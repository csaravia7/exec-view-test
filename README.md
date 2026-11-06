<div align="center">

# 📊 Executive View

**A real-time executive view of availability, users, traffic, errors and revenue per application.**

![Dynatrace](https://img.shields.io/badge/Dynatrace-AppEngine-1496FF?logo=dynatrace&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Strato](https://img.shields.io/badge/Design%20System-Strato-6F2DA8)
![Version](https://img.shields.io/badge/version-0.0.13-success)

[✨ Features](#-features) · [🧩 Prerequisite: metrics](#-prerequisite-create-the-metrics) · [🚀 Installation](#-quick-installation) · [🛠️ Customization](#️-customization) · [🐛 Troubleshooting](#-troubleshooting)

</div>

---

## 📖 What is it?

**Executive View** is a Dynatrace App (React + TypeScript + Strato) that queries **Grail** with **DQL** and shows, for each application/channel, five key business and technical indicators:

| Icon | Indicator | Description |
|:---:|---|---|
| 🟢 | **Availability** | Availability % with a traffic light (Operational / Degraded / Critical) |
| 👥 | **Connected users** | Concurrent users |
| 🔁 | **Requests** | Request volume |
| ❌ | **Errors** | Failed requests |
| 💰 | **Revenue** | Transacted amount |

> ⚠️ **Important:** the app does **not use built-in** Dynatrace metrics. It reads **5 custom metrics** (`app.*`) that you **must create before** deploying it. Without them, the app shows everything as `0`. See [Prerequisite](#-prerequisite-create-the-metrics).

---

## ✨ Features

- 🧭 **Two tabs**: *Overview* (KPIs + trend) and *Channel detail* (one card per application). The selected tab is remembered (`localStorage`).
- ⏱️ **Timeframe selector**: 5m · 10m · 30m · 1h · 6h · 24h.
- 🔄 **Manual refresh** with a last-updated indicator.
- 📈 **Availability trend** using `TimeseriesChart` (interval chosen automatically from the timeframe).
- 🚦 **SLA traffic light** (configurable thresholds, see [Customization](#️-customization)).
- 🗂️ **Grid of up to 30 applications**, sorted by availability.
- ⬇️ **Export CSV** — `channel-detail-{timeframe}-{timestamp}.csv`.
- 🖨️ **Print Cards** — clean print of the grid (A4).
- 🌗 **Automatic light/dark theme**.
- 📱 **Responsive** (mobile friendly).

---

## 🧩 Prerequisite: create the metrics

The app runs this query (see `ui/app/pages/Executive.tsx` and `ui/app/pages/ChannelDetail.tsx`):

```dql
timeseries {
  availability    = avg(app.availability, scalar: true),
  connected_users = avg(app.users.connected, scalar: true),
  requests        = sum(app.requests, scalar: true),
  errors          = sum(app.request.errors, scalar: true),
  revenue         = sum(app.transactions.revenue, scalar: true)
}, by: { app }, from: now() - <timeframe>
```

### 📐 Required metric structure

| # | Metric key | Type | Aggregation used | Unit | Description |
|:-:|---|:-:|:-:|:-:|---|
| 1 | `app.availability` | gauge | `avg` | `%` (0–100) | Application availability |
| 2 | `app.users.connected` | gauge | `avg` | count | Connected / concurrent users |
| 3 | `app.requests` | count | `sum` | count | Number of requests |
| 4 | `app.request.errors` | count | `sum` | count | Number of failed requests |
| 5 | `app.transactions.revenue` | count | `sum` | currency (USD) | Revenue from transactions |

### 🏷️ Dimensions

| Dimension | Required | Applies to | Description |
|---|:-:|---|---|
| `app` | ✅ **Yes** | All 5 metrics | Application/channel identifier or name. Used in `by: { app }` and shown as the title of each card. |

> 💡 Use **consistent `app` values** across all 5 metrics (e.g. `web-portal`, `mobile-app`, `call-center`). A different value in one metric will show up as a separate card.
> You can add extra dimensions (region, environment…), but **the app only groups by `app`**; the rest are aggregated.

### 🧱 Ways to create the metrics

<details>
<summary><b>Option A — Direct ingestion (Metrics API v2, line protocol)</b></summary>

Requires a token with the `metrics.ingest` scope.

```bash
curl -X POST "https://<ENV_ID>.live.dynatrace.com/api/v2/metrics/ingest" \
  -H "Authorization: Api-Token <TOKEN>" \
  -H "Content-Type: text/plain; charset=utf-8" \
  --data-binary @- <<'EOF'
app.availability,app=web-portal gauge,99.95
app.users.connected,app=web-portal gauge,1250
app.requests,app=web-portal count,delta=480
app.request.errors,app=web-portal count,delta=3
app.transactions.revenue,app=web-portal count,delta=15230.50
EOF
```

> Send the data points periodically (e.g. every minute) from your system, an OpenTelemetry Collector, a script or a Dynatrace Workflow.
</details>

<details>
<summary><b>Option B — Extract metrics from logs / business events / spans (OpenPipeline)</b></summary>

In **Settings → Process and contextualize → OpenPipeline**, create one *metric extraction* per metric:

| Metric key | Source | Extraction | Dimension |
|---|---|---|---|
| `app.requests` | logs / bizevents / spans | Counter (record count) | `app` |
| `app.request.errors` | same source, filtered by error | Counter with an error matcher (e.g. `status >= 500`) | `app` |
| `app.transactions.revenue` | bizevents | Sum of a numeric field (e.g. `amount`) | `app` |
| `app.availability` | derived or ingested | Value (gauge) 0–100 | `app` |
| `app.users.connected` | derived or ingested | Value (gauge) | `app` |

Make sure the field in your source that identifies the application is mapped to the **`app`** dimension.
</details>

<details>
<summary><b>Option C — External source via OpenTelemetry / Micrometer / StatsD</b></summary>

Any instrumentation that publishes those metric keys (with the `app` dimension) to Dynatrace is valid.
</details>

### ✅ Verify the metrics exist

Run this in a Dynatrace **Notebook**:

```dql
timeseries {
  availability    = avg(app.availability),
  connected_users = avg(app.users.connected),
  requests        = sum(app.requests),
  errors          = sum(app.request.errors),
  revenue         = sum(app.transactions.revenue)
}, by: { app }, from: now() - 1h
```

If it returns one series per `app`, you're ready ✔️.

---

## 🚀 Quick installation

### 1️⃣ Requirements

- 🟩 **Node.js** ≥ 16.13 and **npm**
- ☁️ A **Dynatrace Platform** tenant (`*.apps.dynatrace.com`) with AppEngine
- 📊 The **5 metrics** above already created and receiving data
- 🔑 Permission to install apps (`app-engine:apps:install`) on the tenant

### 2️⃣ Clone and install

```bash
git clone <REPOSITORY_URL> exec-view
cd exec-view
npm install
```

### 3️⃣ Configure `app.config.json`

```json
{
  "environmentUrl": "https://<your-tenant>.apps.dynatrace.com/",
  "app": {
    "name": "Executive View",
    "id": "my.company.executive.view",
    "version": "0.0.1"
  }
}
```

| Field | What to do |
|---|---|
| `environmentUrl` | ✏️ Change it to **your** tenant. |
| `app.id` | ✏️ Use a unique ID (recommended: your company/domain). |
| `app.version` | Increase it on every deployment (the same version cannot be redeployed). |

### 4️⃣ Required scopes

Already defined in `app.config.json`:

| Scope | Purpose |
|---|---|
| `storage:metrics:read` | 📈 Read the `app.*` metrics (**essential**) |
| `storage:entities:read` | 🏷️ Resolve entity names |
| `storage:buckets:read` | 🪣 Access Grail buckets |
| `storage:logs:read` | 📜 Read logs (default template / *Data* page) |

> End users also need an IAM policy granting read access to metrics (`storage:metrics:read`).

### 5️⃣ Run

```bash
npm run start    # 🔥 development mode with hot reload
```

### 6️⃣ Deploy

```bash
npm run deploy   # 🚢 builds and deploys to the configured tenant
```

Then open **Apps → Executive View** in your tenant.

---

## 🛠️ Customization

| What | Where | Detail |
|---|---|---|
| 🚦 SLA thresholds (Overview) | `ui/app/pages/Executive.tsx` | `SLA_GOOD = 99`, `SLA_BAD = 95` |
| 🚦 SLA thresholds (Detail) | `ui/app/pages/ChannelDetail.tsx` | `SLA_GOOD = 95`, `SLA_BAD = 90` |
| 🔑 Metric names | `buildSnapshotQuery` in both files | Replace `app.availability`, `app.requests`… with your metric keys |
| 🏷️ Grouping dimension | `by: { app }` | Replace `app` with your dimension (e.g. `service`) |
| 💱 Currency | `ChannelDetail.tsx` (`Intl.NumberFormat`, `currency: "USD"`) | Change the ISO code (`PEN`, `EUR`…) |
| ⏱️ Timeframes | `TIMEFRAMES` constant | Add/remove options |
| 🗂️ Max cards | `rows.slice(0, 30)` in `ChannelDetail.tsx` | Adjust the limit |
| 🎨 Colors / theme | `THEME_LIGHT` / `THEME_DARK` | `--exec-*` / `--app-*` CSS variables |

> 📝 If you rename a metric or dimension, update **both** queries (Executive and ChannelDetail) to keep them consistent.

---

## 🗂️ Project structure

```
exec-view/
├── ui/
│   ├── main.tsx                   # Entry point
│   ├── app/
│   │   ├── App.tsx                # Routes (/ → Executive)
│   │   ├── components/            # Header, Card
│   │   └── pages/
│   │       ├── Executive.tsx      # 📊 Overview + tabs + trend
│   │       ├── ChannelDetail.tsx  # 🗂️ Per-app cards, CSV, Print
│   │       ├── Data.tsx           # 🔍 DQL explorer (route disabled)
│   │       └── Home.tsx           # 🏠 Home (not routed)
│   └── assets/                    # Icons and images
├── app.config.json                # App config and scopes
├── package.json
└── README.md
```

---

## 📚 Commands

| Command | Description |
|---|---|
| `npm run start` | 🔥 Development server |
| `npm run build` | 📦 Production build into `dist/` |
| `npm run deploy` | 🚢 Deploy to the tenant |
| `npm run uninstall` | 🗑️ Uninstall the app |
| `npm run update` | ⬆️ Update Dynatrace SDKs |
| `npm run lint` | 🧹 ESLint |
| `npm run info` | ℹ️ CLI/environment information |

---

## 🐛 Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Everything at `0` / no cards | Metrics don't exist or have no data in the timeframe | Run the [verification](#-verify-the-metrics-exist) query in a Notebook |
| Duplicated or incomplete cards | Inconsistent `app` values across metrics | Unify the values of the `app` dimension |
| `403 Forbidden` | Missing scopes or IAM permissions | Check `scopes` in `app.config.json` and redeploy; validate the user's policy |
| Availability always 0 % | Metric on a 0–1 scale instead of 0–100 | Ingest as a percentage (0–100) or adjust the query |
| `Version already exists` on deploy | Same version already published | Increase `app.version` |
| Changes not visible in dev | Hot reload not applied | Reload the browser and check the terminal |

---

## 🔗 Resources

- 📘 [Dynatrace Developer](https://dt-url.net/developers)
- 🔎 [DQL — Dynatrace Query Language](https://dt-url.net/dql)
- 🎨 [Strato Design System](https://developer.dynatrace.com/design/about-strato-design-system/)
- 📡 [Metrics ingestion (API v2)](https://docs.dynatrace.com/docs/discover-dynatrace/references/dynatrace-api/environment-api/metric-v2/post-ingest-metrics)

---

## 📝 Release notes

| Version | Changes |
|---|---|
| **0.0.13** | 🎨 Design and mobile UI improvements, Overview/Detail tabs, availability trend |
| **0.0.9** | ⬇️ Export CSV and 🖨️ Print Cards |
| **0.0.1** | 🌱 Initial version |

---
