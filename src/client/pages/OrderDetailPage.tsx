import { useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useTenant } from "../auth/AuthContext";
import { dateTime, money } from "../lib/format";
import { Badge, Button, Card, DataTable, PageHeader } from "../components/ui";
import { useResource } from "./useResource";

export function OrderDetailPage() {
  const { orderId = "" } = useParams();
  const { selectedRestaurantId, canManageOrders, isReadOnly } = useTenant();
  const { data, setData, loading, error } = useResource(
    `order:${selectedRestaurantId}:${orderId}`,
    () => api.order(selectedRestaurantId!, orderId),
    [orderId, selectedRestaurantId],
  );
  const [message, setMessage] = useState("");
  const [showOrderDetails, setShowOrderDetails] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  if (loading) return <div className="panel-state">Loading order…</div>;
  if (error || !data) return <div className="panel-state error">{error}</div>;

  async function refresh() {
    setData(await api.order(selectedRestaurantId!, orderId));
  }

  async function approve() {
    await api.approveOrder(selectedRestaurantId!, orderId);
    setMessage(
      data.order.splitGroupSize && data.order.splitGroupSize > 1
        ? `Split order bundle approved. Phantom is sending ${data.order.splitGroupSize} linked orders to POS.`
        : "Order approved. Phantom is sending it to POS."
    );
    await refresh();
  }

  async function reject() {
    await api.rejectOrder(selectedRestaurantId!, orderId);
    setMessage(
      data.order.splitGroupSize && data.order.splitGroupSize > 1
        ? "Split order bundle rejected."
        : "Order rejected."
    );
    await refresh();
  }

  const groupedOrders = Array.isArray(data.groupedOrders) ? data.groupedOrders : [];
  const hasSplitBundle = groupedOrders.length > 1;
  const orderLabelById = new Map(
    groupedOrders.map((order: any, index: number) => [
      order.id,
      `Suborder ${order.splitGroupIndex ?? index + 1} of ${groupedOrders.length}`,
    ]),
  );
  const canDecide = canManageOrders && !isReadOnly && data.order.status === "needs_approval";
  const renderCaret = (expanded: boolean) => (
    <span
      style={{
        display: "inline-block",
        transform: expanded ? "rotate(0deg)" : "rotate(180deg)",
        transition: "transform 0.2s ease",
      }}
    >
      ^
    </span>
  );

  return (
    <div className="page-grid">
      <PageHeader
        eyebrow="Order Detail"
        title={data.order.id}
        description="Managers make a one-time approve or reject decision. Phantom handles the POS workflow after approval."
        actions={
          canDecide ? (
            <div className="page-actions">
              <Button tone="secondary" onClick={approve}>Approve</Button>
              <Button tone="danger" onClick={reject}>Reject</Button>
            </div>
          ) : undefined
        }
      />
      {message ? <div className="inline-message success">{message}</div> : null}
      <div className="two-column">
        <Card title="Order Overview">
          <div className="detail-grid">
            <div><span>Status</span><strong><Badge tone="warning">{data.order.status}</Badge></strong></div>
            <div><span>Agent</span><strong>{data.order.agentName ?? data.order.agentId}</strong></div>
            <div><span>Customer</span><strong>{data.order.customerName}</strong></div>
            <div><span>Fulfillment</span><strong>{data.order.fulfillmentType}</strong></div>
            <div><span>Requested Time</span><strong>{dateTime(data.order.requestedFulfillmentTime)}</strong></div>
            <div><span>Headcount</span><strong>{data.order.headcount}</strong></div>
            <div><span>Total</span><strong>{money(data.order.totalEstimateCents)}</strong></div>
            {data.order.splitGroupSize && data.order.splitGroupSize > 1 ? (
              <div><span>Split Orders</span><strong>{String(data.order.splitGroupSize)}</strong></div>
            ) : null}
          </div>
        </Card>
        <Card title="Validation & Quote">
          <div className="stack-list">
            {(data.validationResults ?? []).map((result: any) => (
              <div key={result.id} className="stack-row">
                <div>
                  <strong>{result.valid ? "Valid" : "Validation failed"}</strong>
                  <div className="muted">{dateTime(result.checkedAt)}</div>
                  {hasSplitBundle ? <div className="muted">{orderLabelById.get(result.orderId) ?? result.orderId}</div> : null}
                </div>
                <div className="muted">{result.issues.length} issues</div>
              </div>
            ))}
            {(data.quotes ?? []).map((quote: any) => (
              <div key={quote.id} className="stack-row">
                <div>
                  <strong>Quoted total</strong>
                  <div className="muted">{dateTime(quote.quotedAt)}</div>
                  {hasSplitBundle ? <div className="muted">{orderLabelById.get(quote.orderId) ?? quote.orderId}</div> : null}
                </div>
                <div>{money(quote.totalCents)}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {hasSplitBundle ? (
        <Card title="Split Orders" subtitle="This grouped approval contains multiple technical suborders that Phantom will send separately to the POS.">
          <DataTable
            columns={["Suborder", "Status", "Requested Time", "Headcount", "Total"]}
            rows={groupedOrders.map((order: any, index: number) => [
              `Suborder ${order.splitGroupIndex ?? index + 1} of ${groupedOrders.length}`,
              order.status,
              dateTime(order.requestedFulfillmentTime),
              String(order.headcount),
              money(order.totalEstimateCents),
            ])}
          />
        </Card>
      ) : null}

      <Card title="Items">
        <DataTable
          columns={hasSplitBundle ? ["Suborder", "Item", "Qty", "Modifiers"] : ["Item", "Qty", "Modifiers"]}
          rows={data.items.map((item: any) => [
            ...(hasSplitBundle ? [orderLabelById.get(item.orderId) ?? item.orderId] : []),
            item.menuItem?.name ?? item.menuItemId,
            String(item.quantity),
            item.modifiers.map((modifier: any) => modifier.modifier?.name ?? modifier.modifierId).join(", "),
          ])}
        />
      </Card>

      <Card
        title="Order Details"
        actions={
          <Button
            type="button"
            tone="secondary"
            onClick={() => setShowOrderDetails((value) => !value)}
            aria-expanded={showOrderDetails}
          >
            {renderCaret(showOrderDetails)}
          </Button>
        }
      >
        {showOrderDetails ? (
          hasSplitBundle ? (
            <div className="stack-list">
              {groupedOrders.map((order: any, index: number) => (
                <div key={order.id}>
                  <strong>{`Suborder ${order.splitGroupIndex ?? index + 1} of ${groupedOrders.length}`}</strong>
                  <div className="muted">{order.id}</div>
                  <pre className="json-view">{JSON.stringify(order.orderIntent, null, 2)}</pre>
                </div>
              ))}
            </div>
          ) : (
            <pre className="json-view">{JSON.stringify(data.order.orderIntent, null, 2)}</pre>
          )
        ) : null}
      </Card>

      <Card title="Order Timeline" subtitle="Lifecycle, validation, quote, submission, retry, and audit events are shown together for debugging.">
        <div className="stack-list">
          {(data.timeline ?? []).map((event: any) => (
            <div key={event.id} className="stack-row">
              <div>
                <strong>{event.title}</strong>
                <div className="muted">{event.kind} · {dateTime(event.createdAt)}</div>
                <div className="muted">{event.message}</div>
              </div>
              <div className="muted">{event.status ?? ""}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card
        title="Operational Diagnostics"
        subtitle="Raw payloads and retry history for operator debugging."
        actions={
          <Button
            type="button"
            tone="secondary"
            onClick={() => setShowDiagnostics((value) => !value)}
            aria-expanded={showDiagnostics}
          >
            {renderCaret(showDiagnostics)}
          </Button>
        }
      >
        {showDiagnostics ? (
          <pre className="json-view">{JSON.stringify(data.diagnostics ?? {}, null, 2)}</pre>
        ) : null}
      </Card>
    </div>
  );
}
