import { createContext, useContext } from "react"
import type {
  CallResult,
  ConsoleState,
  FunctionId,
  Lane,
  OwnerTransaction,
  PermissionInput,
  Tone,
} from "./types"
export interface ConsoleModel {
  state: ConsoleState | null
  loading: boolean
  error: string | null
  busy: string | null
  notice: { message: string; tone: Tone } | null
  last: Partial<Record<Lane, CallResult>>
  ownerTransactions: OwnerTransaction[]
  refresh: () => Promise<void>
  call: (lane: Lane, fn: FunctionId, amount: string | null) => Promise<boolean>
  permission: (input: PermissionInput) => Promise<boolean>
  path: string
}
export const ConsoleContext = createContext<ConsoleModel | null>(null)
export function useConsole() {
  const model = useContext(ConsoleContext)
  if (!model) throw new Error("Console provider is missing")
  return model
}
