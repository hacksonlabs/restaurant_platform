import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useTenant } from "../auth/AuthContext";
import { dateTime, money } from "../lib/format";
import { Badge, Button, Card, DataTable, PageHeader } from "../components/ui";
import { useResource } from "./useResource";

export function OrdersPage() {
  const { selectedRestaurantId, selectedRestaurantIds, isAllRestaurantsScope, session } = useTenant();
  const isDemoMode = import.meta.env.MODE === "demo";
  const mockOrderRestaurantId = selectedRestaurantId ?? selectedRestaurantIds[0] ?? null;
  const canAddMockOrder = isDemoMode && Boolean(mockOrderRestaurantId);
  const { data, setData, loading, error, refresh } = useResource(
    `orders:${isAllRestaurantsScope ? selectedRestaurantIds.join(",") : selectedRestaurantId}`,
    async () => {
      if (isAllRestaurantsScope) {
        const responses = await Promise.all(
          selectedRestaurantIds.map(async (restaurantId) => ({
            restaurantId,
            restaurantName: session?.restaurants.find((restaurant) => restaurant.id === restaurantId)?.name ?? restaurantId,
            orders: await api.orders(restaurantId),
          })),
        );
        return responses
          .flatMap(({ restaurantId, restaurantName, orders }) =>
            orders.map((order) => ({ ...order, restaurantId, restaurantName })),
          )
          .sort((left, right) => left.requestedFulfillmentTime.localeCompare(right.requestedFulfillmentTime));
      }
      return api.orders(selectedRestaurantId!);
    },
    [selectedRestaurantId, selectedRestaurantIds.join(","), isAllRestaurantsScope, session?.restaurants.length ?? 0],
  );
  const [message, setMessage] = useState("");
  const [reviewingOrderId, setReviewingOrderId] = useState<string | null>(null);
  const [pendingDecisionOrderId, setPendingDecisionOrderId] = useState<string | null>(null);
  const [pendingDecisionByOrderId, setPendingDecisionByOrderId] = useState<Record<string, "approved" | "rejected">>({});
  const [creatingMockOrder, setCreatingMockOrder] = useState(false);
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
    const latestOrders = await refresh();
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
      const targetRestaurantId = orders.find((entry) => entry.id === orderId)?.restaurantId ?? selectedRestaurantId!;
      const updatedOrder = await api.approveOrder(targetRestaurantId, orderId);
      setData(orders.map((order) => (order.id === orderId ? { ...order, ...updatedOrder } : order)));
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
      const targetRestaurantId = orders.find((entry) => entry.id === orderId)?.restaurantId ?? selectedRestaurantId!;
      const updatedOrder = await api.rejectOrder(targetRestaurantId, orderId);
      setData(orders.map((order) => (order.id === orderId ? { ...order, ...updatedOrder } : order)));
      void refreshOrders();
    } catch (submitError) {
      setMessage(submitError instanceof Error ? submitError.message : `Failed to reject order ${orderId}.`);
      await refreshOrders();
    } finally {
      setPendingDecisionOrderId(null);
    }
  }

  async function addMockOrder() {
    if (!mockOrderRestaurantId) return;
    setMessage("");
    setCreatingMockOrder(true);
    try {
      const order = await api.addMockOrder(mockOrderRestaurantId);
      setMessage(`Added mock order ${order.id}.`);
      await refreshOrders();
    } catch (submitError) {
      setMessage(submitError instanceof Error ? submitError.message : "Failed to add a mock order.");
    } finally {
      setCreatingMockOrder(false);
    }
  }

  function statusLabel(status: string) {
    if (status === "needs_approval") {
      return "Needs review";
    }
    return status.replaceAll("_", " ");
  }

  function messageTone(value: string) {
    if (value === "Restaurant has agent ordering disabled.") {
      return "warning";
    }
    if (value.toLowerCase().includes("failed")) {
      return "danger";
    }
    return "success";
  }

  function canReviewOrder(order: any) {
    const targetRestaurantId = order.restaurantId ?? selectedRestaurantId;
    const membership = session?.restaurants
      .find((restaurant) => restaurant.id === targetRestaurantId)
      ?.memberships.find((entry) => entry.restaurantId === targetRestaurantId);
    return membership?.role === "owner" || membership?.role === "staff";
  }

  useEffect(() => {
    if (!selectedRestaurantId && !isAllRestaurantsScope) return undefined;
    const intervalId = window.setInterval(() => {
      void refreshOrders();
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [pendingDecisionByOrderId, refresh, selectedRestaurantId]);

  useEffect(() => {
    if (!message) return undefined;
    const timeoutId = window.setTimeout(() => setMessage(""), 7000);
    return () => window.clearTimeout(timeoutId);
  }, [message]);

  if (loading) return <div className="panel-state">Loading incoming orders…</div>;
  if (error || !data) return <div className="panel-state error">{error}</div>;

  return (
    <div className="page-grid">
      <PageHeader
        eyebrow="Incoming Orders"
        title={isAllRestaurantsScope ? "Incoming Orders" : "Incoming Orders"}
        description={
          isAllRestaurantsScope
            ? "Track active incoming orders across all restaurants."
            : "Track active incoming orders and step in when a review is needed."
        }
        actions={
          canAddMockOrder ? (
            <Button onClick={() => void addMockOrder()} disabled={creatingMockOrder}>
              {creatingMockOrder ? "Adding…" : "Add Mock Order"}
            </Button>
          ) : null
        }
      />
      {message ? <div className={`inline-message ${messageTone(message)}`}>{message}</div> : null}
      <Card>
        <DataTable
          columns={
            isAllRestaurantsScope
              ? ["Restaurant", "Order ID", "Agent", "Requested Time", "Status", "Total", "Headcount", "Approval", "Created"]
              : ["Order ID", "Agent", "Requested Time", "Status", "Total", "Headcount", "Approval", "Created"]
          }
          rows={orders.map((order, index) => {
            const displayStatus = getDisplayStatus(order);
            const canReview = displayStatus === "needs_approval" && canReviewOrder(order);
            const shouldOpenReviewMenuUpward = index >= orders.length - 2;
            const row = [
            isAllRestaurantsScope ? (order as any).restaurantName : null,
            <div key={order.id}>
              <Link
                to={`/orders/${order.id}?restaurantId=${encodeURIComponent(order.restaurantId)}`}
                className="order-link"
              >
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
                  <div className={`review-popover ${shouldOpenReviewMenuUpward ? "open-up" : ""}`.trim()}>
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
          return isAllRestaurantsScope ? row : row.slice(1);
          })}
        />
      </Card>
    </div>
  );
}
