import { fileURLToPath } from "node:url"
import { groth16 } from "snarkjs"

const build = file => fileURLToPath(new URL(`../build/${file}`, import.meta.url))

export async function proveScopedCall(view, { root, scope, nonce, amount }) {
  if (BigInt(view.root) !== root || BigInt(view.scope) !== scope)
    throw new Error("The scoped view does not match the current root or requested call.")
  if (amount > BigInt(view.limit))
    throw new Error("E_PRIVATE_LIMIT: requested amount exceeds the private rule.")
  const input = {
    root: root.toString(), scope: scope.toString(), nonce: nonce.toString(), amount: amount.toString(),
    limit: view.limit, salt: view.salt, siblings: view.siblings, directions: view.directions,
  }
  const { proof, publicSignals } = await groth16.fullProve(
    input, build("scoped-permission_js/scoped-permission.wasm"), build("scoped.zkey"),
    undefined, undefined, { singleThread: true },
  )
  const [a, b, c] = JSON.parse(`[${await groth16.exportSolidityCallData(proof, publicSignals)}]`)
  return { a, b, c, binding: BigInt(publicSignals[0]), publicSignals }
}
