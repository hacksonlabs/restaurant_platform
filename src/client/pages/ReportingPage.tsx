import { api } from "../lib/api";
import { useTenant } from "../auth/AuthContext";
import { money } from "../lib/format";
import { Card, PageHeader } from "../components/ui";
import { useResource } from "./useResource";

function formatShortDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function OrderVolumeBars(props: {
  data: Array<{ label: string; value: number }>;
}) {
  if (!props.data.length) {
    return <div className="panel-state">No daily order volume yet.</div>;
  }

  const max = Math.max(...props.data.map((item) => item.value), 1);

  return (
    <div className="report-volume-chart">
      {props.data.map((item) => {
        const height = Math.max((item.value / max) * 100, item.value > 0 ? 12 : 4);
        return (
          <div key={item.label} className="report-volume-bar">
            <span className="report-volume-value">{item.value}</span>
            <div className="report-volume-track">
              <div className="report-volume-fill" style={{ height: `${height}%` }} />
            </div>
            <span className="report-volume-label">{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function RevenueTrendChart(props: {
  data: Array<{ label: string; value: number }>;
}) {
  if (!props.data.length) {
    return <div className="panel-state">No revenue trend yet.</div>;
  }

  const width = 640;
  const height = 260;
  const paddingX = 28;
  const paddingTop = 24;
  const paddingBottom = 40;
  const max = Math.max(...props.data.map((point) => point.value), 1);
  const min = Math.min(...props.data.map((point) => point.value), 0);
  const range = Math.max(max - min, 1);

  const points = props.data.map((point, index) => {
    const x = paddingX + (index * (width - paddingX * 2)) / Math.max(props.data.length - 1, 1);
    const y =
      paddingTop +
      (1 - (point.value - min) / range) * (height - paddingTop - paddingBottom);
    return { ...point, x, y };
  });

  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - paddingBottom} L ${points[0].x} ${height - paddingBottom} Z`;

  return (
    <div className="report-trend-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="report-trend-svg"
        role="img"
        aria-label="Revenue trend"
      >
        <defs>
          <linearGradient id="reportRevenueFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(139, 94, 52, 0.32)" />
            <stop offset="100%" stopColor="rgba(139, 94, 52, 0.02)" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((step) => {
          const y = paddingTop + (step * (height - paddingTop - paddingBottom)) / 3;
          return (
            <line
              key={step}
              x1={paddingX}
              x2={width - paddingX}
              y1={y}
              y2={y}
              className="report-trend-grid"
            />
          );
        })}
        <path d={areaPath} fill="url(#reportRevenueFill)" />
        <path d={linePath} className="report-trend-line" />
        {points.map((point) => (
          <circle key={point.label} cx={point.x} cy={point.y} r="5" className="report-trend-dot" />
        ))}
      </svg>
      <div className="report-trend-labels">
        {points.map((point) => (
          <div key={point.label} className="report-trend-label">
            <span>{point.label}</span>
            <strong>{money(point.value)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function RankingList(props: {
  emptyLabel: string;
  entries: Array<{ name: string; count: number }>;
}) {
  const max = Math.max(...props.entries.map((entry) => entry.count), 1);

  if (!props.entries.length) {
    return <div className="panel-state">No reporting data yet.</div>;
  }

  return (
    <div className="report-ranking">
      {props.entries.map((entry, index) => (
        <div key={entry.name} className="report-ranking-row">
          <div className="report-ranking-topline">
            <div className="report-ranking-title">
              <span className="report-ranking-index">{String(index + 1).padStart(2, "0")}</span>
              <strong>{entry.name || props.emptyLabel}</strong>
            </div>
            <span className="report-ranking-count">{entry.count}</span>
          </div>
          <div className="report-ranking-track">
            <div
              className="report-ranking-fill"
              style={{ width: `${Math.max((entry.count / max) * 100, 8)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ReportingPage() {
  const { selectedRestaurantId } = useTenant();
  const { data, loading, error } = useResource(
    `reporting:${selectedRestaurantId}`,
    () =>
      selectedRestaurantId
        ? api.reporting(selectedRestaurantId)
        : Promise.resolve({
            metrics: [],
            topItems: [],
            topModifiers: [],
            failureReasons: [],
          }),
    [selectedRestaurantId],
  );

  if (!selectedRestaurantId) return <div className="panel-state">Choose a restaurant to view reporting.</div>;
  if (loading) return <div className="panel-state">Loading reporting…</div>;
  if (error || !data) return <div className="panel-state error">{error}</div>;

  const metrics = [...data.metrics].sort((left: any, right: any) => left.date.localeCompare(right.date));
  const orderVolume = metrics.map((metric: any) => ({
    label: formatShortDate(metric.date),
    value: metric.totalOrders,
  }));
  const revenueTrend = metrics.map((metric: any) => ({
    label: formatShortDate(metric.date),
    value: metric.revenueCents,
  }));

  return (
    <div className="page-grid reporting-page">
      <PageHeader
        eyebrow="Reporting"
        title="Restaurant Performance"
        description="A clean read on order flow, revenue momentum, and the customizations guests keep coming back for."
      />

      <div className="reporting-board">
        <Card
          title="Daily Order Volume"
          subtitle="Day-by-day order counts to spot where agent demand spikes."
          className="report-panel report-panel-volume"
        >
          <OrderVolumeBars data={orderVolume} />
        </Card>

        <Card
          title="Revenue Trend"
          subtitle="Daily revenue shown as a smoother directional story."
          className="report-panel report-panel-revenue"
        >
          <RevenueTrendChart data={revenueTrend} />
        </Card>

        <Card
          title="Top Items"
          subtitle="The dishes showing up most often across agent orders."
          className="report-panel"
        >
          <RankingList entries={data.topItems} emptyLabel="Unnamed item" />
        </Card>

        <Card
          title="Top Modifiers"
          subtitle="The customizations your guests select most often."
          className="report-panel"
        >
          <RankingList entries={data.topModifiers} emptyLabel="Unnamed modifier" />
        </Card>
      </div>
    </div>
  );
}
