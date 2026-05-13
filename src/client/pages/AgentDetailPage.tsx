import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { AgentApiScope } from "@shared/types";
import { api } from "../lib/api";
import { useTenant } from "../auth/AuthContext";
import { dateTimeOrFallback } from "../lib/format";
import { Badge, Button, Card, Field, PageHeader } from "../components/ui";
import { useResource } from "./useResource";

const AVAILABLE_SCOPES: Array<{ value: AgentApiScope; label: string; description: string }> = [
  { value: "menus:read", label: "Menus Read", description: "Allow menu and mapping reads." },
  { value: "orders:validate", label: "Orders Validate", description: "Allow validation-only requests." },
  { value: "orders:quote", label: "Orders Quote", description: "Allow price and fee quotes." },
  { value: "orders:submit", label: "Orders Submit", description: "Allow structured order submission." },
  { value: "orders:status", label: "Orders Status", description: "Allow status polling for submitted orders." },
  { value: "restaurants:read", label: "Restaurants Read", description: "Reserved for future restaurant metadata reads." },
];

function defaultScopes() {
  return AVAILABLE_SCOPES.filter((scope) => scope.value !== "restaurants:read").map((scope) => scope.value);
}

export function AgentDetailPage() {
  const { agentId = "" } = useParams();
  const { selectedRestaurantId, canManageAgents } = useTenant();
  const { data, setData, loading, error } = useResource(
    `agent:${selectedRestaurantId}:${agentId}`,
    () => api.agent(selectedRestaurantId!, agentId),
    [agentId, selectedRestaurantId],
  );
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [keyLabel, setKeyLabel] = useState("Primary API Key");
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [selectedScopes, setSelectedScopes] = useState<AgentApiScope[]>(defaultScopes);

  useEffect(() => {
    if (!data) return;
    setKeyLabel(data.apiKey?.label ?? "Primary API Key");
    setSelectedScopes(data.apiKey?.scopes?.length ? data.apiKey.scopes : defaultScopes());
  }, [data]);

  if (loading) return <div className="panel-state">Loading agent…</div>;
  if (error || !data) return <div className="panel-state error">{error}</div>;

  async function refreshAgent() {
    setData(await api.agent(selectedRestaurantId!, agentId));
  }

  async function updateStatus(status: string) {
    setPending(true);
    try {
      await api.updateAgentPermission(selectedRestaurantId!, agentId, { status });
      await refreshAgent();
      setMessage(`Agent set to ${status}.`);
    } finally {
      setPending(false);
    }
  }

  async function createKey() {
    setPending(true);
    try {
      const created = await api.createAgentKey(selectedRestaurantId!, agentId, {
        label: keyLabel.trim() || "Primary API Key",
        scopes: selectedScopes,
      });
      await refreshAgent();
      setRawKey(created.rawKey);
      setMessage("New API key created. Copy it now because Phantom will not show the raw key again.");
    } finally {
      setPending(false);
    }
  }

  async function rotateKey() {
    if (!data.apiKey) return;
    setPending(true);
    try {
      const rotated = await api.rotateAgentKey(selectedRestaurantId!, agentId, data.apiKey.id, {
        scopes: selectedScopes,
      });
      await refreshAgent();
      setRawKey(rotated.rawKey);
      setMessage("API key rotated. Copy the new raw key now because it will not be shown again.");
    } finally {
      setPending(false);
    }
  }

  async function revokeKey() {
    if (!data.apiKey) return;
    setPending(true);
    try {
      await api.revokeAgentKey(selectedRestaurantId!, agentId, data.apiKey.id);
      await refreshAgent();
      setRawKey(null);
      setMessage("API key revoked.");
    } finally {
      setPending(false);
    }
  }

  function toggleScope(scope: AgentApiScope) {
    setSelectedScopes((current) =>
      current.includes(scope) ? current.filter((entry) => entry !== scope) : [...current, scope],
    );
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
        description="Authentication, restaurant access, and order capabilities for this agent integration."
        actions={
          <div className="page-actions">
            {data.apiKey ? (
              <Button tone="secondary" onClick={rotateKey} disabled={!canManageAgents || pending}>
                Rotate Key
              </Button>
            ) : (
              <Button onClick={createKey} disabled={!canManageAgents || pending || selectedScopes.length === 0}>
                Create Key
              </Button>
            )}
            {data.apiKey ? (
              <Button tone="danger" onClick={revokeKey} disabled={!canManageAgents || pending || !!data.apiKey.revokedAt}>
                Revoke Key
              </Button>
            ) : null}
          </div>
        }
      />

      {message ? <div className="inline-message success">{message}</div> : null}
      {rawKey ? (
        <Card title="Copy This Key Now" subtitle="The raw key is only returned once at creation or rotation.">
          <Field label="Raw API Key">
            <input value={rawKey} readOnly />
          </Field>
        </Card>
      ) : null}

      <div className="agent-manage-grid">
        <Card
          title="Access Summary"
          subtitle="Current tenant-level status for this integration."
        >
          <div className="summary-list">
            <div className="summary-row">
              <span>Application Type</span>
              <Badge tone="default">{data.agent.slug === "phantom" ? "First-Party Agent" : "External Agent"}</Badge>
            </div>
            <div className="summary-row">
              <span>Status</span>
              <Badge
                tone={
                  data.permission.status === "allowed"
                    ? "success"
                    : data.permission.status === "blocked"
                      ? "danger"
                      : "warning"
                }
              >
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
            <div className="summary-row">
              <span>Key State</span>
              <strong>{data.apiKey?.revokedAt ? `Revoked ${dateTimeOrFallback(data.apiKey.revokedAt)}` : "Active"}</strong>
            </div>
            <div className="summary-actions">
              <Button tone="secondary" onClick={() => updateStatus("allowed")} disabled={!canManageAgents || pending}>
                Allow
              </Button>
              <Button tone="danger" onClick={() => updateStatus("blocked")} disabled={!canManageAgents || pending}>
                Block
              </Button>
            </div>
          </div>
        </Card>

        <Card
          title="Key Configuration"
          subtitle="Create once, rotate when needed, and keep scopes limited to the workflows this agent actually needs."
        >
          <Field label="Key Label">
            <input
              value={keyLabel}
              onChange={(event) => setKeyLabel(event.target.value)}
              disabled={!canManageAgents || pending || !!data.apiKey}
            />
          </Field>
          <div className="muted" style={{ marginTop: 12 }}>
            Raw API keys are only shown once. The server stores only the hash, prefix, scopes, and timestamps.
          </div>
        </Card>
      </div>

      <Card title="Scope Permissions" subtitle="Server-enforced capabilities for this restaurant tenant.">
        <div className="scope-grid">
          {AVAILABLE_SCOPES.map((scope) => (
            <label key={scope.value} className="scope-card">
              <div>
                <strong>{scope.label}</strong>
                <div className="muted">{scope.description}</div>
              </div>
              <input
                type="checkbox"
                checked={selectedScopes.includes(scope.value)}
                onChange={() => toggleScope(scope.value)}
                disabled={!canManageAgents || pending || !!data.apiKey?.revokedAt}
              />
            </label>
          ))}
        </div>
      </Card>

      <Card title="Agent Notes">
        <div className="agent-note-block">
          <strong>{data.agent.description}</strong>
          <p className="muted">
            This screen stays restaurant-centric: it shows whether the agent is trusted for the currently selected tenant,
            which capabilities its API key has, and when that key was last used or rotated.
          </p>
        </div>
      </Card>
    </div>
  );
}
