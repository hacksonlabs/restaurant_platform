import { api } from "../lib/api";
import { dateTime, money } from "../lib/format";
import { Badge, Card, PageHeader, StatCard } from "../components/ui";
import { useResource } from "./useResource";

export function DashboardPage() {
  const { data, loading, error } = useResource(() => api.dashboard("rest_lb_steakhouse"), []);

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
        <StatCard label="POS Connection" value={data.posConnectionStatus} hint="Toast sandbox adapter" />
        <StatCard label="Agent Ordering" value={data.agentOrderingStatus} hint="Restaurant-side gateway enabled" />
        <StatCard label="Orders This Week" value={String(data.ordersThisWeek)} />
        <StatCard label="Agent Revenue" value={money(data.revenueFromAgentOrdersCents)} />
        <StatCard label="Top Item" value={data.topItem} />
        <StatCard label="Needs Review" value={String(data.ordersNeedingReview)} hint="Manager approval queue" />
      </div>

      <div className="two-column">
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
        <Card title="Demo Notes" subtitle="This local build ships in deterministic demo mode.">
          <div className="stack-list">
            <div className="stack-row">
              <span>Seed restaurant</span>
              <Badge tone="success">LB Steakhouse</Badge>
            </div>
            <div className="stack-row">
              <span>First agent</span>
              <Badge>Phantom allowed</Badge>
            </div>
            <div className="stack-row">
              <span>POS adapter</span>
              <Badge tone="warning">Toast mock sandbox</Badge>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
