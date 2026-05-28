import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useTenant } from "../auth/AuthContext";
import { Button, Card, DataTable, Field, PageHeader } from "../components/ui";
import { useResource } from "./useResource";
import type { CreateTeamMemberInput, TeamMemberRecord, UpdateTeamMemberInput } from "@shared/types";

function InfoLabel(props: { title: string; hint: string }) {
  return (
    <span className="settings-info-label">
      {props.title}
      <span className="settings-info-bubble" tabIndex={0} aria-label={props.hint}>
        i
        <span className="settings-info-tooltip" role="tooltip">
          {props.hint}
        </span>
      </span>
    </span>
  );
}

function SyncLabel(props: { title: string; badge: string }) {
  return (
    <span className="settings-sync-label">
      {props.title}
      <span className="settings-sync-badge">{props.badge}</span>
    </span>
  );
}

type TeamMemberFormState = {
  fullName: string;
  email: string;
  password: string;
  role: CreateTeamMemberInput["role"];
  accessScope: CreateTeamMemberInput["accessScope"];
  restaurantIds: string[];
};

function emptyTeamMemberForm(): TeamMemberFormState {
  return {
    fullName: "",
    email: "",
    password: "",
    role: "staff",
    accessScope: "all",
    restaurantIds: [],
  };
}

