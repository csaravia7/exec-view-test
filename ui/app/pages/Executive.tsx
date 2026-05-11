import React, { useEffect, useMemo, useState } from "react";

import { useDql } from "@dynatrace-sdk/react-hooks";
import { ChannelDetail } from "./ChannelDetail";


const T = {
  bg: "var(--exec-bg)",
  bgPanel: "var(--exec-panel)",
  bgPanelAlt: "var(--exec-panel-alt)",
  border: "var(--exec-border)",
  textPrimary: "var(--exec-text-primary)",
  textSecondary: "var(--exec-text-secondary)",
  textMuted: "var(--exec-text-muted)",
  good: "var(--exec-good)",
  warn: "var(--exec-warn)",
  bad: "var(--exec-bad)",
  live: "var(--exec-good)",
};

const THEME_LIGHT = {
  "--exec-bg": "#f5f7fb",
  "--exec-panel": "#ffffff",
  "--exec-panel-alt": "#eef2f7",
  "--exec-border": "#d7dee9",
  "--exec-text-primary": "#0f172a",
  "--exec-text-secondary": "#334155",
  "--exec-text-muted": "#64748b",
  "--exec-good": "#16a34a",
  "--exec-warn": "#d97706",
  "--exec-bad": "#dc2626",
} as const;

const THEME_DARK = {
  "--exec-bg": "#0b1220",
  "--exec-panel": "#111b2e",
  "--exec-panel-alt": "#1b2740",
  "--exec-border": "#2a3a57",
  "--exec-text-primary": "#f8fafc",
  "--exec-text-secondary": "#c8d4ea",
  "--exec-text-muted": "#93a5c4",
  "--exec-good": "#22c55e",
  "--exec-warn": "#f59e0b",
  "--exec-bad": "#ef4444",
} as const;

// Per-channel accent palette (green / blue / orange / purple / cyan / pink).
const CHANNEL_ACCENTS = [
  "#22c55e",
  "#3b82f6",
  "#f97316",
  "#a855f7",
  "#06b6d4",
  "#ec4899",
];

type AppRecord = {
  app_name: string | null;
  "dt.rum.application.entity": string | null;
  availability: number | null;
  connected_users: number | null;
  requests: number | null;
  errors: number | null;
  revenue: number | null;
};

type TrendRecord = {
  availability: (number | null)[] | null;
};

const TIMEFRAMES = [
  { id: "5m", label: "Last 5m" },
  { id: "10m", label: "Last 10m" },
  { id: "30m", label: "Last 30m" },
  { id: "1h", label: "Last 1h" },
  { id: "6h", label: "Last 6h" },
  { id: "24h", label: "Last 24h" },
] as const;

type TimeframeId = (typeof TIMEFRAMES)[number]["id"];

const TREND_INTERVALS: Record<TimeframeId, string> = {
  "5m": "1m",
  "10m": "1m",
  "30m": "1m",
  "1h": "5m",
  "6h": "10m",
  "24h": "30m",
};

const buildSnapshotQuery = (timeframe: TimeframeId) => `
timeseries {
  availability = avg(app.availability, scalar: true),
  connected_users = avg(app.users.connected, scalar: true),
  requests = sum(app.requests, scalar: true),
  errors = sum(app.request.errors, scalar: true),
  revenue = sum(app.transactions.revenue, scalar: true)
}, by: { dt.rum.application.entity }, from: now() - ${timeframe}
| lookup [fetch dt.entity.application], sourceField: dt.rum.application.entity, lookupField: id, fields: { entity.name }
| fieldsAdd
    app_name = entity.name,
    availability = if(isNotNull(availability), availability, else: 0.0),
    connected_users = if(isNotNull(connected_users), connected_users, else: 0),
    requests = if(isNotNull(requests), requests, else: 0),
    errors = if(isNotNull(errors), errors, else: 0),
    revenue = if(isNotNull(revenue), revenue, else: 0)
| fields app_name, dt.rum.application.entity, availability, connected_users, requests, errors, revenue
| sort availability desc
`;

