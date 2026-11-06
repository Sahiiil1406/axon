# One-server deployment on Render

The frontend and API use the same origin. The build copies `final/frontend/dist/` into `final/server/public/`. The production entrypoint runs `final/server/index.ts`, which serves those files and `/api/*`. No separate frontend service or Vite process is needed.

## Render settings

Create a **Web Service** from this repository, not a Static Site.

| Setting | Value |
| --- | --- |
| Branch | `ux-enhancment` (or the branch containing these scripts) |
| Runtime | Node |
| Root Directory | Leave empty: repository root (`.`), not `final/server` |
| Build Command | `bash build.sh` |
| Start Command | `bash deploy.sh` |
| Health Check Path | `/api/ready` |
| Node version | `24.19.0`, also set in `.node-version` |

Alternatively, create a Render Blueprint using the root `render.yaml`. Values marked `sync: false` must be entered privately in Render. The scripts do not publish anything by themselves; Render invokes the build and production process commands after you create the service.

The repository root is required because the server imports the local SDK, the SDK references codegen types, and the frontend docs import `sdk/README.md`.

## Environment variables

Copy the **current values** from your working local configuration into Render's Environment tab. Do not commit private keys or upload `.env` as a frontend asset. The build does not need signing secrets; the running API does.

### Core API / execution

- `NODE_ENV=production`
- `FINAL_HOST=0.0.0.0`
- `FINAL_API_ONLY=false`
- `WORLD_ID_TEST_SKIP=false`
- `RPC`: EIP-8141 execution RPC URL.
- `SIDECAR`: alternative-mempool RPC URL.
- `CHAIN_ID=1337` if that is the execution chain in use.
- `DEPLOYER_PRIVATE_KEY`: configured demo owner signer, 0x-prefixed 32-byte key.
- `AGENT_PRIVATE_KEY`: signer matching the live account grant, 0x-prefixed 32-byte key.
- `REGISTRY_ADDRESS`: current deployed registry.
- `ACCOUNT_ADDRESS`: current deployed agent account.
- `FINAL_COUNTER_ADDRESS`: current deployed demo target.

Render assigns `PORT`; do not hard-code it. `deploy.sh` maps it to `FINAL_PORT` and always binds `0.0.0.0`, overriding a copied local FINAL_HOST value. If no hosting-platform port is provided, the local default is 8900.

The server can read public deployment metadata from `final/deployment.json`, but explicitly set the three address variables above when the live deployment differs. A devnet reset can invalidate old addresses.

### ENS on Sepolia

- `SEPOLIA_RPC`
- `SEPOLIA_OWNER_PRIVATE_KEY`
- `ENS_REGISTRY`
- `HUMAN_ENS_NAME`, such as the parent namespace you already control.

Use the configured resolver/name-registry deployment expected by the application. A generic ENS registry address is not interchangeable with the app's configured contract.

### World ID

- `WORLD_ID_APP_ID`
- `WORLD_ID_RP_ID`
- `WORLD_ID_SIGNER_ADDRESS`
- `WORLD_ID_RP_SIGNING_KEY`
- Optional: `WORLD_ID_VERIFIER_URL`, if you intentionally use a different verifier endpoint.

Use the matching RP signing key and signer address from your working setup. Configure the deployed application domain in the World developer configuration where required. Keep RP signing secrets server-side. Production does not allow the local verification bypass.

### Optional configuration

- `AXON_FRONTEND_ORIGINS=https://your-service.onrender.com`: explicit origin allowlist if needed. The bundled frontend uses same-origin requests.
- `FINAL_DEPLOYMENTS_FILE`: optional absolute path to a different deployment JSON.
- `BUILD_ZK=true`: also installs ZK tooling and prepares missing local proof artifacts during build. This can substantially increase build time. Existing proving keys are not overwritten.

The current `/api/zk/demo` endpoint is deliberately restricted to loopback requests, so its local-only demo button remains unavailable from a remote browser. Building proof artifacts does not remove that restriction. Normal API and frontend serving do not require ZK setup.

## Local production preview

```bash
bash build.sh
# Uses your existing server/final/root .env loading behavior.
bash deploy.sh
```

Visit `http://localhost:8900`, `/app/profile`, and `/docs/sdk/frame-builder`. To keep an already running development server on 8900:

```bash
PORT=8901 bash deploy.sh
```

The build intentionally clears `VITE_AXON_API_URL` so production assets use relative `/api` URLs rather than embedding a localhost or obsolete development API address. No frontend environment variables are needed for the single-origin deployment.

## Storage and restarts

Axon reads the agent hierarchy from Sepolia ENSv2 after each restart. Transaction history is held in process memory and resets on restart. Onchain transactions remain available in the explorer.

Generated frontend files are ignored by Git. Commit the scripts, server changes and `render.yaml`; Render builds the assets from source. The process runs TypeScript through the server's installed `tsx`, so the build explicitly installs development dependencies and must not be followed by pruning them.

## Verify deployment

```bash
curl -I https://YOUR-SERVICE.onrender.com/
curl -I https://YOUR-SERVICE.onrender.com/app/profile
curl -I https://YOUR-SERVICE.onrender.com/docs/sdk/frame-builder
curl https://YOUR-SERVICE.onrender.com/api/ready
curl https://YOUR-SERVICE.onrender.com/api/health
```

`/api/ready` is the process health check. `/api/health` additionally checks the execution RPC. Deep links return the SPA HTML; missing assets return 404. Hashed assets are cached, while HTML is revalidated so a new deploy loads the current bundle.

## Render cannot detect an open port

If an older deployed script retained `FINAL_HOST=127.0.0.1` from copied local settings, set `FINAL_HOST=0.0.0.0` in Render and redeploy. An immediate start-command override is `FINAL_HOST=0.0.0.0 bash deploy.sh`. The current script enforces that binding itself. Remove local-only `FINAL_PORT` values and let Render provide `PORT` unless you intentionally configure a custom port.
