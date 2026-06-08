import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useTenant } from "../auth/AuthContext";
import { Badge, Button, Card, DataTable, Field, PageHeader } from "../components/ui";
import { dateTimeOrFallback } from "../lib/format";
import { useResource } from "./useResource";
import type { CreateTeamMemberInput, TeamMemberRecord, UpdateTeamMemberInput } from "@shared/types";

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

export function AccessPage() {
  const navigate = useNavigate();
  const { session, selectedRestaurantId, selectedRestaurantIds, isAllRestaurantsScope, hasAnyOwnerAccess, selectedRole, selectScope } =
    useTenant();
  const ownerManagedRestaurants =
    session?.restaurants.filter((restaurant) => restaurant.memberships.some((membership) => membership.role === "owner")) ?? [];
  const teamRestaurantIds = isAllRestaurantsScope ? ownerManagedRestaurants.map((restaurant) => restaurant.id) : selectedRole === "owner" && selectedRestaurantId ? [selectedRestaurantId] : [];
  const agentRestaurantIds = isAllRestaurantsScope ? selectedRestaurantIds : selectedRestaurantId ? [selectedRestaurantId] : [];

  const { data, setData, loading, error } = useResource(
    `access:${agentRestaurantIds.join(",")}:${teamRestaurantIds.join(",")}`,
    async () => {
      const [teamMembers, agentLists] = await Promise.all([
        teamRestaurantIds.length > 0 ? api.teamMembers(teamRestaurantIds[0]) : Promise.resolve([]),
        Promise.all(agentRestaurantIds.map(async (restaurantId) => ({ restaurantId, agents: await api.agents(restaurantId) }))),
      ]);

      return {
        teamMembers,
        agents: agentLists.flatMap(({ restaurantId, agents }) => {
          const restaurantName = session?.restaurants.find((restaurant) => restaurant.id === restaurantId)?.name ?? restaurantId;
          return agents.map((entry: any) => ({ ...entry, restaurantId, restaurantName }));
        }),
      };
    },
    [agentRestaurantIds.join(","), teamRestaurantIds.join(","), session?.restaurants.length ?? 0],
  );
  const [message, setMessage] = useState("");
  const [teamModal, setTeamModal] = useState<{ mode: "create" } | { mode: "edit"; member: TeamMemberRecord } | null>(null);
  const [teamForm, setTeamForm] = useState<TeamMemberFormState>(emptyTeamMemberForm());
  const [savingTeamMember, setSavingTeamMember] = useState(false);
  const [deletingTeamMemberId, setDeletingTeamMemberId] = useState<string | null>(null);
  const [reviewingAgentKey, setReviewingAgentKey] = useState<string | null>(null);
  const [pendingAgentKey, setPendingAgentKey] = useState<string | null>(null);

  if (loading) return <div className="panel-state">Loading access…</div>;
  if (error || !data) return <div className="panel-state error">{error}</div>;

  const editingCurrentUser = teamModal?.mode === "edit" && teamModal.member.user.id === session?.user.id;

  function visibleRestaurantIdsForForm(form: TeamMemberFormState) {
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
    if (!selectedRestaurantId && !isAllRestaurantsScope) return;
    const firstOwnerRestaurantId = ownerManagedRestaurants[0]?.id;
    if (!firstOwnerRestaurantId) return;
    if (!teamForm.fullName.trim()) {
      setMessage("Full name is required.");
      return;
    }
    if (!teamForm.email.trim()) {
      setMessage("Email is required.");
      return;
    }
    if (teamModal?.mode !== "edit" && teamForm.password.length < 8) {
      setMessage("Password must be at least 8 characters.");
      return;
    }
    if (teamForm.accessScope === "selected" && teamForm.restaurantIds.length === 0) {
      setMessage("Choose at least one restaurant for this account.");
      return;
    }
    setSavingTeamMember(true);
    setMessage("");
    try {
      if (teamModal?.mode === "edit") {
        const payload: UpdateTeamMemberInput = editingCurrentUser
          ? {
              fullName: teamForm.fullName,
              email: teamForm.email,
              role: "owner",
              accessScope: "selected",
              restaurantIds: teamModal.member.assignments.map((assignment) => assignment.restaurantId),
            }
          : {
              fullName: teamForm.fullName,
              email: teamForm.email,
              role: teamForm.role,
              accessScope: teamForm.accessScope,
              restaurantIds: visibleRestaurantIdsForForm(teamForm),
            };
        const updated = await api.updateTeamMember(firstOwnerRestaurantId, teamModal.member.user.id, payload);
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
          restaurantIds: visibleRestaurantIdsForForm(teamForm),
        };
        const created = await api.createTeamMember(firstOwnerRestaurantId, payload);
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
    const firstOwnerRestaurantId = ownerManagedRestaurants[0]?.id;
    if (!firstOwnerRestaurantId) return;
    if (!window.confirm(`Remove ${member.user.fullName} from your team?`)) return;
    setDeletingTeamMemberId(member.user.id);
    setMessage("");
    try {
      await api.deleteTeamMember(firstOwnerRestaurantId, member.user.id);
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

  async function openAgent(agent: any) {
    if (isAllRestaurantsScope) {
      await selectScope(agent.restaurantId);
    }
    navigate(`/agents/${agent.agent.id}`);
  }

  function agentRowKey(entry: any) {
    return `${entry.restaurantId}:${entry.agent.id}`;
  }

  function canManageAgentForRestaurant(entry: any) {
    const membership = session?.restaurants
      .find((restaurant) => restaurant.id === entry.restaurantId)
      ?.memberships.find((membership) => membership.restaurantId === entry.restaurantId);
    return membership?.role === "owner";
  }

  function permissionTone(status: string) {
    if (status === "allowed") return "success";
    if (status === "blocked" || status === "revoked") return "danger";
    return "warning";
  }

  function permissionLabel(status: string) {
    if (status === "pending") return "Needs review";
    return status.replaceAll("_", " ");
  }

  async function decideAgent(entry: any, status: "allowed" | "blocked") {
    const rowKey = agentRowKey(entry);
    const previousAgents = data.agents;
    setReviewingAgentKey(null);
    setPendingAgentKey(rowKey);
    setMessage("");
    setData({
      ...data,
      agents: data.agents.map((agentEntry: any) =>
        agentRowKey(agentEntry) === rowKey
          ? {
              ...agentEntry,
              permission: {
                ...agentEntry.permission,
                status,
                lastActivityAt: new Date().toISOString(),
              },
            }
          : agentEntry,
      ),
    });
    try {
      const updated = await api.updateAgentPermission(entry.restaurantId, entry.agent.id, { status });
      setData({
        ...data,
        agents: previousAgents.map((agentEntry: any) =>
          agentRowKey(agentEntry) === rowKey
            ? {
                ...agentEntry,
                permissionId: updated.id,
                permission: updated,
              }
            : agentEntry,
        ),
      });
    } catch (decisionError) {
      setData({ ...data, agents: previousAgents });
      setMessage(decisionError instanceof Error ? decisionError.message : `Failed to ${status === "allowed" ? "allow" : "block"} agent.`);
    } finally {
      setPendingAgentKey(null);
    }
  }

  return (
    <div className="page-grid">
      <PageHeader
        eyebrow="Access Management"
        title={isAllRestaurantsScope ? "Account Access" : "Restaurant Access"}
        description={isAllRestaurantsScope ? "Manage people and agents across your restaurants." : "Manage people and agents for this restaurant."}
      />
      {message && !teamModal ? <div className="inline-message">{message}</div> : null}

      {hasAnyOwnerAccess ? (
        <Card
          title="Team Members"
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
                  <button type="button" className="settings-table-action icon" aria-label={`Edit ${member.user.fullName}`} title="Edit" onClick={() => openEditTeamMemberModal(member)}>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25zm2.92 2.33H5v-.92l8.06-8.06.92.92-8.06 8.06zM19.71 6.04a1 1 0 0 0 0-1.41L17.37 2.29a1 1 0 0 0-1.41 0l-1.13 1.13 3.75 3.75 1.13-1.13z" fill="currentColor" />
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
                      {deletingTeamMemberId === member.user.id ? "..." : (
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v8h-2V9zm4 0h2v8h-2V9zM7 9h2v8H7V9zm1 11a2 2 0 0 1-2-2V8h12v10a2 2 0 0 1-2 2H8z" fill="currentColor" />
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

      <Card title="Agents" className="settings-controls-card access-agents-card">
        <DataTable
          columns={isAllRestaurantsScope ? ["Restaurant", "Agent", "Type", "Status", "Last Used"] : ["Agent", "Type", "Status", "Last Used"]}
          rows={data.agents.map((entry: any, index: number) => {
            const rowKey = agentRowKey(entry);
            const canDecideAgent = canManageAgentForRestaurant(entry);
            const shouldOpenReviewMenuUpward = index >= data.agents.length - 2;
            const cells = [
              <div className="access-agents-cell" key={`${entry.restaurantId}-restaurant`}>{entry.restaurantName}</div>,
              <div className="agent-app-cell" key={`${entry.restaurantId}-${entry.agent.id}-agent`}>
                <div className="agent-app-icon">{entry.agent.name.slice(0, 1)}</div>
                <div>
                  <button type="button" className="agent-name-link" onClick={() => void openAgent(entry)}>
                    {entry.agent.name}
                  </button>
                  <span className="agent-company-name">{entry.agent.partner?.name ?? "Independent agent"}</span>
                </div>
              </div>,
              <div className="access-agents-cell" key={`${entry.agent.id}-type`}>
                <Badge tone="default">
                  {entry.agent.slug === "coachimhungry" ? "First-Party Agent" : "External Agent"}
                </Badge>
              </div>,
              <div className="access-agents-cell" key={`${entry.agent.id}-status`}>
                {canDecideAgent ? (
                  <div className="review-cell">
                    <button
                      type="button"
                      className="review-trigger"
                      disabled={pendingAgentKey === rowKey}
                      onClick={() => setReviewingAgentKey((current) => (current === rowKey ? null : rowKey))}
                    >
                      <Badge tone={permissionTone(entry.permission.status)}>{permissionLabel(entry.permission.status)}</Badge>
                    </button>
                    {reviewingAgentKey === rowKey ? (
                      <div className={`review-popover access-review-popover ${shouldOpenReviewMenuUpward ? "open-up" : ""}`.trim()}>
                        <Button
                          className="button-small"
                          tone="secondary"
                          onClick={() => void decideAgent(entry, "allowed")}
                          disabled={pendingAgentKey === rowKey || entry.permission.status === "allowed"}
                        >
                          Approve
                        </Button>
                        <Button
                          className="button-small"
                          tone="danger"
                          onClick={() => void decideAgent(entry, "blocked")}
                          disabled={pendingAgentKey === rowKey || entry.permission.status === "blocked"}
                        >
                          Block
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <Badge tone={permissionTone(entry.permission.status)}>{permissionLabel(entry.permission.status)}</Badge>
                )}
              </div>,
              <div className="access-agents-cell" key={`${entry.agent.id}-used`}>{dateTimeOrFallback(entry.apiKey?.lastUsedAt ?? entry.permission.lastActivityAt)}</div>,
            ];
            return isAllRestaurantsScope ? cells : cells.slice(1);
          })}
        />
      </Card>

      {teamModal ? (
        <div className="settings-modal-backdrop" role="presentation" onClick={closeTeamMemberModal}>
          <div className="settings-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="settings-modal-header">
              <div>
                <h3>{editingCurrentUser ? "Edit Your Profile" : teamModal.mode === "edit" ? "Edit Team Member" : "Add Team Member"}</h3>
                <p>{editingCurrentUser ? "Update your name and email." : teamModal.mode === "edit" ? "Update role and restaurant access." : "Create a new account for your team."}</p>
              </div>
              <button type="button" className="settings-modal-close" onClick={closeTeamMemberModal} aria-label="Close">×</button>
            </div>
            <div className="settings-modal-body">
              {message ? <div className="inline-message">{message}</div> : null}
              <Field label="Full Name">
                <input value={teamForm.fullName} onChange={(event) => setTeamForm({ ...teamForm, fullName: event.target.value })} />
              </Field>
              <Field label="Email">
                <input type="email" value={teamForm.email} onChange={(event) => setTeamForm({ ...teamForm, email: event.target.value })} />
              </Field>
              {teamModal.mode === "create" ? (
                <Field label="Password">
                  <input type="password" value={teamForm.password} onChange={(event) => setTeamForm({ ...teamForm, password: event.target.value })} />
                </Field>
              ) : null}
              {!editingCurrentUser ? (
                <>
                  <Field label="Role">
                    <select value={teamForm.role} onChange={(event) => setTeamForm({ ...teamForm, role: event.target.value as CreateTeamMemberInput["role"] })}>
                      <option value="owner">Owner</option>
                      <option value="staff">Staff</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  </Field>
                  <Field label="Restaurant Access">
                    <select
                      value={teamForm.accessScope}
                      onChange={(event) => setTeamForm({ ...teamForm, accessScope: event.target.value as CreateTeamMemberInput["accessScope"], restaurantIds: event.target.value === "all" ? [] : teamForm.restaurantIds })}
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
                </>
              ) : null}
            </div>
            <div className="settings-modal-footer">
              <Button
                onClick={submitTeamMember}
                disabled={
                  savingTeamMember ||
                  !teamForm.fullName.trim() ||
                  !teamForm.email.trim() ||
                  (teamModal.mode === "create" && teamForm.password.length < 8) ||
                  (!editingCurrentUser && teamForm.accessScope === "selected" && visibleRestaurantIdsForForm(teamForm).length === 0)
                }
              >
                {savingTeamMember ? (teamModal.mode === "edit" ? "Saving..." : "Creating...") : teamModal.mode === "edit" ? "Save Changes" : "Create Account"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
