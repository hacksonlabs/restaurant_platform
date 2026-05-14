import { useEffect, useState } from "react";
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
  const [pendingDecision, setPendingDecision] = useState<"approve" | "reject" | null>(null);
  const [optimisticDecisionStatus, setOptimisticDecisionStatus] = useState<"approved" | "rejected" | null>(null);

  function mergeOptimisticDecision(detail: any, optimisticStatus: "approved" | "rejected" | null) {
    if (!optimisticStatus) return detail;
    if (detail?.order?.status !== "needs_approval") return detail;
    return {
      ...detail,
      order: { ...detail.order, status: optimisticStatus },
      groupedOrders: Array.isArray(detail.groupedOrders)
        ? detail.groupedOrders.map((order: any) =>
            order.status === "needs_approval" ? { ...order, status: optimisticStatus } : order,
          )
        : detail.groupedOrders,
    };
  }

  const displayData = data ? mergeOptimisticDecision(data, optimisticDecisionStatus) : data;
  const groupedOrders = Array.isArray(displayData?.groupedOrders) ? displayData.groupedOrders : [];
  const hasSplitBundle = groupedOrders.length > 1;
  const orderLabelById = new Map(
    groupedOrders.map((order: any, index: number) => [
      order.id,
      `Suborder ${order.splitGroupIndex ?? index + 1} of ${groupedOrders.length}`,
    ]),
  );

  if (loading) return <div className="panel-state">Loading order…</div>;
  if (error || !displayData) return <div className="panel-state error">{error}</div>;

  async function refresh() {
    const latestDetail = await api.order(selectedRestaurantId!, orderId);
    if (latestDetail?.order?.status && latestDetail.order.status !== "needs_approval") {
      setOptimisticDecisionStatus(null);
    }
    setData(mergeOptimisticDecision(latestDetail, optimisticDecisionStatus));
  }

  async function approve() {
    setPendingDecision("approve");
    setOptimisticDecisionStatus("approved");
    setMessage("Approving order…");
    setData({
      ...displayData,
      order: { ...displayData.order, status: "approved" },
      groupedOrders: groupedOrders.length
        ? groupedOrders.map((order: any) => ({ ...order, status: "approved" }))
        : displayData.groupedOrders,
    });
    try {
      const updatedOrder = await api.approveOrder(selectedRestaurantId!, orderId);
      setMessage(
        updatedOrder.splitGroupSize && updatedOrder.splitGroupSize > 1
          ? `Split order bundle approved. Phantom is sending ${updatedOrder.splitGroupSize} linked orders to POS.`
          : "Order approved. Phantom is sending it to POS."
      );
      setData({
        ...displayData,
        order: updatedOrder,
        groupedOrders: groupedOrders.length
          ? groupedOrders.map((order: any) => ({ ...order, status: "approved" }))
          : displayData.groupedOrders,
      });
      void refresh();
    } catch (submitError) {
      setMessage(submitError instanceof Error ? submitError.message : "Failed to approve order.");
      await refresh();
    } finally {
      setPendingDecision(null);
    }
  }

  async function reject() {
    setPendingDecision("reject");
    setOptimisticDecisionStatus("rejected");
    setMessage("Rejecting order…");
    setData({
      ...displayData,
      order: { ...displayData.order, status: "rejected" },
      groupedOrders: groupedOrders.length
        ? groupedOrders.map((order: any) => ({ ...order, status: "rejected" }))
        : displayData.groupedOrders,
    });
    try {
      const updatedOrder = await api.rejectOrder(selectedRestaurantId!, orderId);
      setMessage(
        updatedOrder.splitGroupSize && updatedOrder.splitGroupSize > 1
          ? "Split order bundle rejected."
          : "Order rejected."
      );
      setData({
        ...displayData,
        order: updatedOrder,
        groupedOrders: groupedOrders.length
          ? groupedOrders.map((order: any) => ({ ...order, status: "rejected" }))
          : displayData.groupedOrders,
      });
      void refresh();
    } catch (submitError) {
      setMessage(submitError instanceof Error ? submitError.message : "Failed to reject order.");
      await refresh();
    } finally {
      setPendingDecision(null);
    }
  }

  const canDecide = canManageOrders && !isReadOnly && displayData.order.status === "needs_approval";
  const shouldAutoRefresh =
    displayData.order.status === "approved" ||
    displayData.order.status === "submitting_to_pos" ||
    groupedOrders.some((order: any) => ["approved", "submitting_to_pos"].includes(order.status));
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

  useEffect(() => {
    if (!shouldAutoRefresh || !selectedRestaurantId) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      void refresh();
    }, 2500);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [shouldAutoRefresh, selectedRestaurantId, orderId]);

  return (
    <div className="page-grid">
      <PageHeader
        eyebrow="Order Detail"
        title={displayData.order.id}
        description="Managers make a one-time approve or reject decision. Phantom handles the POS workflow after approval."
        actions={
          canDecide ? (
            <div className="page-actions">
              <Button tone="secondary" onClick={approve} disabled={pendingDecision !== null}>Approve</Button>
              <Button tone="danger" onClick={reject} disabled={pendingDecision !== null}>Reject</Button>
            </div>
          ) : undefined
        }
      />
      {message ? <div className="inline-message success">{message}</div> : null}
      <div className="two-column">
        <Card title="Order Overview">
          <div className="detail-grid">
            <div><span>Status</span><strong><Badge tone="warning">{displayData.order.status}</Badge></strong></div>
            <div><span>Agent</span><strong>{displayData.order.agentName ?? displayData.order.agentId}</strong></div>
            <div><span>Customer</span><strong>{displayData.order.customerName}</strong></div>
            <div><span>Fulfillment</span><strong>{displayData.order.fulfillmentType}</strong></div>
            <div><span>Requested Time</span><strong>{dateTime(displayData.order.requestedFulfillmentTime)}</strong></div>
            <div><span>Headcount</span><strong>{displayData.order.headcount}</strong></div>
            <div><span>Total</span><strong>{money(displayData.order.totalEstimateCents)}</strong></div>
            {displayData.order.splitGroupSize && displayData.order.splitGroupSize > 1 ? (
              <div><span>Split Orders</span><strong>{String(displayData.order.splitGroupSize)}</strong></div>
            ) : null}
          </div>
        </Card>
        <Card title="Validation & Quote">
          <div className="stack-list">
            {(displayData.validationResults ?? []).map((result: any) => (
              <div key={result.id} className="stack-row">
                <div>
                  <strong>{result.valid ? "Valid" : "Validation failed"}</strong>
                  <div className="muted">{dateTime(result.checkedAt)}</div>
                  {hasSplitBundle ? <div className="muted">{orderLabelById.get(result.orderId) ?? result.orderId}</div> : null}
                </div>
                <div className="muted">{result.issues.length} issues</div>
              </div>
            ))}
            {(displayData.quotes ?? []).map((quote: any) => (
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
          rows={displayData.items.map((item: any) => [
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
            <pre className="json-view">{JSON.stringify(displayData.order.orderIntent, null, 2)}</pre>
          )
        ) : null}
      </Card>

      <Card title="Order Timeline" subtitle="Lifecycle, validation, quote, submission, retry, and audit events are shown together for debugging.">
        <div className="stack-list">
          {(displayData.timeline ?? []).map((event: any) => (
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
          <pre className="json-view">{JSON.stringify(displayData.diagnostics ?? {}, null, 2)}</pre>
        ) : null}
      </Card>
    </div>
  );
}
