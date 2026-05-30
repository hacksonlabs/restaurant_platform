import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useTenant } from "../auth/AuthContext";
import { dateTime, money } from "../lib/format";
import { Badge, Button, Card, DataTable, PageHeader } from "../components/ui";
import { useResource } from "./useResource";

function sortTextList(values: string[]) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function formatModifierLabel(modifier: any) {
  const name = modifier?.modifier?.name ?? modifier?.modifierId ?? "Modifier";
  const quantity = Number(modifier?.quantity || 1);
  return quantity > 1 ? `${name} x${quantity}` : name;
}

function buildItemModifierSummary(item: any) {
  return sortTextList(
    (Array.isArray(item?.modifiers) ? item.modifiers : []).map((modifier: any) => formatModifierLabel(modifier)),
  );
}

function buildItemUnitPriceCents(item: any) {
  const basePriceCents = Number(item?.menuItem?.priceCents ?? 0) || 0;
  const modifierPriceCents = (Array.isArray(item?.modifiers) ? item.modifiers : []).reduce(
    (sum: number, modifier: any) =>
      sum + ((Number(modifier?.modifier?.priceCents ?? 0) || 0) * (Number(modifier?.quantity || 1) || 1)),
    0,
  );
  return basePriceCents + modifierPriceCents;
}

function aggregateDisplayItems(items: any[], hasSplitBundle: boolean) {
  const grouped = new Map<string, any>();

  for (const item of Array.isArray(items) ? items : []) {
    const modifierSummary = buildItemModifierSummary(item);
    const notes = String(item?.notes || "").trim();
    const groupOrderId = hasSplitBundle ? String(item?.orderId || item?.groupOrderId || "") : "";
    const itemName = item?.menuItem?.name ?? item?.menuItemId ?? "Item";
    const unitPriceCents = buildItemUnitPriceCents(item);
    const key = JSON.stringify({
      groupOrderId,
      itemName,
      modifierSummary,
      notes,
      unitPriceCents,
    });

    const existing = grouped.get(key);
    if (existing) {
      existing.quantity += Number(item?.quantity || 0) || 0;
      existing.lineTotalCents = existing.unitPriceCents * existing.quantity;
      continue;
    }

    grouped.set(key, {
      key,
      groupOrderId,
      groupOrderIndex: item?.groupOrderIndex ?? null,
      groupOrderSize: item?.groupOrderSize ?? null,
      itemName,
      quantity: Number(item?.quantity || 0) || 0,
      unitPriceCents,
      lineTotalCents: unitPriceCents * (Number(item?.quantity || 0) || 0),
      modifierSummary,
      notes,
    });
  }

  return Array.from(grouped.values()).sort((left, right) => {
    const leftIndex = Number(left.groupOrderIndex ?? Number.MAX_SAFE_INTEGER);
    const rightIndex = Number(right.groupOrderIndex ?? Number.MAX_SAFE_INTEGER);
    if (leftIndex !== rightIndex) return leftIndex - rightIndex;
    return left.itemName.localeCompare(right.itemName);
  });
}

function getLatestQuotesByOrderId(quotes: any[]) {
  const latestByOrderId = new Map<string, any>();
  for (const quote of Array.isArray(quotes) ? quotes : []) {
    const orderId = String(quote?.orderId || "");
    if (!orderId) continue;
    const existing = latestByOrderId.get(orderId);
    if (!existing || new Date(quote.quotedAt).getTime() > new Date(existing.quotedAt).getTime()) {
      latestByOrderId.set(orderId, quote);
    }
  }
  return latestByOrderId;
}

function formatStatusLabel(status: string | null | undefined) {
  return String(status || "unknown")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (value) => value.toUpperCase());
}

