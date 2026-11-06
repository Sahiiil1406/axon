# Axon

**Agent-native accounts for Ethereum.** An agent should get a policy, not a private key.

Axon makes the owner's permissions a first-class part of the transaction — enforced by
the account's own validation frame — and gives developers the SDK and admission rules to
build for agents at all.

## ENSv2 Integration (ENSv2 track)

Axon uses Sepolia for agent identity and the EIP-8141 devnet for permissions:

- **Agent names:** Axon resolves each name to its account and agent key using Sepolia records.
- **Execution:** The devnet `PermissionRegistry` stores the effective budget, allowlist,
  and revocation state. Permission updates write only to the devnet.

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
<http://localhost:5173/app>. The API runs on port 8900 and serves JSON only when launched with this script.
The frontend sends API requests directly to it. Press Ctrl+C to stop both services.

The server uses the existing `.env` configuration and `final/deployment.json`.
The configured devnet RPC and sidecar run remotely. Starting the app does not
redeploy contracts or execute agent transactions.

## ENS / World ID environment variables (`final/server/.env`)

```
# ENSv2 on Sepolia — agent identity & control plane
SEPOLIA_RPC=https://sepolia.infura.io/v3/YOUR_KEY
SEPOLIA_OWNER_PRIVATE_KEY=0x...          # owner key for ENS text record updates
ENS_REGISTRY=0x...                        # Axon AgentNameRegistry deployed on Sepolia
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

## Run the demo with Codex

Set the agent’s budget and allowed functions in the Axon Permissions page.
Then use the [axon-transactions skill](.agents/skills/axon-transactions/SKILL.md)
in Codex and ask it to increment FinalCounter or pay an exact ETH amount.
When no agent name is given, the skill uses the configured default devnet account.

The skill runs the SDK directly against chain 1337. For named agents, it reads the name
binding from Sepolia and uses the local agent signer. The web server is only
needed to manage permissions. Add `--simulate` to the command for a preview
that does not submit a transaction.
