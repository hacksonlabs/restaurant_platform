import { useState } from "react";
import { api } from "../lib/api";
import { useTenant } from "../auth/AuthContext";
import { Button, Card, Field, PageHeader } from "../components/ui";
import { useResource } from "./useResource";

export function RulesPage() {
  const { selectedRestaurantId, canManageRules } = useTenant();
  const { data, setData, loading, error } = useResource(`rules:${selectedRestaurantId}`, () => api.rules(selectedRestaurantId!), [selectedRestaurantId]);
  const [message, setMessage] = useState("");

  if (loading) return <div className="panel-state">Loading ordering rules…</div>;
  if (error || !data) return <div className="panel-state error">{error}</div>;

  async function save() {
    const updated = await api.updateRules(selectedRestaurantId!, data);
    setData(updated);
    setMessage("Ordering rules saved.");
  }

  return (
    <div className="page-grid">
      <PageHeader
        eyebrow="Agent Ordering Rules"
        title="Order Guardrails"
        description="Deterministic rule checks run before quote and submit to keep agent ordering safe."
        actions={<Button onClick={save} disabled={!canManageRules}>Save Rules</Button>}
      />
      <Card title="Rules">
        <div className="form-grid">
          <Field label="Minimum Lead Time (minutes)">
            <input
              type="number"
              value={data.minimumLeadTimeMinutes}
              disabled={!canManageRules}
              onChange={(event) => setData({ ...data, minimumLeadTimeMinutes: Number(event.target.value) })}
            />
          </Field>
          <Field label="Max Order Dollar Amount">
            <input
              type="number"
              value={data.maxOrderDollarAmount}
              disabled={!canManageRules}
              onChange={(event) => setData({ ...data, maxOrderDollarAmount: Number(event.target.value) })}
            />
          </Field>
          <Field label="Max Item Quantity">
            <input
              type="number"
              value={data.maxItemQuantity}
              disabled={!canManageRules}
              onChange={(event) => setData({ ...data, maxItemQuantity: Number(event.target.value) })}
            />
          </Field>
          <Field label="Max Headcount">
            <input
              type="number"
              value={data.maxHeadcount}
              disabled={!canManageRules}
              onChange={(event) => setData({ ...data, maxHeadcount: Number(event.target.value) })}
            />
          </Field>
          <Field label="Auto Accept">
            <select
              value={String(data.autoAcceptEnabled)}
              disabled={!canManageRules}
              onChange={(event) => setData({ ...data, autoAcceptEnabled: event.target.value === "true" })}
            >
              <option value="true">enabled</option>
              <option value="false">disabled</option>
            </select>
          </Field>
          <Field label="Manager Approval Threshold (cents)">
            <input
              type="number"
              value={data.managerApprovalThresholdCents}
              disabled={!canManageRules}
              onChange={(event) => setData({ ...data, managerApprovalThresholdCents: Number(event.target.value) })}
            />
          </Field>
          <Field label="Substitution Policy">
            <select
              value={data.substitutionPolicy}
              disabled={!canManageRules}
              onChange={(event) => setData({ ...data, substitutionPolicy: event.target.value as any })}
            >
              <option value="strict">strict</option>
              <option value="allow_equivalent">allow_equivalent</option>
              <option value="require_approval">require_approval</option>
            </select>
          </Field>
          <Field label="Payment Policy">
            <select
              value={data.paymentPolicy}
              disabled={!canManageRules}
              onChange={(event) => setData({ ...data, paymentPolicy: event.target.value as any })}
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
