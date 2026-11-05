import { SiteLink } from "@/components/site-link"
import type { ReactNode } from "react"
import { ArrowUpRight } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function Logo() {
  return (
    <SiteLink href="/" className="brand axon-brand" aria-label="Axon home">
      <svg
        width="40"
        height="40"
        viewBox="0 0 406 488"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M203 0L378.803 366H27.1968L203 0Z" fill="#1B5C6C" />
        <path
          d="M363 270C274.911 270 203.5 336.262 203.5 418C203.5 336.262 132.089 270 44 270C132.089 270 203.5 155.385 203.5 14C203.5 155.385 274.911 270 363 270Z"
          fill="#8ECED0"
        />
      </svg>

      <span>AXON</span>
    </SiteLink>
  )
}
export function ActionLink({
  href,
  children,
  variant = "default",
  className,
}: {
  href: string
  children: ReactNode
  variant?: "default" | "outline" | "secondary"
  className?: string
}) {
  return (
    <SiteLink
      href={href}
      className={cn(buttonVariants({ variant, size: "lg" }), className)}
    >
      {children}
    </SiteLink>
  )
}
export function TextLink({
  href,
  children,
}: {
  href: string
  children: ReactNode
}) {
  return (
    <SiteLink className="text-link" href={href}>
      {children}
      <ArrowUpRight size={16} />
    </SiteLink>
  )
}
export function SectionHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string
  title: string
  children?: ReactNode
}) {
  return (
    <div className="section-heading">
      {eyebrow && <div className="eyebrow mb-5">{eyebrow}</div>}
      <h2 className="section-title">{title}</h2>
      {children && <p className="body-copy">{children}</p>}
    </div>
  )
}
export function FeatureCard({
  icon,
  title,
  children,
  href,
}: {
  icon: ReactNode
  title: string
  children: ReactNode
  href?: string
}) {
  return (
    <article className="surface feature">
      <div className="text-primary">{icon}</div>
      <h3>{title}</h3>
      <p className="body-copy text-sm">{children}</p>
      {href && <TextLink href={href}>Explore {title.toLowerCase()}</TextLink>}
    </article>
  )
}
export function Globe() {
  return (
    <div
      className="globe"
      role="img"
      aria-label="Illustration of a distributed agent network"
    >
      <svg viewBox="0 0 500 500" fill="none">
        <defs>
          <radialGradient id="glow">
            <stop stopColor="#68f2c2" />
            <stop offset="1" stopColor="#31a6c0" />
          </radialGradient>
        </defs>
        <g stroke="#59bfde" strokeOpacity=".25">
          <circle cx="250" cy="250" r="245" />
          {[65, 135, 200].map((r) => (
            <ellipse key={r} cx="250" cy="250" rx={r} ry="245" />
          ))}
          {[75, 155, 250, 345, 425].map((y, i) => (
            <ellipse
              key={y}
              cx="250"
              cy={y}
              rx={[175, 226, 245, 226, 175][i]}
              ry="34"
            />
          ))}
          <path
            d="M70 150Q250 20 410 300M90 350Q180 100 400 140M150 430Q250 150 420 220"
            stroke="#66ede3"
            strokeOpacity=".9"
          />
        </g>
        {Array.from({ length: 95 }, (_, i) => {
          const a = i * 2.39996
          const r = Math.sqrt(i / 95) * 225
          return (
            <circle
              key={i}
              cx={250 + Math.cos(a) * r}
              cy={250 + Math.sin(a) * r * 0.85}
              r={i % 7 === 0 ? 3 : 1.3}
              fill="url(#glow)"
              opacity={i % 3 === 0 ? 0.9 : 0.45}
            />
          )
        })}
        <circle cx="90" cy="350" r="5" fill="#68f2c2" />
        <circle cx="400" cy="140" r="5" fill="#68f2c2" />
      </svg>
    </div>
  )
}
