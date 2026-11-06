import { Dithering, StaticRadialGradient } from "@paper-design/shaders-react"
import { useEffect, useRef, useState } from "react"

export default function LandingShader({ variant, className = "" }: {
  variant: "radial" | "dithering"; className?: string
}) {
  const element = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [seen, setSeen] = useState(false)
  const [reduced, setReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches)
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(entry.isIntersecting)
      if (entry.isIntersecting) setSeen(true)
    }, { rootMargin: "80px" })
    if (element.current) observer.observe(element.current)
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setReduced(motion.matches)
    motion.addEventListener("change", update)
    return () => { observer.disconnect(); motion.removeEventListener("change", update) }
  }, [])
  return <div ref={element} className={`landing-shader ${className}`} aria-hidden="true">
    {seen && (variant === "radial" ? <StaticRadialGradient
      width="100%" height="100%" colors={["#00bbff", "#00ffe1", "#ffffff"]}
      colorBack="#000000" radius={1.55} focalDistance={0.99} focalAngle={0}
      falloff={0.24} mixing={0.5} distortion={0} distortionShift={0}
      distortionFreq={12} grainMixer={0} grainOverlay={0} maxPixelCount={921600}
    /> : <Dithering
      width="100%" height="100%" colorBack="#000000" colorFront="#00b3ff"
      shape="sphere" type="4x4" size={2} speed={visible && !reduced ? 1 : 0}
      scale={0.6} maxPixelCount={360000}
    />)}
  </div>
}
