import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { groth16 } from "snarkjs"
import { createScopedViews } from "./scoped-views.mjs"
import { proveScopedCall } from "./prove.mjs"

const build = file => fileURLToPath(new URL(`../build/${file}`, import.meta.url))
const wasm = build("scoped-permission_js/scoped-permission.wasm")
const zkey = build("scoped.zkey")
const vk = JSON.parse(readFileSync(build("verification-key.json"), "utf8"))
try {
  const views = createScopedViews([{ scope: "15", limit: "100" }, { scope: "20", limit: "200" }])
  const view = views[1]
  assert.equal(view.root, views[0].root)

  const call = { root: BigInt(view.root), scope: 20n, nonce: 7n, amount: 199n }
  const encoded = await proveScopedCall(view, call)
  assert.deepEqual(encoded.publicSignals.slice(1), [view.root, "20", "7", "199"])

  const input = { ...view, nonce: "7", amount: "199" }
  const { proof, publicSignals } = await groth16.fullProve(input, wasm, zkey, undefined, undefined, { singleThread: true })
  assert.equal(await groth16.verify(vk, publicSignals, proof), true)
  for (const index of [1, 2, 3, 4]) {
    const modified = publicSignals.slice()
    modified[index] = (BigInt(modified[index]) + 1n).toString()
    assert.equal(await groth16.verify(vk, modified, proof), false, `public signal ${index} was not bound`)
  }
  await assert.rejects(proveScopedCall(view, { ...call, amount: 201n }), /E_PRIVATE_LIMIT/)
  await assert.rejects(groth16.fullProve({ ...input, amount: "201" }, wasm, zkey, undefined, undefined, { singleThread: true }), /Assert Failed/)
  await assert.rejects(groth16.fullProve({ ...input, scope: "15" }, wasm, zkey, undefined, undefined, { singleThread: true }), /Assert Failed/)
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({
      root: view.root,
      amountWei: call.amount.toString(),
      verified: true,
      tamperedAmountRejected: true,
      overLimitRejected: true,
    }))
  } else {
    console.log("Scoped proof verified. Tampered root, scope, nonce, value, and over-limit witnesses were rejected.")
  }
} finally {
  await globalThis.curve_bn128?.terminate()
}