const buildTrendQuery = (timeframe: TimeframeId) => `
timeseries {
  availability = avg(app.availability)
}, from: now() - ${timeframe}, interval: ${TREND_INTERVALS[timeframe]}
| fields availability
`;

const SLA_GOOD = 99;
const SLA_BAD = 95;
const EXEC_TAB_STORAGE_KEY = "exec.activeTab";

type ExecutiveTab = "overview" | "detail";

const getPersistedExecutiveTab = (): ExecutiveTab => {
  if (typeof window === "undefined") return "overview";
  const saved = window.localStorage.getItem(EXEC_TAB_STORAGE_KEY);
  return saved === "detail" ? "detail" : "overview";
};

export const Executive = () => {
  const [isDark, setIsDark] = useState(() => detectDarkAppearance());
  const [timeframe, setTimeframe] = useState<TimeframeId>("10m");
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null);
  const {
    data: snapData,
    error: snapError,
    isLoading: snapLoading,
    refetch: refetchSnapshot,
  } = useDql({
    query: buildSnapshotQuery(timeframe),
  });

  const { data: trendData, refetch: refetchTrend } = useDql({
    query: buildTrendQuery(timeframe),
  });

  const apps = useMemo<AppRecord[]>(
    () => (snapData?.records ?? []) as unknown as AppRecord[],
    [snapData]
  );

  const avgAvailabilityTrend = useMemo<number[]>(() => {
    const records = (trendData?.records ?? []) as unknown as TrendRecord[];
    const firstRecord = records[0];
    if (!firstRecord?.availability) return [];

    return firstRecord.availability.map((value) =>
      value == null ? NaN : value
    );
  }, [trendData]);

  // Live clock for the header.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const updateAppearance = () => setIsDark(detectDarkAppearance());

    updateAppearance();
    media.addEventListener("change", updateAppearance);

    const observer = new MutationObserver(updateAppearance);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [
        "class",
        "style",
        "data-theme",
        "data-appearance",
        "data-color-scheme",
      ],
    });
    if (document.body) {
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ["class", "style"],
      });
    }

    return () => {
      media.removeEventListener("change", updateAppearance);
      observer.disconnect();
    };
  }, []);

  const themeVars =
    (isDark ? THEME_DARK : THEME_LIGHT) as unknown as React.CSSProperties;

  // Internal tabs: "overview" (default) and "detail".
  const [tab, setTab] = useState<ExecutiveTab>(() => getPersistedExecutiveTab());
  const [detailChannelId, setDetailChannelId] = useState<string | undefined>(
    undefined
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(EXEC_TAB_STORAGE_KEY, tab);
  }, [tab]);

  const avgAvailability = apps.length
    ? apps.reduce((acc, a) => acc + (a.availability ?? 0), 0) / apps.length
    : 0;
  const totalUsers = apps.reduce(
    (acc, a) => acc + (a.connected_users ?? 0),
    0
  );
  const totalRequests = apps.reduce((acc, a) => acc + (a.requests ?? 0), 0);
  const totalErrors = apps.reduce((acc, a) => acc + (a.errors ?? 0), 0);
  const totalRevenue = apps.reduce((acc, a) => acc + (a.revenue ?? 0), 0);

  const timeframeLabel =
    TIMEFRAMES.find((item) => item.id === timeframe)?.label ?? "Last 10m";

  const refreshData = async () => {
    if (isRefreshing) return;
    const startedAt = Date.now();
    setIsRefreshing(true);
    try {
      await Promise.all([refetchSnapshot(), refetchTrend()]);
      setRefreshNonce((value) => value + 1);
      setLastRefreshAt(new Date());
    } finally {
      const elapsed = Date.now() - startedAt;
      const minVisibleMs = 700;
      if (elapsed < minVisibleMs) {
        await new Promise((resolve) => setTimeout(resolve, minVisibleMs - elapsed));
      }
      setIsRefreshing(false);
    }
  };

  return (
    <div
      style={{
        ...themeVars,
        background: T.bg,
        minHeight: "100%",
        padding: "clamp(14px, 3.8vw, 32px) clamp(12px, 4.5vw, 40px) 48px",
        color: T.textPrimary,
        colorScheme: isDark ? "dark" : "light",
        fontFamily: "inherit",
      }}
    >
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 30,
          background: T.bg,
          borderBottom: `1px solid color-mix(in oklab, ${T.border} 60%, transparent)`,
          backdropFilter: "blur(4px)",
          marginBottom: 24,
        }}
      >
        <ExecHeader
          now={now}
          timeframe={timeframe}
          onTimeframeChange={setTimeframe}
          onRefresh={() => {
            void refreshData();
          }}
          isRefreshing={isRefreshing}
          lastRefreshAt={lastRefreshAt}
        />

        <TabStrip
          value={tab}
          onChange={(nextTab) => setTab(nextTab)}
          tabs={[
            { id: "overview", label: "Overview" },
            { id: "detail", label: "Channel detail" },
          ]}
          compact
        />
      </div>

      {snapError && (
        <Panel style={{ borderColor: T.bad, marginBottom: 24 }}>
          <div style={{ color: T.bad, fontSize: 14 }}>
            Error loading data: {snapError.message}
          </div>
        </Panel>
      )}

      {tab === "detail" ? (
        <ChannelDetail
          embedded
          selectedId={detailChannelId}
          onSelectChannel={setDetailChannelId}
          timeframe={timeframe}
          onTimeframeChange={setTimeframe}
          refreshNonce={refreshNonce}
        />
      ) : (
        <>
          <OverallStatus
            avgAvailability={avgAvailability}
            totalUsers={totalUsers}
            totalRequests={totalRequests}
            totalErrors={totalErrors}
            totalRevenue={totalRevenue}
            loading={snapLoading}
          />

          <SectionTitle>Channels</SectionTitle>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: 20,
              marginBottom: 32,
            }}
          >
            {snapLoading && apps.length === 0
              ? Array.from({ length: 4 }).map((_, i) => (
                  <ChannelSkeleton key={i} accent={CHANNEL_ACCENTS[i]} />
                ))
              : apps.map((app, i) => (
                  <ChannelCard
                    key={app["dt.rum.application.entity"] ?? i}
                    accent={CHANNEL_ACCENTS[i % CHANNEL_ACCENTS.length]}
                    name={
                      app.app_name ?? app["dt.rum.application.entity"] ?? "—"
                    }
                    availability={app.availability ?? 0}
                    users={app.connected_users ?? 0}
                  />
                ))}
            {!snapLoading && apps.length === 0 && (
              <Panel>
                <div style={{ color: T.textSecondary }}>
                  No applications with RUM data found for the last hour.
                </div>
              </Panel>
            )}
          </div>

          <SectionTitle>{`Availability trend · ${timeframeLabel.toLowerCase()}`}</SectionTitle>
          <Panel>
            <TrendChart values={avgAvailabilityTrend} timeframeLabel={timeframeLabel} />
          </Panel>
        </>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

