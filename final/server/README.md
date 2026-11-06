# Axon demo server

Runs the existing FinalCounter API and serves the built frontend on the same origin.

## Install and run

From the repository root:

```sh
npm install --prefix codegen
npm install --prefix sdk
npm install --prefix final/server
npm run build --prefix final/frontend
npm run typecheck --prefix final/server
npm start --prefix final/server
```

The SDK uses shared manifest types from codegen, so install all three packages for type checking. `npm run dev --prefix final/server` restarts the server when its source changes. `build` runs TypeScript validation without emitting files; `start` executes the actual `index.ts` entry using tsx.

## Configuration

The first existing environment file is used: `final/server/.env`, then `final/.env`, then the repository `.env`. Existing process environment values take precedence. Keys remain in the server environment.

Required settings: `DEPLOYER_PRIVATE_KEY`, `AGENT_PRIVATE_KEY`, `RPC`, `SIDECAR`, `REGISTRY_ADDRESS`, `ACCOUNT_ADDRESS`, and `FINAL_COUNTER_ADDRESS`. `CHAIN_ID` defaults to 1337, `FINAL_PORT` (or `PORT`) to 8900, and `FINAL_HOST` (or `HOST`) to 127.0.0.1.

A deployment JSON is optional. Set `FINAL_DEPLOYMENTS_FILE`, or place it at `final/contract/deployments.json`, `final/server/deployments.json`, or `final/deployments.json`. Explicit environment settings override deployment fields. The counter ABI is declared directly from the Solidity public interface, so startup does not require an `out/` artifact.

## Routes

- `GET /api/health`: read-only RPC/chain health.
- `GET /api/state`: contract state, grant, allowlist, functions, balances and session history.
- `POST /api/call`: server-signed human or agent transaction.
- `POST /api/permission`: owner-signed grant/allowlist/revocation changes.
- `/app`, `/app/permissions`, `/app/activity`, `/app/transactions/:id`: frontend routes.

The static frontend is served from `final/frontend/dist`. Legacy `/demo` and `/permissions` links redirect to their new console routes. Calls and permission changes submit actual transactions using the configured server keys.

The SDK frame and builder tests run with:

```sh
cd sdk
npx tsx --test test/frame.test.ts test/builder.test.ts
```

The separate manifest test suite additionally requires the generated `codegen/manifest.json`.

## Fresh devnet deployment

After a devnet reset, fund `DEPLOYER_PRIVATE_KEY` on the configured chain, then run:

```sh
npm run deploy --prefix final/contract -- --stack
```

This builds and deploys the registry, agent account and counter, activates a seven-day
0.01 ETH/day grant, allows the three counter methods, funds the account to 0.1 ETH,
and stakes it using the sidecar configuration. It updates `final/deployment.json`
and the addresses in the three existing environment files. Restart the server afterward.
World ID and ENS settings are preserved.

To finish setup for an already deployed counter without deploying another, use
`--counter ADDRESS` instead of `--stack`. If it is not yet recorded in the deployment
file, provide its transaction hash as `FINAL_COUNTER_DEPLOY_TX`.
