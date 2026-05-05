import { api } from "../lib/api";
import { money } from "../lib/format";
import { Card, DataTable, PageHeader, StatCard } from "../components/ui";
import { useResource } from "./useResource";

function MiniBarChart(props: {
  data: Array<{ label: string; value: number; tone?: "accent" | "success" | "warning" }>;
  formatter?: (value: number) => string;
}) {
  const max = Math.max(...props.data.map((item) => item.value), 1);

  return (
    <div className="mini-chart">
      {props.data.map((item) => (
        <div key={item.label} className="mini-chart-row">
          <div className="mini-chart-meta">
            <span>{item.label}</span>
            <strong>{props.formatter ? props.formatter(item.value) : item.value}</strong>
          </div>
          <div className="mini-chart-track">
            <div
              className={`mini-chart-fill ${item.tone ?? "accent"}`}
              style={{ width: `${Math.max((item.value / max) * 100, 6)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function LineTrendChart(props: {
  data: Array<{ label: string; value: number }>;
  formatter?: (value: number) => string;
}) {
  const width = 520;
  const height = 220;
  const padding = 24;
  const max = Math.max(...props.data.map((point) => point.value), 1);
  const min = Math.min(...props.data.map((point) => point.value), 0);
  const range = Math.max(max - min, 1);

  const points = props.data.map((point, index) => {
    const x = padding + (index * (width - padding * 2)) / Math.max(props.data.length - 1, 1);
    const y = height - padding - ((point.value - min) / range) * (height - padding * 2);
    return { ...point, x, y };
  });

  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1]?.x ?? padding} ${height - padding} L ${points[0]?.x ?? padding} ${height - padding} Z`;

  return (
    <div className="trend-chart">
      <svg viewBox={`0 0 ${width} ${height}`} className="trend-svg" role="img" aria-label="Reporting trend chart">
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(139, 94, 52, 0.32)" />
            <stop offset="100%" stopColor="rgba(139, 94, 52, 0.02)" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((step) => {
          const y = padding + (step * (height - padding * 2)) / 3;
          return <line key={step} x1={padding} x2={width - padding} y1={y} y2={y} className="trend-grid" />;
        })}
        <path d={areaPath} fill="url(#trendFill)" />
        <path d={linePath} className="trend-line" />
        {points.map((point) => (
          <circle key={point.label} cx={point.x} cy={point.y} r="5" className="trend-dot" />
        ))}
      </svg>
      <div className="trend-labels">
        {points.map((point) => (
          <div key={point.label} className="trend-label">
            <span>{point.label}</span>
            <strong>{props.formatter ? props.formatter(point.value) : point.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ReportingPage() {
  const { data, loading, error } = useResource(() => api.reporting("rest_lb_steakhouse"), []);

  if (loading) return <div className="panel-state">Loading reporting…</div>;
  if (error || !data) return <div className="panel-state error">{error}</div>;

  const totals = data.metrics.reduce(
    (acc: any, metric: any) => ({
      orders: acc.orders + metric.totalOrders,
      revenue: acc.revenue + metric.revenueCents,
      rejected: acc.rejected + metric.rejectedOrders,
    }),
    { orders: 0, revenue: 0, rejected: 0 },
  );

  const orderVolume = data.metrics.map((metric: any) => ({
    label: metric.date,
    value: metric.totalOrders,
  }));

  const revenueTrend = data.metrics.map((metric: any) => ({
    label: metric.date,
    value: metric.revenueCents,
  }));

  const averageSuccessRate = Math.round(
    data.metrics.reduce((sum: number, metric: any) => sum + metric.successRate, 0) /
      Math.max(data.metrics.length, 1) *
      100,
  );

  const averageLeadTime = Math.round(
    data.metrics.reduce((sum: number, metric: any) => sum + metric.averageLeadTimeMinutes, 0) /
      Math.max(data.metrics.length, 1),
  );

  return (
    <div className="page-grid">
      <PageHeader
        eyebrow="Reporting"
        title="Agent Order Performance"
        description="Simple but functional reporting for adoption, revenue, approvals, and failure patterns."
      />
      <div className="stats-grid">
        <StatCard label="Total Agent Orders" value={String(totals.orders)} />
        <StatCard label="Revenue" value={money(totals.revenue)} />
        <StatCard label="Rejected Orders" value={String(totals.rejected)} />
        <StatCard label="Top Item" value={data.topItems[0]?.name ?? "None"} />
      </div>

      <div className="two-column">
        <Card title="Revenue Trend" subtitle="Daily revenue from agent-originated orders in local reporting windows.">
          <LineTrendChart data={revenueTrend} formatter={money} />
        </Card>
        <Card title="Order Volume" subtitle="Daily order counts with quick visual comparison across the week.">
          <MiniBarChart data={orderVolume} />
        </Card>
      </div>

      <div className="two-column">
        <Card title="Daily Metrics">
          <DataTable
            columns={["Date", "Orders", "Revenue", "AOV", "Success Rate", "Lead Time"]}
            rows={data.metrics.map((metric: any) => [
              metric.date,
              String(metric.totalOrders),
              money(metric.revenueCents),
              money(metric.averageOrderValueCents),
              `${Math.round(metric.successRate * 100)}%`,
              `${metric.averageLeadTimeMinutes} min`,
            ])}
          />
        </Card>

        <Card title="Operational Snapshot" subtitle="A tighter view of the restaurant metrics that matter most day to day.">
          <div className="stack-list">
            <div className="stack-row">
              <span>Average success rate</span>
              <strong>{averageSuccessRate}%</strong>
            </div>
            <div className="stack-row">
              <span>Average lead time</span>
              <strong>{averageLeadTime} min</strong>
            </div>
            <div className="stack-row">
              <span>Top ordered item</span>
              <strong>{data.topItems[0]?.name ?? "None"}</strong>
            </div>
            <div className="stack-row">
              <span>Most common failure reason</span>
              <strong>{data.failureReasons[0]?.reason ?? "None"}</strong>
            </div>
          </div>
        </Card>
      </div>

      <div className="two-column">
        <Card title="Popular Items">
          <div className="stack-list">
            {data.topItems.map((item: any) => (
              <div key={item.name} className="stack-row">
                <span>{item.name}</span>
                <strong>{item.count}</strong>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Common Failure Reasons">
          <div className="stack-list">
            {data.failureReasons.map((item: any) => (
              <div key={item.reason} className="stack-row">
                <span>{item.reason}</span>
                <strong>{item.count}</strong>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
