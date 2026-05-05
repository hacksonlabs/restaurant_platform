import { useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { dateTime, money } from "../lib/format";
import { Badge, Button, Card, DataTable, PageHeader } from "../components/ui";
import { useResource } from "./useResource";

export function OrderDetailPage() {
  const { orderId = "" } = useParams();
  const { data, setData, loading, error } = useResource(() => api.order("rest_lb_steakhouse", orderId), [orderId]);
  const [message, setMessage] = useState("");

  if (loading) return <div className="panel-state">Loading order…</div>;
  if (error || !data) return <div className="panel-state error">{error}</div>;

  async function refresh() {
    setData(await api.order("rest_lb_steakhouse", orderId));
  }

  async function approve() {
    await api.approveOrder("rest_lb_steakhouse", orderId);
    setMessage("Order approved.");
    await refresh();
  }

  async function reject() {
    await api.rejectOrder("rest_lb_steakhouse", orderId);
    setMessage("Order rejected.");
    await refresh();
  }

  async function submitToPOS() {
    await api.submitOrderToPOS("rest_lb_steakhouse", orderId);
    setMessage("Order submitted to mock Toast adapter.");
    await refresh();
  }

  return (
    <div className="page-grid">
      <PageHeader
        eyebrow="Order Detail"
        title={data.order.id}
        description="Canonical order intent, validation state, and POS submission are shown together for deterministic review."
        actions={
          <div className="page-actions">
            <Button tone="secondary" onClick={approve}>Approve</Button>
            <Button tone="danger" onClick={reject}>Reject</Button>
            <Button onClick={submitToPOS}>Submit to POS</Button>
          </div>
        }
      />
      {message ? <div className="inline-message success">{message}</div> : null}
      <div className="two-column">
        <Card title="Order Overview">
          <div className="detail-grid">
            <div><span>Status</span><strong><Badge tone="warning">{data.order.status}</Badge></strong></div>
            <div><span>Agent</span><strong>{data.order.agentId}</strong></div>
            <div><span>Customer</span><strong>{data.order.customerName}</strong></div>
            <div><span>Team</span><strong>{data.order.teamName}</strong></div>
            <div><span>Fulfillment</span><strong>{data.order.fulfillmentType}</strong></div>
            <div><span>Requested Time</span><strong>{dateTime(data.order.requestedFulfillmentTime)}</strong></div>
            <div><span>Headcount</span><strong>{data.order.headcount}</strong></div>
            <div><span>Total Estimate</span><strong>{money(data.order.totalEstimateCents)}</strong></div>
          </div>
        </Card>
        <Card title="Validation & Quote">
          <div className="stack-list">
            {(data.validationResults ?? []).map((result: any) => (
              <div key={result.id} className="stack-row">
                <div>
                  <strong>{result.valid ? "Valid" : "Validation failed"}</strong>
                  <div className="muted">{dateTime(result.checkedAt)}</div>
                </div>
                <div className="muted">{result.issues.length} issues</div>
              </div>
            ))}
            {(data.quotes ?? []).map((quote: any) => (
              <div key={quote.id} className="stack-row">
                <div>
                  <strong>Quoted total</strong>
                  <div className="muted">{dateTime(quote.quotedAt)}</div>
                </div>
                <div>{money(quote.totalCents)}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card title="Items">
        <DataTable
          columns={["Item", "Qty", "Modifiers"]}
          rows={data.items.map((item: any) => [
            item.menuItem?.name ?? item.menuItemId,
            String(item.quantity),
            item.modifiers.map((modifier: any) => modifier.modifier?.name ?? modifier.modifierId).join(", "),
          ])}
        />
      </Card>

      <Card title="Canonical Order Intent">
        <pre className="json-view">{JSON.stringify(data.order.orderIntent, null, 2)}</pre>
      </Card>
    </div>
  );
}