const ExecHeader = ({
  now,
  timeframe,
  onTimeframeChange,
  onRefresh,
  isRefreshing,
  lastRefreshAt,
}: {
  now: Date;
  timeframe: TimeframeId;
  onTimeframeChange: (timeframe: TimeframeId) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  lastRefreshAt: Date | null;
}) => {
  const date = now.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const time = now.toLocaleTimeString(undefined, { hour12: false });
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 20,
        padding: "8px 0 10px",
        flexWrap: "wrap",
      }}
    >
      <div>
        <div
          style={{
            fontSize: 12,
            letterSpacing: 2,
            color: T.textMuted,
            textTransform: "uppercase",
          }}
        >
          Executive Operations
        </div>
        <div
          style={{
            fontSize: "clamp(24px, 5.5vw, 30px)",
            fontWeight: 700,
            letterSpacing: -0.4,
          }}
        >
          Application Health Overview
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flex: "1 1 100%",
          justifyContent: "flex-start",
          flexWrap: "wrap",
          minWidth: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            flex: "1 1 100%",
            minWidth: 0,
          }}
        >
          <HeaderEyebrow>Timeframe</HeaderEyebrow>
          <div
            style={{
              flex: "1 1 320px",
              minWidth: 0,
              overflowX: "auto",
            }}
          >
            <div style={{ minWidth: 460 }}>
              <TabStrip
                value={timeframe}
                onChange={onTimeframeChange}
                tabs={TIMEFRAMES.map((item) => ({ id: item.id, label: item.label }))}
                compact
              />
            </div>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            flex: "1 1 100%",
          }}
        >
        <button
          type="button"
          onClick={() => void onRefresh()}
          disabled={isRefreshing}
          style={{
            background: isRefreshing ? T.bgPanelAlt : T.bgPanel,
            color: isRefreshing ? T.textMuted : T.textPrimary,
            border: `1px solid ${T.border}`,
            borderRadius: 8,
            padding: "7px 12px",
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: 0.5,
            cursor: isRefreshing ? "not-allowed" : "pointer",
            minWidth: 82,
          }}
        >
          {isRefreshing ? "Refreshing..." : "Refresh"}
        </button>
        <div
          style={{
            minWidth: 120,
            fontSize: 11,
            color: isRefreshing ? T.good : T.textMuted,
            letterSpacing: 0.3,
            textAlign: "left",
          }}
        >
          {isRefreshing
            ? "Refreshing data..."
            : lastRefreshAt
              ? `Updated ${lastRefreshAt.toLocaleTimeString()}`
              : "Not refreshed yet"}
        </div>
        <LiveIndicator />
        <div style={{ textAlign: "left", lineHeight: 1.3 }}>
          <div
            style={{
              fontSize: 12,
              color: T.textMuted,
              textTransform: "capitalize",
            }}
          >
            {date}
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 600,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {time}
          </div>
        </div>
        </div>
      </div>
    </div>
  );
};

