export type Lane = "human" | "agent"
export type FunctionId = "increment" | "pay" | "payAmount"
export type Tone = "good" | "bad" | "warn" | "muted"
export interface ContractFunction {
  id: FunctionId
  signature: string
  selector: string
  needsAmount: boolean
  label: string
  note: string
}
export interface CounterSnapshot {
  humanCount: string
  agentCount: string
  humanPaid: string
  agentPaid: string
  humanPayments?: string
  agentPayments?: string
  lastLane?: string
  lastCaller?: string
  humanPrice?: string
  agentPrice?: string
  humanPriceEth?: string
  agentPriceEth?: string
}
export interface Grant {
  owner: string
  agentKey: string
  keyScheme: number
  budgetPerEpoch: string
  budgetEth: string
  epochLength: string
  epochLengthSec: number
  expiresAt: string
  expiresInSec: number
  active: boolean
  version: string
  grantHash: string
  epoch: string
  spent: string
  spentEth: string
  remaining: string
  remainingEth: string
}
export interface Preflight {
  ok: boolean
  code?: string
  message?: string
  budgetEth?: string
  spentEth?: string
  remainingEth?: string
  spendEth?: string
}
export interface Simulation {
  executionStatus: string | null
  executionError: string | null
  canonicalMempoolValid: boolean
  canonicalMempoolViolation: string | null
  gasUsed?: string | null
  maxCost?: string | null
  payer?: string | null
  prefixShape?: string | null
  frames: { gasUsed: string; succeeded: boolean }[] | null
}
export interface Admission {
  id: number
  outcome: string
  passed?: number
  failed?: number
  checks: {
    rule: string
    verdict: string
    frameIndex?: number
    reason?: string
  }[]
}
export interface CallResult {
  ok: boolean
  lane: Lane
  function: FunctionId
  signature?: string
  hash?: string
  status?: string
  blockNumber?: string | null
  gasUsed?: string | null
  caller?: string
  value?: string
  valueEth?: string
  amountEth?: string | null
  spendEth?: string
  frames?: number
  before?: CounterSnapshot
  after?: CounterSnapshot
  preflight?: Preflight
  simulation?: Simulation
  admission?: Admission | null
  explorer?: string
  error?: string | null
  at?: string
}
export interface ConsoleState {
  ok: boolean
  checkedAt: string
  network: {
    chainId: number
    rpc: string
    sidecar: string
    blockNumber: string
    explorer?: string
  }
  contracts: {
    counter: string
    registry: string
    agentAccount: string
    owner: string
    agentKey: string
  }
  counter: CounterSnapshot
  grant: Grant
  allowlist: Record<FunctionId, boolean>
  functions: ContractFunction[]
  agentBalance: string
  agentBalanceEth: string
  intentNonce: string
  history: CallResult[]
}
export interface CallPayload {
  ok: boolean
  result: CallResult
  state: ConsoleState
}
export interface PermissionPayload {
  ok: boolean
  txs: OwnerTransaction[]
  state: ConsoleState
}
export interface OwnerTransaction {
  label: string
  hash: string
  at?: string
}
export interface PermissionInput {
  budgetEth?: string
  allow?: Record<FunctionId, boolean>
  active?: boolean
}
