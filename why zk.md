# Why ZK for Axon?

Axon’s public grants reveal what an agent could do, even when it never uses
those permissions. A private scoped view lets the agent prove one exact call
is allowed. The owner publishes a salted policy root and gives each agent
only the selected rule and its Merkle witness. Other rules and their limits
stay private. The agent can read its own rule. Observers can still see the
executed target, function, amount, account, and public epoch budget.

## Implementation plan and result

1. Commit up to eight salted rules in a Poseidon Merkle tree. A rule binds the
   chain, account, FinalCounter target, agent key, and selector to a private
   maximum ETH amount. The circuit proves membership and enforces the amount.
2. Generate a Groth16 proof for the current root, exact scope, intent nonce,
   and ETH value. The runner embeds the same proof-bearing intent in both
   signed EIP-8141 frames.
3. Keep the existing signature and frame-shape checks in VERIFY. The
   ScopedAgentAccount verifies the proof in SENDER before executing the call
   or changing spend counters. Its public epoch budget still applies. A
   proof checked against a stale root or a different call fails.
4. Keep the current account available. Use the new account for the private
   demo after deploying its verifier and configuring a grant on chain 1337.

This design supports `increment()` and `payAmount(uint256)`. The account
checks that the payment calldata amount equals the proved ETH value.
It publishes the two supported functions, while the private root decides
which of them the owner actually granted and at what ceiling.

## Run the private demo

- Install the pinned prover dependencies with `npm ci --prefix zk` and run
  `bash zk/scripts/setup.sh`. Keep the generated verifier and proving key
  paired. Run `node zk/scripts/test.mjs` to verify proofs and tampering checks. This is a local demo ceremony. Use a reviewed ceremony and audit
  before relying on these keys beyond the demo.
- Deploy `zk/build/Groth16Verifier.sol` and
  `contracts/src/ScopedAgentAccount.sol` on the Axon EIP-8141 devnet. Pass
  the owner, existing PermissionRegistry, deployed verifier, and FinalCounter
  to the account constructor. Fund and stake the new account and give its
  agent key a devnet grant with the desired public epoch budget.
- Query the new account’s `scopeFor(agentKey, selector)` for each allowed
  function. Create a private JSON array of `{"scope":"<decimal>","limit":"<wei>"}`
  entries and run `node zk/scripts/make-views.mjs zk/private/rules.json zk/private/views`.
  Set the printed root with the owner’s `setPolicyRoot(uint256)` transaction.
  Give the agent only its matching view. Keep the rules and views out of Git.
- For the default identity, set `ACCOUNT_ADDRESS` to the scoped account in
  the runner environment. For a named identity, bind that name to the new
  account in Axon’s Sepolia registry. Run from the repo root:

  ```bash
  node --import ./agent/node_modules/tsx/dist/loader.mjs agent/scripts/counter.ts pay 0.1 --scoped-view zk/private/views/view-0.json --simulate
  ```

  Remove `--simulate` to submit. Add `--agent <name>` for a named identity.
  Use the view for the requested selector. A request above its limit fails
  locally with `E_PRIVATE_LIMIT`. A submitted invalid proof reverts in
  SENDER with `E_PRIVATE_PROOF` when verification returns false. A generic
  invalid-proof result does not reveal which private rule failed.

The proof is checked after admission, so an included invalid proof can cost
gas. The current VERIFY path still reads the devnet registry and keeps its
existing alt-mempool requirements. This is policy privacy, not transaction
privacy or a claim of canonical mempool compatibility.

References [Circom proving guide](https://docs.circom.io/getting-started/proving-circuits/) and [EIP-8141](https://eips.ethereum.org/EIPS/eip-8141).