const LiveIndicator = () => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "6px 12px",
      borderRadius: 999,
      background:
        "color-mix(in oklab, var(--dt-color-status-success, green) 12%, transparent)",
      border:
        "1px solid color-mix(in oklab, var(--dt-color-status-success, green) 35%, transparent)",
      fontSize: 12,
      letterSpacing: 2,
      fontWeight: 600,
    }}
  >
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: T.live,
        animation: "execPulse 1.6s ease-out infinite",
      }}
    />
    EN VIVO
    <style>{`@keyframes execPulse {
      0%   { box-shadow: 0 0 0 0 color-mix(in oklab, var(--dt-color-status-success, green) 60%, transparent); }
      70%  { box-shadow: 0 0 0 8px color-mix(in oklab, var(--dt-color-status-success, green) 0%, transparent); }
      100% { box-shadow: 0 0 0 0 color-mix(in oklab, var(--dt-color-status-success, green) 0%, transparent); }
    }`}</style>
  </div>
);

// ---------------------------------------------------------------------------
// Overall status panel
// ---------------------------------------------------------------------------

const OverallStatus = ({
  avgAvailability,
  totalUsers,
  totalRequests,
  totalErrors,
  totalRevenue,
  loading,
}: {
  avgAvailability: number;
  totalUsers: number;
  totalRequests: number;
  totalErrors: number;
  totalRevenue: number;
  loading: boolean;
}) => {
  const avgColor = pickColor(avgAvailability);
  return (
    <Panel style={{ marginBottom: 28 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 24,
        }}
      >
        <Stat
          label="Average availability"
          value={loading ? "—" : `${avgAvailability.toFixed(2)}%`}
          accent={avgColor}
        />
        <Stat
          label="Connected users"
          value={loading ? "—" : formatInt(totalUsers)}
          accent="var(--dt-color-accent-primary, Highlight)"
        />
        <Stat
          label="TPS (per min)"
          value={loading ? "—" : formatInt(totalRequests / 60)}
          accent="var(--dt-color-accent-secondary, mediumpurple)"
        />
        <Stat
          label="Errors"
          value={loading ? "—" : formatInt(totalErrors)}
          accent={totalErrors > 0 ? T.bad : T.textSecondary}
        />
        <Stat
          label="Revenue"
          value={loading ? "—" : formatCurrency(totalRevenue)}
          accent="var(--dt-color-accent-tertiary, teal)"
        />
      </div>
    </Panel>
  );
};

