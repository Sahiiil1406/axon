import { useState } from "react"
import { Moon, Sun } from "lucide-react"

/** Theme is shared by marketing, Docs, and the console through semantic tokens. */
export function ThemeToggle() {
  const [light, setLight] = useState(() => document.documentElement.classList.contains("light"))
  function toggle() {
    const next = !light
    const theme = next ? "light" : "dark"
    document.documentElement.classList.toggle("light", next)
    document.documentElement.classList.toggle("dark", !next)
    document.documentElement.style.colorScheme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", next ? "#f7f8f8" : "#151414")
    try { localStorage.setItem("axon-theme", theme) } catch { /* Storage may be unavailable. */ }
    setLight(next)
  }
  return <button type="button" className="theme-toggle" onClick={toggle} aria-label="Light mode" aria-pressed={light}>
    {light ? <Sun size={15} /> : <Moon size={15} />}<span>{light ? "Light mode" : "Dark mode"}</span><span className="theme-toggle-track" aria-hidden="true"><i /></span>
  </button>
}
