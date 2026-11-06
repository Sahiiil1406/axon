# ASCII sharks

Used as the full-width animated background of the landing-page hero.

```tsx
import { AsciiSharks, type SharkSpec } from "@/components/ascii-sharks"

const sharks: SharkSpec[] = [
  { kind: "hammerhead", size: 1 },
  { kind: "mako", size: 0.7 },
]

// Add this only when the animation should be displayed:
<div className="h-96 overflow-hidden">
  <AsciiSharks sharks={sharks} />
</div>
```

Omit `sharks` for the original four classic sharks. Available kinds: `classic`,
`hammerhead`, `greathammer`, `zebra`, `tiger`, `mako`, `thresher`, `nurse`.
`size` is relative to the largest shark. Keep custom arrays stable to avoid
restarting the simulation on every parent render.

The canvas fills its container, with a default minimum height of 16rem.
Use `className` or `style` to control dimensions and font. A monospace system
font is provided; no external font request or additional package is needed.
The original canvas colors and simulation are preserved.

The engine starts on mount, resizes with its container, pauses off-screen,
respects reduced motion, and cleans up animation frames, observers, and pointer
listeners on unmount. `AsciiOcean` is an alias. Engine and simulation exports
remain available for advanced canvas usage.

Original ASCII sharks code by drewdi, MIT licensed; see [LICENSE](./LICENSE).

Hovering a large shark glyph reveals tracking corner brackets and a following identity card.
Small schooling fish and water ripple dots do not trigger hover details.
Agent and human profiles, permissions, scopes, and budgets are illustrative hero
content, not live wallet or registry data. The swimmers keep moving while selected.

The hero also acts as a spatial permission zone. Fish are split into three stable
cohorts: confined to cyan, denied cyan entry, or unrestricted. Restricted fish
reflect at the zone edges; respawns and resizing obey the same rules. The zone is
measured from the actual hero element, so desktop and mobile margins stay aligned.
Sharks remain unrestricted. Each hover card includes its movement policy.
Outside the hero, the reusable component has no permission zone.

Run collision checks with `npm run test:ocean` from the frontend directory.

Use `<AsciiSharks static />` for a single posed shark rendered by the same ASCII
renderer on a transparent canvas. Static mode has no animation loop, pointer
listeners, or observers. The Docs sidebar uses this mode with a slight CSS tilt.