const Stat = ({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) => (
  <div>
    <div
      style={{
        fontSize: 11,
        letterSpacing: 1.5,
        textTransform: "uppercase",
        color: T.textMuted,
        marginBottom: 8,
      }}
    >
      {label}
    </div>
    <div
      style={{
        fontSize: 34,
        fontWeight: 700,
        color: accent,
        fontVariantNumeric: "tabular-nums",
        letterSpacing: -0.5,
      }}
    >
      {value}
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Channel card
// ---------------------------------------------------------------------------

const ChannelCard = ({
  accent,
  name,
  availability,
  users,
}: {
  accent: string;
  name: string;
  availability: number;
  users: number;
}) => {
  const status = pickStatus(availability);
  const inner = (
    <Panel
      style={{ position: "relative", overflow: "hidden", paddingLeft: 24 }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          bottom: 0,
          width: 4,
          background: accent,
        }}
      />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 18,
        }}
      >
        <div
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: T.textPrimary,
            maxWidth: "70%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={name}
        >
          {name}
        </div>
        <StatusBadge status={status} />
      </div>

      <div style={{ marginBottom: 18 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 6,
          }}
        >
          <div style={{ fontSize: 11, color: T.textMuted, letterSpacing: 1 }}>
            AVAILABILITY
          </div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: accent,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {availability.toFixed(2)}
            <span
              style={{
                fontSize: 14,
                color: T.textSecondary,
                marginLeft: 2,
              }}
            >
              %
            </span>
          </div>
        </div>
        <ProgressBar value={availability} accent={accent} />
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ fontSize: 11, color: T.textMuted, letterSpacing: 1 }}>
          CONNECTED USERS
        </div>
        <div
          style={{
            fontSize: 20,
            fontWeight: 600,
            color: T.textPrimary,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatInt(users)}
        </div>
      </div>
    </Panel>
  );
  return inner;
};

const ChannelSkeleton = ({ accent }: { accent: string }) => (
  <Panel style={{ position: "relative", overflow: "hidden", paddingLeft: 24 }}>
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        bottom: 0,
        width: 4,
        background: accent,
        opacity: 0.4,
      }}
    />
    <div
      style={{
        height: 16,
        width: "60%",
        borderRadius: 4,
        background: T.bgPanelAlt,
        marginBottom: 24,
      }}
    />
    <div
      style={{
        height: 28,
        width: "40%",
        borderRadius: 4,
        background: T.bgPanelAlt,
        marginBottom: 16,
      }}
    />
    <div
      style={{
        height: 10,
        width: "100%",
        borderRadius: 999,
        background: T.bgPanelAlt,
      }}
    />
  </Panel>
);

const ProgressBar = ({ value, accent }: { value: number; accent: string }) => {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      style={{
        width: "100%",
        height: 8,
        background: T.bgPanelAlt,
        borderRadius: 999,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: "100%",
          background: `linear-gradient(90deg, ${accent}AA, ${accent})`,
          transition: "width 600ms ease",
        }}
      />
    </div>
  );
};

