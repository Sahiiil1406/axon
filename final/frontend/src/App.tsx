import {
  Link,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useParams,
} from "react-router-dom"
import { lazy, Suspense, useEffect } from "react"
import { AxonHeader, AxonFooter } from "@/components/brand/axon-shell"
import { AxonHome } from "@/pages/axon-home"
import { DesignSystem } from "@/pages/design-system"
import { Docs } from "@/pages/docs"
const ConsoleApp = lazy(() => import("@/console/console-app"))

function ScrollOnNavigation() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (!hash) {
      window.scrollTo({ top: 0, behavior: "instant" })
      return
    }
    const frame = requestAnimationFrame(() => {
      try {
        document
          .getElementById(decodeURIComponent(hash.slice(1)))
          ?.scrollIntoView()
      } catch {
        /* Ignore malformed URL fragments. */
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [pathname, hash])
  return null
}

function SiteLayout() {
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only">
        Skip to content
      </a>
      <div className="page-rails" aria-hidden="true">
        <div />
        <div />
      </div>
      <AxonHeader />
      <main id="main">
        <Outlet />
      </main>
      <AxonFooter />
    </>
  )
}

function TransactionRoute() {
  const { id = "" } = useParams()
  return <TransactionPage id={id} />
}
const TransactionPage = lazy(() =>
  import("@/console/transactions").then((module) => ({
    default: module.TransactionPage,
  }))
)
const DemoPage = lazy(() =>
  import("@/console/demo-page").then((module) => ({ default: module.DemoPage }))
)
const PermissionsPage = lazy(() =>
  import("@/console/permissions-page").then((module) => ({
    default: module.PermissionsPage,
  }))
)
const ActivityPage = lazy(() =>
  import("@/console/transactions").then((module) => ({
    default: module.ActivityPage,
  }))
)

export function App() {
  return (
    <>
      <ScrollOnNavigation />
      <Suspense
        fallback={
          <div className="p-8 text-sm text-muted-foreground" role="status">
            Loading Axon…
          </div>
        }
      >
        <Routes>
          <Route element={<SiteLayout />}>
            <Route index element={<AxonHome />} />
            <Route path="docs" element={<Docs />} />
            <Route path="design-system" element={<DesignSystem />} />
            <Route path="*" element={<AxonHome />} />
          </Route>
          <Route path="app" element={<ConsoleApp />}>
            <Route index element={<DemoPage />} />
            <Route path="permissions" element={<PermissionsPage />} />
            <Route path="activity" element={<ActivityPage />} />
            <Route path="transactions/:id" element={<TransactionRoute />} />
            <Route
              path="*"
              element={
                <div className="console-notfound">
                  <h1>Page not found</h1>
                  <Link to="/app">Return to the console</Link>
                </div>
              }
            />
          </Route>
          <Route path="demo" element={<Navigate to="/app" replace />} />
          <Route
            path="permissions"
            element={<Navigate to="/app/permissions" replace />}
          />
        </Routes>
      </Suspense>
    </>
  )
}
export default App
