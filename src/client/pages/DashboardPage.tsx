import { api } from "../lib/api";
import { useTenant } from "../auth/AuthContext";
import { dateTime, money } from "../lib/format";
import { Card, PageHeader, StatCard } from "../components/ui";
import { useResource } from "./useResource";

export function DashboardPage() {
  const { selectedRestaurantId } = useTenant();
  const { data, loading, error } = useResource(`dashboard:${selectedRestaurantId}`, () => api.dashboard(selectedRestaurantId!), [selectedRestaurantId]);

  if (loading) return <div className="panel-state">Loading dashboard…</div>;
  if (error || !data) return <div className="panel-state error">{error}</div>;

  return (
    <div className="page-grid">
      <PageHeader
        eyebrow="Restaurant Dashboard"
        title={data.restaurant.name}
        description="Monitor connection health, incoming agent demand, and approval queues from one operator console."
      />

      <div className="stats-grid">
        <StatCard label="POS Connection" value={data.posConnectionStatus} />
        <StatCard label="Agent Ordering" value={data.agentOrderingStatus} />
        <StatCard label="Orders This Week" value={String(data.ordersThisWeek)} />
        <StatCard label="Agent Revenue" value={money(data.revenueFromAgentOrdersCents)} />
        <StatCard label="Top Item" value={data.topItem} />
        <StatCard label="Needs Review" value={String(data.ordersNeedingReview)} hint="Manager approval queue" />
      </div>

      <Card title="Recent Activity" subtitle="Audit trail for important manager, system, and agent actions.">
        <div className="stack-list">
          {data.recentActivity.map((entry) => (
            <div key={entry.id} className="stack-row">
              <div>
                <strong>{entry.summary}</strong>
                <div className="muted">
                  {entry.actorType} · {entry.action}
                </div>
              </div>
              <div className="muted">{dateTime(entry.createdAt)}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
