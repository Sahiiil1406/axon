import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/** Small square anchors shared by bordered panels, diagrams, and hero frames. */
export function CornerMarkers() {
  return (
    <>
      {["top-left", "top-right", "bottom-left", "bottom-right"].map(
        (corner) => (
          <span
            key={corner}
            aria-hidden="true"
            className="corner-marker"
            data-corner={corner}
          />
        )
      )}
    </>
  )
}

/** Sharp bordered surface with the page's consistent four-corner anchor pattern. */
export function ReferenceFrame({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn("reference-frame", className)}>
      <CornerMarkers />
      {children}
    </div>
  )
}
