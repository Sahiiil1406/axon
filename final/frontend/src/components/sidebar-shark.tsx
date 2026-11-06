import { AsciiSharks } from "./ascii-sharks"

/** The same shark renderer as the hero, posed once with no animation or input. */
export function SidebarShark() {
  return <figure className="sidebar-shark" role="img" aria-label="Static ASCII shark">
    <AsciiSharks static className="sidebar-shark-canvas" />
  </figure>
}
