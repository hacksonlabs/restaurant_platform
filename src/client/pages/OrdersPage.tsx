import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useTenant } from "../auth/AuthContext";
import { dateTime, money } from "../lib/format";
import { Badge, Button, Card, DataTable, PageHeader } from "../components/ui";
import { useResource } from "./useResource";

export function OrdersPage() {
  const { selectedRestaurantId, canManageOrders, isReadOnly } = useTenant();
  const { data, setData, loading, error } = useResource(`orders:${selectedRestaurantId}`, () => api.orders(selectedRestaurantId!), [selectedRestaurantId]);
  const [message, setMessage] = useState("");
  const [reviewingOrderId, setReviewingOrderId] = useState<string | null>(null);
  const [pendingDecisionOrderId, setPendingDecisionOrderId] = useState<string | null>(null);
  const [pendingDecisionByOrderId, setPendingDecisionByOrderId] = useState<Record<string, "approved" | "rejected">>({});
  const orders = Array.isArray(data) ? data : [];

  function getDisplayStatus(order: any) {
    const optimisticStatus = pendingDecisionByOrderId[order.id];
    if (optimisticStatus && order.status === "needs_approval") {
      return optimisticStatus;
    }
    return order.status;
  }

  function mergePendingDecisionStates(incomingOrders: any[]) {
    if (!incomingOrders.length) return incomingOrders;
    return incomingOrders.map((order) => {
      const displayStatus = getDisplayStatus(order);
      return displayStatus === order.status ? order : { ...order, status: displayStatus };
    });
  }

  async function refreshOrders() {
    const latestOrders = await api.orders(selectedRestaurantId!);
    const nextPendingDecisionByOrderId = Object.fromEntries(
      Object.entries(pendingDecisionByOrderId).filter(([orderId]) => {
        const latestOrder = latestOrders.find((order) => order.id === orderId);
        return !latestOrder || latestOrder.status === "needs_approval";
      }),
    ) as Record<string, "approved" | "rejected">;
    setPendingDecisionByOrderId(nextPendingDecisionByOrderId);
    setData(mergePendingDecisionStates(latestOrders));
  }

  async function acceptOrder(orderId: string) {
    setReviewingOrderId(null);
    setPendingDecisionOrderId(orderId);
    setPendingDecisionByOrderId((current) => ({ ...current, [orderId]: "approved" }));
    setData(orders.map((order) => (order.id === orderId ? { ...order, status: "approved" } : order)));
    try {
      const updatedOrder = await api.approveOrder(selectedRestaurantId!, orderId);
      setData(orders.map((order) => (order.id === orderId ? updatedOrder : order)));
      void refreshOrders();
    } catch (submitError) {
      setMessage(submitError instanceof Error ? submitError.message : `Failed to approve order ${orderId}.`);
      await refreshOrders();
    } finally {
      setPendingDecisionOrderId(null);
    }
  }

  async function rejectOrder(orderId: string) {
    setReviewingOrderId(null);
    setPendingDecisionOrderId(orderId);
    setPendingDecisionByOrderId((current) => ({ ...current, [orderId]: "rejected" }));
    setData(orders.map((order) => (order.id === orderId ? { ...order, status: "rejected" } : order)));
    try {
      const updatedOrder = await api.rejectOrder(selectedRestaurantId!, orderId);
      setData(orders.map((order) => (order.id === orderId ? updatedOrder : order)));
      void refreshOrders();
    } catch (submitError) {
      setMessage(submitError instanceof Error ? submitError.message : `Failed to reject order ${orderId}.`);
      await refreshOrders();
    } finally {
      setPendingDecisionOrderId(null);
    }
  }

  function statusLabel(status: string) {
    if (status === "needs_approval") {
      return "Needs review";
    }
    return status.replaceAll("_", " ");
  }

  useEffect(() => {
    const hasTransitioningOrders = orders.some((order) =>
      ["approved", "submitting_to_pos"].includes(getDisplayStatus(order)),
    );
    const hasPendingDecision = Object.keys(pendingDecisionByOrderId).length > 0;
    if ((!hasTransitioningOrders && !hasPendingDecision) || !selectedRestaurantId) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      void refreshOrders();
    }, 2500);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [orders, pendingDecisionByOrderId, selectedRestaurantId]);

  if (loading) return <div className="panel-state">Loading incoming orders…</div>;
  if (error || !data) return <div className="panel-state error">{error}</div>;

  return (
    <div className="page-grid">
      <PageHeader
        eyebrow="Incoming Orders"
        title="Agent Order Queue"
        description="Review each order’s submitted details, validation, quote, and POS submission lifecycle."
      />
      {message ? <div className="inline-message success">{message}</div> : null}
      <Card>
        <DataTable
          columns={["Order ID", "Agent", "Requested Time", "Status", "Total", "Headcount", "Approval", "Created"]}
          rows={orders.map((order) => {
            const displayStatus = getDisplayStatus(order);
            const canReview = displayStatus === "needs_approval" && canManageOrders && !isReadOnly;
            return [
            <div key={order.id}>
              <Link to={`/orders/${order.id}`} className="order-link">
                {order.id}
              </Link>
              {order.splitGroupSize && order.splitGroupSize > 1 ? (
                <div className="muted split-order-note">{order.splitGroupSize} linked split orders</div>
              ) : null}
            </div>,
            order.agentName ?? order.agentId,
            dateTime(order.requestedFulfillmentTime),
            canReview ? (
              <div key={`${order.id}-review`} className="review-cell">
                <button
                  type="button"
                  className="review-trigger"
                  disabled={pendingDecisionOrderId === order.id}
                  onClick={() => setReviewingOrderId((current) => (current === order.id ? null : order.id))}
                >
                  <Badge tone="warning">{statusLabel(displayStatus)}</Badge>
                </button>
                {reviewingOrderId === order.id ? (
                  <div className="review-popover">
                    <Button
                      className="button-small"
                      tone="secondary"
                      onClick={() => void acceptOrder(order.id)}
                      disabled={pendingDecisionOrderId === order.id}
                    >
                      Accept
                    </Button>
                    <Button
                      className="button-small"
                      tone="danger"
                      onClick={() => void rejectOrder(order.id)}
                      disabled={pendingDecisionOrderId === order.id}
                    >
                      Reject
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : (
              <Badge key={displayStatus} tone={displayStatus === "needs_approval" ? "warning" : "default"}>
                {statusLabel(displayStatus)}
              </Badge>
            ),
            money(order.totalEstimateCents),
            String(order.headcount),
            order.approvalRequired ? "required" : "not required",
            dateTime(order.createdAt),
          ];
          })}
        />
      </Card>
    </div>
  );
}
