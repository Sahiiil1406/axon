import {
  concat, encodeAbiParameters, encodeFunctionData, getAddress, getCreate2Address,
  keccak256, namehash, parseAbi, parseAbiItem, toHex, zeroAddress, type Address, type Hex, type PublicClient,
} from "viem";

// ENSv2 Sepolia deployments. https://docs.ens.domains/learn/deployments/
const ethRegistry = getAddress("0xd4ebcbbdf463c9c45784603db0ddd499bc44a8b4");
const factory = getAddress("0xda70306c98e97ece36f997a21368e53298572991");
const implementation = getAddress("0x9bd8a88719068d09ecee662f36c0e3856708366a");
const registryAbi = parseAbi([
  "function initialize((address account,uint256 roleBitmap)[] grants)",
  "function findOwner(string) view returns (address)",
  "function findExpiry(string) view returns (uint64)",
  "function getSubregistry(string) view returns (address)",
  "function getResolver(string) view returns (address)",
  "function getParent() view returns (address,string)",
  "function hasRoles(uint256,uint256,address) view returns (bool)",
  "function hasRootRoles(uint256,address) view returns (bool)",
  "function setParent(address,string)",
  "function setSubregistry(uint256,address)",
  "function register(string,address,address,address,uint256,uint64) returns (uint256)",
]);
const factoryAbi = parseAbi([
  "function deployProxy(address,uint256,bytes) returns (address)",
  "function proxyLogic() view returns (address)",
  "function verifyContract(address) view returns (address)",
]);

export async function prepareEnsHierarchy(
  client: PublicClient,
  signer: Address,
  parent: string,
  resolver: Address,
  send: (label: string, to: Address, data: Hex) => Promise<Hex>,
  branches: readonly string[] = [],
) {
  const [label, tld, extra] = parent.split(".");
  if (!label || tld !== "eth" || extra !== undefined || await client.getChainId() !== 11155111)
    throw new Error("ENS hierarchy publishing requires a second-level .eth parent on Sepolia.");

  async function openRegistry(parentRegistry: Address, label: string, fullName: string) {
    const [owner, existing, expiry, registeredResolver] = await Promise.all([
      client.readContract({ address: parentRegistry, abi: registryAbi, functionName: "findOwner", args: [label] }),
      client.readContract({ address: parentRegistry, abi: registryAbi, functionName: "getSubregistry", args: [label] }),
      client.readContract({ address: parentRegistry, abi: registryAbi, functionName: "findExpiry", args: [label] }),
      client.readContract({ address: parentRegistry, abi: registryAbi, functionName: "getResolver", args: [label] }),
    ]);
    if (owner !== signer || registeredResolver !== resolver)
      throw new Error("The configured signer must own the parent and use its registered ENS resolver.");

    let registry = existing;
    if (registry === zeroAddress) {
      const id = BigInt(keccak256(toHex(label)));
      const authorized = await client.readContract({
        address: parentRegistry, abi: registryAbi, functionName: "hasRoles", args: [id, 1n << 20n, signer],
      });
      if (!authorized) throw new Error(`The signer lacks permission to attach a subregistry to ${fullName}.`);

      const salt = BigInt(keccak256(encodeAbiParameters(
        [{ type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }],
        [keccak256(toHex("UserRegistry")), namehash(fullName), 0n],
      )));
      const proxyLogic = await client.readContract({ address: factory, abi: factoryAbi, functionName: "proxyLogic" });
      const outerSalt = keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [signer, salt]));
      registry = getCreate2Address({ from: factory, salt: outerSalt, bytecode: concat([
        "0x3d604d80600a3d3981f3363d3d373d3d3d363d73", proxyLogic,
        "0x5af43d82803e903d91602b57fd5bf3", outerSalt,
      ]) });
      if (!await client.getCode({ address: registry })) {
        const roleBitmap = 1n | (1n << 8n) | (1n << 16n) | (1n << 24n);
        const init = encodeFunctionData({
          abi: registryAbi, functionName: "initialize", args: [[{ account: signer, roleBitmap }]],
        });
        await send("Deploy ENS UserRegistry", factory, encodeFunctionData({
          abi: factoryAbi, functionName: "deployProxy", args: [implementation, salt, init],
        }));
      }
      if (await client.readContract({ address: factory, abi: factoryAbi, functionName: "verifyContract", args: [registry] }) !== implementation)
        throw new Error("The predicted subregistry does not use the expected ENS implementation.");

      const [canonicalRegistry, canonicalLabel] = await client.readContract({
        address: registry, abi: registryAbi, functionName: "getParent",
      });
      if (canonicalRegistry === zeroAddress) {
        await send("Set ENS canonical parent", registry, encodeFunctionData({
          abi: registryAbi, functionName: "setParent", args: [parentRegistry, label],
        }));
      } else if (canonicalRegistry !== parentRegistry || canonicalLabel !== label) {
        throw new Error("The predicted subregistry has a different canonical parent.");
      }
      const current = await client.readContract({
        address: parentRegistry, abi: registryAbi, functionName: "getSubregistry", args: [label],
      });
      if (current === zeroAddress) {
        await send("Attach ENS UserRegistry", parentRegistry, encodeFunctionData({
          abi: registryAbi, functionName: "setSubregistry", args: [id, registry],
        }));
      } else if (current !== registry) {
        throw new Error("The parent subregistry changed during setup.");
      }
    }

    return {
      address: registry,
      async register(child: string) {
        const current = await client.readContract({ address: registry, abi: registryAbi, functionName: "findOwner", args: [child] });
        if (current !== zeroAddress) {
          const childResolver = await client.readContract({ address: registry, abi: registryAbi, functionName: "getResolver", args: [child] });
          if (current !== signer || childResolver !== resolver)
            throw new Error("The subname is already registered with a different owner or resolver.");
          return;
        }
        if (!await client.readContract({ address: registry, abi: registryAbi, functionName: "hasRootRoles", args: [1n, signer] }))
          throw new Error("The Sepolia signer lacks the subregistry registrar role.");
        await send(`Register ENS subname ${child}.${fullName}`, registry, encodeFunctionData({
          abi: registryAbi, functionName: "register", args: [child, signer, zeroAddress, resolver, 1n << 20n, expiry],
        }));
        if (await client.readContract({ address: registry, abi: registryAbi, functionName: "findOwner", args: [child] }) !== signer)
          throw new Error("Could not verify ownership of the new ENS subname.");
      },
    };
  }

  let fullName = parent;
  let current = await openRegistry(ethRegistry, label, fullName);
  for (const branch of branches) {
    await current.register(branch);
    fullName = `${branch}.${fullName}`;
    current = await openRegistry(current.address, branch, fullName);
  }
  return current;
}

