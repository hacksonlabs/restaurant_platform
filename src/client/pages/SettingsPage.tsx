import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useTenant } from "../auth/AuthContext";
import { Button, Card, Field, PageHeader } from "../components/ui";
import { useResource } from "./useResource";

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

export function SettingsPage() {
  const { selectedRestaurantId, canManageRules } = useTenant();
  const { data, setData, loading, error } = useResource(
    `settings:${selectedRestaurantId}`,
    async () => {
      const [restaurant, rules] = await Promise.all([
        api.restaurant(selectedRestaurantId!),
        api.rules(selectedRestaurantId!),
      ]);

      return { restaurant, rules };
    },
    [selectedRestaurantId],
  );
  const [message, setMessage] = useState("");
  const [savedData, setSavedData] = useState<typeof data | null>(null);
  const [updatingAutoAccept, setUpdatingAutoAccept] = useState(false);
  const [updatingAgentOrdering, setUpdatingAgentOrdering] = useState(false);

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
    </div>
  );
}
