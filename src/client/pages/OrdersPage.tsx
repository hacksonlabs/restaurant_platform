import { useState } from "react";
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

  if (loading) return <div className="panel-state">Loading incoming orders…</div>;
  if (error || !data) return <div className="panel-state error">{error}</div>;

  async function refreshOrders() {
    setData(await api.orders(selectedRestaurantId!));
  }

  async function acceptOrder(orderId: string) {
    await api.approveOrder(selectedRestaurantId!, orderId);
    setReviewingOrderId(null);
    setMessage(`Order ${orderId} accepted.`);
    await refreshOrders();
  }

  async function rejectOrder(orderId: string) {
    await api.rejectOrder(selectedRestaurantId!, orderId);
    setReviewingOrderId(null);
    setMessage(`Order ${orderId} rejected.`);
    await refreshOrders();
  }

  function statusLabel(status: string) {
    if (status === "needs_approval") {
      return "Needs review";
    }
    return status.replaceAll("_", " ");
  }

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
          rows={data.map((order) => [
            <div key={order.id}>
              <Link to={`/orders/${order.id}`} className="order-link">
                {order.id}
              </Link>
              {order.splitGroupSize && order.splitGroupSize > 1 ? (
                <div className="muted">{order.splitGroupSize} linked split orders</div>
              ) : null}
            </div>,
            order.agentName ?? order.agentId,
            dateTime(order.requestedFulfillmentTime),
            order.status === "needs_approval" && canManageOrders && !isReadOnly ? (
              <div key={`${order.id}-review`} className="review-cell">
                <button
                  type="button"
                  className="review-trigger"
                  onClick={() => setReviewingOrderId((current) => (current === order.id ? null : order.id))}
                >
                  <Badge tone="warning">{statusLabel(order.status)}</Badge>
                </button>
                {reviewingOrderId === order.id ? (
                  <div className="review-popover">
                    <Button className="button-small" tone="secondary" onClick={() => void acceptOrder(order.id)}>
                      Accept
                    </Button>
                    <Button className="button-small" tone="danger" onClick={() => void rejectOrder(order.id)}>
                      Reject
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : (
              <Badge key={order.status} tone={order.status === "needs_approval" ? "warning" : "default"}>
                {statusLabel(order.status)}
              </Badge>
            ),
            money(order.totalEstimateCents),
            String(order.headcount),
            order.approvalRequired ? "required" : "not required",
            dateTime(order.createdAt),
          ])}
        />
      </Card>
    </div>
  );
}
