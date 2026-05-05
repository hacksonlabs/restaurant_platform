import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { dateTime, money } from "../lib/format";
import { Badge, Card, DataTable, PageHeader } from "../components/ui";
import { useResource } from "./useResource";

export function OrdersPage() {
  const { data, loading, error } = useResource(() => api.orders("rest_lb_steakhouse"), []);

  if (loading) return <div className="panel-state">Loading incoming orders…</div>;
  if (error || !data) return <div className="panel-state error">{error}</div>;

  return (
    <div className="page-grid">
      <PageHeader
        eyebrow="Incoming Orders"
        title="Agent Order Queue"
        description="Review each order’s canonical intent, validation, quote, and POS submission lifecycle."
      />
      <Card title="Orders">
        <DataTable
          columns={["Order ID", "Agent", "Requested Time", "Status", "Estimate", "Headcount", "Approval", "Created"]}
          rows={data.map((order) => [
            <Link key={order.id} to={`/orders/${order.id}`}>
              {order.id}
            </Link>,
            order.agentId,
            dateTime(order.requestedFulfillmentTime),
            <Badge key={order.status} tone={order.status === "needs_approval" ? "warning" : "default"}>
              {order.status}
            </Badge>,
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
