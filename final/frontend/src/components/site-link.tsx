import type { AnchorHTMLAttributes } from "react"
import { Link } from "react-router-dom"

export function SiteLink({
  href = "",
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return href.startsWith("/") && !href.startsWith("//") ? (
    <Link to={href} {...props} />
  ) : (
    <a href={href} {...props} />
  )
}
