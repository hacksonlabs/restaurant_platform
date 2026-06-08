import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import type { AgentApiScope, PartnerCredentialEnvironment, PartnerCredentialSummary, PlatformAdminPartnerRecord } from "@shared/types";
import { api } from "../lib/api";
import { dateTimeOrFallback } from "../lib/format";
import { useResource } from "./useResource";

const AVAILABLE_SCOPES: Array<{ value: AgentApiScope; label: string }> = [
  { value: "restaurants:read", label: "Restaurants" },
  { value: "menus:read", label: "Menus" },
  { value: "orders:validate", label: "Validate" },
  { value: "orders:quote", label: "Quote" },
  { value: "orders:submit", label: "Submit" },
  { value: "orders:status", label: "Status" },
];
const AVAILABLE_SCOPE_VALUES = new Set(AVAILABLE_SCOPES.map((scope) => scope.value));

function defaultScopes() {
  return AVAILABLE_SCOPES.filter((scope) => scope.value !== "orders:submit").map((scope) => scope.value);
}

function visibleScopes(scopes: AgentApiScope[]) {
  return scopes.filter((scope) => AVAILABLE_SCOPE_VALUES.has(scope));
}

function scopeLabel(scope: AgentApiScope) {
  return AVAILABLE_SCOPES.find((entry) => entry.value === scope)?.label ?? scope;
}

function AdminBadge(props: { tone?: "default" | "success" | "warning" | "danger"; children: ReactNode }) {
  return <span className={`pa-badge ${props.tone ?? "default"}`}>{props.children}</span>;
}

function ActionMenu(props: { label: string; children: ReactNode }) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const open = Boolean(position);

  function toggleMenu(event: MouseEvent<HTMLButtonElement>) {
    if (open) {
      setPosition(null);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 172;
    const menuHeight = 132;
    const opensUp = rect.bottom + menuHeight + 8 > window.innerHeight;
    setPosition({
      top: opensUp ? Math.max(8, rect.top - menuHeight - 6) : rect.bottom + 6,
      left: Math.min(window.innerWidth - menuWidth - 8, Math.max(8, rect.right - menuWidth)),
    });
  }

  return (
    <div
      className="pa-action-menu"
      onBlur={(event) => {
        const nextTarget = event.relatedTarget;
        if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
          setPosition(null);
        }
      }}
    >
      <button
        type="button"
        className="pa-action-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={props.label}
        onClick={toggleMenu}
      >
        ⋮
      </button>
      {position ? (
        <div
          className="pa-action-menu-list"
          role="menu"
          style={{ top: position.top, left: position.left }}
          onClick={() => setPosition(null)}
        >
          {props.children}
        </div>
      ) : null}
    </div>
  );
}

function AdminPanel(props: { title?: string; subtitle?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="pa-panel">
      {props.title || props.subtitle || props.actions ? (
        <div className="pa-panel-head">
          <div>
            {props.title ? <h2>{props.title}</h2> : null}
            {props.subtitle ? <p>{props.subtitle}</p> : null}
          </div>
          {props.actions ? <div className="pa-panel-actions">{props.actions}</div> : null}
        </div>
      ) : null}
      {props.children}
    </section>
  );
}