const StatusBadge = ({
  status,
}: {
  status: "operational" | "degraded" | "critical";
}) => {
  const map = {
    operational: { color: T.good, label: "OPERATIONAL" },
    degraded: { color: T.warn, label: "DEGRADED" },
    critical: { color: T.bad, label: "CRITICAL" },
  } as const;
  const { color, label } = map[status];
  return (
    <div
      style={{
        display: "inline-flex",
        flexShrink: 0,
        alignItems: "center",
        gap: 6,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 1.2,
        color,
        padding: "4px 8px",
        borderRadius: 999,
        background: `${color}1A`,
        border: `1px solid ${color}55`,
      }}
    >
      <span
        style={{ width: 6, height: 6, borderRadius: "50%", background: color }}
      />
      {label}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Trend chart (custom SVG to stay on-theme)
// ---------------------------------------------------------------------------

const TrendChart = ({
  values,
  timeframeLabel,
}: {
  values: number[];
  timeframeLabel: string;
}) => {
  const width = 1000;
  const height = 220;
  const padding = { top: 16, right: 16, bottom: 28, left: 44 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  // Domain: focus on the SLA-relevant range so small drops are visible.
  const allValues = values.filter((value) => !Number.isNaN(value));
  const dataMin = allValues.length ? Math.min(...allValues) : 95;
  const minY = Math.min(95, Math.floor(dataMin - 1));
  const maxY = 100;

  const len = Math.max(1, values.length);
  const xAt = (i: number) =>
    padding.left + (len <= 1 ? innerW / 2 : (i / (len - 1)) * innerW);
  const yAt = (v: number) =>
    padding.top + innerH - ((v - minY) / (maxY - minY)) * innerH;

  const path = values
    .map((value, index) => {
      if (Number.isNaN(value)) return null;
      return `${index === 0 ? "M" : "L"} ${xAt(index)} ${yAt(value)}`;
    })
    .filter(Boolean)
    .join(" ");

  const latestValue = [...allValues].pop();

  const yTicks = 4;
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => {
    const v = minY + ((maxY - minY) * i) / yTicks;
    return { v, y: yAt(v) };
  });

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height: 240, display: "block" }}
      >
        {ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={t.y}
              y2={t.y}
              stroke={T.border}
              strokeDasharray="3 4"
              strokeWidth={1}
            />
            <text
              x={padding.left - 8}
              y={t.y + 4}
              textAnchor="end"
              fontSize={10}
              fill={T.textMuted}
            >
              {t.v.toFixed(0)}%
            </text>
          </g>
        ))}

        <line
          x1={padding.left}
          x2={width - padding.right}
          y1={yAt(SLA_GOOD)}
          y2={yAt(SLA_GOOD)}
          stroke={T.good}
          strokeDasharray="2 6"
          strokeWidth={1}
          opacity={0.6}
        />
        <text
          x={width - padding.right}
          y={yAt(SLA_GOOD) - 6}
          textAnchor="end"
          fontSize={10}
          fill={T.good}
          opacity={0.8}
        >
          SLA {SLA_GOOD}%
        </text>

        {path && (
          <path
            d={path}
            stroke="var(--dt-color-accent-primary, Highlight)"
            strokeWidth={3}
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        <text x={padding.left} y={height - 8} fontSize={10} fill={T.textMuted}>
          {timeframeLabel.replace("Last ", "-").toLowerCase()}
        </text>
        <text
          x={padding.left + innerW / 2}
          y={height - 8}
          fontSize={10}
          fill={T.textMuted}
          textAnchor="middle"
        >
          -3h
        </text>
        <text
          x={width - padding.right}
          y={height - 8}
          fontSize={10}
          fill={T.textMuted}
          textAnchor="end"
        >
          now
        </text>
      </svg>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          marginTop: 8,
        }}
      >
        {allValues.length > 0 ? (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
              color: T.textSecondary,
            }}
          >
            <span
              style={{
                width: 12,
                height: 3,
                borderRadius: 2,
                background: "var(--dt-color-accent-primary, Highlight)",
              }}
            />
            <span>Average availability of all applications</span>
          </div>
        ) : (
          <div style={{ color: T.textMuted, fontSize: 12 }}>
            No trend data available.
          </div>
        )}
        {latestValue != null && (
          <div style={{ color: T.textSecondary, fontSize: 12 }}>
            Latest point: {latestValue.toFixed(2)}%
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

const Panel = ({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) => (
  <div
    style={{
      background: T.bgPanel,
      border: `1px solid ${T.border}`,
      borderRadius: 14,
      padding: 22,
      ...style,
    }}
  >
    {children}
  </div>
);

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      fontSize: 11,
      letterSpacing: 2,
      color: T.textMuted,
      textTransform: "uppercase",
      margin: "8px 4px 14px",
      fontWeight: 600,
    }}
  >
    {children}
  </div>
);

