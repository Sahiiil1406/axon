# Axon

**Agent-native accounts for Ethereum.** An agent should get a policy, not a private key.

Axon makes the owner's permissions a first-class part of the transaction — enforced by
the account's own validation frame — and gives developers the SDK and admission rules to
build for agents at all.

## ENSv2 Integration (ENSv2 track)

Axon integrates ENSv2 as the agent identity and permission control plane:

- **Human name:** a main ENS name (e.g. `alice.eth`) on Sepolia
- **Agent subdomains:** each agent lives as a subdomain (e.g. `trader.alice.eth`) with its own
  **Permissioned Resolver** holding axon text records
  (`axon.account`, `axon.agentKey`, `axon.budget`, `axon.active`, `axon.version`,
  `axon.allowlist`)
- **IAM map:** the `agent_subdomain → permission` mapping lives on ENSv2 itself. The parent
  name owner controls all agent permissions via Enhanced Access Control on each subdomain's
  resolver
- **Execution:** permissions are synced from ENS text records to axon's devnet
  `PermissionRegistry`, so `AgentAccount.validate()` enforces them at frame-tx validation
  time
- **World ID Agent Pass:** authority changes (create agent, update budget/allowlist, revoke)
  require a human World ID verification before the owner transaction is submitted

**Two chains:** ENSv2 identity lives on Sepolia; agent execution runs on the EIP-8141 devnet
(chain 1337).

## Run locally

With Node.js 24 and npm installed, run from the repository root:

```sh
./start.sh
```

This installs missing SDK, server, and frontend dependencies, then starts the API
and Vite with automatic reload. Open <http://localhost:5173> or
<http://localhost:5173/app>. The API runs on port 8900; frontend API requests are
proxied to it. Press Ctrl+C to stop both services.

The server uses the existing `.env` configuration and `final/deployment.json`.
The configured devnet RPC and sidecar run remotely. Starting the app does not
redeploy contracts or execute agent transactions.

## ENS / World ID environment variables (`final/server/.env`)

```
# ENSv2 on Sepolia — agent identity & control plane
SEPOLIA_RPC=https://sepolia.infura.io/v3/YOUR_KEY
SEPOLIA_OWNER_PRIVATE_KEY=0x...          # owner key for ENS text record updates
ENS_REGISTRY=0x...                        # Sepolia ENS Registry address
HUMAN_ENS_NAME=alice.eth                  # human parent name

# World ID Agent Pass — human approval gate for authority changes
WORLD_ID_APP_ID=your_app_id               # from https://auth.world.org/portal
WORLD_ID_RP_ID=rp_...
WORLD_ID_SIGNER_ADDRESS=0x...
WORLD_ID_RP_SIGNING_KEY=...               # private RP signing key, server only
WORLD_ID_VERIFIER_URL=https://developer.world.org/api/v4
```

## Console routes

- `/app` — human vs agent call console (optional ENS agent selector)
- `/app/agents` — ENS agent subdomain manager (create, resolve, revoke agents)
- `/app/permissions` — permission editor (default account or ENS-scoped agents)
- `/app/activity` — transaction history

## API endpoints

- `GET /api/state` — now includes `ens` (human name + resolved agents)
- `GET /api/ens/resolve?name=trader.alice.eth` — resolve an agent subdomain
- `GET /api/ens/agents?name=alice.eth` — list agents under a human name
- `POST /api/ens/register` — create a new agent subdomain (World ID gated)
- `POST /api/call` — accepts optional `agentName` to call as that ENS agent
- `POST /api/permission` — accepts `agentName` + `worldIdProof` for ENS-scoped updates

To choose different local ports:

```sh
FINAL_PORT=8902 FRONTEND_PORT=5175 ./start.sh
```
