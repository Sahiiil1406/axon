import { createContext, useContext } from "react"
import type {
  AgentInfo,
  CallResult,
  CallRestrictions,
  ConsoleState,
  EnsState,
  FunctionId,
  Lane,
  OwnerTransaction,
  PermissionInput,
  Tone,
  WorldIdStatus,
  WorldIdProof,
} from "./types"
export interface ConsoleModel {
  state: ConsoleState | null
  loading: boolean
  error: string | null
  busy: string | null
  notice: { message: string; tone: Tone } | null
  last: Partial<Record<Lane, CallResult>>
  ownerTransactions: OwnerTransaction[]
  ens: EnsState
  ensLoading: boolean
  takeWorldIdProof: () => WorldIdProof | undefined
  worldIdStatus: WorldIdStatus
  worldIdSkipped: boolean
  skipWorldId: () => void
  callRestrictions: CallRestrictions
  refresh: () => Promise<void>
  refreshEns: () => Promise<void>
  call: (lane: Lane, fn: FunctionId, amount: string | null, agentName?: string) => Promise<boolean>
  permission: (input: PermissionInput) => Promise<boolean>
  verifyWorldId: () => Promise<boolean>
  setCallRestriction: (key: keyof CallRestrictions, value: unknown) => void
  path: string
}
export const ConsoleContext = createContext<ConsoleModel | null>(null)
export function useConsole() {
  const model = useContext(ConsoleContext)
  if (!model) throw new Error("Console provider is missing")
  return model
}