const HeaderEyebrow = ({ children }: { children: React.ReactNode }) => (
  <span
    style={{
      fontSize: 11,
      letterSpacing: 2,
      color: T.textMuted,
      textTransform: "uppercase",
      fontWeight: 600,
    }}
  >
    {children}
  </span>
);

// In-page tab strip used to switch between Overview and Channel detail.
const TabStrip = <T extends string>({
  value,
  onChange,
  tabs,
  compact = false,
}: {
  value: T;
  onChange: (v: T) => void;
  tabs: { id: T; label: string }[];
  compact?: boolean;
}) => (
  <div
    style={{
      display: "flex",
      gap: 4,
      borderBottom: compact ? "none" : `1px solid ${T_BORDER}`,
      marginBottom: compact ? 0 : 24,
    }}
  >
    {tabs.map((t) => {
      const active = t.id === value;
      return (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          style={{
            background:
              compact && active
                ? "color-mix(in oklab, var(--dt-color-accent-primary, Highlight) 14%, transparent)"
                : "transparent",
            color: active ? T.textPrimary : T.textSecondary,
            border: compact
              ? `1px solid ${
                  active
                    ? "color-mix(in oklab, var(--dt-color-accent-primary, Highlight) 58%, transparent)"
                    : "color-mix(in oklab, var(--dt-color-border-default, GrayText) 55%, transparent)"
                }`
              : "none",
            borderRadius: compact ? 8 : 0,
            padding: compact ? "7px 12px" : "10px 16px",
            fontSize: compact ? 12 : 13,
            fontWeight: active ? 700 : 600,
            letterSpacing: 0.4,
            cursor: "pointer",
            borderBottom: `${compact ? 1 : 2}px solid ${
              active
                ? "var(--dt-color-accent-primary, Highlight)"
                : "transparent"
            }`,
            marginBottom: -1,
            boxShadow:
              compact && active
                ? "inset 0 0 0 1px color-mix(in oklab, var(--dt-color-accent-primary, Highlight) 26%, transparent)"
                : "none",
            transition:
              "color 150ms ease, border-color 150ms ease, background-color 150ms ease, box-shadow 150ms ease",
          }}
        >
          {t.label}
        </button>
      );
    })}
  </div>
);

// Constant outside the generic component for type-safe access.
const T_BORDER = "var(--dt-color-border-default, GrayText)";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const pickColor = (v: number) => {
  if (v >= SLA_GOOD) return T.good;
  if (v >= SLA_BAD) return T.warn;
  return T.bad;
};

const pickStatus = (v: number): "operational" | "degraded" | "critical" => {
  if (v >= SLA_GOOD) return "operational";
  if (v >= SLA_BAD) return "degraded";
  return "critical";
};

const formatInt = (n: number) =>
  Number.isFinite(n) ? Math.round(n).toLocaleString() : "—";

const formatCurrency = (n: number) =>
  Number.isFinite(n)
    ? n.toLocaleString(undefined, {
        style: "currency",
        currency: "PEN",
        maximumFractionDigits: 0,
      })
    : "—";

const detectDarkAppearance = () => {
  if (typeof window === "undefined") return false;

  const root = document.documentElement;
  const markers = [
    root.getAttribute("data-theme"),
    root.getAttribute("data-appearance"),
    root.getAttribute("data-color-scheme"),
    root.className,
    document.body?.className,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (markers.includes("dark")) return true;
  if (markers.includes("light")) return false;

  const bg = getComputedStyle(document.body || root).backgroundColor;
  const parts = bg.match(/\d+(?:\.\d+)?/g);
  if (parts && parts.length >= 3) {
    const [r, g, b] = parts.slice(0, 3).map(Number);
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    if (!Number.isNaN(luminance)) return luminance < 0.5;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches;
};
