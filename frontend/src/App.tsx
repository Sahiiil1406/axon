import { useEffect } from "react"
import { AxonHeader, AxonFooter } from "@/components/brand/axon-shell"
import { AxonHome } from "@/pages/axon-home"
import { DesignSystem } from "@/pages/design-system"
import { Docs } from "@/pages/docs"
export function App() {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1))
    if (id) document.getElementById(id)?.scrollIntoView()
  }, [])
  const path = window.location.pathname.replace(/\/$/, "") || "/"
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
        {path === "/design-system" ? (
          <DesignSystem />
        ) : path === "/docs" ? (
          <Docs />
        ) : (
          <AxonHome />
        )}
      </main>
      <AxonFooter />
    </>
  )
}
export default App
