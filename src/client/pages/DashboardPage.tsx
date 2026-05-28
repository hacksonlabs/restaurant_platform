import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useTenant } from "../auth/AuthContext";
import { dateTime, money } from "../lib/format";
import { Card, PageHeader } from "../components/ui";
import { useResource } from "./useResource";

function formatStatus(value: string) {
  return value.replaceAll("_", " ");
}

function statusTone(value: string) {
  if (value === "active" || value === "enabled") return "good";
  if (value === "mock") return "neutral";
  return "warning";
}

function isImportantDashboardActivity(action: string) {
  return [
    "order.needs_approval",
    "order.approved",
    "order.rejected",
    "order.failed",
    "order.validation_failed",
    "order.quote_failed",
    "order.pos_submission_attention_needed",
    "rules.updated",
  ].includes(action);
}

export function DashboardPage() {
  const { selectedRestaurantId } = useTenant();
  const { data, loading, error, refresh } = useResource(`dashboard:${selectedRestaurantId}`, () => api.dashboard(selectedRestaurantId!), [selectedRestaurantId]);
  const [activityOpen, setActivityOpen] = useState(false);

  useEffect(() => {
    if (!selectedRestaurantId) return undefined;
    const intervalId = window.setInterval(() => {
      void refresh();
    }, 5000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [refresh, selectedRestaurantId]);

  if (loading) return <div className="panel-state">Loading dashboard…</div>;
  if (error || !data) return <div className="panel-state error">{error}</div>;

  const importantActivity = data.recentActivity.filter((entry) => isImportantDashboardActivity(entry.action));

  return (
    <div className="page-grid dashboard-page">
      <PageHeader
        eyebrow="Restaurant Dashboard"
        title={data.restaurant.name}
        description="A quick view of queue health and agent ordering performance."
        actions={
          <Card className="dashboard-header-status">
            <div className="dashboard-kicker">System Status</div>
            <div className="dashboard-status-list">
              <div className="dashboard-status-row">
                <span>POS connection</span>
                <strong className={`dashboard-status-value ${statusTone(data.posConnectionStatus)}`}>
                  {formatStatus(data.posConnectionStatus)}
                </strong>
              </div>
              <div className="dashboard-status-row">
                <span>Agent ordering</span>
                <strong className={`dashboard-status-value ${statusTone(data.agentOrderingStatus)}`}>
                  {formatStatus(data.agentOrderingStatus)}
                </strong>
              </div>
            </div>
          </Card>
        }
      />

      <div className="dashboard-summary-grid">
        <Card className="dashboard-summary-card">
          <div className="dashboard-kicker">Orders Needing Review</div>
          <div className={`dashboard-summary-value ${data.ordersNeedingReview > 0 ? "warning" : "good"}`}>
            {data.ordersNeedingReview}
          </div>
        </Card>

        <Card className="dashboard-summary-card">
          <div className="dashboard-kicker">Orders This Week</div>
          <div className="dashboard-summary-value">{data.ordersThisWeek}</div>
        </Card>

        <Card className="dashboard-summary-card">
          <div className="dashboard-kicker">Revenue This Week</div>
          <div className="dashboard-summary-value">{money(data.revenueFromAgentOrdersCents)}</div>
        </Card>
      </div>

      <div className="dashboard-lower-grid">
        <Card className="dashboard-activity-card">
          <button
            type="button"
            className="dashboard-activity-toggle"
            onClick={() => setActivityOpen((open) => !open)}
            aria-expanded={activityOpen}
          >
            <div>
              <div className="dashboard-kicker">Recent Activity</div>
              <div className="dashboard-activity-subtitle">Latest system and team actions.</div>
            </div>
            <span className={`section-caret${activityOpen ? " expanded" : ""}`} />
          </button>
          {activityOpen ? (
            <div className="stack-list">
              {importantActivity.length > 0 ? (
                importantActivity.map((entry) => (
                  <div key={entry.id} className="stack-row">
                    <div>
                      <strong>{entry.summary}</strong>
                      <div className="muted">
                        {entry.actorType} · {entry.action}
                      </div>
                    </div>
                    <div className="muted">{dateTime(entry.createdAt)}</div>
                  </div>
                ))
              ) : (
                <div className="dashboard-empty-activity">No recent exceptions or team actions.</div>
              )}
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
