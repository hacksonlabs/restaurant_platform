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
  const { selectedRestaurantId, selectedRestaurantIds, isAllRestaurantsScope, session } = useTenant();
  const { data, loading, error, refresh } = useResource(
    `dashboard:${isAllRestaurantsScope ? selectedRestaurantIds.join(",") : selectedRestaurantId}`,
    async () => {
      if (isAllRestaurantsScope) {
        const dashboards = await Promise.all(selectedRestaurantIds.map((restaurantId) => api.dashboard(restaurantId)));
        const statusSummary = dashboards.reduce(
          (summary, dashboard) => {
            if (dashboard.posConnectionStatus === "active" || dashboard.posConnectionStatus === "sandbox") {
              summary.connected += 1;
            } else {
              summary.attention += 1;
            }
            if (dashboard.agentOrderingStatus === "enabled") {
              summary.orderingEnabled += 1;
            }
            return summary;
          },
          { connected: 0, attention: 0, orderingEnabled: 0 },
        );
        return {
          restaurant: {
            id: "all",
            name: "All Restaurants",
          },
          posConnectionStatus: `${statusSummary.connected}/${dashboards.length} connected`,
          agentOrderingStatus: `${statusSummary.orderingEnabled}/${dashboards.length} live`,
          ordersThisWeek: dashboards.reduce((sum, dashboard) => sum + dashboard.ordersThisWeek, 0),
          revenueFromAgentOrdersCents: dashboards.reduce((sum, dashboard) => sum + dashboard.revenueFromAgentOrdersCents, 0),
          topItem: "",
          ordersNeedingReview: dashboards.reduce((sum, dashboard) => sum + dashboard.ordersNeedingReview, 0),
          recentActivity: dashboards
            .flatMap((dashboard) =>
              dashboard.recentActivity.map((entry) => ({
                ...entry,
                summary: `${dashboard.restaurant.name}: ${entry.summary}`,
              })),
            )
            .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
            .slice(0, 8),
        } as any;
      }
      return api.dashboard(selectedRestaurantId!);
    },
    [selectedRestaurantId, selectedRestaurantIds.join(","), isAllRestaurantsScope],
  );
  const [activityOpen, setActivityOpen] = useState(false);

  useEffect(() => {
    if (!selectedRestaurantId && !isAllRestaurantsScope) return undefined;
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
  const restaurantCount = session?.restaurants.length ?? 0;

  return (
    <div className="page-grid dashboard-page">
      <PageHeader
        eyebrow={isAllRestaurantsScope ? "Account Overview" : "Restaurant Dashboard"}
        title={data.restaurant.name}
        description={
          isAllRestaurantsScope
            ? `A portfolio view across ${restaurantCount} restaurants.`
            : "A quick view of queue health and agent ordering performance."
        }
        actions={
          <Card className="dashboard-header-status">
            <div className="dashboard-kicker">System Status</div>
            <div className="dashboard-status-list">
              <div className="dashboard-status-row">
                <span>{isAllRestaurantsScope ? "POS connections" : "POS connection"}</span>
                <strong className={`dashboard-status-value ${isAllRestaurantsScope ? "neutral" : statusTone(data.posConnectionStatus)}`}>
                  {formatStatus(data.posConnectionStatus)}
                </strong>
              </div>
              <div className="dashboard-status-row">
                <span>{isAllRestaurantsScope ? "Ordering live" : "Agent ordering"}</span>
                <strong className={`dashboard-status-value ${isAllRestaurantsScope ? "neutral" : statusTone(data.agentOrderingStatus)}`}>
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