const registeredEvent = parseAbiItem(
  "event LabelRegistered(uint256 indexed tokenId, bytes32 indexed labelHash, string label, address owner, uint64 expiry, address indexed sender)",
);
const deploymentBlocks = new Map<Address, bigint>();

async function findRegistryStart(client: PublicClient, registry: Address, tip: bigint) {
  const cached = deploymentBlocks.get(registry);
  if (cached !== undefined) return cached;
  let high = tip;
  let low = tip > 1024n ? tip - 1024n : 0n;
  for (let span = 2048n; low > 0n && await client.getCode({ address: registry, blockNumber: low }); span *= 2n) {
    high = low;
    low = tip > span ? tip - span : 0n;
  }
  while (high - low > 1n) {
    const middle = (high + low) / 2n;
    if (await client.getCode({ address: registry, blockNumber: middle })) high = middle;
    else low = middle;
  }
  deploymentBlocks.set(registry, high);
  return high;
}

export async function readEnsHierarchy(client: PublicClient, parent: string) {
  const [label, tld, extra] = parent.split(".");
  if (!label || tld !== "eth" || extra !== undefined)
    throw new Error("ENS hierarchy lookup requires a second-level .eth parent.");
  if (await client.getChainId() !== 11155111)
    throw new Error("ENS hierarchy RPC must be on Sepolia.");
  const tip = await client.getBlockNumber({ cacheTime: 0 });
  const subregistry = (address: Address, child: string) => client.readContract({
    address, abi: registryAbi, functionName: "getSubregistry", args: [child], blockNumber: tip,
  });

  async function walk(registry: Address, namespace: string, depth: number): Promise<Array<{
    name: string;
    registrationTxHash: Hex;
  }>> {
    if (registry === zeroAddress) return [];
    const start = await findRegistryStart(client, registry, tip);
    const labels = new Map<string, Hex>();
    for (let fromBlock = start; fromBlock <= tip; fromBlock += 50_000n) {
      const end = fromBlock + 49_999n;
      const events = await client.getLogs({
        address: registry, event: registeredEvent, strict: true, fromBlock, toBlock: end < tip ? end : tip,
      });
      for (const { args, transactionHash } of events) labels.set(args.label, transactionHash);
    }

    const children = await Promise.all([...labels].map(async ([child, registrationTxHash]) => {
      const owner = await client.readContract({
        address: registry, abi: registryAbi, functionName: "findOwner", args: [child], blockNumber: tip,
      });
      if (owner === zeroAddress) return [];
      const name = `${child}.${namespace}`;
      const descendants = depth < 3 ? await walk(await subregistry(registry, child), name, depth + 1) : [];
      return [{ name, registrationTxHash }, ...descendants];
    }));
    return children.flat();
  }

  return walk(await subregistry(ethRegistry, label), parent, 1);
}
