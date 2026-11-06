import { useEffect, useRef, type CSSProperties } from "react"
import { OceanEngine } from "./engine"
import { AsciiRenderer } from "./renderer"
import { World } from "./world"
import type { SharkSpec } from "./world"
import { cn } from "@/lib/utils"

export interface AsciiSharksProps {
  /** Render one posed shark without animation or input listeners. */
  static?: boolean
  className?: string
  style?: CSSProperties
  /** Keep a custom roster stable (for example, a module-level constant). */
  sharks?: SharkSpec[]
  /** Optional synchronized second view, styled independently without another simulation. */
  overlayClassName?: string
}

/** Decorative canvas. Nothing starts until the component is mounted. */
export function AsciiSharks({ className, style, sharks, overlayClassName, static: stillFrame = false }: AsciiSharksProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (stillFrame) {
      const renderer = new AsciiRenderer(canvas, { transparentBackground: true })
      renderer.setFontFamily(getComputedStyle(canvas).fontFamily)
      const world = new World(sharks ?? [{ kind: "classic", size: 1 }], 0)
      // A fixed composition keeps the still identical across rerenders and resizes.
      const width = 640, height = 320
      renderer.resize(width, height, 1)
      world.resize(width, height, renderer.cellWidth, renderer.cellHeight)
      world.time = 12
      world.fish = []
      const shark = world.sharks[0]
      if (shark) {
        world.sharks = [shark]
        shark.length = width * 0.76
        shark.heading = 0
        shark.phase = 0.4
        shark.turn = 0
        shark.depth = 1
        for (let i = 0; i < shark.nodes.length / 2; i++) {
          shark.nodes[i * 2] = width * 0.88 - shark.length * i / (shark.nodes.length / 2 - 1)
          shark.nodes[i * 2 + 1] = height * 0.48 + Math.sin(i * 0.3) * 7
        }
      }
      renderer.render(world, 0)
      return
    }
    const overlay = overlayRef.current
    const context = overlay?.getContext("2d")
    const engine = new OceanEngine(canvas, sharks, () => {
      if (!overlay || !context) return
      if (overlay.width !== canvas.width) overlay.width = canvas.width
      if (overlay.height !== canvas.height) overlay.height = canvas.height
      context.drawImage(canvas, 0, 0)
    })
    return () => engine.destroy()
  }, [sharks, overlayClassName, stillFrame])

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
