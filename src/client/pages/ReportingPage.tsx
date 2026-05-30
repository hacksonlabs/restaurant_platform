import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useTenant } from "../auth/AuthContext";
import { money } from "../lib/format";
import { Card, PageHeader } from "../components/ui";
import { useResource } from "./useResource";

type ReportingPreset = "this_week" | "this_month" | "past_3_months" | "ytd" | "custom";

function reportingNow() {
  const configured = import.meta.env.VITE_DEMO_NOW?.trim();
  if (configured) {
    const parsed = new Date(configured);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return new Date();
}

function toDateInputValue(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(value: Date, amount: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + amount);
  return next;
}

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function endOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth() + 1, 0);
}

function startOfYear(value: Date) {
  return new Date(value.getFullYear(), 0, 1);
}

function endOfYear(value: Date) {
  return new Date(value.getFullYear(), 11, 31);
}

function addMonths(value: Date, amount: number) {
  return new Date(value.getFullYear(), value.getMonth() + amount, value.getDate());
}

function rangeForPreset(preset: ReportingPreset, customStartDate: string, customEndDate: string) {
  const today = reportingNow();
  const endDate = toDateInputValue(today);

  if (preset === "custom") {
    return {
      startDate: customStartDate || undefined,
      endDate: customEndDate || undefined,
    };
  }

  if (preset === "this_week") {
    return {
      startDate: toDateInputValue(today),
      endDate: toDateInputValue(addDays(today, 6)),
    };
  }

  if (preset === "this_month") {
    return {
      startDate: toDateInputValue(startOfMonth(today)),
      endDate: toDateInputValue(endOfMonth(today)),
    };
  }

  if (preset === "past_3_months") {
    return {
      startDate: toDateInputValue(startOfMonth(addMonths(today, -2))),
      endDate: toDateInputValue(endOfMonth(today)),
    };
  }

  return {
    startDate: toDateInputValue(startOfYear(today)),
    endDate: toDateInputValue(endOfYear(today)),
  };
}

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
  const { selectedRestaurantId, selectedRestaurantIds, isAllRestaurantsScope } = useTenant();
  const [preset, setPreset] = useState<ReportingPreset>("this_week");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    if (preset !== "custom") return;
    if (customStartDate && customEndDate) return;
    const today = reportingNow();
    setCustomStartDate((current) => current || toDateInputValue(startOfMonth(today)));
    setCustomEndDate((current) => current || toDateInputValue(endOfMonth(today)));
  }, [preset, customEndDate, customStartDate]);

  const selectedRange = useMemo(
    () => rangeForPreset(preset, customStartDate, customEndDate),
    [preset, customEndDate, customStartDate],
  );

  const selectedRangeLabel = useMemo(() => {
    if (preset === "this_week") return "This Week";
    if (preset === "this_month") return "This Month";
    if (preset === "past_3_months") return "Past 3 Months";
    if (preset === "ytd") return "YTD";
    if (preset === "custom") {
      if (selectedRange.startDate && selectedRange.endDate) {
        return `${selectedRange.startDate} to ${selectedRange.endDate}`;
      }
      return "Custom";
    }
    return "This Week";
  }, [preset, selectedRange.endDate, selectedRange.startDate]);
  const { data, loading, error } = useResource(
    `reporting:${isAllRestaurantsScope ? selectedRestaurantIds.join(",") : selectedRestaurantId}:${preset}:${selectedRange.startDate ?? ""}:${selectedRange.endDate ?? ""}`,
    async () => {
      if (isAllRestaurantsScope) {
        const snapshots = await Promise.all(selectedRestaurantIds.map((restaurantId) => api.reporting(restaurantId, selectedRange)));
        const metricsByDate = new Map<string, any>();
        const topItems = new Map<string, number>();
        const topModifiers = new Map<string, number>();
        const failureReasons = new Map<string, number>();

        for (const snapshot of snapshots as any[]) {
          for (const metric of snapshot.metrics) {
            const existing = metricsByDate.get(metric.date) ?? {
              id: `agg_${metric.date}`,
              restaurantId: "all",
              date: metric.date,
              totalOrders: 0,
              revenueCents: 0,
              averageOrderValueCents: 0,
              approvalRate: 0,
              successRate: 0,
              rejectedOrders: 0,
              averageLeadTimeMinutes: 0,
              upcomingScheduledOrderVolume: 0,
              _count: 0,
            };
            existing.totalOrders += metric.totalOrders;
            existing.revenueCents += metric.revenueCents;
            existing.rejectedOrders += metric.rejectedOrders;
            existing.upcomingScheduledOrderVolume += metric.upcomingScheduledOrderVolume;
            existing.averageOrderValueCents += metric.averageOrderValueCents;
            existing.approvalRate += metric.approvalRate;
            existing.successRate += metric.successRate;
            existing.averageLeadTimeMinutes += metric.averageLeadTimeMinutes;
            existing._count += 1;
            metricsByDate.set(metric.date, existing);
          }
          for (const entry of snapshot.topItems) topItems.set(entry.name, (topItems.get(entry.name) ?? 0) + entry.count);
          for (const entry of snapshot.topModifiers) topModifiers.set(entry.name, (topModifiers.get(entry.name) ?? 0) + entry.count);
          for (const entry of snapshot.failureReasons) failureReasons.set(entry.reason, (failureReasons.get(entry.reason) ?? 0) + entry.count);
        }

        return {
          metrics: [...metricsByDate.values()].map((metric: any) => ({
            ...metric,
            averageOrderValueCents: Math.round(metric.averageOrderValueCents / Math.max(metric._count, 1)),
            approvalRate: metric.approvalRate / Math.max(metric._count, 1),
            successRate: metric.successRate / Math.max(metric._count, 1),
            averageLeadTimeMinutes: Math.round(metric.averageLeadTimeMinutes / Math.max(metric._count, 1)),
          })),
          topItems: [...topItems.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5),
          topModifiers: [...topModifiers.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5),
          failureReasons: [...failureReasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count).slice(0, 5),
        };
      }
      return selectedRestaurantId
        ? api.reporting(selectedRestaurantId, selectedRange)
        : Promise.resolve({ metrics: [], topItems: [], topModifiers: [], failureReasons: [] });
    },
    [selectedRestaurantId, selectedRestaurantIds.join(","), isAllRestaurantsScope, preset, selectedRange.startDate, selectedRange.endDate],
  );

  if (!selectedRestaurantId && !isAllRestaurantsScope) return <div className="panel-state">Choose a restaurant to view reporting.</div>;
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
        title={isAllRestaurantsScope ? "Portfolio Performance" : "Restaurant Performance"}
        description={isAllRestaurantsScope ? "A combined reporting view across all restaurants." : "A clean read on order flow, revenue momentum, and more."}
      />

      <Card className="reporting-range-card">
        <button
          type="button"
          className="reporting-range-toggle"
          onClick={() => setFiltersOpen((open) => !open)}
          aria-expanded={filtersOpen}
        >
          <div>
            <div className="dashboard-kicker">Date Range</div>
            <div className="reporting-range-selected">{selectedRangeLabel}</div>
          </div>
          <span className={`section-caret${filtersOpen ? " expanded" : ""}`} />
        </button>
        {filtersOpen ? (
          <div className="reporting-filters">
            <div className="reporting-filter-buttons">
              <button type="button" className={`reporting-filter-chip${preset === "this_week" ? " active" : ""}`} onClick={() => setPreset("this_week")}>
                This Week
              </button>
              <button type="button" className={`reporting-filter-chip${preset === "this_month" ? " active" : ""}`} onClick={() => setPreset("this_month")}>
                This Month
              </button>
              <button type="button" className={`reporting-filter-chip${preset === "past_3_months" ? " active" : ""}`} onClick={() => setPreset("past_3_months")}>
                Past 3 Months
              </button>
              <button type="button" className={`reporting-filter-chip${preset === "ytd" ? " active" : ""}`} onClick={() => setPreset("ytd")}>
                YTD
              </button>
              <button type="button" className={`reporting-filter-chip${preset === "custom" ? " active" : ""}`} onClick={() => setPreset("custom")}>
                Custom
              </button>
            </div>
            {preset === "custom" ? (
              <div className="reporting-custom-range">
                <label className="field">
                  <span>Start Date</span>
                  <input
                    type="date"
                    value={customStartDate}
                    max={customEndDate || undefined}
                    onChange={(event) => setCustomStartDate(event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>End Date</span>
                  <input
                    type="date"
                    value={customEndDate}
                    min={customStartDate || undefined}
                    onChange={(event) => setCustomEndDate(event.target.value)}
                  />
                </label>
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>

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
