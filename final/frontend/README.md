# Axon frontend

Axon’s landing page, technical overview, and reusable design system. Built with React, TypeScript, Vite, Tailwind, and shadcn/Base UI.

```sh
npm install
npm run dev
npm run build
```

Routes: `/`, `/docs`, `/design-system`. Configure static hosts with an index.html fallback.

The landing-page policy playground runs local illustrative checks; it does not submit blockchain transactions. Technical content is grounded in the Solidity implementation under `../contracts/src`.

See [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) for palette, neutral colors, corner frames, components, and content conventions.

## Live console routes

The legacy demo is integrated as React pages with the Axon theme:

- `/app`: function selector, amount presets, `humanCall` / `agentCall`, counter and payment comparison, latest receipt and recent calls.
- `/app/permissions`: live grant details, epoch budget, selector allowlist, save/regrant, reset, revocation confirmation, and owner transaction results.
- `/app/activity`: searchable history with lane/outcome filters and JSON export.
- `/app/transactions/:id`: complete receipt, preflight result, VERIFY/SENDER frames, canonical probe, all ERC-8421 admission checks, raw JSON and explorer links. Failed attempts without a transaction hash have stable timestamp-based IDs.

The homepage, its navigation, and its styles are unchanged. The console has its own navigation and lazily loaded, scoped stylesheet.

### API connection

The console calls the existing server contract: `GET /api/state`, `POST /api/call` with `{lane, function, amountEth}`, and `POST /api/permission` with `{budgetEth, allow}` or `{active:false}`. Signers remain server-side.

Vite development and preview proxy `/api` to `http://127.0.0.1:8900`. Set `AXON_API_PROXY_TARGET` to use a different server. See `.env.example`. Production should reverse-proxy `/api` to the demo server; alternatively set `VITE_AXON_API_URL` to a backend that supports the necessary CORS requests. Neither variable should contain private keys.

Missing/unreachable APIs show an error, retain the last successfully loaded state, and disable transaction controls. There is no simulated data fallback. Mutations are serialized, never retried automatically, and explicitly report failures. Permission drafts survive unrelated state updates until saved, reset, or explicitly reloaded.

### Validation

`npm run test:console` runs the request-contract, amount precision, formatting and failure tests using Node 22.18+ or 24+. `npm run build` performs TypeScript checking and a production build.

For browser QA without chain transactions, use the test-only fixture in a separate terminal:

```sh
npm run test:fixture
AXON_API_PROXY_TARGET=http://127.0.0.1:8901 npm run dev -- --port 5181
```

The fixture is never imported by the application or used as a live API fallback. Stop it when testing is complete. It exercises calls, payments, budget rejection, allowlists, grant revocation/regrant and history through the same HTTP contract.

## ASCII sharks component

`src/components/ascii-sharks` contains the reusable `AsciiSharks` component,
its canvas engine, types, usage notes, and MIT license. The landing-page hero
uses it as a full-width background. See its [README](./src/components/ascii-sharks/README.md).