function AdminTable(props: { columns: string[]; rows: ReactNode[][] }) {
  return (
    <div className="pa-table-wrap">
      <table className="pa-table">
        <thead>
          <tr>
            {props.columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type CredentialFormState = {
  agentId: string;
  label: string;
  environment: PartnerCredentialEnvironment;
  scopes: AgentApiScope[];
};

type PartnerFormState = {
  name: string;
  contactEmail: string;
  status: "pending" | "approved" | "suspended";
};

type AgentFormState = {
  partnerId: string;
  name: string;
};

type OpenForm = "partner" | "agent" | "credential" | "editPartner" | "editAgent" | "editCredential" | null;

export function PlatformAdminPage() {
  const { data, loading, error, refresh } = useResource("platform-admin:partners", () => api.platformAdminPartners());
  const [selectedPartnerId, setSelectedPartnerId] = useState("");
  const [credentialForm, setCredentialForm] = useState<CredentialFormState>({
    agentId: "",
    label: "Pilot access",
    environment: "test",
    scopes: defaultScopes(),
  });
  const [partnerForm, setPartnerForm] = useState<PartnerFormState>({
    name: "",
    contactEmail: "",
    status: "approved",
  });
  const [agentForm, setAgentForm] = useState<AgentFormState>({
    partnerId: "",
    name: "",
  });
  const [rawKey, setRawKey] = useState<{ label: string; value: string } | null>(null);
  const [message, setMessage] = useState("");
  const [pendingCredentialId, setPendingCredentialId] = useState<string | null>(null);
  const [pendingAgentId, setPendingAgentId] = useState<string | null>(null);
  const [removingPartnerId, setRemovingPartnerId] = useState<string | null>(null);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [editingCredentialId, setEditingCredentialId] = useState<string | null>(null);
  const [creating, setCreating] = useState<OpenForm>(null);
  const [openForm, setOpenForm] = useState<OpenForm>(null);

  useEffect(() => {
    if (!data?.length) return;
    const fallbackPartnerId = data[0].partner.id;
    setSelectedPartnerId((current) => (data.some((entry) => entry.partner.id === current) ? current : fallbackPartnerId));
    setAgentForm((current) => ({
      ...current,
      partnerId: data.some((entry) => entry.partner.id === current.partnerId) ? current.partnerId : fallbackPartnerId,
    }));
  }, [data]);

  const selectedPartner = useMemo<PlatformAdminPartnerRecord | null>(() => {
    if (!data?.length) return null;
    return data.find((entry) => entry.partner.id === selectedPartnerId) ?? data[0];
  }, [data, selectedPartnerId]);

  useEffect(() => {
    if (!selectedPartner) return;
    setAgentForm((current) => ({
      ...current,
      partnerId: selectedPartner.partner.id,
    }));
    setCredentialForm((current) => ({
      ...current,
      agentId: selectedPartner.agents.some((entry) => entry.agent.id === current.agentId)
        ? current.agentId
        : selectedPartner.agents[0]?.agent.id ?? "",
    }));
  }, [selectedPartner]);

  if (loading) return <div className="pa-state">Loading Phantom Admin...</div>;
  if (error || !data) return <div className="pa-state danger">{error}</div>;

  const partnerCount = data.length;
  const activeCredentials = selectedPartner?.credentials.filter((credential) => !credential.revokedAt) ?? [];
  const liveCredentialCount = activeCredentials.filter((credential) => credential.environment === "live").length;

  function toggleScope(scope: AgentApiScope) {
    setCredentialForm((current) => ({
      ...current,
      scopes: current.scopes.includes(scope)
        ? current.scopes.filter((entry) => entry !== scope)
        : [...current.scopes, scope],
    }));
  }

  function beginEditPartner() {
    if (!selectedPartner) return;
    setPartnerForm({
      name: selectedPartner.partner.name,
      contactEmail: selectedPartner.partner.contactEmail ?? "",
      status: selectedPartner.partner.status,
    });
    setEditingAgentId(null);
    setEditingCredentialId(null);
    setOpenForm("editPartner");
  }

  function beginEditAgent(agentId: string, name: string) {
    if (!selectedPartner) return;
    setAgentForm({ partnerId: selectedPartner.partner.id, name });
    setEditingAgentId(agentId);
    setEditingCredentialId(null);
    setOpenForm("editAgent");
  }

  function beginEditCredential(credential: PartnerCredentialSummary) {
    setCredentialForm({
      agentId: credential.agentId,
      label: credential.label,
      environment: credential.environment,
      scopes: visibleScopes(credential.scopes),
    });
    setEditingCredentialId(credential.id);
    setEditingAgentId(null);
    setOpenForm("editCredential");
  }

  function closeForm() {
    setOpenForm(null);
    setEditingAgentId(null);
    setEditingCredentialId(null);
  }

  async function savePartner() {
    if (!partnerForm.name.trim()) return;
    const mode = openForm === "editPartner" ? "editPartner" : "partner";
    if (mode === "editPartner" && !selectedPartner) return;
    setCreating(mode);
    setMessage("");
    try {
      const body = {
        name: partnerForm.name.trim(),
        contactEmail: partnerForm.contactEmail.trim() || undefined,
        status: partnerForm.status,
      };
      const partner =
        mode === "editPartner"
          ? await api.updatePartner(selectedPartner.partner.id, body)
          : await api.createPartner(body);
      setRawKey(null);
      closeForm();
      setSelectedPartnerId(partner.id);
      setPartnerForm({ name: "", contactEmail: "", status: "approved" });
      await refresh();
    } catch (partnerError) {
      setMessage(partnerError instanceof Error ? partnerError.message : "Failed to save partner.");
    } finally {
      setCreating(null);
    }
  }

  async function saveAgent() {
    if (!agentForm.partnerId || !agentForm.name.trim()) return;
    const mode = openForm === "editAgent" ? "editAgent" : "agent";
    if (mode === "editAgent" && (!editingAgentId || !selectedPartner)) return;
    setCreating(mode);
    setMessage("");
    try {
      if (mode === "editAgent") {
        await api.updatePartnerAgent(selectedPartner.partner.id, editingAgentId, { name: agentForm.name.trim() });
      } else {
        await api.createPartnerAgent(agentForm.partnerId, { name: agentForm.name.trim() });
      }
      setRawKey(null);
      closeForm();
      setSelectedPartnerId(agentForm.partnerId);
      setAgentForm((current) => ({ ...current, name: "" }));
      await refresh();
    } catch (agentError) {
      setMessage(agentError instanceof Error ? agentError.message : "Failed to save agent.");
    } finally {
      setCreating(null);
    }
  }

  async function saveCredential() {
    if (!selectedPartner || !credentialForm.agentId || !credentialForm.label.trim() || credentialForm.scopes.length === 0) return;
    const mode = openForm === "editCredential" ? "editCredential" : "credential";
    if (mode === "editCredential" && !editingCredentialId) return;
    setCreating(mode);
    setMessage("");
    try {
      const body = {
        label: credentialForm.label.trim(),
        environment: credentialForm.environment,
        scopes: credentialForm.scopes,
      };
      if (mode === "editCredential") {
        await api.updatePartnerCredential(selectedPartner.partner.id, editingCredentialId, body);
        setRawKey(null);
      } else {
        const created = await api.createPartnerCredential(selectedPartner.partner.id, {
          agentId: credentialForm.agentId,
          ...body,
        });
        setRawKey({ label: created.credential.label, value: created.rawKey });
      }
      closeForm();
      setCredentialForm((current) => ({ ...current, label: "Pilot access" }));
      await refresh();
    } catch (credentialError) {
      setMessage(credentialError instanceof Error ? credentialError.message : "Failed to save credential.");
    } finally {
      setCreating(null);
    }
  }

  async function rotateCredential(credential: PartnerCredentialSummary) {
    if (!selectedPartner) return;
    if (!window.confirm(`Rotate ${credential.label}?`)) return;
    setPendingCredentialId(credential.id);
    setMessage("");
    try {
      const rotated = await api.rotatePartnerCredential(selectedPartner.partner.id, credential.id, {
        scopes: visibleScopes(credential.scopes),
        environment: credential.environment,
      });
      setRawKey({ label: rotated.credential.label, value: rotated.rawKey });
      await refresh();
    } catch (rotateError) {
      setMessage(rotateError instanceof Error ? rotateError.message : "Failed to rotate credential.");
    } finally {
      setPendingCredentialId(null);
    }
  }

  async function removeCredential(credential: PartnerCredentialSummary) {
    if (!selectedPartner) return;
    if (!window.confirm(`Remove ${credential.label}? This API key will stop working immediately.`)) return;
    setPendingCredentialId(credential.id);
    setMessage("");
    try {
      await api.removePartnerCredential(selectedPartner.partner.id, credential.id);
      setRawKey(null);
      await refresh();
    } catch (removeError) {
      setMessage(removeError instanceof Error ? removeError.message : "Failed to remove credential.");
    } finally {
      setPendingCredentialId(null);
    }
  }

  async function removeAgent(agentId: string, agentName: string) {
    if (!selectedPartner) return;
    if (!window.confirm(`Remove ${agentName}? Its partner credentials will also be removed.`)) return;
    setPendingAgentId(agentId);
    setMessage("");
    try {
      await api.removePartnerAgent(selectedPartner.partner.id, agentId);
      setRawKey(null);
      await refresh();
    } catch (removeError) {
      setMessage(removeError instanceof Error ? removeError.message : "Failed to remove agent.");
    } finally {
      setPendingAgentId(null);
    }
  }

  async function removePartner() {
    if (!selectedPartner) return;
    if (!window.confirm(`Remove ${selectedPartner.partner.name}? Its agent surfaces will be detached and credentials removed.`)) return;
    setRemovingPartnerId(selectedPartner.partner.id);
    setMessage("");
    try {
      await api.removePartner(selectedPartner.partner.id);
      setRawKey(null);
      setSelectedPartnerId("");
      await refresh();
    } catch (removeError) {
      setMessage(removeError instanceof Error ? removeError.message : "Failed to remove partner.");
    } finally {
      setRemovingPartnerId(null);
    }
  }

  return (
    <div className="pa-page">
      <header className="pa-hero">
        <div>
          <p>Internal Platform</p>
          <h1>Partner Operations</h1>
        </div>
      </header>

      {message ? <div className="pa-message">{message}</div> : null}
      {rawKey ? (
        <AdminPanel title="One-Time Credential Secret" subtitle="Copy this value now. Phantom will not show it again.">
          <label className="pa-field">
            <span>{rawKey.label}</span>
            <input value={rawKey.value} readOnly />
          </label>
        </AdminPanel>
      ) : null}

      {openForm === "partner" || openForm === "editPartner" ? (
        <AdminPanel title={openForm === "editPartner" ? "Edit Partner" : "Add Partner"}>
          <div className="pa-form-grid partner">
            <label className="pa-field">
              <span>Company</span>
              <input value={partnerForm.name} onChange={(event) => setPartnerForm({ ...partnerForm, name: event.target.value })} />
            </label>
            <label className="pa-field">
              <span>Contact Email</span>
              <input value={partnerForm.contactEmail} onChange={(event) => setPartnerForm({ ...partnerForm, contactEmail: event.target.value })} />
            </label>
            <label className="pa-field">
              <span>Status</span>
              <select value={partnerForm.status} onChange={(event) => setPartnerForm({ ...partnerForm, status: event.target.value as PartnerFormState["status"] })}>
                <option value="approved">Approved</option>
                <option value="pending">Pending</option>
                <option value="suspended">Suspended</option>
              </select>
            </label>
          </div>
          <div className="pa-form-actions">
            <button
              type="button"
              className="pa-primary-action"
              onClick={() => void savePartner()}
              disabled={(creating === "partner" || creating === "editPartner") || !partnerForm.name.trim()}
            >
              {creating === "partner" || creating === "editPartner"
                ? "Saving..."
                : openForm === "editPartner"
                  ? "Save Partner"
                  : "Add Partner"}
            </button>
            <button type="button" className="pa-secondary-action" onClick={closeForm}>Cancel</button>
          </div>
        </AdminPanel>
      ) : null}

      <div className="pa-workspace">
        <aside className="pa-directory">
          <div className="pa-directory-head">
            <span>Partners <strong>{partnerCount}</strong></span>
            <button
              type="button"
              className="pa-secondary-action compact"
              onClick={() => {
                setPartnerForm({ name: "", contactEmail: "", status: "approved" });
                setEditingAgentId(null);
                setEditingCredentialId(null);
                setOpenForm("partner");
              }}
            >
              New Partner
            </button>
          </div>
          <div className="pa-directory-list">
            {data.map((entry) => (
              <button
                key={entry.partner.id}
                type="button"
                className={`pa-directory-row ${entry.partner.id === selectedPartner?.partner.id ? "selected" : ""}`}
                onClick={() => setSelectedPartnerId(entry.partner.id)}
              >
                <span>
                  <strong>{entry.partner.name}</strong>
                </span>
                <AdminBadge tone={entry.partner.status === "approved" ? "success" : entry.partner.status === "suspended" ? "danger" : "warning"}>
                  {entry.partner.status}
                </AdminBadge>
              </button>
            ))}
          </div>
        </aside>

        {selectedPartner ? (
          <section className="pa-detail">
            <section className="pa-partner-summary">
              <div className="pa-partner-title">
                <span>Selected Partner</span>
                <h2>{selectedPartner.partner.name}</h2>
                <p>{selectedPartner.partner.contactEmail ?? "No contact email"}</p>
              </div>
              <div className="pa-partner-status">
                <AdminBadge
                  tone={
                    selectedPartner.partner.status === "approved"
                      ? "success"
                      : selectedPartner.partner.status === "suspended"
                        ? "danger"
                        : "warning"
                  }
                >
                  {selectedPartner.partner.status}
                </AdminBadge>
                <small>Created {dateTimeOrFallback(selectedPartner.partner.createdAt)}</small>
                <ActionMenu label={`Actions for ${selectedPartner.partner.name}`}>
                  <button type="button" role="menuitem" onClick={beginEditPartner}>
                    Edit Partner
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="danger"
                    onClick={() => void removePartner()}
                    disabled={removingPartnerId === selectedPartner.partner.id}
                  >
                    Remove Partner
                  </button>
                </ActionMenu>
              </div>
              <div className="pa-partner-stats">
                <div>
                  <span>Agents</span>
                  <strong>{selectedPartner.agents.length}</strong>
                </div>
                <div>
                  <span>Active Credentials</span>
                  <strong>{activeCredentials.length}</strong>
                </div>
                <div>
                  <span>Live Credentials</span>
                  <strong>{liveCredentialCount}</strong>
                </div>
              </div>
            </section>

            <details className="pa-secondary-panel">
              <summary>
                <span>Agent Surfaces</span>
                <strong>{selectedPartner.agents.length}</strong>
              </summary>
              <div className="pa-secondary-toolbar">
                <button
                  type="button"
                  className="pa-secondary-action"
                  onClick={() => {
                    if (openForm === "agent") {
                      closeForm();
                      return;
                    }
                    setAgentForm({ partnerId: selectedPartner.partner.id, name: "" });
                    setEditingAgentId(null);
                    setEditingCredentialId(null);
                    setOpenForm("agent");
                  }}
                >
                  {openForm === "agent" ? "Close" : "Add Agent"}
                </button>
              </div>
              {openForm === "agent" || openForm === "editAgent" ? (
                <div className="pa-create-drawer secondary">
                  <div className="pa-drawer-title">
                    <strong>{openForm === "editAgent" ? "Edit Agent Surface" : "Add Agent Surface"}</strong>
                  </div>
                  <div className="pa-form-grid agent">
                    <label className="pa-field">
                      <span>Agent Name</span>
                      <input value={agentForm.name} onChange={(event) => setAgentForm({ ...agentForm, name: event.target.value })} />
                    </label>
                    <label className="pa-field">
                      <span>Company</span>
                      <select
                        value={agentForm.partnerId}
                        disabled={openForm === "editAgent"}
                        onChange={(event) => {
                          setAgentForm({ ...agentForm, partnerId: event.target.value });
                          setSelectedPartnerId(event.target.value);
                        }}
                      >
                        {data.map((entry) => (
                          <option key={entry.partner.id} value={entry.partner.id}>{entry.partner.name}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="pa-form-actions">
                    <button
                      type="button"
                      className="pa-primary-action"
                      onClick={() => void saveAgent()}
                      disabled={
                        (creating === "agent" || creating === "editAgent") ||
                        !agentForm.partnerId ||
                        !agentForm.name.trim()
                      }
                    >
                      {creating === "agent" || creating === "editAgent"
                        ? "Saving..."
                        : openForm === "editAgent"
                          ? "Save Agent"
                          : "Add Agent"}
                    </button>
                    <button type="button" className="pa-secondary-action" onClick={closeForm}>Cancel</button>
                  </div>
                </div>
              ) : null}
              {selectedPartner.agents.length > 0 ? (
                <AdminTable
                  columns={["Agent", "Slug", "Active Credentials", "Actions"]}
                  rows={selectedPartner.agents.map((entry) => [
                    <strong key="name">{entry.agent.name}</strong>,
                    <span key="slug">{entry.agent.slug}</span>,
                    <span key="credentials">{entry.credentials.filter((credential) => !credential.revokedAt).length}</span>,
                    <div className="pa-row-actions" key="actions">
                      <ActionMenu label={`Actions for ${entry.agent.name}`}>
                        <button
                          type="button"
                          role="menuitem"
                          disabled={pendingAgentId === entry.agent.id}
                          onClick={() => beginEditAgent(entry.agent.id, entry.agent.name)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="danger"
                          disabled={pendingAgentId === entry.agent.id}
                          onClick={() => void removeAgent(entry.agent.id, entry.agent.name)}
                        >
                          Remove
                        </button>
                      </ActionMenu>
                    </div>,
                  ])}
                />
              ) : (
                <div className="pa-state">No partner agents.</div>
              )}
            </details>

            <AdminPanel
              title="Credentials"
              actions={
                <button
                  type="button"
                  className="pa-primary-action compact"
                  onClick={() => {
                    if (openForm === "credential") {
                      closeForm();
                      return;
                    }
                    if (selectedPartner) {
                      setCredentialForm((current) => ({
                        ...current,
                        label: "Pilot access",
                        environment: "test",
                        scopes: defaultScopes(),
                        agentId: selectedPartner.agents.some((entry) => entry.agent.id === current.agentId)
                          ? current.agentId
                          : selectedPartner.agents[0]?.agent.id ?? "",
                      }));
                    }
                    setEditingAgentId(null);
                    setEditingCredentialId(null);
                    setOpenForm("credential");
                  }}
                >
                  {openForm === "credential" ? "Close" : "Add New Credential"}
                </button>
              }
            >
              {openForm === "credential" || openForm === "editCredential" ? (
                <div className="pa-create-drawer">
                  <div className="pa-drawer-title">
                    <strong>{openForm === "editCredential" ? "Edit Credential" : "Add Credential"}</strong>
                  </div>
                  <div className="pa-form-grid">
                    <label className="pa-field">
                      <span>Agent</span>
                      <select
                        value={credentialForm.agentId}
                        disabled={openForm === "editCredential"}
                        onChange={(event) => setCredentialForm({ ...credentialForm, agentId: event.target.value })}
                      >
                        {selectedPartner.agents.map((entry) => (
                          <option key={entry.agent.id} value={entry.agent.id}>{entry.agent.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="pa-field">
                      <span>Label</span>
                      <input value={credentialForm.label} onChange={(event) => setCredentialForm({ ...credentialForm, label: event.target.value })} />
                    </label>
                    <label className="pa-field">
                      <span>Environment</span>
                      <select
                        value={credentialForm.environment}
                        onChange={(event) => setCredentialForm({ ...credentialForm, environment: event.target.value as PartnerCredentialEnvironment })}
                      >
                        <option value="test">Test</option>
                        <option value="live">Live</option>
                      </select>
                    </label>
                  </div>
                  <div className="pa-scope-picker">
                    <span className="pa-section-label">API Access</span>
                    {AVAILABLE_SCOPES.map((scope) => (
                      <button
                        key={scope.value}
                        type="button"
                        className={credentialForm.scopes.includes(scope.value) ? "selected" : ""}
                        onClick={() => toggleScope(scope.value)}
                      >
                        {scope.label}
                      </button>
                    ))}
                  </div>
                  <div className="pa-form-actions">
                    <button
                      type="button"
                      className="pa-primary-action"
                      onClick={() => void saveCredential()}
                      disabled={
                        (creating === "credential" || creating === "editCredential") ||
                        !credentialForm.agentId ||
                        !credentialForm.label.trim() ||
                        credentialForm.scopes.length === 0
                      }
                    >
                      {creating === "credential" || creating === "editCredential"
                        ? "Saving..."
                        : openForm === "editCredential"
                          ? "Save Credential"
                          : "Add Credential"}
                    </button>
                    <button type="button" className="pa-secondary-action" onClick={closeForm}>Cancel</button>
                  </div>
                </div>
              ) : null}

              {selectedPartner.credentials.length > 0 ? (
                <AdminTable
                  columns={["Agent", "Access", "Last Used", "Actions"]}
                  rows={selectedPartner.credentials.map((credential) => {
                    const agent = selectedPartner.agents.find((entry) => entry.agent.id === credential.agentId)?.agent;
                    return [
                      <div className="pa-identity" key="credential">
                        <strong>{agent?.name ?? credential.agentId}</strong>
                        <span>{credential.label} / {credential.keyPrefix}</span>
                      </div>,
                      <div className="pa-access-cell" key="access">
                        <div className="pa-access-badges">
                          <AdminBadge tone={credential.environment === "live" ? "success" : "warning"}>{credential.environment}</AdminBadge>
                          {credential.revokedAt ? <AdminBadge tone="danger">revoked</AdminBadge> : null}
                        </div>
                        <div className="pa-scope-list">
                          {visibleScopes(credential.scopes).map((scope) => <span key={scope}>{scopeLabel(scope)}</span>)}
                        </div>
                      </div>,
                      <span key="last-used">{dateTimeOrFallback(credential.lastUsedAt)}</span>,
                      <div className="pa-row-actions" key="actions">
                        <ActionMenu label={`Actions for ${credential.label}`}>
                          <button
                            type="button"
                            role="menuitem"
                            disabled={pendingCredentialId === credential.id}
                            onClick={() => beginEditCredential(credential)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            disabled={pendingCredentialId === credential.id || !!credential.revokedAt}
                            onClick={() => void rotateCredential(credential)}
                          >
                            Rotate
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="danger"
                            disabled={pendingCredentialId === credential.id}
                            onClick={() => void removeCredential(credential)}
                          >
                            Remove
                          </button>
                        </ActionMenu>
                      </div>,
                    ];
                  })}
                />
              ) : (
                <div className="pa-state">No credentials issued.</div>
              )}
            </AdminPanel>
          </section>
        ) : null}
      </div>
    </div>
  );
}
