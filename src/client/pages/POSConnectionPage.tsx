import { useState } from "react";
import { api } from "../lib/api";
import { useTenant } from "../auth/AuthContext";
import { dateTimeOrFallback } from "../lib/format";
import { Badge, Button, Card, PageHeader } from "../components/ui";
import { useResource } from "./useResource";

export function POSConnectionPage() {
  const { selectedRestaurantId, selectedRole } = useTenant();
  const canManagePos = selectedRole === "owner";
  const { data, setData, loading, error } = useResource(`pos-connection:${selectedRestaurantId}`, () => api.posConnection(selectedRestaurantId!), [selectedRestaurantId]);
  const [message, setMessage] = useState("");

  if (loading) return <div className="panel-state">Loading POS connection…</div>;
  if (error || !data) return <div className="panel-state error">{error}</div>;

  async function testConnection() {
    const result = await api.testPOSConnection(selectedRestaurantId!);
    setData({ ...data, status: result.status, lastTestedAt: result.checkedAt });
    setMessage(result.message);
  }

  async function syncMenu() {
    const result = await api.syncMenu(selectedRestaurantId!);
    setData({ ...data, lastSyncedAt: result.syncedAt });
    setMessage(result.message);
  }

  return (
    <div className="page-grid">
      <PageHeader
        eyebrow="POS Connection"
        title="Toast Provider"
        description="The adapter layer stays POS-agnostic while Toast is the first concrete implementation."
        actions={
          <div className="page-actions">
            <Button tone="secondary" onClick={testConnection} disabled={!canManagePos}>
              Test Connection
            </Button>
            <Button onClick={syncMenu} disabled={!canManagePos}>Sync Menu</Button>
          </div>
        }
      />
      <Card title="Connection Status" subtitle="Safe mock mode until sandbox credentials are available.">
        <div className="detail-grid">
          <div><span>Status</span><strong><Badge tone="warning">{data.status}</Badge></strong></div>
          <div><span>Provider</span><strong>{data.provider}</strong></div>
          <div><span>Mode</span><strong>{data.mode}</strong></div>
          <div><span>Restaurant GUID</span><strong>{data.restaurantGuid}</strong></div>
          <div><span>Location ID</span><strong>{data.locationId}</strong></div>
          <div><span>Last Tested</span><strong>{dateTimeOrFallback(data.lastTestedAt)}</strong></div>
          <div><span>Last Synced</span><strong>{dateTimeOrFallback(data.lastSyncedAt)}</strong></div>
        </div>
        {message ? <div className="inline-message">{message}</div> : null}
      </Card>
    </div>
  );
}
