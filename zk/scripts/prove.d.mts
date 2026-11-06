export interface ScopedView {
  root: string
  scope: string
  limit: string
  salt: string
  siblings: string[]
  directions: number[]
}

export function proveScopedCall(
  view: ScopedView,
  call: { root: bigint; scope: bigint; nonce: bigint; amount: bigint },
): Promise<{
  a: [string, string]
  b: [[string, string], [string, string]]
  c: [string, string]
  binding: bigint
  publicSignals: string[]
}>
