import { useEffect, useRef, type CSSProperties } from "react"
import { OceanEngine } from "./engine"
import type { SharkSpec } from "./world"
import { cn } from "@/lib/utils"

export interface AsciiSharksProps {
  className?: string
  style?: CSSProperties
  /** Keep a custom roster stable (for example, a module-level constant). */
  sharks?: SharkSpec[]
  /** Optional synchronized second view, styled independently without another simulation. */
  overlayClassName?: string
}

/** Decorative canvas. Nothing starts until the component is mounted. */
export function AsciiSharks({ className, style, sharks, overlayClassName }: AsciiSharksProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const overlay = overlayRef.current
    const context = overlay?.getContext("2d")
    const engine = new OceanEngine(canvas, sharks, () => {
      if (!overlay || !context) return
      if (overlay.width !== canvas.width) overlay.width = canvas.width
      if (overlay.height !== canvas.height) overlay.height = canvas.height
      context.drawImage(canvas, 0, 0)
    })
    return () => engine.destroy()
  }, [sharks, overlayClassName])

  return (
    <>
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={cn("block h-full min-h-64 w-full", className)}
      style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", ...style }}
    />
    {overlayClassName && <canvas ref={overlayRef} aria-hidden="true" className={overlayClassName} />}
    </>
  )
}

export { AsciiSharks as AsciiOcean }
