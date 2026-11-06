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
  const registrationParent = ens.humanName ?? state?.ens?.humanName
  const registeredAgents = new Map(
    [...(state?.ens?.agents ?? []), ...ens.agents].map((agent) => [
      agent.name,
      agent,
    ])
  )
  const hierarchy = new Map((ens.hierarchy ?? state?.ens?.hierarchy ?? []).map(entry => [entry.name, entry]))
  const agentNames = [...new Set([...hierarchy.keys(), ...registeredAgents.keys()])]
  const agentsByParent = new Map<string, Set<string>>()
  const roots = new Set<string>()
  for (const name of agentNames) {
    const root = registrationParent && name.endsWith(`.${registrationParent}`)
      ? registrationParent
      : name.split(".").slice(1).join(".")
    roots.add(root)
    let child = name
    while (child !== root) {
      const parent = child.split(".").slice(1).join(".")
      const children = agentsByParent.get(parent) ?? new Set<string>()
      children.add(child)
      agentsByParent.set(parent, children)
      child = parent
    }
  }

  function renderBranches(parent: string): React.ReactNode {
    return [...(agentsByParent.get(parent) ?? [])].map((name) => {
      const children = agentsByParent.get(name)
      const agent = registeredAgents.get(name)
      const hash = hierarchy.get(name)?.registrationTxHash ?? agent?.registrationTxHash
      return (
        <li key={name}>
          <details className="console-agent-file">
            <summary>
              <ChevronRight
                size={13}
                className="console-agent-chevron"
              />
              {children?.size ? <Folder size={15} /> : <File size={15} />}
              <span className="console-agent-name">{name}</span>
              {(agent?.ensPublished || hierarchy.has(name)) && <a
                className="console-chain-link"
                href={`https://sepolia.app.ens.domains/${encodeURIComponent(name)}`}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => event.stopPropagation()}
              >View on ENS</a>}
              {hash && <a
                className="console-chain-link"
                href={`https://sepolia.etherscan.io/tx/${encodeURIComponent(hash)}`}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => event.stopPropagation()}
              >
                Sepolia transaction
              </a>}
            </summary>
            {agent && <div className="console-agent-file-details">
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
            </div>}
            {!!children?.size && <ul className="console-agent-branches">{renderBranches(name)}</ul>}
          </details>
        </li>
      )
    })
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

      <div className="console-agents-inline console-accent-pair">
      <Panel
        className="console-panel-cyan"
        icon={<Folder size={22}/>}
        eyebrow="01 / ENS namespace"
        title="Agent tree"
        action={
          <Badge tone="muted">
            {agentNames.length} {agentNames.length === 1 ? "agent" : "agents"}
          </Badge>
        }
      >
        {ens.error ? <p className="console-inline-error" role="alert">{ens.error}</p> : !agentNames.length && <p className="console-help">No registered ENS subnames yet.</p>}
        <ul className="console-agent-tree">
          {[...roots].map((parent) => (
            <li key={parent}>
              <details className="console-agent-folder" open>
                <summary>
                  <ChevronRight size={13} className="console-agent-chevron" />
                  <Folder size={16} />
                  <strong>{parent}</strong>
                </summary>
                <ul className="console-agent-branches">
                  {renderBranches(parent)}
                </ul>
              </details>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel className="console-panel-green" icon={<UserPlus size={22}/>} eyebrow="02 / Create agent" title="Register a new agent subdomain">
        <form className="console-form" onSubmit={handleCreate}>
          <label htmlFor="create-name">
            Agent subdomain
            <input
              id="create-name"
              value={subdomain}
              onChange={(event) => setSubdomain(event.target.value)}
              placeholder="analyst or analyst.team"
              required
            />
          </label>
          {registrationParent ? (
            <p className="console-muted">
              Registers under {registrationParent}. Use up to three labels, such as analyst.team.ops.
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
      </div>
    </>
  )
}
