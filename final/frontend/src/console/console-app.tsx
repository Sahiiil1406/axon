import { useCallback, useEffect, useRef, useState } from "react"
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  Blocks,
  FileText,
  LayoutDashboard,
  Radio,
  Settings2,
} from "lucide-react"
import { Logo } from "@/components/brand/primitives"
import { Button } from "@/components/ui/button"
import { fetchConsoleState, submitCall, updatePermission } from "./api"
import { failureReason } from "./format"
import { ConsoleContext } from "./model"
import { Badge, ConsoleLink, RefreshButton } from "./components"
import { DemoPage } from "./demo-page"
import { PermissionsPage } from "./permissions-page"
import { ActivityPage, TransactionPage } from "./transactions"
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
  const [path, setPath] = useState(
    () => window.location.pathname.replace(/\/$/, "") || "/app"
  )
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
    void refresh()
    return () => {
      requestVersion.current++
    }
  }, [refresh])
  useEffect(() => {
    const listener = () =>
      setPath(window.location.pathname.replace(/\/$/, "") || "/app")
    window.addEventListener("popstate", listener)
    return () => window.removeEventListener("popstate", listener)
  }, [])
  const navigate = useCallback((to: string) => {
    window.history.pushState(null, "", to)
    setNotice(null)
    setPath(window.location.pathname.replace(/\/$/, "") || "/app")
    window.scrollTo({ top: 0, behavior: "instant" })
  }, [])
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
  const known =
    path === "/app" ||
    path === "/app/permissions" ||
    path === "/app/activity" ||
    path.startsWith("/app/transactions/")
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
        navigate,
      }}
    >
      <div className="console-app">
        <a href="#console-main" className="sr-only focus:not-sr-only">
          Skip to console
        </a>
        <header className="console-topbar">
          <div className="console-brand">
            <Logo />
            <span className="console-word-divider" />
            <span>CONSOLE</span>
          </div>
          <div className="console-network">
            <span
              className={`console-connection-dot ${error ? "offline" : loading ? "loading" : ""}`}
            />
            <span>
              {error
                ? "API offline"
                : state
                  ? `Chain ${state.network.chainId}`
                  : "Connecting…"}
            </span>
            <Badge>
              {state ? `Block ${state.network.blockNumber}` : "Devnet"}
            </Badge>
          </div>
          <a className="console-back" href="/">
            <ArrowLeft size={13} /> Back to site
          </a>
        </header>
        <div className="console-layout">
          <aside className="console-sidebar">
            <p className="console-eyebrow">WORKSPACE</p>
            <nav aria-label="Console navigation">
              {nav.map((item) => (
                <ConsoleLink
                  key={item.href}
                  href={item.href}
                  className={
                    path === item.href ||
                    (item.href === "/app/activity" &&
                      path.startsWith("/app/transactions/"))
                      ? "active"
                      : ""
                  }
                  aria-current={path === item.href ? "page" : undefined}
                >
                  <item.icon size={17} />
                  {item.label}
                  {item.href === "/app/activity" && state && (
                    <span className="console-count">
                      {state.history.length}
                    </span>
                  )}
                </ConsoleLink>
              ))}
            </nav>
            <div className="console-sidebar-foot">
              <Radio size={17} />
              <strong>Two lanes. One contract.</strong>
              <p>
                Ordinary EOA transactions and agent frame transactions, side by
                side.
              </p>
              <a
                href="https://altmempoolexplorer.forshtat.com"
                target="_blank"
                rel="noreferrer"
              >
                Devnet explorer <ArrowUpRight size={13} />
              </a>
              <a href="/docs">
                Protocol overview <FileText size={13} />
              </a>
            </div>
          </aside>
          <main id="console-main" className="console-main">
            <div className="console-breadcrumb">
              <span>Axon</span>
              <span>/</span>
              <span>
                {path === "/app"
                  ? "Overview"
                  : path === "/app/permissions"
                    ? "Permissions"
                    : path === "/app/activity"
                      ? "Activity"
                      : "Transaction details"}
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
            {known ? (
              path === "/app" ? (
                <DemoPage />
              ) : path === "/app/permissions" ? (
                <PermissionsPage />
              ) : path === "/app/activity" ? (
                <ActivityPage />
              ) : (
                <TransactionPage
                  id={decodeURIComponent(
                    path.slice("/app/transactions/".length)
                  )}
                />
              )
            ) : (
              <div className="console-notfound">
                <h1>Page not found</h1>
                <ConsoleLink href="/app">Return to the console</ConsoleLink>
              </div>
            )}
          </main>
        </div>
        <footer className="console-footer">
          <span>AXON / EIP-8141 DEVNET</span>
          <span>Server-side signers · Live permission registry</span>
          <span>
            {state?.network.chainId
              ? `Chain ${state.network.chainId}`
              : "API connection required"}
          </span>
        </footer>
      </div>
    </ConsoleContext.Provider>
  )
}
