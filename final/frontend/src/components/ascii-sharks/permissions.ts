export type MovementPolicy = "confined" | "excluded" | "unrestricted";
export interface PermissionBounds { left: number; right: number; top: number; bottom: number }
export interface SwimmerPosition { x: number; y: number; vx: number; vy: number }
export const MOVEMENT_LABELS: Record<MovementPolicy, string> = {
  confined: "Cyan zone only",
  excluded: "Cyan entry denied",
  unrestricted: "Unrestricted roaming",
};

/** Resolve a movement against the permission zone, retaining tangential velocity. */
export function enforceMovement(fish: SwimmerPosition, policy: MovementPolicy, bounds: PermissionBounds, previous = { x: fish.x, y: fish.y }, padding = 8) {
  if (policy === "unrestricted") return;
  if (policy === "confined") {
    const left = bounds.left + padding, right = bounds.right - padding;
    const top = bounds.top + padding, bottom = bounds.bottom - padding;
    if (left >= right || top >= bottom) return;
    if (fish.x < left) { fish.x = left; fish.vx = Math.abs(fish.vx); }
    if (fish.x > right) { fish.x = right; fish.vx = -Math.abs(fish.vx); }
    if (fish.y < top) { fish.y = top; fish.vy = Math.abs(fish.vy); }
    if (fish.y > bottom) { fish.y = bottom; fish.vy = -Math.abs(fish.vy); }
    return;
  }
  const left = bounds.left - padding, right = bounds.right + padding;
  const top = bounds.top - padding, bottom = bounds.bottom + padding;
  const inside = (x: number, y: number) => x > left && x < right && y > top && y < bottom;
  // Initial placement and resize: move denied fish to the nearest exterior edge.
  if (inside(previous.x, previous.y)) {
    const distances = [fish.x - left, right - fish.x, fish.y - top, bottom - fish.y];
    const face = distances.indexOf(Math.min(...distances));
    if (face === 0) { fish.x = left - 0.1; fish.vx = -Math.abs(fish.vx); }
    if (face === 1) { fish.x = right + 0.1; fish.vx = Math.abs(fish.vx); }
    if (face === 2) { fish.y = top - 0.1; fish.vy = -Math.abs(fish.vy); }
    if (face === 3) { fish.y = bottom + 0.1; fish.vy = Math.abs(fish.vy); }
    return;
  }
  // Segment/rectangle intersection also catches fast movement through the zone.
  const dx = fish.x - previous.x, dy = fish.y - previous.y;
  const hits: { t: number; nx: number; ny: number }[] = [];
  if (dx > 0 && previous.x <= left) hits.push({ t: (left - previous.x) / dx, nx: -1, ny: 0 });
  if (dx < 0 && previous.x >= right) hits.push({ t: (right - previous.x) / dx, nx: 1, ny: 0 });
  if (dy > 0 && previous.y <= top) hits.push({ t: (top - previous.y) / dy, nx: 0, ny: -1 });
  if (dy < 0 && previous.y >= bottom) hits.push({ t: (bottom - previous.y) / dy, nx: 0, ny: 1 });
  for (const hit of hits.sort((a, b) => a.t - b.t)) {
    if (hit.t < 0 || hit.t > 1) continue;
    const x = previous.x + dx * hit.t, y = previous.y + dy * hit.t;
    if (x < left - 0.01 || x > right + 0.01 || y < top - 0.01 || y > bottom + 0.01) continue;
    fish.x = x + hit.nx * 0.1;
    fish.y = y + hit.ny * 0.1;
    if (hit.nx) fish.vx = Math.abs(fish.vx) * hit.nx;
    if (hit.ny) fish.vy = Math.abs(fish.vy) * hit.ny;
    return;
  }
}
