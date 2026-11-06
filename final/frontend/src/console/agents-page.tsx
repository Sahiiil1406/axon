import { useState, type FormEvent } from "react"
import { ChevronRight, File, Folder, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { registerEnsAgent } from "./api"
import { Badge, ChainLink, CopyButton, DefinitionList, PageHeading, Panel } from "./components"
import { eth } from "./format"
import { useConsole } from "./model"

export function AgentsPage() {
  const { state, ens, refreshEns, worldIdStatus, worldIdSkipped, skipWorldId, takeWorldIdProof, verifyWorldId } = useConsole()
  const [subdomain, setSubdomain] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string>()
  const [createdAgent, setCreatedAgent] = useState<string>()
  const [registrations, setRegistrations] = useState<
    Record<string, string | undefined>
  >({})
  const registrationParent = ens.humanName ?? state?.ens?.humanName
  const registeredAgents = new Map(
    [...(state?.ens?.agents ?? []), ...ens.agents].map((agent) => [
      agent.name,
      agent,
    ])
  )
  const agentNames = [...new Set([...registeredAgents.keys(), ...Object.keys(registrations)])]
  const agentsByParent = new Map<string, string[]>()
  for (const name of agentNames) {
    const parent = registrationParent ?? name.split(".").slice(1).join(".")
    const children = agentsByParent.get(parent) ?? []
    children.push(name)
    agentsByParent.set(parent, children)
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting || !registrationParent || worldIdStatus !== "verified")
      return

    setSubmitting(true)
    setError(undefined)
    setCreatedAgent(undefined)
    try {
      const result = await registerEnsAgent({
        subdomain: subdomain.trim(),
        agentKey: "",
        agentAccount: "",
        worldIdProof: takeWorldIdProof(),
      })
      setCreatedAgent(result.agent)
      setRegistrations((previous) => ({
        ...previous,
        [result.agent]: result.txs.at(-1)?.hash ?? previous[result.agent],
      }))
      setSubdomain("")
      await refreshEns()
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Failed to create agent."
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <PageHeading eyebrow="ENS / AGENT IDENTITY" title="Agent subdomains">
        Browse registered agents under their ENS names.
      </PageHeading>

      <Panel
        eyebrow="01 / ENS namespace"
        title="Agent tree"
        action={
          <Badge tone="muted">
            {agentNames.length} {agentNames.length === 1 ? "agent" : "agents"}
          </Badge>
        }
      >
        {!agentNames.length && <p className="console-help">No registered agents yet.</p>}
        <ul className="console-agent-tree">
          {[...agentsByParent].map(([parent, names]) => (
            <li key={parent}>
              <details className="console-agent-folder" open>
                <summary>
                  <ChevronRight size={13} className="console-agent-chevron" />
                  <Folder size={16} />
                  <strong>{parent}</strong>
                </summary>
                <ul className="console-agent-branches">
                  {names.map((name) => {
                    const agent = registeredAgents.get(name)
                    const hash = registrations[name] ?? agent?.registrationTxHash
                    return (
                      <li key={name}>
                        <details className="console-agent-file">
                          <summary>
                            <ChevronRight
                              size={13}
                              className="console-agent-chevron"
                            />
                            <File size={15} />
                            <span className="console-agent-name">{name}</span>
                            <a
                              className="console-chain-link"
                              href={hash
                                ? `https://sepolia.etherscan.io/tx/${encodeURIComponent(hash)}`
                                : `https://sepolia.app.ens.domains/${encodeURIComponent(name)}`}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(event) => event.stopPropagation()}
                            >
                              {hash ? "Sepolia transaction" : "View on ENS"}
                            </a>
                          </summary>
                          <div className="console-agent-file-details">
                            <CopyButton value={name} label="Copy name" />
                            <DefinitionList
                              rows={[
                                [
                                  "Account",
                                  <ChainLink value={agent?.account} />,
                                ],
                                [
                                  "Agent key",
                                  <ChainLink value={agent?.agentKey} />,
                                ],
                                [
                                  "Budget",
                                  agent?.budget != null
                                    ? `${eth(agent.budget)} ETH per epoch`
                                    : "—",
                                ],
                              ]}
                            />
                          </div>
                        </details>
                      </li>
                    )
                  })}
                </ul>
              </details>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel eyebrow="02 / Create agent" title="Register a new agent subdomain">
        <form className="console-form" onSubmit={handleCreate}>
          <label htmlFor="create-name">
            Agent subdomain
            <input
              id="create-name"
              value={subdomain}
              onChange={(event) => setSubdomain(event.target.value)}
              placeholder="analyst"
              required
            />
          </label>
          {registrationParent ? (
            <p className="console-muted">
              Registers under {registrationParent}.
            </p>
          ) : (
            <p className="console-help">
              Registration requires a parent ENS name on the server.
            </p>
          )}
          <p className="console-help">
            This name uses the configured devnet account and its existing grant.
            Edit the grant on the Permissions page.
          </p>
          <div className="console-worldid-row">
            <Button
              type="button"
              variant="outline"
              disabled={
                !registrationParent ||
                submitting ||
                worldIdStatus === "verifying"
              }
              onClick={() => void verifyWorldId()}
            >
              {worldIdStatus === "verifying"
                ? "Verifying…"
                : "Verify with World ID"}
            </Button>
            {state?.worldIdTestSkip && worldIdStatus !== "verified" && (
              <Button type="button" variant="outline" onClick={skipWorldId}
                disabled={!registrationParent || submitting || worldIdStatus === "verifying"}>
                Skip World ID for testing
              </Button>
            )}
            {worldIdStatus === "verified" && <Badge tone="good">{worldIdSkipped ? "Skipped for testing" : "Proof ready"}</Badge>}
          </div>
          {error && (
            <p className="console-inline-error" role="alert">
              {error}
            </p>
          )}
          {createdAgent && <p role="status">Registered {createdAgent}.</p>}
          <Button
            type="submit"
            disabled={
              !registrationParent ||
              submitting ||
              !subdomain.trim() ||
              worldIdStatus !== "verified"
            }
          >
            <UserPlus size={14} />
            {submitting ? "Creating…" : "Create agent"}
          </Button>
        </form>
      </Panel>
    </>
  )
}
