# Axon design system

The Axon site presents the repository’s EIP-8141 devnet prototype: owner-defined grants, scoped agent intents, live registry reads through an alt mempool, and protocol-owned execution rules.

## Preview

Run `npm run dev` in frontend. Routes: `/` for the homepage, `/docs` for the technical overview, and `/design-system` for the component catalog. `npm run build` produces the static site. Static hosting needs an index.html fallback for the two additional routes.

## Brand and theme

Only accents use the supplied palette. The original neutral surfaces, text, and borders remain gray.

| Token | Value | Use |
| --- | --- | --- |
| `--axon-mint` / `--primary` | #68F2C2 | Main actions, positive signals |
| `--axon-blue` | #59BFDE | Supporting accent, gradients |
| `--axon-teal` | #31A6C0 | Deeper illustration accent |
| `--axon-cyan` / `--ring` | #57D8EB | Focus, validation-path emphasis |
| `--axon-aqua` | #66EDE3 | Supporting accent, code |
| `--background` | #151414 | Page surface |
| `--card` | #191817 | Raised gray surface |
| `--foreground` | #F0E3DE | Main neutral text |
| `--muted-foreground` | #9A9390 | Supporting neutral text |
| `--border` | #F0E3DE20 | Subtle rules and patterns |

`src/index.css` maps these into shadcn’s semantic theme, including charts, inputs, sidebar and focus tokens. Red remains the existing destructive-state color.

Landing panels, code blocks, tab groups, form fields, and actions use sharp corners. CornerMarkers is shared across the hero, flow nodes, code panels, and playground. The page retains the geometric language: 1200px content rails, 1480px outer rails, 12px dot repeats, dashed rules at a 32px repeat, and 14px square corner markers centered on the 1px border intersections. The retained STK Bureau Sans font is served locally. Assets and runtime modules from the prior reference page are removed.

## Components

- `src/components/brand/axon-shell.tsx`: shared Axon navigation and footer.
- `src/components/brand/primitives.tsx`: Axon logo, actions, links, headings and feature cards.
- `src/components/brand/reference-frame.tsx`: bordered section with corner markers. `.reference-rails` adds the surrounding pattern.
- `src/components/ui/button.tsx`: themed shadcn/Base UI button variants.
- `src/pages/axon-home.tsx`: homepage with architecture, authority boundaries, live-vs-mirrored comparison, policy playground and developer example.
- `src/pages/docs.tsx`: technical copy grounded in the Solidity contracts.
- `src/pages/design-system.tsx`: palette and component examples.

## Behavior and content

The policy playground is an illustrative local simulation of grant-active, target-allowlist and epoch-budget checks. It does not submit transactions. Full account validation also covers signature, nonce, deadline and grant freshness; protocol execution has its own constraints. The site labels the current implementation as an EIP-8141 prototype and does not claim production usage, audits, integrations or customers.

Homepage technical statements are grounded in PermissionRegistry, AgentAccount, MirrorAgentAccount, AgentNative and the demo AgentVault. The mirrored account needs explicit synchronization; the live-read account observes the current registry. Grant changes invalidate old hashes. Time-dependent checks belong in execution.

## Language

Lead with owner authority and bounded agent autonomy. Explain the difference between an agent’s identity, its delegated authority and a protocol’s independent rules. Avoid invented adoption metrics and claims that a local policy preview proves transaction safety.

## Transaction console

`src/console/` contains the live workspace, separate from marketing pages. Its CSS is scoped to `.console-*` classes and loads only for `/app` routes. It reuses the Axon logo, button, border and corner-anchor primitives without changing the homepage. The sidebar, dense statistic strip, transaction tables, receipt definitions, permission editor and confirmation dialog retain the gray surfaces and five accent colors.