export function SettingsPage() {
  const { selectedRestaurantId, canManageRules, session } = useTenant();
  const ownerManagedRestaurants =
    session?.restaurants.filter((restaurant) => restaurant.memberships.some((membership) => membership.role === "owner")) ?? [];
  const { data, setData, loading, error } = useResource(
    `settings:${selectedRestaurantId}`,
    async () => {
      const [restaurant, rules, teamMembers] = await Promise.all([
        api.restaurant(selectedRestaurantId!),
        api.rules(selectedRestaurantId!),
        canManageRules ? api.teamMembers(selectedRestaurantId!) : Promise.resolve([]),
      ]);

      return { restaurant, rules, teamMembers };
    },
    [selectedRestaurantId, canManageRules],
  );
  const [message, setMessage] = useState("");
  const [savedData, setSavedData] = useState<typeof data | null>(null);
  const [updatingAutoAccept, setUpdatingAutoAccept] = useState(false);
  const [updatingAgentOrdering, setUpdatingAgentOrdering] = useState(false);
  const [teamModal, setTeamModal] = useState<{ mode: "create" } | { mode: "edit"; member: TeamMemberRecord } | null>(null);
  const [teamForm, setTeamForm] = useState<TeamMemberFormState>(emptyTeamMemberForm());
  const [savingTeamMember, setSavingTeamMember] = useState(false);
  const [deletingTeamMemberId, setDeletingTeamMemberId] = useState<string | null>(null);

  useEffect(() => {
    setMessage("");
  }, [data?.restaurant.updatedAt]);

  useEffect(() => {
    if (data && (!savedData || savedData.restaurant.id !== data.restaurant.id)) {
      setSavedData(data);
    }
  }, [data, savedData]);

  if (loading) return <div className="panel-state">Loading settings…</div>;
  if (error || !data) return <div className="panel-state error">{error}</div>;

  async function save() {
    const [restaurant, rules] = await Promise.all([
      api.updateRestaurant(data.restaurant.id, data.restaurant),
      api.updateRules(selectedRestaurantId!, data.rules),
    ]);
    const nextData = { restaurant, rules };
    setData(nextData);
    setSavedData(nextData);
    setMessage("Profile and ordering rules saved.");
  }

  async function updateAutoAccept(enabled: boolean) {
    const previous = data;
    const nextRestaurant =
      enabled
        ? { ...data.restaurant, defaultApprovalMode: "auto" as const }
        : data.restaurant.defaultApprovalMode === "auto"
          ? { ...data.restaurant, defaultApprovalMode: "threshold_review" as const }
          : data.restaurant;
    const nextData = {
      restaurant: nextRestaurant,
      rules: { ...data.rules, autoAcceptEnabled: enabled },
    };

    setData(nextData);
    setUpdatingAutoAccept(true);
    setMessage("");
    try {
      const tasks: Array<Promise<unknown>> = [api.updateRules(selectedRestaurantId!, { autoAcceptEnabled: enabled })];
      if (nextRestaurant.defaultApprovalMode !== data.restaurant.defaultApprovalMode) {
        tasks.push(api.updateRestaurant(data.restaurant.id, { defaultApprovalMode: nextRestaurant.defaultApprovalMode }));
      }
      const [rules, restaurant] = await Promise.all([
        tasks[0] as Promise<typeof data.rules>,
        tasks[1]
          ? (tasks[1] as Promise<typeof data.restaurant>)
          : Promise.resolve(nextRestaurant),
      ]);
      const nextData = { restaurant, rules };
      setData(nextData);
      setSavedData(nextData);
      setMessage(`Auto accept ${enabled ? "enabled" : "disabled"}.`);
    } catch (updateError) {
      setData(previous);
      setMessage(updateError instanceof Error ? updateError.message : "Failed to update auto accept.");
    } finally {
      setUpdatingAutoAccept(false);
    }
  }

  async function updateAgentOrdering(enabled: boolean) {
    const previous = data;
    setData({
      ...data,
      restaurant: {
        ...data.restaurant,
        agentOrderingEnabled: enabled,
      },
    });
    setUpdatingAgentOrdering(true);
    setMessage("");
    try {
      const restaurant = await api.updateRestaurant(data.restaurant.id, { agentOrderingEnabled: enabled });
      const nextData = { ...data, restaurant };
      setData(nextData);
      setSavedData(nextData);
      setMessage(`Agent ordering ${enabled ? "enabled" : "disabled"}.`);
    } catch (updateError) {
      setData(previous);
      setMessage(updateError instanceof Error ? updateError.message : "Failed to update agent ordering.");
    } finally {
      setUpdatingAgentOrdering(false);
    }
  }

  const hasUnsavedChanges = !!savedData && (
    savedData.restaurant.contactEmail !== data.restaurant.contactEmail ||
    savedData.restaurant.contactPhone !== data.restaurant.contactPhone ||
    savedData.rules.maxOrderDollarAmount !== data.rules.maxOrderDollarAmount
  );

  function teamRestaurantIdsForForm(form: TeamMemberFormState) {
    return form.accessScope === "all" ? ownerManagedRestaurants.map((restaurant) => restaurant.id) : form.restaurantIds;
  }

  function openCreateTeamMemberModal() {
    setTeamForm(emptyTeamMemberForm());
    setTeamModal({ mode: "create" });
  }

  function openEditTeamMemberModal(member: TeamMemberRecord) {
    const ownerRestaurantIds = ownerManagedRestaurants.map((restaurant) => restaurant.id);
    const memberRestaurantIds = member.assignments.map((assignment) => assignment.restaurantId);
    const hasAllRestaurants =
      ownerRestaurantIds.length > 0 && ownerRestaurantIds.every((restaurantId) => memberRestaurantIds.includes(restaurantId));
    setTeamForm({
      fullName: member.user.fullName,
      email: member.user.email,
      password: "",
      role: member.assignments[0]?.role ?? "staff",
      accessScope: hasAllRestaurants ? "all" : "selected",
      restaurantIds: hasAllRestaurants ? [] : memberRestaurantIds,
    });
    setTeamModal({ mode: "edit", member });
  }

  function closeTeamMemberModal() {
    setTeamModal(null);
    setTeamForm(emptyTeamMemberForm());
  }

  async function submitTeamMember() {
    if (!selectedRestaurantId) return;
    const selectedTeamRestaurantIds = teamRestaurantIdsForForm(teamForm);
    setSavingTeamMember(true);
    setMessage("");
    try {
      if (teamModal?.mode === "edit") {
        const payload: UpdateTeamMemberInput = {
          fullName: teamForm.fullName,
          email: teamForm.email,
          role: teamForm.role,
          accessScope: teamForm.accessScope,
          restaurantIds: selectedTeamRestaurantIds,
        };
        const updated = await api.updateTeamMember(selectedRestaurantId, teamModal.member.user.id, payload);
        setData({
          ...data,
          teamMembers: data.teamMembers
            .map((member) => (member.user.id === updated.user.id ? updated : member))
            .sort((a, b) => a.user.fullName.localeCompare(b.user.fullName)),
        });
      } else {
        const payload: CreateTeamMemberInput = {
          fullName: teamForm.fullName,
          email: teamForm.email,
          password: teamForm.password,
          role: teamForm.role,
          accessScope: teamForm.accessScope,
          restaurantIds: selectedTeamRestaurantIds,
        };
        const created = await api.createTeamMember(selectedRestaurantId, payload);
        setData({
          ...data,
          teamMembers: [...data.teamMembers, created].sort((a, b) => a.user.fullName.localeCompare(b.user.fullName)),
        });
      }
      closeTeamMemberModal();
    } catch (teamError) {
      setMessage(teamError instanceof Error ? teamError.message : "Failed to save team member.");
    } finally {
      setSavingTeamMember(false);
    }
  }

  async function deleteTeamMember(member: TeamMemberRecord) {
    if (!selectedRestaurantId) return;
    if (!window.confirm(`Remove ${member.user.fullName} from your team?`)) {
      return;
    }
    setDeletingTeamMemberId(member.user.id);
    setMessage("");
    try {
      await api.deleteTeamMember(selectedRestaurantId, member.user.id);
      setData({
        ...data,
        teamMembers: data.teamMembers.filter((entry) => entry.user.id !== member.user.id),
      });
    } catch (deleteError) {
      setMessage(deleteError instanceof Error ? deleteError.message : "Failed to delete team member.");
    } finally {
      setDeletingTeamMemberId(null);
    }
  }

  return (
    <div className="page-grid settings-page">
      <PageHeader
        eyebrow="Restaurant Profile"
        title="Profile & Settings"
        description="Live controls paired with synced restaurant reference data."
        actions={hasUnsavedChanges ? <Button onClick={save} disabled={!canManageRules}>Save Changes</Button> : null}
      />

      <div className="settings-layout">
        <Card className="settings-overview-card">
          <div className="settings-overview">
            <div className="settings-overview-label">Restaurant</div>
            <h2>{data.restaurant.name}</h2>
            <div className="settings-overview-divider" />
            <div className="settings-overview-list">
              <div className="settings-overview-item">
                <span>POS provider</span>
                <strong>{data.restaurant.posProvider}</strong>
              </div>
              <div className="settings-overview-item">
                <span>Location</span>
                <strong>{data.restaurant.location}</strong>
              </div>
              <div className="settings-overview-item">
                <span>Timezone</span>
                <strong>{data.restaurant.timezone}</strong>
              </div>
            </div>
            <div className="settings-sync-panel">
              <div className="settings-sync-panel-head">
                <span>Synced Reference</span>
              </div>
              <div className="settings-sync-metric">
                <div className="settings-sync-metric-copy">
                  <span>Minimum Lead Time</span>
                  <strong>{data.rules.minimumLeadTimeMinutes} min</strong>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <div className="settings-column">
          <Card title="Live Controls" className="settings-controls-card">
            <div className="settings-control-list">
              <div className="settings-control-row">
                <div className="settings-control-copy">
                  <div className="settings-toggle-card-head">
                    <InfoLabel
                      title="Ordering Enabled"
                      hint="Toggle on/off to accept/pause ordering"
                    />
                    <span className="settings-toggle-status">
                      {data.restaurant.agentOrderingEnabled ? "Live" : "Paused"}
                    </span>
                  </div>
                  <p>Controls whether Phantom is currently accepting new agent orders.</p>
                </div>
                <button
                  type="button"
                  className={`settings-toggle${data.restaurant.agentOrderingEnabled ? " on" : ""}`}
                  aria-pressed={data.restaurant.agentOrderingEnabled}
                  disabled={!canManageRules || updatingAgentOrdering}
                  onClick={() => void updateAgentOrdering(!data.restaurant.agentOrderingEnabled)}
                >
                  <span />
                  <strong>{data.restaurant.agentOrderingEnabled ? "On" : "Off"}</strong>
                </button>
              </div>

              <div className="settings-control-row">
                <div className="settings-control-copy">
                  <div className="settings-toggle-card-head">
                    <span className="settings-info-label">Auto Accept</span>
                    <span className="settings-toggle-status">
                      {data.rules.autoAcceptEnabled ? "Automatic" : "Manual"}
                    </span>
                  </div>
                  <p>Sets whether incoming orders flow straight through or wait for a manager review.</p>
                </div>
                <button
                  type="button"
                  className={`settings-toggle${data.rules.autoAcceptEnabled ? " on" : ""}`}
                  aria-pressed={data.rules.autoAcceptEnabled}
                  disabled={!canManageRules || updatingAutoAccept}
                  onClick={() => void updateAutoAccept(!data.rules.autoAcceptEnabled)}
                >
                  <span />
                  <strong>{data.rules.autoAcceptEnabled ? "On" : "Off"}</strong>
                </button>
              </div>
            </div>
          </Card>

          <Card title="Reference & Limits" className="settings-controls-card">
            <div className="settings-config-grid">
              <Field label="Contact Email">
                <input
                  value={data.restaurant.contactEmail}
                  disabled={!canManageRules}
                  onChange={(event) =>
                    setData({ ...data, restaurant: { ...data.restaurant, contactEmail: event.target.value } })
                  }
                />
              </Field>
              <Field label="Contact Phone">
                <input
                  value={data.restaurant.contactPhone}
                  disabled={!canManageRules}
                  onChange={(event) =>
                    setData({ ...data, restaurant: { ...data.restaurant, contactPhone: event.target.value } })
                  }
                />
              </Field>
              <Field label="Max Order Dollar Amount">
                <input
                  type="number"
                  value={data.rules.maxOrderDollarAmount}
                  disabled={!canManageRules}
                  onChange={(event) =>
                    setData({
                      ...data,
                      rules: { ...data.rules, maxOrderDollarAmount: Number(event.target.value) },
                    })
                  }
                />
              </Field>
            </div>
          </Card>

          {message ? <div className="inline-message success">{message}</div> : null}
        </div>
      </div>

      {canManageRules ? (
        <Card
          title="Team Access"
          className="settings-controls-card"
          actions={
            <Button tone="secondary" className="button-small" onClick={openCreateTeamMemberModal}>
              + Add Team Member
            </Button>
          }
        >
          <DataTable
            columns={["Name", "Role", "Restaurant Access", "Actions"]}
            rows={data.teamMembers.map((member) => {
              const accessLabel =
                member.assignments.length === ownerManagedRestaurants.length
                  ? "All restaurants"
                  : member.assignments.map((assignment) => assignment.restaurantName).join(", ");
              const isCurrentUser = member.user.id === session?.user.id;
              return [
                <div className="settings-team-cell" key={`${member.user.id}-identity`}>
                  <strong>{member.user.fullName}</strong>
                  <span>{member.user.email}</span>
                </div>,
                <span className="settings-team-role" key={`${member.user.id}-role`}>
                  {member.assignments[0]?.role ?? "staff"}
                </span>,
                <span className="settings-team-access" key={`${member.user.id}-access`}>
                  {accessLabel}
                </span>,
                <div className="settings-team-actions" key={`${member.user.id}-actions`}>
                  <button
                    type="button"
                    className="settings-table-action icon"
                    onClick={() => openEditTeamMemberModal(member)}
                    aria-label={`Edit ${member.user.fullName}`}
                    title="Edit"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25zm2.92 2.33H5v-.92l8.06-8.06.92.92-8.06 8.06zM19.71 6.04a1 1 0 0 0 0-1.41L17.37 2.29a1 1 0 0 0-1.41 0l-1.13 1.13 3.75 3.75 1.13-1.13z"
                        fill="currentColor"
                      />
                    </svg>
                  </button>
                  {!isCurrentUser ? (
                    <button
                      type="button"
                      className="settings-table-action icon danger"
                      disabled={deletingTeamMemberId === member.user.id}
                      onClick={() => void deleteTeamMember(member)}
                      aria-label={`Delete ${member.user.fullName}`}
                      title="Delete"
                    >
                      {deletingTeamMemberId === member.user.id ? (
                        "..."
                      ) : (
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v8h-2V9zm4 0h2v8h-2V9zM7 9h2v8H7V9zm1 11a2 2 0 0 1-2-2V8h12v10a2 2 0 0 1-2 2H8z"
                            fill="currentColor"
                          />
                        </svg>
                      )}
                    </button>
                  ) : null}
                </div>,
              ];
            })}
          />
        </Card>
      ) : null}

      {teamModal ? (
        <div className="settings-modal-backdrop" role="presentation" onClick={closeTeamMemberModal}>
          <div className="settings-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="settings-modal-header">
              <div>
                <h3>{teamModal.mode === "edit" ? "Edit Team Member" : "Add Team Member"}</h3>
                <p>{teamModal.mode === "edit" ? "Update role and restaurant access." : "Create a new account for your team."}</p>
              </div>
              <button type="button" className="settings-modal-close" onClick={closeTeamMemberModal} aria-label="Close">
                ×
              </button>
            </div>
            <div className="settings-modal-body">
              <Field label="Full Name">
                <input
                  value={teamForm.fullName}
                  onChange={(event) => setTeamForm({ ...teamForm, fullName: event.target.value })}
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  value={teamForm.email}
                  onChange={(event) => setTeamForm({ ...teamForm, email: event.target.value })}
                />
              </Field>
              {teamModal.mode === "create" ? (
                <Field label="Password">
                  <input
                    type="password"
                    value={teamForm.password}
                    onChange={(event) => setTeamForm({ ...teamForm, password: event.target.value })}
                  />
                </Field>
              ) : null}
              <Field label="Role">
                <select
                  value={teamForm.role}
                  onChange={(event) =>
                    setTeamForm({ ...teamForm, role: event.target.value as CreateTeamMemberInput["role"] })
                  }
                >
                  <option value="owner">Owner</option>
                  <option value="staff">Staff</option>
                  <option value="viewer">Viewer</option>
                </select>
              </Field>
              <Field label="Restaurant Access">
                <select
                  value={teamForm.accessScope}
                  onChange={(event) =>
                    setTeamForm({
                      ...teamForm,
                      accessScope: event.target.value as CreateTeamMemberInput["accessScope"],
                      restaurantIds: event.target.value === "all" ? [] : teamForm.restaurantIds,
                    })
                  }
                >
                  <option value="all">All my restaurants</option>
                  <option value="selected">Selected restaurants</option>
                </select>
              </Field>
              {teamForm.accessScope === "selected" ? (
                <div className="settings-team-checkboxes">
                  {ownerManagedRestaurants.map((restaurant) => {
                    const checked = teamForm.restaurantIds.includes(restaurant.id);
                    return (
                      <label key={restaurant.id} className="settings-team-checkbox">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) =>
                            setTeamForm({
                              ...teamForm,
                              restaurantIds: event.target.checked
                                ? [...teamForm.restaurantIds, restaurant.id]
                                : teamForm.restaurantIds.filter((id) => id !== restaurant.id),
                            })
                          }
                        />
                        <span>{restaurant.name}</span>
                      </label>
                    );
                  })}
                </div>
              ) : null}
            </div>
            <div className="settings-modal-footer">
              <Button tone="secondary" onClick={closeTeamMemberModal}>
                Cancel
              </Button>
              <Button
                onClick={submitTeamMember}
                disabled={
                  savingTeamMember ||
                  !teamForm.fullName.trim() ||
                  !teamForm.email.trim() ||
                  (teamModal.mode === "create" && teamForm.password.length < 8) ||
                  (teamForm.accessScope === "selected" && teamRestaurantIdsForForm(teamForm).length === 0)
                }
              >
                {savingTeamMember
                  ? teamModal.mode === "edit"
                    ? "Saving..."
                    : "Creating..."
                  : teamModal.mode === "edit"
                    ? "Save Changes"
                    : "Create Account"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
