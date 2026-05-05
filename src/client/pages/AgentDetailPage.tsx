import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { dateTimeOrFallback } from "../lib/format";
import { Button, Card, Field, PageHeader, Badge } from "../components/ui";
import { useResource } from "./useResource";

function maskSecret(value: string) {
  return "•".repeat(Math.max(16, value.length));
}

export function AgentDetailPage() {
  const { agentId = "" } = useParams();
  const { data, setData, loading, error } = useResource(
    () => api.agent("rest_lb_steakhouse", agentId),
    [agentId],
  );
  const [message, setMessage] = useState("");
  const [credentialsVisible, setCredentialsVisible] = useState<Record<string, boolean>>({});
  const [scopes, setScopes] = useState({
    menu_read: true,
    validate_order: true,
    quote_order: true,
    submit_order: true,
    order_status: true,
    reporting_read: false,
  });

  const credentialValues = useMemo(() => {
    if (!data) return [];
    const prefix = data.apiKey?.keyPrefix ?? "agentkey";
    return [
      { id: "api_key", label: "Agent API Key", value: `${prefix}••••••••••••mock` },
      { id: "client_id", label: "Client Identifier", value: `${data.agent.slug}_client_lb_steakhouse` },
      { id: "shared_secret", label: "Webhook Shared Secret", value: `whsec_${data.agent.slug}_lb_demo_secret` },
    ];
  }, [data]);

  if (loading) return <div className="panel-state">Loading agent…</div>;
  if (error || !data) return <div className="panel-state error">{error}</div>;

  async function updateStatus(status: string) {
    await api.updateAgentPermission("rest_lb_steakhouse", agentId, { status });
    setData(await api.agent("rest_lb_steakhouse", agentId));
    setMessage(`Agent set to ${status}.`);
  }

  async function rotateCredentials() {
    setMessage("Demo credentials rotated visually. Real rotation will be wired when persistent secrets are connected.");
  }

  return (
    <div className="page-grid">
      <div className="agent-detail-topline">
        <Link to="/agents" className="back-link">
          ← Back
        </Link>
      </div>

      <PageHeader
        eyebrow="Manage Agent"
        title={data.agent.name}
        description="Authentication, access, and restaurant-specific policy controls for this agent connection."
        actions={
          <div className="page-actions">
            <Button tone="secondary" onClick={rotateCredentials}>Rotate Credentials</Button>
            <Button onClick={() => setMessage("Changes are managed inline in this demo view.")}>Save Changes</Button>
          </div>
        }
      />

      {message ? <div className="inline-message success">{message}</div> : null}

      <div className="agent-manage-grid">
        <Card
          title="Access Credentials"
          subtitle="Secrets remain masked in the UI. This screen is designed for metadata and rotation workflows, not raw secret disclosure."
        >
          <div className="credential-list">
            {credentialValues.map((credential) => (
              <div key={credential.id} className="credential-row">
                <Field label={credential.label}>
                  <div className="credential-input-wrap">
                    <input
                      value={
                        credentialsVisible[credential.id]
                          ? credential.value
                          : maskSecret(credential.value)
                      }
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost-eye"
                      onClick={() =>
                        setCredentialsVisible((current) => ({
                          ...current,
                          [credential.id]: !current[credential.id],
                        }))
                      }
                    >
                      {credentialsVisible[credential.id] ? "Hide" : "Show"}
                    </button>
                  </div>
                </Field>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Access Summary" subtitle="Current tenant-level status for this integration.">
          <div className="summary-list">
            <div className="summary-row">
              <span>Application Type</span>
              <Badge tone="default">Restaurant Agent</Badge>
            </div>
            <div className="summary-row">
              <span>Status</span>
              <Badge tone={data.permission.status === "allowed" ? "success" : data.permission.status === "blocked" ? "danger" : "warning"}>
                {data.permission.status}
              </Badge>
            </div>
            <div className="summary-row">
              <span>Key Prefix</span>
              <strong>{data.apiKey?.keyPrefix ?? "Not issued"}</strong>
            </div>
            <div className="summary-row">
              <span>Last Rotated</span>
              <strong>{dateTimeOrFallback(data.apiKey?.rotatedAt ?? data.apiKey?.createdAt, "Not available")}</strong>
            </div>
            <div className="summary-row">
              <span>Last Used</span>
              <strong>{dateTimeOrFallback(data.apiKey?.lastUsedAt ?? data.permission.lastActivityAt)}</strong>
            </div>
            <div className="summary-actions">
              <Button tone="secondary" onClick={() => updateStatus("allowed")}>Allow</Button>
              <Button tone="danger" onClick={() => updateStatus("blocked")}>Block</Button>
            </div>
          </div>
        </Card>
      </div>

      <Card title="Scope Permissions" subtitle="Future-facing capability toggles for the internal API surface.">
        <div className="scope-grid">
          {[
            ["menu_read", "Menu Read"],
            ["validate_order", "Validate Order"],
            ["quote_order", "Quote Order"],
            ["submit_order", "Submit Order"],
            ["order_status", "Order Status"],
            ["reporting_read", "Reporting Read"],
          ].map(([key, label]) => (
            <label key={key} className="scope-card">
              <div>
                <strong>{label}</strong>
                <div className="muted">Controls whether this agent can use the corresponding canonical endpoint.</div>
              </div>
              <button
                type="button"
                className={`scope-toggle ${scopes[key as keyof typeof scopes] ? "on" : ""}`}
                onClick={() =>
                  setScopes((current) => ({
                    ...current,
                    [key]: !current[key as keyof typeof current],
                  }))
                }
              >
                <span />
              </button>
            </label>
          ))}
        </div>
      </Card>

      <Card title="Agent Notes">
        <div className="agent-note-block">
          <strong>{data.agent.description}</strong>
          <p className="muted">
            This management screen is restaurant-centric: it focuses on whether the agent is trusted, how it authenticates,
            and which order operations it is allowed to perform for LB Steakhouse.
          </p>
        </div>
      </Card>
    </div>
  );
}
