---
name: axon-transactions
description: Execute or simulate Axon FinalCounter increments and ETH payments with the agent SDK on the EIP-8141 devnet. Use when the user requests an Axon transaction or wants to see why its agent permission check rejected or reverted a call.
---

# Axon transactions

Use the Axon repository root as the working directory. Use the registered ENS name the user identifies in the prompt, including requests phrased as “you are <name>” or “act as <name>”. Pass that name as `--agent <name>` for this invocation. When the prompt omits an agent, omit `--agent` and use the configured default devnet account. If an explicitly named agent fails resolution or signer verification, report the error for that name. The runner reads local configuration and signs with the configured agent key. Keep private keys and environment file contents out of chat, tool output, and command arguments.

## Run the request

- Increment the counter with `node --import ./agent/node_modules/tsx/dist/loader.mjs agent/scripts/counter.ts increment`.
- Pay 0.1 ETH into the counter with `node --import ./agent/node_modules/tsx/dist/loader.mjs agent/scripts/counter.ts pay 0.1`. Substitute the exact requested decimal amount.
- Append `--agent <name>` for an explicitly requested identity or `--simulate` when the user only asks to preview. Ask for the missing amount if the payment amount is ambiguous. The demo supports one FinalCounter call per invocation.
- Run one submission per explicit transaction request. If the result is pending or uncertain, report it and stop. Changing grants, selecting a different signer, and retrying a transaction require separate user direction.

Example prompt: “You are `test.supersen.eth`. Pay 0.1 ETH into FinalCounter.” Run the payment command with `--agent test.supersen.eth`.

## Axon rules

For named agents, Sepolia supplies the account and key binding. Chain 1337 supplies the live grant and enforces it. The SDK builds a signed VERIFY frame for authority and protocol checks and a matching SENDER frame for execution, deadline, and epoch budget. Simulation is diagnostic. The actual sidecar decides admission. The web UI edits grants and is independent of SDK submission. A canonical mempool diagnostic such as `StorageReadNonSender` is advisory for this alt-mempool deployment. Use the sidecar response to determine admission.

Common VERIFY codes are `E_TARGET_DENIED` for an unallowlisted selector, `E_GRANT_INACTIVE` for revocation, `E_GRANT_STALE` for a changed grant, and `E_FRAME_SHAPE` for a mismatched execution frame. The epoch budget and time-dependent rules run in SENDER, so admission can succeed even when execution reverts.

## Report the result

Report the agent, requested action, outcome, and explorer link when available. For rejection, show the returned frame and exact code, such as `VERIFY frame 0 / E_TARGET_DENIED`. For an included revert, show the failed frame when available and distinguish simulation diagnosis from confirmed receipt evidence. A pre-inclusion rejection has no onchain receipt. A simulation or pending status is not confirmation.
