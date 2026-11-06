import { randomBytes } from "node:crypto"
import { poseidon2, poseidon3 } from "poseidon-lite"

const field = 21888242871839275222246405745257275088548364400416034343698204186575808495617n
const salt = () => BigInt(`0x${randomBytes(31).toString("hex")}`)

export function createScopedViews(rules) {
  if (!Array.isArray(rules) || rules.length < 1 || rules.length > 8)
    throw new Error("Supply between one and eight rules.")
  const entries = rules.map(rule => {
    const scope = BigInt(rule.scope)
    const limit = BigInt(rule.limit)
    if (scope < 0n || scope >= field || limit < 0n || limit >= 2n ** 128n)
      throw new Error("Rule scope or limit is outside the supported range.")
    return { scope, limit, salt: salt() }
  })
  const levels = [Array.from({ length: 8 }, (_, index) => {
    const rule = entries[index]
    return rule ? poseidon3([rule.scope, rule.limit, rule.salt]) : salt()
  })]
  for (let level = 0; level < 3; level++) {
    const nodes = levels[level]
    levels.push(Array.from({ length: nodes.length / 2 }, (_, index) =>
      poseidon2(nodes.slice(index * 2, index * 2 + 2))
    ))
  }
  const root = levels[3][0].toString()
  return entries.map((rule, index) => {
    const siblings = []
    const directions = []
    for (let level = 0; level < 3; level++) {
      const position = index >> level
      siblings.push(levels[level][position ^ 1].toString())
      directions.push(position & 1)
    }
    return { root, scope: rule.scope.toString(), limit: rule.limit.toString(), salt: rule.salt.toString(), siblings, directions }
  })
}
