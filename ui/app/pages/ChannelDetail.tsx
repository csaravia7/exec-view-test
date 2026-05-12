import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useDql } from "@dynatrace-sdk/react-hooks";

const T = {
  bg: "var(--app-bg)",
  bgPanel: "var(--app-panel)",
  bgPanelAlt: "var(--app-panel-alt)",
  border: "var(--app-border)",
  textPrimary: "var(--app-text-primary)",
  textSecondary: "var(--app-text-secondary)",
  textMuted: "var(--app-text-muted)",
  good: "var(--app-good)",
  warn: "var(--app-warn)",
  bad: "var(--app-bad)",
  accentUsers: "var(--app-accent-users)",
  accentRequests: "var(--app-accent-requests)",
  accentRevenue: "var(--app-accent-revenue)",
};

const THEME_LIGHT = {
  "--app-bg": "#f5f7fb",
  "--app-panel": "#ffffff",
  "--app-panel-alt": "#eef2f7",
  "--app-border": "#d7dee9",
  "--app-text-primary": "#0f172a",
  "--app-text-secondary": "#334155",
  "--app-text-muted": "#64748b",
  "--app-good": "#16a34a",
  "--app-warn": "#d97706",
  "--app-bad": "#dc2626",
  "--app-accent-users": "#2563eb",
  "--app-accent-requests": "#9333ea",
  "--app-accent-revenue": "#0f766e",
} as const;

const THEME_DARK = {
  "--app-bg": "#0b1220",
  "--app-panel": "#111b2e",
  "--app-panel-alt": "#1b2740",
  "--app-border": "#2a3a57",
  "--app-text-primary": "#f8fafc",
  "--app-text-secondary": "#c8d4ea",
  "--app-text-muted": "#93a5c4",
  "--app-good": "#22c55e",
  "--app-warn": "#f59e0b",
  "--app-bad": "#ef4444",
  "--app-accent-users": "#60a5fa",
  "--app-accent-requests": "#c084fc",
  "--app-accent-revenue": "#2dd4bf",
} as const;

const SLA_GOOD = 95;
const SLA_BAD = 90;

