# Axon: World ID + ENS demonstration

## Product story

A person creates a named agent and defines what it may do. World ID supplies a human checkpoint before agent registration or an authority change. ENS supplies a readable agent identity on Sepolia. Axon's live registry and account enforce the permitted actions on the execution devnet.

Proof of Human is used because the requested assertion is humanness. The workflow does not need passport attributes, nationality or age. Humanness is not wallet ownership, ENS ownership or authority to execute a contract call. Those are separate responsibilities. The current demo uses configured server signers; do not describe it as a complete self-custodial wallet onboarding product.

## Show the real integration

1. Open `/app`. Point out the separate World ID, ENS and Axon roles.
2. Open `/app/agents`. Show the configured ENS namespace and the current agent tree.
3. Request a World ID proof. Approve using a supported credential in the actual IDKit flow. The frontend then shows **Proof ready**, not **Server verified**.
4. Register an agent. The backend verifies the submitted result before writing identity records. Show the returned agent name and actual Sepolia transaction evidence.
5. Open `/app/permissions`. Select that agent and obtain a fresh proof if the preceding action consumed the previous one. Submit a permission change and show its actual owner transaction.
6. Run an agent action in `/app`. Explain that normal delegated execution uses the live grant, not a new World ID prompt for each autonomous action.
7. Show the admission result and execution receipt in Activity.

The backend's World ID verifier is in `server/index.ts`; protected routes include `/api/ens/register` and `/api/permission`. The frontend widget is in `frontend/src/console/console-app.tsx`. The new identity overview is in `frontend/src/console/identity-overview.tsx`.

## Meaningful alternative path

Cancel a proof request or demonstrate an unavailable credential. Keep the UI in a non-proof-ready state and show that the protected create/update workflow cannot be completed without proof. Retry successfully if possible. Record the actual behavior encountered; do not substitute a local testing bypass for successful verification.

The optional local test skip must be identified as a bypass. It does not demonstrate a successful World ID verification. A generic `verified` UI state or receiving a client callback alone is not evidence that the server accepted the proof.

## Integration debrief — complete from a real session

- Time from starting integration to the first server-accepted protected action: **record actual time; not measured here**.
- Credential and environment used: **record actual credential and environment**.
- Successful verification evidence: **record the protected action result and resulting transaction, without publishing proof payloads or secrets**.
- Alternative path tested: **record cancellation, rejection or unavailable-credential behavior actually observed**.
- Friction encountered: **record the concrete SDK, configuration or user-flow issue**.
- Missing capability or documentation: **record the specific gap and page involved**.
- Highest-impact improvement: **choose one based on that session**. One candidate to evaluate is making the distinction between receiving a session proof and server verification before a protected write clearer.

This checklist documents what still needs to be demonstrated; it does not assert prize qualification or a successful production proof run.
