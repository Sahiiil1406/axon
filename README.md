# Axon

**Agent-native accounts for Ethereum.** An agent should get a policy, not a private key.

Axon makes the owner's permissions a first-class part of the transaction — enforced by
the account's own validation frame — and gives developers the SDK and admission rules to
build for agents at all.
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

To choose different local ports:

```sh
FINAL_PORT=8902 FRONTEND_PORT=5175 ./start.sh
```
