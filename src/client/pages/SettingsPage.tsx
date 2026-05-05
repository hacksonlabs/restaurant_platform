import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Button, Card, Field, PageHeader } from "../components/ui";
import { useResource } from "./useResource";

export function SettingsPage() {
  const { data, setData, loading, error } = useResource(
    async () => {
      const [restaurant, rules] = await Promise.all([
        api.restaurant("rest_lb_steakhouse"),
        api.rules("rest_lb_steakhouse"),
      ]);

      return { restaurant, rules };
    },
    [],
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    setMessage("");
  }, [data?.restaurant.updatedAt]);

  if (loading) return <div className="panel-state">Loading settings…</div>;
  if (error || !data) return <div className="panel-state error">{error}</div>;

  async function save() {
    const [restaurant, rules] = await Promise.all([
      api.updateRestaurant(data.restaurant.id, data.restaurant),
      api.updateRules("rest_lb_steakhouse", data.rules),
    ]);
    setData({ restaurant, rules });
    setMessage("Profile and ordering rules saved.");
  }

  return (
    <div className="page-grid">
      <PageHeader
        eyebrow="Restaurant Profile"
        title="Profile & Settings"
        description="Configure the restaurant tenant and its ordering guardrails in one place."
        actions={<Button onClick={save}>Save Changes</Button>}
      />
      <Card title="Restaurant Configuration">
        <div className="form-grid">
          <Field label="Restaurant Name">
            <input
              value={data.restaurant.name}
              onChange={(event) =>
                setData({ ...data, restaurant: { ...data.restaurant, name: event.target.value } })
              }
            />
          </Field>
          <Field label="Location">
            <input
              value={data.restaurant.location}
              onChange={(event) =>
                setData({ ...data, restaurant: { ...data.restaurant, location: event.target.value } })
              }
            />
          </Field>
          <Field label="Timezone">
            <input
              value={data.restaurant.timezone}
              onChange={(event) =>
                setData({ ...data, restaurant: { ...data.restaurant, timezone: event.target.value } })
              }
            />
          </Field>
          <Field label="POS Provider">
            <input value={data.restaurant.posProvider} disabled />
          </Field>
          <Field label="Contact Email">
            <input
              value={data.restaurant.contactEmail}
              onChange={(event) =>
                setData({ ...data, restaurant: { ...data.restaurant, contactEmail: event.target.value } })
              }
            />
          </Field>
          <Field label="Contact Phone">
            <input
              value={data.restaurant.contactPhone}
              onChange={(event) =>
                setData({ ...data, restaurant: { ...data.restaurant, contactPhone: event.target.value } })
              }
            />
          </Field>
          <Field label="Default Approval Mode">
            <select
              value={data.restaurant.defaultApprovalMode}
              onChange={(event) =>
                setData({
                  ...data,
                  restaurant: { ...data.restaurant, defaultApprovalMode: event.target.value as any },
                })
              }
            >
              <option value="auto">auto</option>
              <option value="manual_review">manual_review</option>
              <option value="threshold_review">threshold_review</option>
            </select>
          </Field>
          <Field label="Agent Ordering Enabled">
            <select
              value={String(data.restaurant.agentOrderingEnabled)}
              onChange={(event) =>
                setData({
                  ...data,
                  restaurant: {
                    ...data.restaurant,
                    agentOrderingEnabled: event.target.value === "true",
                  },
                })
              }
            >
              <option value="true">enabled</option>
              <option value="false">disabled</option>
            </select>
          </Field>
        </div>
      </Card>
      <Card
        title="Ordering Rules"
        subtitle="Deterministic checks that run before quote and submit for all agent orders."
      >
        <div className="form-grid">
          <Field label="Minimum Lead Time (minutes)">
            <input
              type="number"
              value={data.rules.minimumLeadTimeMinutes}
              onChange={(event) =>
                setData({
                  ...data,
                  rules: { ...data.rules, minimumLeadTimeMinutes: Number(event.target.value) },
                })
              }
            />
          </Field>
          <Field label="Max Order Dollar Amount">
            <input
              type="number"
              value={data.rules.maxOrderDollarAmount}
              onChange={(event) =>
                setData({
                  ...data,
                  rules: { ...data.rules, maxOrderDollarAmount: Number(event.target.value) },
                })
              }
            />
          </Field>
          <Field label="Max Item Quantity">
            <input
              type="number"
              value={data.rules.maxItemQuantity}
              onChange={(event) =>
                setData({
                  ...data,
                  rules: { ...data.rules, maxItemQuantity: Number(event.target.value) },
                })
              }
            />
          </Field>
          <Field label="Max Headcount">
            <input
              type="number"
              value={data.rules.maxHeadcount}
              onChange={(event) =>
                setData({
                  ...data,
                  rules: { ...data.rules, maxHeadcount: Number(event.target.value) },
                })
              }
            />
          </Field>
          <Field label="Auto Accept">
            <select
              value={String(data.rules.autoAcceptEnabled)}
              onChange={(event) =>
                setData({
                  ...data,
                  rules: { ...data.rules, autoAcceptEnabled: event.target.value === "true" },
                })
              }
            >
              <option value="true">enabled</option>
              <option value="false">disabled</option>
            </select>
          </Field>
          <Field label="Manager Approval Threshold (cents)">
            <input
              type="number"
              value={data.rules.managerApprovalThresholdCents}
              onChange={(event) =>
                setData({
                  ...data,
                  rules: {
                    ...data.rules,
                    managerApprovalThresholdCents: Number(event.target.value),
                  },
                })
              }
            />
          </Field>
          <Field label="Substitution Policy">
            <select
              value={data.rules.substitutionPolicy}
              onChange={(event) =>
                setData({
                  ...data,
                  rules: { ...data.rules, substitutionPolicy: event.target.value as any },
                })
              }
            >
              <option value="strict">strict</option>
              <option value="allow_equivalent">allow_equivalent</option>
              <option value="require_approval">require_approval</option>
            </select>
          </Field>
          <Field label="Payment Policy">
            <select
              value={data.rules.paymentPolicy}
              onChange={(event) =>
                setData({
                  ...data,
                  rules: { ...data.rules, paymentPolicy: event.target.value as any },
                })
              }
            >
              <option value="required_before_submit">required_before_submit</option>
              <option value="invoice_manual">invoice_manual</option>
              <option value="stored_payment">stored_payment</option>
            </select>
          </Field>
        </div>
        {message ? <div className="inline-message success">{message}</div> : null}
      </Card>
    </div>
  );
}