function getStatusTone(status: string | null | undefined): "default" | "success" | "warning" | "danger" {
  const normalized = String(status || "").toLowerCase();
  if (["accepted", "confirmed", "approved", "completed", "ready", "preparing", "submitted_to_pos"].includes(normalized)) {
    return "success";
  }
  if (["rejected", "failed", "cancelled", "canceled"].includes(normalized)) {
    return "danger";
  }
  if (["needs_approval", "pending_confirmation", "submitted", "submitting_to_pos"].includes(normalized)) {
    return "warning";
  }
  return "default";
}

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
  const [showSuborderPricing, setShowSuborderPricing] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
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
  const aggregatedItems = aggregateDisplayItems(displayData?.items ?? [], hasSplitBundle);
  const latestQuotesByOrderId = getLatestQuotesByOrderId(displayData?.quotes ?? []);
  const latestQuoteEntries = Array.from(latestQuotesByOrderId.values()).sort((left, right) => {
    const leftOrder = groupedOrders.find((order: any) => order.id === left.orderId);
    const rightOrder = groupedOrders.find((order: any) => order.id === right.orderId);
    const leftIndex = Number(leftOrder?.splitGroupIndex ?? Number.MAX_SAFE_INTEGER);
    const rightIndex = Number(rightOrder?.splitGroupIndex ?? Number.MAX_SAFE_INTEGER);
    if (leftIndex !== rightIndex) return leftIndex - rightIndex;
    return new Date(right.quotedAt).getTime() - new Date(left.quotedAt).getTime();
  });
  const pricingBreakdown = latestQuoteEntries.reduce(
    (sum, quote: any) => ({
      subtotalCents: sum.subtotalCents + (Number(quote?.subtotalCents ?? 0) || 0),
      taxCents: sum.taxCents + (Number(quote?.taxCents ?? 0) || 0),
      feesCents: sum.feesCents + (Number(quote?.feesCents ?? 0) || 0),
      tipCents: sum.tipCents + (Number(quote?.tipCents ?? 0) || 0),
      totalCents: sum.totalCents + (Number(quote?.totalCents ?? 0) || 0),
    }),
    { subtotalCents: 0, taxCents: 0, feesCents: 0, tipCents: 0, totalCents: 0 },
  );

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

  const canDecide = canManageOrders && !isReadOnly && displayData?.order?.status === "needs_approval";
  const shouldAutoRefresh =
    displayData?.order?.status === "approved" ||
    displayData?.order?.status === "submitting_to_pos" ||
    groupedOrders.some((order: any) => ["approved", "submitting_to_pos"].includes(order.status));
  const renderCaret = (expanded: boolean) => (
    <span className={`section-caret ${expanded ? "expanded" : ""}`} aria-hidden="true" />
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

  if (loading) return <div className="panel-state">Loading order…</div>;
  if (error || !displayData) return <div className="panel-state error">{error}</div>;

  return (
    <div className="page-grid">
      <PageHeader
        eyebrow="Order Detail"
        title={displayData.order.id}
        description=""
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
        <Card title="Order Overview" className="overview-card">
          <div className="detail-grid">
            <div>
              <span>Status</span>
              <strong className="overview-status-wrap">
                <Badge tone={getStatusTone(displayData.order.status)}>{formatStatusLabel(displayData.order.status)}</Badge>
              </strong>
            </div>
            <div><span>Agent</span><strong>{displayData.order.agentName ?? displayData.order.agentId}</strong></div>
            <div><span>Customer</span><strong>{displayData.order.customerName}</strong></div>
            <div><span>Fulfillment</span><strong>{displayData.order.fulfillmentType}</strong></div>
            <div><span>Requested Time</span><strong>{dateTime(displayData.order.requestedFulfillmentTime)}</strong></div>
            <div><span>Headcount</span><strong>{displayData.order.headcount}</strong></div>
            {/* <div><span>Total</span><strong>{money(displayData.order.totalEstimateCents)}</strong></div> */}
            {/* {displayData.order.splitGroupSize && displayData.order.splitGroupSize > 1 ? (
              <div><span>Split Orders</span><strong>{String(displayData.order.splitGroupSize)}</strong></div>
            ) : null} */}
          </div>
        </Card>
        <Card title="Pricing" className="pricing-card">
          <div className="pricing-flow-card">
            <div className="pricing-flow-list">
              <div className="pricing-flow-row">
                <span>Subtotal</span>
                <strong>{money(pricingBreakdown.subtotalCents)}</strong>
              </div>
              <div className="pricing-flow-row">
                <span>Tax</span>
                <strong>{money(pricingBreakdown.taxCents)}</strong>
              </div>
              <div className="pricing-flow-row">
                <span>Fees</span>
                <strong>{money(pricingBreakdown.feesCents)}</strong>
              </div>
              <div className="pricing-flow-row">
                <span>Tip</span>
                <strong>{money(pricingBreakdown.tipCents)}</strong>
              </div>
            </div>
            <div className="pricing-flow-total">
              <span>Total</span>
              <strong>{money(pricingBreakdown.totalCents || displayData.order.totalEstimateCents)}</strong>
            </div>
            {latestQuoteEntries[0]?.quotedAt ? (
              <div className="pricing-flow-meta">
                Latest quote: {dateTime(latestQuoteEntries[0].quotedAt)}
              </div>
            ) : null}
          </div>
          {hasSplitBundle && latestQuoteEntries.length > 0 ? (
            <div className="split-breakdown-shell">
              <button
                type="button"
                className="split-breakdown-toggle"
                onClick={() => setShowSuborderPricing((value) => !value)}
                aria-expanded={showSuborderPricing}
              >
                <div className="split-breakdown-toggle-copy">
                  <span className="split-breakdown-heading">Suborder Pricing</span>
                  <strong>{latestQuoteEntries.length} linked suborders</strong>
                </div>
                <span
                  className={`split-breakdown-caret ${showSuborderPricing ? "expanded" : ""}`}
                  aria-hidden="true"
                />
              </button>
              {showSuborderPricing ? (
                <div className="split-breakdown-panel">
                  {latestQuoteEntries.map((quote: any) => (
                    <div key={quote.id} className="split-breakdown-card">
                      <div className="split-breakdown-meta">
                        <strong>{orderLabelById.get(quote.orderId) ?? quote.orderId}</strong>
                      </div>
                      <div className="split-breakdown-receipt">
                        <div className="quote-breakdown-values">
                          <span>Subtotal</span>
                          <strong>{money(quote.subtotalCents)}</strong>
                        </div>
                        <div className="quote-breakdown-values">
                          <span>Tax</span>
                          <strong>{money(quote.taxCents)}</strong>
                        </div>
                        <div className="quote-breakdown-values">
                          <span>Fees</span>
                          <strong>{money(quote.feesCents)}</strong>
                        </div>
                        <div className="quote-breakdown-values">
                          <span>Tip</span>
                          <strong>{money(quote.tipCents)}</strong>
                        </div>
                        <div className="quote-breakdown-total">
                          <span>Total</span>
                          <strong>{money(quote.totalCents)}</strong>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
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

      <Card title="Items" subtitle="">
        <DataTable
          columns={
            hasSplitBundle
              ? ["Suborder", "Item", "Qty", "Unit Price", "Line Total", "Modifiers & Customizations"]
              : ["Item", "Qty", "Unit Price", "Line Total", "Modifiers & Customizations"]
          }
          rows={aggregatedItems.map((item: any) => [
            ...(hasSplitBundle ? [orderLabelById.get(item.groupOrderId) ?? item.groupOrderId] : []),
            item.itemName,
            String(item.quantity),
            money(item.unitPriceCents),
            money(item.lineTotalCents),
            <div className="item-detail-cell" key={item.key}>
              {item.modifierSummary.length ? (
                <div className="item-detail-primary">{item.modifierSummary.join(", ")}</div>
              ) : (
                <div className="muted">—</div>
              )}
              {item.notes ? <div className="item-detail-note">Notes: {item.notes}</div> : null}
            </div>,
          ])}
        />
      </Card>

      <Card
        title="Order Timeline"
        subtitle="Lifecycle and submission events for debugging."
        actions={
          <Button
            type="button"
            tone="secondary"
            onClick={() => setShowTimeline((value) => !value)}
            aria-expanded={showTimeline}
          >
            {renderCaret(showTimeline)}
          </Button>
        }
      >
        {showTimeline ? (
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
        ) : null}
      </Card>

      <Card
        title="Order Payload"
        subtitle="Raw order data captured for this submission."
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

      <Card
        title="Execution Diagnostics"
        subtitle="Retry history and execution debug context."
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
