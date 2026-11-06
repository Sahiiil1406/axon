import { WorkspaceSidebar } from "@/components/workspace-sidebar"
import { Outlet, useLocation } from "react-router-dom"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  Activity,
  ArrowUpRight,
  Blocks,
  FileText,
  LayoutDashboard,
  Radio,
  Settings2,
} from "lucide-react"
import { WorkspaceHeader } from "@/components/workspace-header"
import { Button } from "@/components/ui/button"
import { fetchConsoleState, submitCall, updatePermission } from "./api"
import { failureReason } from "./format"
import { ConsoleContext } from "./model"
import { RefreshButton } from "./components"
import type {
  CallResult,
  ConsoleState,
  FunctionId,
  Lane,
  OwnerTransaction,
  PermissionInput,
  Tone,
} from "./types"
import "./console.css"

export default function ConsoleApp() {
  const [state, setState] = useState<ConsoleState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ message: string; tone: Tone } | null>(
    null
  )
  const [last, setLast] = useState<Partial<Record<Lane, CallResult>>>({})
  const [ownerTransactions, setOwnerTransactions] = useState<
    OwnerTransaction[]
  >([])
  const { pathname } = useLocation()
  const path = pathname.replace(/\/$/, "") || "/app"
  const requestVersion = useRef(0)
  const writing = useRef(false)
  const ingest = useCallback((next: ConsoleState) => {
    setState(next)
    setLast(() => {
      const merged: Partial<Record<Lane, CallResult>> = {}
      for (const lane of ["human", "agent"] as const) {
        const latest = next.history.find((r) => r.lane === lane)
        if (latest) merged[lane] = latest
      }
      return merged
    })
  }, [])
  const refresh = useCallback(async () => {
    const version = ++requestVersion.current
    setLoading(true)
    try {
      const next = await fetchConsoleState()
      if (version !== requestVersion.current) return
      ingest(next)
      setError(null)
    } catch (e) {
      if (version === requestVersion.current)
        setError(e instanceof Error ? e.message : "Unable to load state.")
    } finally {
      if (version === requestVersion.current) setLoading(false)
    }
  }, [ingest])
  useEffect(() => {
    let mounted = true
    queueMicrotask(() => {
      if (mounted) void refresh()
    })
    return () => {
      mounted = false
      // This ref is a request generation counter, not a DOM node.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      requestVersion.current++
    }
  }, [refresh])
  const call = async (lane: Lane, fn: FunctionId, amount: string | null) => {
    if (writing.current || !state) return false
    writing.current = true
    setBusy(`${lane} call`)
    setNotice(null)
    requestVersion.current++
    setLoading(false)
    try {
      const payload = await submitCall(lane, fn, amount)
      if (!payload.result || !payload.state)
        throw new Error(
          "The API did not return a call result and updated state."
        )
      ingest(payload.state)
      setError(null)
      setLast((prev) => ({
        ...prev,
        [lane]:
          payload.state.history.find((r) => r.lane === lane) ?? payload.result,
      }))
      setNotice({
        tone: payload.ok ? "good" : "bad",
        message: payload.ok
          ? `${lane === "human" ? "Human" : "Agent"} call confirmed.`
          : failureReason(payload.result),
      })
      return payload.ok
    } catch (e) {
      setNotice({
        tone: "bad",
        message:
          e instanceof Error
            ? e.message
            : "Call failed. Refresh state before retrying.",
      })
      return false
    } finally {
      writing.current = false
      setBusy(null)
    }
  }
  const permission = async (input: PermissionInput) => {
    if (writing.current || !state) return false
    writing.current = true
    setBusy(input.active === false ? "revoking grant" : "updating permissions")
    setNotice(null)
    requestVersion.current++
    setLoading(false)
    try {
      const payload = await updatePermission(input)
      if (!payload.ok || !payload.state)
        throw new Error(
          "The API did not confirm the permission update. Refresh state to inspect the grant."
        )
      ingest(payload.state)
      setError(null)
      setOwnerTransactions((prev) => [
        ...(payload.txs ?? []).map((tx) => ({
          ...tx,
          at: new Date().toISOString(),
        })),
        ...prev,
      ])
      setNotice({
        tone: "good",
        message:
          input.active === false
            ? "Agent grant revoked."
            : payload.txs?.length
              ? `Permission updated. ${payload.txs.length} owner transaction${payload.txs.length === 1 ? "" : "s"} confirmed.`
              : "Permissions already match. No transaction submitted.",
      })
      return true
    } catch (e) {
      setNotice({
        tone: "bad",
        message:
          e instanceof Error
            ? e.message
            : "Permission update failed. Refresh state before retrying.",
      })
      return false
    } finally {
      writing.current = false
      setBusy(null)
    }
  }
  useEffect(() => {
    const original = document.title
    document.title = `Axon Console — ${path === "/app" ? "Overview" : path === "/app/permissions" ? "Permissions" : path === "/app/activity" ? "Activity" : "Transaction details"}`
    return () => {
      document.title = original
    }
  }, [path])
  const nav = [
    { href: "/app", label: "Overview", icon: LayoutDashboard },
    { href: "/app/permissions", label: "Permissions", icon: Settings2 },
    { href: "/app/activity", label: "Activity", icon: Activity },
  ]
  return (
    <ConsoleContext.Provider
      value={{
        state,
        loading,
        error,
        busy,
        notice,
        last,
        ownerTransactions,
        refresh,
        call,
        permission,
        path,
      }}
    >
      <div className="console-app">
        <a href="#console-main" className="sr-only focus:not-sr-only">
          Skip to console
        </a>
        <WorkspaceHeader page={path === "/app" ? "Overview" : path === "/app/permissions" ? "Permissions" : path === "/app/activity" ? "Activity" : "Transaction details"} />
        <div className="console-layout">
          <WorkspaceSidebar
            label="Workspace"
            className="console-sidebar"
            items={nav.map((item) => ({
              ...item,
              active:
                path === item.href ||
                (item.href === "/app/activity" &&
                  path.startsWith("/app/transactions/")),
              badge:
                item.href === "/app/activity" && state
                  ? state.history.length
                  : undefined,
            }))}
            resources={[
              {
                label: "Devnet explorer",
                href: "https://altmempoolexplorer.forshtat.com",
                icon: ArrowUpRight,
              },
              { label: "Protocol overview", href: "/docs", icon: FileText },
            ]}
          />
          <main id="console-main" className="console-main">
            <div className="console-breadcrumb">
              <span className="console-status-inline">
                <span
                  className={`console-connection-dot ${error ? "offline" : loading ? "loading" : ""}`}
                />
                {error
                  ? "API offline"
                  : state
                    ? `Chain ${state.network.chainId} · Block ${state.network.blockNumber}`
                    : "Connecting…"}
              </span>
              <span className="console-sync">
                {state?.checkedAt
                  ? `Synced ${new Date(state.checkedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
                  : "Awaiting state"}
              </span>
              <RefreshButton />
            </div>
            {error && (
              <div className="console-banner bad" role="alert">
                <Blocks size={18} />
                <div>
                  <strong>Demo API unavailable</strong>
                  <p>
                    {error}
                    {state
                      ? " Showing the last successfully loaded state."
                      : ""}
                  </p>
                </div>
                <Button
                  variant="outline"
                  disabled={loading || !!busy}
                  onClick={() => void refresh()}
                >
                  Retry
                </Button>
              </div>
            )}
            {notice && (
              <div
                className={`console-banner ${notice.tone}`}
                role={notice.tone === "bad" ? "alert" : "status"}
              >
                {notice.tone === "bad" ? (
                  <Blocks size={17} />
                ) : (
                  <Radio size={17} />
                )}
                <p>{notice.message}</p>
              </div>
            )}
            {busy && (
              <div className="console-progress" role="status">
                <span className="console-spinner" /> {busy}… Waiting for the
                server to return the transaction result.
              </div>
            )}
            <Outlet />
          </main>
        </div>
      </div>
    </ConsoleContext.Provider>
  )
}
