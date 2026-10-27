import { useEffect, useState } from "react";
import { useCRM } from "./context";
import { PageHeader } from "./Workspace";
import { Avatar, Badge, Empty, Icon, Status } from "./ui";
import type { Row } from "./types";
export const metricDefinitions = [
  ["vendors", "Total vendors", "Building2", "vendors"],
  ["active", "Active vendors", "CircleCheck", "vendors"],
  ["brands", "Brands managed", "BadgeCheck", "brands"],
  ["authorized", "Authorized dealers", "ShieldCheck", "vendors"],
  ["products", "Products listed", "Package", "products"],
  ["rfqs", "Open RFQs", "ClipboardList", "rfqs"],
  ["due", "Follow-ups today", "CalendarClock", "follow-ups"],
  ["pending", "Pending verifications", "ShieldQuestion", "vendors"],
];
export function Dashboard() {
  const c = useCRM(),
    [customize, setCustomize] = useState(false),
    [dateRange, setDateRange] = useState("30"),
    [tasks, setTasks] = useState<Row[]>([]),
    [vendors, setVendors] = useState<Row[]>([]),
    [rfqs, setRfqs] = useState<Row[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    Promise.all([
      c.list("follow-ups", { limit: "6", sort: "date", status: "Open" }),
      c.list("vendors", { limit: "5", sort: "createdAt", direction: "desc" }),
      c.list("rfqs", { limit: "4", sort: "createdAt", direction: "desc" }),
    ])
      .then(([t, v, r]) => {
        if (alive) {
          setTasks(t.rows);
          setVendors(v.rows);
          setRfqs(r.rows);
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [c.summary]);
  const hour = new Date().getHours(),
    greeting = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const defaultWidgets = [
    "network",
    "tasks",
    "vendors",
    "rfqs",
    "verification",
    "activity",
  ];
  const widgets = c.prefs.widgetOrder || [
    ...defaultWidgets,
    "expiring",
    "awaiting",
    "pending",
  ];
  const visible = c.prefs.widgets || defaultWidgets;
  const progress = c.summary.progress,
    steps = [
      ["profile", "Complete company profile", () => c.go("settings")],
      ["vendors", "Add your first vendor", () => c.openForm("vendors")],
      ["brands", "Add your first brand", () => c.openForm("brands")],
      ["imported", "Import vendor Excel sheet", () => c.go("import")],
      ["rfqs", "Create your first RFQ", () => c.openForm("rfqs")],
    ] as const;
  const [dismissSetup, setDismissSetup] = useState(
    () => sessionStorage.getItem("ofneeds-crm.setup.dismissed") === "yes",
  );
  return (
    <div>
      <PageHeader
        title={`Good ${greeting}, ${c.user?.name.split(" ")[0] || "Alex"} ☀`}
        description="Welcome to OfNeeds Vendor CRM. Here’s your supplier network at a glance."
      >
        <button className="button outline" onClick={() => c.go("import")}>
          <Icon name="Upload" size={16} />
          Import vendors
        </button>
        <button
          className="button primary"
          disabled={!c.write}
          onClick={() => c.openForm("vendors")}
        >
          <Icon name="Plus" size={17} />
          Add vendor
        </button>
      </PageHeader>
      <div className="overview-controls">
        <div className="section-tabs">
          <button className="selected">Overview</button>
          <button onClick={() => c.go("analytics")}>
            Network analytics
            <Icon name="ArrowUpRight" size={13} />
          </button>
        </div>
        <div>
          <select
            aria-label="Dashboard date range"
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
          >
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last 12 months</option>
          </select>
          <button
            className="button outline small"
            onClick={() => setCustomize(!customize)}
          >
            <Icon name="SlidersHorizontal" size={15} />
            Customize
          </button>
        </div>
      </div>
      {customize && (
        <div className="card customization">
          <h3>Make this overview yours</h3>
          <p>
            Hide widgets or move them into your preferred order. Saved to your{" "}
            {c.demo ? "browser" : "account"}.
          </p>
          {widgets.map((id, i) => (
            <div key={id}>
              <label>
                <input
                  type="checkbox"
                  checked={visible.includes(id)}
                  onChange={(e) =>
                    c.updatePrefs({
                      widgets: e.target.checked
                        ? [...visible, id]
                        : visible.filter((v) => v !== id),
                    })
                  }
                />
                {id[0].toUpperCase() + id.slice(1)}
              </label>
              <button
                disabled={i === 0}
                aria-label={`Move ${id} up`}
                onClick={() => {
                  const next = [...widgets];
                  [next[i - 1], next[i]] = [next[i], next[i - 1]];
                  c.updatePrefs({ widgetOrder: next });
                }}
              >
                <Icon name="ArrowUp" size={14} />
              </button>
            </div>
          ))}
          <button
            className="button ghost small"
            onClick={() =>
              c.updatePrefs({ widgets: undefined, widgetOrder: undefined })
            }
          >
            Restore default layout
          </button>
        </div>
      )}
      <div className="metrics-grid" data-tour="metrics">
        {metricDefinitions.map(([key, label, icon, page], i) => (
          <button
            key={key}
            className="metric-card"
            onClick={() => {
              if (key === "pending")
                sessionStorage.setItem(
                  "ofneeds-crm.next-filter",
                  JSON.stringify({ authorization: "Unverified" }),
                );
              if (key === "active")
                sessionStorage.setItem(
                  "ofneeds-crm.next-filter",
                  JSON.stringify({ status: "Active" }),
                );
              if (key === "authorized")
                sessionStorage.setItem(
                  "ofneeds-crm.next-filter",
                  JSON.stringify({ authorization: "Authorized" }),
                );
              c.go(page);
            }}
          >
            <span className={`metric-icon color-${i % 4}`}>
              <Icon name={icon} />
            </span>
            <span className="metric-label">{label}</span>
            <strong>{c.summary.metrics[key]}</strong>
            <span className="metric-foot">
              {c.demo ? "Sample data" : "Current records"}
              <Icon name="ArrowUpRight" size={14} />
            </span>
          </button>
        ))}
      </div>
      {!c.demo && !dismissSetup && !steps.every(([id]) => progress[id]) && (
        <section className="setup-card">
          <div>
            <span className="eyebrow">A GOOD PLACE TO START</span>
            <h3>Your workspace, one step at a time.</h3>
            <p>
              {steps.filter(([id]) => progress[id]).length} of 5 steps complete.
              Pick up wherever you like.
            </p>
          </div>
          <div className="setup-steps">
            {steps.map(([id, label, action]) => (
              <button key={id} onClick={action}>
                <Icon
                  name={progress[id] ? "CircleCheck" : "Circle"}
                  size={17}
                />
                {label}
              </button>
            ))}
          </div>
          <button
            className="icon-button"
            title="Skip setup for now"
            aria-label="Skip setup for now"
            onClick={() => {
              sessionStorage.setItem("ofneeds-crm.setup.dismissed", "yes");
              setDismissSetup(true);
            }}
          >
            <Icon name="X" size={16} />
          </button>
        </section>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="dashboard-grid">
        {widgets
          .filter((id) => visible.includes(id))
          .map((id) => (
            <section className={`card dashboard-widget widget-${id}`} key={id}>
              {id === "network" ? (
                <>
                  <WidgetHeader
                    title="Your supplier network"
                    subtitle="Category coverage · all current vendors"
                    action={() => c.go("reports")}
                  />
                  <div className="network-chart">
                    <Donut values={c.summary.charts.categories} />
                    <BarChart
                      values={c.summary.charts.categories}
                      onSelect={(category) => {
                        sessionStorage.setItem(
                          "ofneeds-crm.next-filter",
                          JSON.stringify({ category }),
                        );
                        c.go("vendors");
                      }}
                    />
                  </div>
                </>
              ) : id === "tasks" ? (
                <>
                  <WidgetHeader
                    title="Stay one step ahead"
                    subtitle="Upcoming & overdue follow-ups"
                    action={() => c.go("follow-ups")}
                  />
                  <div className="widget-list">
                    {tasks.length ? (
                      tasks.map((t) => (
                        <div className="task-row" key={t.id}>
                          <button
                            className={`task-checkbox ${t.status === "Completed" ? "checked" : ""}`}
                            disabled={!c.write}
                            aria-label={`Mark ${t.name} ${t.status === "Completed" ? "open" : "completed"}`}
                            onClick={async () => {
                              try {
                                await c.save(
                                  "follow-ups",
                                  {
                                    ...t,
                                    status:
                                      t.status === "Completed"
                                        ? "Open"
                                        : "Completed",
                                  },
                                  t.id,
                                );
                                c.notify("Task updated.");
                              } catch (e) {
                                c.notify((e as Error).message);
                              }
                            }}
                          >
                            {t.status === "Completed" && (
                              <Icon name="Check" size={12} />
                            )}
                          </button>
                          <button
                            className="task-detail"
                            onClick={() => c.go("follow-ups", t.id)}
                          >
                            <b>{t.name}</b>
                            <small>
                              {c.options.vendors.find(
                                (v) => v.id === t.vendorId,
                              )?.name || "Vendor"}
                            </small>
                          </button>
                          <span
                            className={`task-date ${t.date < new Date().toISOString().slice(0, 10) && t.status !== "Completed" ? "overdue" : ""}`}
                          >
                            {new Date(t.date + "T12:00:00").toLocaleDateString(
                              "en-IN",
                              { day: "numeric", month: "short" },
                            )}
                          </span>
                        </div>
                      ))
                    ) : (
                      <Empty
                        title="A clear day ahead"
                        description="Schedule your next supplier follow-up."
                        action={() => c.openForm("follow-ups")}
                      />
                    )}
                  </div>
                  <button
                    className="widget-bottom"
                    disabled={!c.write}
                    onClick={() => c.openForm("follow-ups")}
                  >
                    <Icon name="Plus" size={15} />
                    Schedule a follow-up
                  </button>
                </>
              ) : id === "vendors" ? (
                <>
                  <WidgetHeader
                    title="Recently added vendors"
                    subtitle="Meet the latest connections in your network"
                    action={() => c.go("vendors")}
                  />
                  <div className="mini-vendor-table">
                    {vendors.length ? (
                      vendors.map((v) => (
                        <button
                          key={v.id}
                          onClick={() => c.go("vendors", v.id)}
                        >
                          <Avatar name={v.name} />
                          <span>
                            <b>{v.name}</b>
                            <small>
                              {v.city} · {v.category || "Category not set"}
                              {c.demo ? " · Sample" : ""}
                            </small>
                          </span>
                          <Status value={v.status} />
                          <Icon name="ChevronRight" size={16} />
                        </button>
                      ))
                    ) : (
                      <Empty
                        title="No vendors added yet"
                        description="Build your supplier network by adding your first vendor or importing an Excel sheet."
                        action={() => c.openForm("vendors")}
                      />
                    )}
                  </div>
                </>
              ) : ["expiring", "awaiting", "pending"].includes(id) ? (
                <OperationalWidget id={id} />
              ) : id === "rfqs" ? (
                <>
                  <WidgetHeader
                    title="Sourcing in motion"
                    subtitle="Latest requests for quotation"
                    action={() => c.go("rfqs")}
                  />
                  <div className="rfq-list">
                    {rfqs.length ? (
                      rfqs.map((r) => (
                        <button key={r.id} onClick={() => c.go("rfqs", r.id)}>
                          <span className="rfq-icon">
                            <Icon name="ClipboardList" />
                          </span>
                          <span>
                            <b>{r.name}</b>
                            <small>
                              {r.quantity} units · {r.vendorIds?.length || 0}{" "}
                              suppliers{c.demo ? " · Sample" : ""}
                            </small>
                          </span>
                          <Status value={r.status} />
                        </button>
                      ))
                    ) : (
                      <Empty
                        title="Start a sourcing brief"
                        description="Create a product and vendors, then invite a comparison."
                        action={() => c.openForm("rfqs")}
                      />
                    )}
                  </div>
                </>
              ) : id === "verification" ? (
                <>
                  <WidgetHeader
                    title="Relationships to review"
                    subtitle="Keep vendor records current"
                    action={() => c.go("vendors")}
                  />
                  <div className="review-metric">
                    <span className="feature-icon">
                      <Icon name="ShieldQuestion" size={28} />
                    </span>
                    <strong>{c.summary.metrics.pending}</strong>
                    <div>
                      <b>Pending verifications</b>
                      <p>
                        Review supplier details and evidence before recording an
                        authorization.
                      </p>
                    </div>
                  </div>
                  <div className="review-note">
                    <Icon name="Info" size={15} />
                    Recorded statuses are maintained by your team.
                  </div>
                </>
              ) : (
                <>
                  <WidgetHeader
                    title="Recent activity"
                    subtitle="The latest from your workspace"
                    action={() => c.go("activity")}
                  />
                  <div className="activity-list">
                    {c.summary.activity.slice(0, 4).map((a: any) => (
                      <article key={a.id}>
                        <span className="activity-dot" />
                        <div>
                          <b>{a.text}</b>
                          <small>
                            {new Date(a.created).toLocaleDateString()}
                          </small>
                        </div>
                      </article>
                    ))}
                  </div>
                </>
              )}
            </section>
          ))}
      </div>
      <div className="insight-banner">
        <span>
          <Icon name="Sparkles" size={20} />
        </span>
        <div>
          <b>A clearer view of your sourcing activity</b>
          <p>
            Explore vendor locations, brand coverage and activity from the last{" "}
            {dateRange} days.
          </p>
        </div>
        <button
          className="button outline small"
          onClick={() => {
            sessionStorage.setItem("ofneeds-crm.report-range", dateRange);
            c.go("analytics");
          }}
        >
          Explore analytics
          <Icon name="ArrowUpRight" size={15} />
        </button>
      </div>
    </div>
  );
}
export function WidgetHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: () => void;
}) {
  return (
    <header className="widget-header">
      <div>
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </div>
      {action && (
        <button
          className="icon-button"
          title={`View ${title}`}
          aria-label={`View ${title}`}
          onClick={action}
        >
          <Icon name="ArrowUpRight" size={17} />
        </button>
      )}
    </header>
  );
}
export function counts(values: string[]): [string, number][] {
  const map = new Map<string, number>();
  values.filter(Boolean).forEach((v) => map.set(v, (map.get(v) || 0) + 1));
  return [...map].sort((a, b) => b[1] - a[1]);
}
export function BarChart({
  values,
  onSelect,
}: {
  values: string[];
  onSelect?: (name: string) => void;
}) {
  const rows = counts(values),
    max = Math.max(1, ...rows.map(([, n]) => n));
  return (
    <div
      className="bar-chart"
      role="group"
      aria-label={
        rows.map(([name, count]) => `${name}: ${count}`).join(", ") ||
        "No data available"
      }
    >
      {rows.length ? (
        rows.slice(0, 8).map(([name, count], i) => (
          <button
            key={name}
            className="bar-row"
            disabled={!onSelect}
            title={`${name}: ${count}`}
            onClick={() => onSelect?.(name)}
          >
            <span>
              <i className={`dot color-${i % 4}`} />
              {name}
            </span>
            <span className="bar-track">
              <i
                className={`color-${i % 4}`}
                style={{ width: `${(count / max) * 100}%` }}
              />
            </span>
            <b>{count}</b>
          </button>
        ))
      ) : (
        <p className="muted">No records to chart yet.</p>
      )}
    </div>
  );
}
export function Donut({ values }: { values: string[] }) {
  const groups = counts(values),
    total = values.filter(Boolean).length;
  let start = 0;
  const paths = groups.map(([name, count], i) => {
    const dash = total ? (count / total) * 100 : 0;
    const el = (
      <circle
        key={name}
        cx="60"
        cy="60"
        r="45"
        pathLength="100"
        fill="none"
        stroke={`var(--chart-${i % 4})`}
        strokeWidth="15"
        strokeDasharray={`${dash} ${100 - dash}`}
        strokeDashoffset={-start}
        transform="rotate(-90 60 60)"
      >
        <title>
          {name}: {count}
        </title>
      </circle>
    );
    start += dash;
    return el;
  });
  return (
    <div className="chart-donut">
      <svg
        viewBox="0 0 120 120"
        role="img"
        aria-label={`Total ${total} vendors; ${groups.map(([n, v]) => `${n}: ${v}`).join(", ")}`}
      >
        <circle
          cx="60"
          cy="60"
          r="45"
          fill="none"
          stroke="var(--border)"
          strokeWidth="15"
        />
        {paths}
      </svg>
      <span>
        <strong>{total}</strong>
        <small>Vendors</small>
      </span>
    </div>
  );
}
function OperationalWidget({ id }: { id: string }) {
  const c = useCRM(),
    rows = c.summary.operational?.[id] || [];
  return (
    <>
      <WidgetHeader
        title={
          id === "expiring"
            ? "Expiring brand authorizations"
            : id === "awaiting"
              ? "Awaiting supplier responses"
              : "Pending vendor approvals"
        }
        subtitle={
          id === "expiring"
            ? "Recorded expiry in the next 30 days"
            : id === "awaiting"
              ? "Open RFQs without all supplier responses"
              : "Pending relationships to review"
        }
        action={() => c.go(id === "awaiting" ? "rfqs" : "vendors")}
      />
      <div className="mini-vendor-table">
        {rows.map((r: Row) => (
          <button
            key={r.id}
            onClick={() => c.go(id === "awaiting" ? "rfqs" : "vendors", r.id)}
          >
            <Avatar name={r.name} />
            <span>
              <b>{r.name}</b>
              <small>
                {id === "expiring"
                  ? new Date(r.authorizationUntil).toLocaleDateString()
                  : id === "awaiting"
                    ? `${r.responses?.length || 0} of ${r.vendorIds?.length || 0} responses recorded`
                    : r.city}
                {c.demo ? " · Sample" : ""}
              </small>
            </span>
            <Icon name="ArrowUpRight" size={16} />
          </button>
        ))}
        {!rows.length && (
          <Empty
            title="Nothing pending here"
            description="This widget updates from your recorded relationships and sourcing activity."
          />
        )}
      </div>
    </>
  );
}