type AppRow = {
  app_name: string | null;
  app: string | null;
  availability: number | null;
  connected_users: number | null;
  requests: number | null;
  errors: number | null;
  revenue: number | null;
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

export { TIMEFRAMES };
export type { TimeframeId };

const buildSnapshotQuery = (tf: TimeframeId) => `
timeseries {
  availability = avg(app.availability, scalar: true),
  connected_users = avg(app.users.connected, scalar: true),
  requests = sum(app.requests, scalar: true),
  errors = sum(app.request.errors, scalar: true),
  revenue = sum(app.transactions.revenue, scalar: true)
}, by: { app }, from: now() - ${tf}
| fieldsAdd
    app_name = app,
    availability = if(isNotNull(availability), availability, else: 0.0),
    connected_users = if(isNotNull(connected_users), connected_users, else: 0),
    requests = if(isNotNull(requests), requests, else: 0),
    errors = if(isNotNull(errors), errors, else: 0),
    revenue = if(isNotNull(revenue), revenue, else: 0)
| fields app_name, app, availability, connected_users, requests, errors, revenue
| sort availability desc
| limit 150
`;

export type ChannelDetailProps = {
  embedded?: boolean;
  selectedId?: string;
  onSelectChannel?: (id: string) => void;
  timeframe?: TimeframeId;
  onTimeframeChange?: (id: TimeframeId) => void;
  refreshNonce?: number;
};

export const ChannelDetail = ({
  embedded = false,
  selectedId,
  onSelectChannel,
  timeframe: controlledTimeframe,
  onTimeframeChange,
  refreshNonce,
}: ChannelDetailProps = {}) => {
  const [isDark, setIsDark] = useState(() => detectDarkAppearance());
  const [localTimeframe, setLocalTimeframe] = useState<TimeframeId>("10m");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null);
  const lastHandledRefreshNonce = useRef<number | null>(null);
  const cardsGridRef = useRef<HTMLDivElement | null>(null);

  const timeframe = controlledTimeframe ?? localTimeframe;
  const usesExternalControls = controlledTimeframe !== undefined;

  const { data, isLoading, error, refetch } = useDql({
    query: buildSnapshotQuery(timeframe),
  });

  const apps = useMemo<AppRow[]>(
    () => (data?.records ?? []) as unknown as AppRow[],
    [data]
  );

  const visibleApps = useMemo(() => {
    const rows = [...apps];
    rows.sort((left, right) => {
      const availabilityDelta =
        (right.availability ?? 0) - (left.availability ?? 0);
      if (availabilityDelta !== 0) return availabilityDelta;

      return (right.connected_users ?? 0) - (left.connected_users ?? 0);
    });
    return rows.slice(0, 30);
  }, [apps]);

  const timeframeLabel =
    TIMEFRAMES.find((item) => item.id === timeframe)?.label ?? "Last 6h";

  const avgAvailability = visibleApps.length
    ? visibleApps.reduce((sum, app) => sum + (app.availability ?? 0), 0) /
      visibleApps.length
    : 0;
  const totalUsers = visibleApps.reduce(
    (sum, app) => sum + (app.connected_users ?? 0),
    0
  );
  const criticalApps = visibleApps.filter(
    (app) => (app.availability ?? 100) < SLA_BAD
  ).length;

  const refreshData = useCallback(async () => {
    if (isRefreshing) return;
    const startedAt = Date.now();
    setIsRefreshing(true);
    try {
      await refetch();
      setLastRefreshAt(new Date());
    } finally {
      // Keep feedback visible a bit so the action is perceived by the user.
      const elapsed = Date.now() - startedAt;
      const minVisibleMs = 700;
      if (elapsed < minVisibleMs) {
        await new Promise((resolve) => setTimeout(resolve, minVisibleMs - elapsed));
      }
      setIsRefreshing(false);
    }
  }, [isRefreshing, refetch]);

  useEffect(() => {
    if (refreshNonce == null || refreshNonce === 0) return;
    if (lastHandledRefreshNonce.current === refreshNonce) return;

    lastHandledRefreshNonce.current = refreshNonce;
    void refreshData();
  }, [refreshNonce, refreshData]);

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

  const exportToCsv = useCallback(() => {
    const headers = [
      "app_name",
      "app_id",
      "availability",
      "status",
      "connected_users",
      "requests",
      "errors",
      "revenue_pen",
    ];

    const rows = visibleApps.map((app) => [
      app.app_name ?? app.app ?? "",
      app.app ?? "",
      app.availability != null ? app.availability.toFixed(2) : "",
      pickStatus(app.availability),
      String(app.connected_users ?? 0),
      String(app.requests ?? 0),
      String(app.errors ?? 0),
      String(app.revenue ?? 0),
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map(escapeCsvValue).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    link.href = url;
    link.download = `channel-detail-${timeframe}-${timestamp}.csv`;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [timeframe, visibleApps]);

  const printCardsGrid = useCallback(() => {
    if (!cardsGridRef.current) return;
    window.print();
  }, []);

  const themeVars =
    (isDark ? THEME_DARK : THEME_LIGHT) as unknown as React.CSSProperties;

  return (
    <div
      style={
        embedded
          ? {
              ...themeVars,
              colorScheme: isDark ? "dark" : "light",
              color: T.textPrimary,
            }
          : {
              ...themeVars,
              background: T.bg,
              minHeight: "100%",
              padding: "32px 40px 48px",
              color: T.textPrimary,
              colorScheme: isDark ? "dark" : "light",
              fontFamily: "inherit",
            }
      }
    >
      {!embedded && (
        <DetailHeader
          appCount={visibleApps.length}
          timeframeLabel={timeframeLabel}
        />
      )}

      {/* <Panel style={{ marginBottom: 24 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          {!usesExternalControls && (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Eyebrow>Timeframe</Eyebrow>
              <SegmentedControl
                value={timeframe}
                onChange={(value) => {
                  const next = value as TimeframeId;
                  if (onTimeframeChange) onTimeframeChange(next);
                  else setLocalTimeframe(next);
                }}
                options={TIMEFRAMES.map((item) => ({
                  id: item.id,
                  label: item.label,
                }))}
              />
              <button
                type="button"
                onClick={() => void refreshData()}
                disabled={isLoading || isRefreshing}
                style={{
                  background: isLoading || isRefreshing ? T.bgPanelAlt : T.bgPanel,
                  color: isLoading || isRefreshing ? T.textMuted : T.textPrimary,
                  border: `1px solid ${T.border}`,
                  borderRadius: 8,
                  padding: "7px 12px",
                  fontSize: 12,
                  fontWeight: 600,
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
              <div
                style={{
                  minWidth: 140,
                  fontSize: 11,
                  color: isRefreshing ? T.good : T.textMuted,
                  letterSpacing: 0.3,
                }}
              >
                {isRefreshing
                  ? "Refreshing data..."
                  : lastRefreshAt
                    ? `Updated ${lastRefreshAt.toLocaleTimeString()}`
                    : "Not refreshed yet"}
              </div>
            </div>
          )}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              color: T.textSecondary,
              fontSize: 13,
              flexWrap: "wrap",
            }}
          >
            <Eyebrow>Grid</Eyebrow>
            <span>Showing up to 30 applications</span>
            {selectedId && (
              <span style={{ color: T.textMuted }}>
                The selected application is pinned first.
              </span>
            )}
          </div>
        </div>
      </Panel> */}

      {error && (
        <Panel style={{ borderColor: T.bad, marginBottom: 24 }}>
          <div style={{ color: T.bad, fontSize: 14 }}>
            Error loading data: {error.message}
          </div>
        </Panel>
      )}

      <style>
        {`
          @media print {
            body * {
              visibility: hidden !important;
            }

            #channel-detail-cards-grid,
            #channel-detail-cards-grid * {
              visibility: visible !important;
            }

            #channel-detail-cards-grid {
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              width: 100% !important;
              margin: 0 !important;
              padding: 12px !important;
            }
          }
        `}
      </style>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 20,
          marginBottom: 24,
        }}
      >
        <KpiTile
          label="Applications"
          value={isLoading ? "—" : String(visibleApps.length)}
          accent={T.textPrimary}
        />
        <KpiTile
          label="Average availability"
          value={isLoading ? "—" : `${avgAvailability.toFixed(2)}%`}
          accent={pickColor(avgAvailability)}
        />
        <KpiTile
          label="Connected users"
          value={isLoading ? "—" : formatInt(totalUsers)}
          accent={T.accentUsers}
        />
        <KpiTile
          label="Critical apps"
          value={isLoading ? "—" : String(criticalApps)}
          accent={criticalApps > 0 ? T.bad : T.textSecondary}
        />
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: 10,
          marginBottom: 14,
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={exportToCsv}
          disabled={isLoading || visibleApps.length === 0}
          style={{
            background: T.bgPanel,
            color: T.textPrimary,
            border: `1px solid ${T.border}`,
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 12,
            fontWeight: 600,
            cursor: isLoading || visibleApps.length === 0 ? "not-allowed" : "pointer",
            opacity: isLoading || visibleApps.length === 0 ? 0.6 : 1,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M12 3v10m0 0 4-4m-4 4-4-4M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Export CSV
        </button>
        <button
          type="button"
          onClick={printCardsGrid}
          disabled={isLoading || visibleApps.length === 0}
          style={{
            background: T.bgPanel,
            color: T.textPrimary,
            border: `1px solid ${T.border}`,
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 12,
            fontWeight: 600,
            cursor: isLoading || visibleApps.length === 0 ? "not-allowed" : "pointer",
            opacity: isLoading || visibleApps.length === 0 ? 0.6 : 1,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M7 8V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v3M7 17h10v4H7v-4Zm12 0h1a2 2 0 0 0 2-2v-4a3 3 0 0 0-3-3H5a3 3 0 0 0-3 3v4a2 2 0 0 0 2 2h1"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Print Cards
        </button>
      </div>

      <div
        id="channel-detail-cards-grid"
        ref={cardsGridRef}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
          gap: 14,
          alignItems: "stretch",
        }}
      >
        {isLoading && visibleApps.length === 0
          ? Array.from({ length: 6 }).map((_, index) => (
              <AppTileSkeleton key={index} />
            ))
          : visibleApps.map((app, index) => {
              const id = app.app ?? "";
              return (
                <AppTile
                  key={id || `${app.app_name ?? "app"}-${index}`}
                  app={app}
                  tileBackground={availabilityTileBackground(
                    app.availability,
                    isDark
                  )}
                  selected={!!selectedId && id === selectedId}
                  isRefreshing={isRefreshing || isLoading}
                />
              );
            })}

        {!isLoading && visibleApps.length === 0 && (
          <Panel style={{ gridColumn: "1 / -1" }}>
            <div style={{ color: T.textSecondary, fontSize: 14 }}>
              No applications with RUM data found for the selected timeframe.
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
};

const DetailHeader = ({
  appCount,
  timeframeLabel,
}: {
  appCount: number;
  timeframeLabel: string;
}) => (
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 24,
    }}
  >
    <div>
      <div
        style={{
          fontSize: 12,
          letterSpacing: 2,
          color: T.textMuted,
          textTransform: "uppercase",
          marginBottom: 4,
        }}
      >
        Channel detail
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 700,
          letterSpacing: -0.4,
        }}
      >
        Application detail grid
      </div>
      <div style={{ color: T.textSecondary, fontSize: 14, marginTop: 8 }}>
        {appCount} applications across {timeframeLabel.toLowerCase()}.
      </div>
    </div>
  </div>
);

const KpiTile = ({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) => (
  <Panel style={{ borderRadius: 14, border: "none" }}>
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
        fontSize: 32,
        fontWeight: 700,
        color: accent,
        fontVariantNumeric: "tabular-nums",
        letterSpacing: -0.5,
      }}
    >
      {value}
    </div>
  </Panel>
);

const SegmentedControl = ({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { id: string; label: string }[];
}) => (
  <div
    style={{
      display: "inline-flex",
      background: T.bgPanelAlt,
      border: `1px solid ${T.border}`,
      borderRadius: 8,
      padding: 3,
      gap: 2,
    }}
  >
    {options.map((option) => {
      const active = option.id === value;
      return (
        <button
          key={option.id}
          onClick={() => onChange(option.id)}
          style={{
            background: active ? T.bgPanel : "transparent",
            color: active ? T.textPrimary : T.textSecondary,
            border: "none",
            borderRadius: 6,
            padding: "6px 12px",
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: 0.5,
            cursor: "pointer",
            boxShadow: active ? `inset 0 0 0 1px ${T.border}` : "none",
          }}
        >
          {option.label}
        </button>
      );
    })}
  </div>
);

const AppTile = ({
  app,
  tileBackground,
  selected,
  isRefreshing = false,
}: {
  app: AppRow;
  tileBackground: string;
  selected: boolean;
  isRefreshing?: boolean;
}) => (
  <Panel
    style={{
      background: tileBackground,
      position: "relative",
      overflow: "hidden",
      borderColor: selected ? "var(--dt-color-accent-primary, Highlight)" : T.border,
      boxShadow: "none",
      minHeight: 196,
      padding: 0,
    }}
  >
    {isRefreshing && (
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(0, 0, 0, 0.15)",
          backdropFilter: "blur(0.5px)",
          zIndex: 10,
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            border: `2px solid color-mix(in oklab, ${T.textPrimary} 25%, transparent)`,
            borderTopColor: T.textPrimary,
            animation: "spin 0.8s linear infinite",
          }}
        />
      </div>
    )}
    <style>
      {`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}
    </style>
    <div style={{ height: 2, background: "transparent" }} />
    <button
      type="button"
      disabled
      style={{
        appearance: "none",
        background: "transparent",
        border: "none",
        margin: 0,
        width: "100%",
        color: "inherit",
        textAlign: "left",
        display: "block",
        padding: 11,
        cursor: "default",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 10,
              letterSpacing: 1.4,
              textTransform: "uppercase",
              color: T.textMuted,
              marginBottom: 4,
              fontWeight: 700,
            }}
          >
            Application
          </div>
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: T.textPrimary,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={app.app_name ?? app.app ?? ""}
          >
            {app.app_name ?? app.app ?? "Unnamed app"}
          </div>
          <div
            style={{
              fontSize: 10,
              letterSpacing: 1.1,
              textTransform: "uppercase",
              color: T.textMuted,
              marginTop: 2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={app.app ?? ""}
          >
             {/* {app.app ?? "No app id"} */}
          </div>
        </div>
        <StatusBadge status={pickStatus(app.availability)} />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr",
          alignItems: "end",
          marginBottom: 6,
          padding: "8px 0 6px",
          borderTop: `1px solid color-mix(in oklab, ${T.border} 55%, transparent)`,
          borderBottom: `1px solid color-mix(in oklab, ${T.border} 55%, transparent)`,
        }}
      >
        <div
          style={{
            minWidth: 0,
          }}
        >
          <Eyebrow>Availability</Eyebrow>
          <div
            style={{
              fontSize: 32,
              fontWeight: 700,
              color: pickColor(app.availability),
              fontVariantNumeric: "tabular-nums",
              letterSpacing: -1,
              lineHeight: 1,
              marginTop: 3,
            }}
          >
            {app.availability != null ? `${app.availability.toFixed(2)}%` : "—"}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 8 }}>
        <ProgressBar
          value={app.availability ?? 0}
          accent={pickColor(app.availability)}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 6,
        }}
      >
        <MetricBlock
          label="Users"
          value={formatInt(app.connected_users ?? 0)}
          accent={T.accentUsers}
        />
        <MetricBlock
          label="Requests"
          value={formatInt(app.requests ?? 0)}
          accent={T.accentRequests}
        />
        <MetricBlock
          label="Errors"
          value={formatInt(app.errors ?? 0)}
          accent={(app.errors ?? 0) > 0 ? T.bad : T.textSecondary}
        />
        <MetricBlock
          label="Revenue"
          value={formatCurrency(app.revenue ?? 0)}
          accent={T.accentRevenue}
        />
      </div>
    </button>
  </Panel>
);

const MetricBlock = ({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) => (
  <div
    style={{
      background: "transparent",
      border: "none",
      borderRadius: 12,
      padding: "6px 6px 4px",
      boxShadow: "none",
    }}
  >
    <div
      style={{
        fontSize: 9,
        letterSpacing: 1.1,
        color: T.textMuted,
        textTransform: "uppercase",
        marginBottom: 1,
      }}
    >
      {label}
    </div>
    <div
      style={{
        fontSize: 16,
        fontWeight: 700,
        color: accent,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {value}
    </div>
  </div>
);

const AppTileSkeleton = () => (
  <Panel style={{ minHeight: 232 }}>
    <div
      style={{
        height: 18,
        width: "62%",
        borderRadius: 6,
        background: T.bgPanelAlt,
        marginBottom: 10,
      }}
    />
    <div
      style={{
        height: 12,
        width: "78%",
        borderRadius: 6,
        background: T.bgPanelAlt,
        marginBottom: 24,
      }}
    />
    <div
      style={{
        height: 28,
        width: "38%",
        borderRadius: 6,
        background: T.bgPanelAlt,
        marginBottom: 10,
      }}
    />
    <div
      style={{
        height: 8,
        width: "100%",
        borderRadius: 999,
        background: T.bgPanelAlt,
        marginBottom: 20,
      }}
    />
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 14,
      }}
    >
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          style={{
            height: 54,
            borderRadius: 10,
            background: T.bgPanelAlt,
          }}
        />
      ))}
    </div>
  </Panel>
);

const ProgressBar = ({ value, accent }: { value: number; accent: string }) => {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      style={{
        width: "100%",
        height: 8,
        background: "color-mix(in oklab, var(--app-panel-alt) 55%, transparent)",
        borderRadius: 999,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: "100%",
          background: accent,
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
    operational: { color: T.good, label: "Operational" },
    degraded: { color: T.warn, label: "Degraded" },
    critical: { color: T.bad, label: "Critical" },
  } as const;
  const { color, label } = map[status];
  return (
    <div
      style={{
        display: "inline-flex",
        flexShrink: 0,
        alignItems: "center",
        gap: 5,
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: 0.8,
        color,
        padding: "2px 4px",
        borderRadius: 999,
        background: "transparent",
        border: "none",
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{ width: 6, height: 6, borderRadius: "50%", background: color }}
      />
      {label}
    </div>
  );
};

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

const Eyebrow = ({ children }: { children: React.ReactNode }) => (
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

const pickColor = (value: number | null) => {
  if (value == null) return T.textSecondary;
  if (value >= SLA_GOOD) return T.good;
  if (value >= SLA_BAD) return T.warn;
  return T.bad;
};

const pickStatus = (
  value: number | null
): "operational" | "degraded" | "critical" => {
  if (value == null) return "degraded";
  if (value >= SLA_GOOD) return "operational";
  if (value >= SLA_BAD) return "degraded";
  return "critical";
};

const formatInt = (value: number) =>
  Number.isFinite(value) ? Math.round(value).toLocaleString() : "—";

const formatCurrency = (value: number) =>
  Number.isFinite(value)
    ? value.toLocaleString(undefined, {
        style: "currency",
        currency: "PEN",
        maximumFractionDigits: 0,
      })
    : "—";

const escapeCsvValue = (value: string) => {
  if (/[,"\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

const availabilityTileBackground = (availability: number | null, isDark: boolean) => {
  if (availability == null) return "var(--app-panel)";
  if (availability >= SLA_GOOD) {
    return isDark ? "rgba(34, 197, 94, 0.06)" : "rgba(22, 163, 74, 0.04)";
  }
  if (availability >= SLA_BAD) {
    return isDark ? "rgba(245, 158, 11, 0.07)" : "rgba(217, 119, 6, 0.05)";
  }
  return isDark ? "rgba(239, 68, 68, 0.08)" : "rgba(220, 38, 38, 0.06)";
};

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
