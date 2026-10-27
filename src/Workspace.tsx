import { useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import {
  api,
  readDemo,
  saveDemo,
  resetDemo,
  demoList,
  demoSave,
  defaultData,
  preferences,
} from "./client";
import { metrics, canDelete } from "../shared/core.mjs";
import { CRM, type CRMContext } from "./context";
import {
  modules,
  labelOf,
  type User,
  type Prefs,
  type Row,
  type Data,
} from "./types";
import { Icon, Logo, Avatar, Badge, Modal, Skeleton, Empty } from "./ui";
import { Directory, VendorProfile, RecordList } from "./records";
import { RecordForm, VendorWizard } from "./forms";
import { Dashboard } from "./Dashboard";
import { Settings, ImportExport, Team } from "./administration";
import { helpTopics } from "./Public";
import { GuidedTour } from "./tour";
import Onboarding from "./Onboarding";
import { SupplierPreview } from "./SupplierPreview";
const Operations = lazy(() => import("./Operations"));
const Reports = lazy(() => import("./Reports"));
export default function Workspace({
  demo,
  user,
  path,
  navigate,
  onLogout,
}: {
  demo: boolean;
  user: User | null;
  path: string;
  navigate: (path: string) => void;
  onLogout: () => void;
}) {
  const parts = path.split("/").filter(Boolean),
    page = parts[demo ? 1 : 0] || "dashboard",
    recordId = parts[demo ? 2 : 1];
  const [data, setData] = useState<Data>(() =>
      demo ? readDemo() : defaultData(),
    ),
    [options, setOptions] = useState<Data>(defaultData()),
    [summary, setSummary] = useState<any>(null),
    [notifications, setNotifications] = useState<any[]>([]),
    [workspace, setWorkspace] = useState<any>({
      name: demo ? "The Gifting Studio" : "Your workspace",
      profile: "{}",
    });
  const [prefs, setPrefs] = useState<Prefs>(() => ({
      ...preferences(demo, user?.id),
      ...(user?.preferences || {}),
    })),
    [version, setVersion] = useState(0),
    [message, setMessage] = useState(""),
    [loadError, setLoadError] = useState(""),
    [mobile, setMobile] = useState(false),
    [palette, setPalette] = useState(false),
    [panel, setPanel] = useState(""),
    [form, setForm] = useState<{ kind: string; row?: Partial<Row> } | null>(
      null,
    ),
    [tour, setTour] = useState<number | null>(null),
    [entry, setEntry] = useState(
      () =>
        demo &&
        path === "/demo" &&
        !sessionStorage.getItem("ofneeds-crm.demo.entered"),
    ),
    [confirmReset, setConfirmReset] = useState(false);
  const dataRef = useRef(data);
  dataRef.current = data;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const go = (next: string, id?: string) => {
    navigate(
      `${demo ? "/demo" : ""}/${next}${id ? "/" + encodeURIComponent(id) : ""}`,
    );
    setMobile(false);
    setPanel("");
  };
  const notify = (text: string) => {
    setMessage(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setMessage(""), 4500);
  };
  const updatePrefs = (patch: Partial<Prefs>) => {
    setPrefs((previous) => {
      const next = { ...previous, ...patch };
      localStorage.setItem(
        `ofneeds-crm.prefs.${demo ? "demo" : user?.id}`,
        JSON.stringify(next),
      );
      if (!demo) {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(
          () =>
            api("/api/crm/preferences", "PATCH", next).catch((e) =>
              notify("Preference sync failed: " + e.message),
            ),
          400,
        );
      }
      return next;
    });
  };
  const refresh = () => setVersion((v) => v + 1);
  useEffect(() => {
    if (demo) return;
    api("/api/services/notifications")
      .then(setNotifications)
      .catch((e) => notify(e.message));
  }, [demo, version, panel]);
  useEffect(() => {
    if (demo) {
      setOptions(data);
      setSummary({
        metrics: metrics(data),
        operational: {
          pending: data.vendors
            .filter(
              (v) => v.status === "Pending" || v.authorization === "Unverified",
            )
            .slice(0, 10),
          expiring: data.vendors
            .filter(
              (v) =>
                v.authorization === "Authorized" &&
                v.authorizationUntil &&
                Date.parse(v.authorizationUntil) >= Date.now() &&
                Date.parse(v.authorizationUntil) < Date.now() + 30 * 86400000,
            )
            .slice(0, 10),
          awaiting: data.rfqs
            .filter(
              (r) =>
                r.status !== "Closed" &&
                (r.responses || []).length < (r.vendorIds || []).length,
            )
            .slice(0, 10),
        },
        activity: [
          ...JSON.parse(
            sessionStorage.getItem("ofneeds-crm.demo.activity") || "[]",
          ),
          {
            id: "welcome",
            text: "Sample workspace ready to explore",
            created: new Date().toISOString(),
          },
        ],
        charts: {
          categories: data.vendors.map((v) => v.category),
          cities: data.vendors.map((v) => v.city),
          brands: data.vendors.flatMap((v) => v.brandIds || []),
          onboarding: data.vendors.map((v) => v.createdAt?.slice(0, 10)),
          rfqs: data.rfqs.map((v) => v.status),
          followups: data["follow-ups"].map((v) => ({
            date: v.date,
            status: v.status,
          })),
        },
        progress: {
          profile: true,
          vendors: !!data.vendors.length,
          brands: !!data.brands.length,
          rfqs: !!data.rfqs.length,
          imported: false,
        },
      });
      return;
    }
    let alive = true;
    Promise.all([
      api("/api/crm/options"),
      api("/api/crm/summary"),
      api("/api/auth/me"),
    ])
      .then(([o, s, a]) => {
        if (alive) {
          setOptions(o);
          setSummary(s);
          setWorkspace(a.workspace);
          setLoadError("");
        }
      })
      .catch((e) => {
        if (alive) setLoadError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [demo, data, version]);
  useEffect(() => {
    document.documentElement.dataset.theme = prefs.theme || "light";
    return () => {
      delete document.documentElement.dataset.theme;
    };
  }, [prefs.theme]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((v) => !v);
      }
      if (e.key === "Escape") setMobile(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  useEffect(() => {
    if (new URLSearchParams(location.search).get("tour") === "1") {
      setEntry(false);
      sessionStorage.setItem("ofneeds-crm.demo.entered", "yes");
      setTour(0);
    }
  }, []);
  const context: CRMContext = {
    demo,
    user,
    page,
    recordId,
    data,
    options,
    summary,
    prefs,
    workspace,
    setWorkspace,
    write: demo || user?.role !== "viewer",
    go,
    notify,
    updatePrefs,
    refresh,
    startTour: (step = 0) => {
      setEntry(false);
      setTour(step);
    },
    list: async (kind, filters = {}) =>
      demo
        ? demoList(data, kind, filters)
        : api(`/api/crm/${kind}?${new URLSearchParams(filters)}`),
    get: async (kind, id) => {
      if (demo) {
        const row = data[kind].find((r) => r.id === id);
        if (!row) throw new Error("Record not found.");
        return row;
      }
      return api(`/api/crm/${kind}/${id}`);
    },
    save: async (kind, row, id) => {
      if (demo) {
        const result = demoSave(dataRef.current, kind, row, id);
        dataRef.current = result.data;
        setData(result.data);
        const history = JSON.parse(
          sessionStorage.getItem("ofneeds-crm.demo.activity") || "[]",
        );
        sessionStorage.setItem(
          "ofneeds-crm.demo.activity",
          JSON.stringify(
            [
              {
                id: crypto.randomUUID(),
                text: `${id ? "Updated" : "Added"} ${result.row.name} · Sample`,
                created: new Date().toISOString(),
              },
              ...history,
            ].slice(0, 30),
          ),
        );
        refresh();
        return result.row;
      }
      const result = await api(
        `/api/crm/${kind}${id ? "/" + id : ""}`,
        id ? "PATCH" : "POST",
        row,
      );
      refresh();
      return result;
    },
    remove: async (kind, id) => {
      if (demo) {
        canDelete(dataRef.current, kind, id);
        const next = {
          ...dataRef.current,
          [kind]: dataRef.current[kind].filter((r) => r.id !== id),
        };
        dataRef.current = next;
        setData(next);
        saveDemo(next);
      } else await api(`/api/crm/${kind}/${id}`, "DELETE", {});
      refresh();
    },
    openForm: (kind, row) => {
      if (!demo && user?.role === "viewer") {
        notify("Your role has read-only access.");
        return;
      }
      setForm({ kind, row });
    },
  };
  const overdue = demo
    ? data["follow-ups"].filter(
        (t) =>
          t.status !== "Completed" &&
          t.date < new Date().toISOString().slice(0, 10),
      ).length
    : summary?.overdue || 0;
  const allModules = modules.flatMap((g) => g.items);
  return (
    <CRM.Provider value={context}>
      <div
        className={`workspace ${prefs.collapsed ? "collapsed" : ""} ${demo ? "is-demo" : ""}`}
      >
        {demo && (
          <div className="demo-toolbar">
            <span>
              <i className="dot" />
              <b>Demo mode</b>
              <span className="demo-disclaimer">
                Fictional sample data · private to this browser tab
              </span>
            </span>
            <div>
              <button onClick={() => setTour(0)}>
                <Icon name="CirclePlay" size={15} />
                Guided tour
              </button>
              <button onClick={() => setConfirmReset(true)}>
                <Icon name="RotateCcw" size={14} />
                Reset demo
              </button>
              <a data-route href="/">
                Exit demo
              </a>
              <a data-route className="demo-signup" href="/signup">
                Create workspace
                <Icon name="ArrowUpRight" size={14} />
              </a>
            </div>
          </div>
        )}
        {mobile && (
          <button
            className="mobile-backdrop"
            onClick={() => setMobile(false)}
            aria-label="Close navigation"
          />
        )}
        <aside
          className={`sidebar ${mobile ? "mobile-open" : ""}`}
          aria-label="Workspace navigation"
        >
          <a
            data-route
            href={demo ? "/demo/dashboard" : "/dashboard"}
            className="sidebar-brand"
          >
            <Logo compact={prefs.collapsed} />
          </a>
          <div className="workspace-switch">
            <span className="workspace-mark">
              {workspace.name?.slice(0, 1) || "O"}
            </span>
            {!prefs.collapsed && (
              <span>
                <b>{workspace.name}</b>
                <small>{demo ? "Sample workspace" : "Private workspace"}</small>
              </span>
            )}
            <Icon name="ChevronsUpDown" size={14} />
          </div>
          <div className="sidebar-scroll">
            {(prefs.pinned || []).length > 0 && (
              <div className="nav-group">
                <span>PINNED</span>
                {allModules
                  .filter((i) => prefs.pinned?.includes(i[0]))
                  .map(([id, label, icon]) => (
                    <button key={id} onClick={() => go(id)} title={label}>
                      <Icon name={icon} />
                      <span>{label}</span>
                    </button>
                  ))}
              </div>
            )}
            {modules.map((group) => (
              <div className="nav-group" key={group.group}>
                <span>{group.group}</span>
                {group.items.map(([id, label, icon]) => (
                  <div
                    key={id}
                    className={`nav-item ${page === id ? "active" : ""}`}
                  >
                    <button onClick={() => go(id)} title={label}>
                      <Icon name={icon} />
                      <span>{label}</span>
                      {id === "follow-ups" && overdue > 0 && (
                        <b className="nav-count">{overdue}</b>
                      )}
                    </button>
                    {!prefs.collapsed && (
                      <button
                        className={`pin ${prefs.pinned?.includes(id) ? "pinned" : ""}`}
                        title={`Pin ${label}`}
                        aria-label={`Pin ${label}`}
                        onClick={() =>
                          updatePrefs({
                            pinned: prefs.pinned?.includes(id)
                              ? prefs.pinned.filter((i) => i !== id)
                              : [...(prefs.pinned || []), id],
                          })
                        }
                      >
                        <Icon name="Pin" size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="sidebar-bottom">
            <button onClick={() => setPanel("help")} title="Help center">
              <Icon name="CircleHelp" />
              <span>Help & getting started</span>
              <Icon name="ArrowUpRight" size={14} />
            </button>
            <button
              onClick={() => updatePrefs({ collapsed: !prefs.collapsed })}
              title="Toggle sidebar"
              aria-label="Toggle sidebar"
            >
              <Icon
                name={prefs.collapsed ? "PanelLeftOpen" : "PanelLeftClose"}
              />
              <span>Collapse sidebar</span>
              <kbd>⌘</kbd>
            </button>
          </div>
        </aside>
        <div className="workspace-body">
          <header className="topbar">
            <button
              className="icon-button mobile-menu"
              onClick={() => setMobile((v) => !v)}
              aria-label="Open navigation"
            >
              <Icon name="Menu" />
            </button>
            <div className="breadcrumbs">
              <button
                onClick={() => go("dashboard")}
                aria-label="Workspace home"
              >
                <Icon name="House" size={16} />
              </button>
              <Icon name="ChevronRight" size={13} />
              <button onClick={() => (recordId ? go(page) : undefined)}>
                {labelOf(page)}
              </button>
              {recordId && (
                <>
                  <Icon name="ChevronRight" size={13} />
                  <span>Profile</span>
                </>
              )}
            </div>
            <div className="topbar-actions">
              <button
                className="search-trigger"
                aria-label="Search workspace (Ctrl+K)"
                onClick={() => setPalette(true)}
              >
                <Icon name="Search" size={16} />
                <span>Search anything…</span>
                <kbd>⌘ K</kbd>
              </button>
              <button
                className="icon-button"
                title="Quick create"
                aria-label="Quick create"
                onClick={() => setPanel(panel === "create" ? "" : "create")}
              >
                <Icon name="CirclePlus" />
              </button>
              <button
                className="icon-button notification-trigger"
                title="Notifications"
                aria-label="Notifications"
                onClick={() =>
                  setPanel(panel === "notifications" ? "" : "notifications")
                }
              >
                <Icon name="Bell" />
                {(overdue > 0 || notifications.some((n) => !n.read_at)) &&
                  prefs.notifications !== false && <i />}
              </button>
              <button
                className="icon-button help-trigger"
                aria-label="Help center"
                onClick={() => setPanel("help")}
              >
                <Icon name="CircleHelp" />
              </button>
              <button
                className="icon-button"
                aria-label="Toggle color theme"
                title="Toggle color theme"
                onClick={() =>
                  updatePrefs({
                    theme: prefs.theme === "dark" ? "light" : "dark",
                  })
                }
              >
                <Icon name={prefs.theme === "dark" ? "Sun" : "Moon"} />
              </button>
              <button
                className="profile-trigger"
                aria-label="User profile menu"
                onClick={() => setPanel(panel === "profile" ? "" : "profile")}
              >
                <Avatar name={user?.name || "Alex Morgan"} />
                <Icon name="ChevronDown" size={13} />
              </button>
            </div>
          </header>
          {panel && (
            <div className="top-panel">
              <div className="panel-title">
                <h3>
                  {panel === "help"
                    ? "How can we help?"
                    : panel === "notifications"
                      ? "Your notifications"
                      : panel === "profile"
                        ? "Your workspace"
                        : "Quick create"}
                </h3>
                <button
                  className="icon-button"
                  aria-label="Close panel"
                  onClick={() => setPanel("")}
                >
                  <Icon name="X" size={16} />
                </button>
              </div>
              {panel === "create" ? (
                <div className="menu-list">
                  {[
                    ["vendors", "Building2", "New vendor"],
                    ["brands", "BadgeCheck", "New brand"],
                    ["products", "Package", "New product"],
                    ["rfqs", "ClipboardList", "New RFQ"],
                    ["follow-ups", "CalendarClock", "New follow-up"],
                  ].map(([kind, icon, text]) => (
                    <button
                      disabled={!context.write}
                      key={kind}
                      onClick={() => {
                        context.openForm(kind);
                        setPanel("");
                      }}
                    >
                      <Icon name={icon} />
                      {text}
                      <Icon name="ChevronRight" size={14} />
                    </button>
                  ))}
                </div>
              ) : panel === "help" ? (
                <div className="help-panel">
                  <button
                    className="button primary"
                    onClick={() => {
                      setTour(0);
                      setPanel("");
                    }}
                  >
                    <Icon name="CirclePlay" />
                    Replay product tour
                  </button>
                  {helpTopics.map(([title, copy]) => (
                    <details key={title}>
                      <summary>{title}</summary>
                      <p>{copy}</p>
                    </details>
                  ))}
                  <a data-route href="/help">
                    Open full help center ↗
                  </a>
                </div>
              ) : panel === "notifications" ? (
                <div className="notification-list">
                  {notifications.map((n) => (
                    <article key={n.id}>
                      <span className="activity-dot" />
                      <div>
                        <b>{n.text}</b>
                        <small>{new Date(n.created).toLocaleString()}</small>
                        <button
                          className="button ghost small"
                          onClick={async () => {
                            try {
                              await api(
                                "/api/services/notifications/read",
                                "POST",
                                { id: n.id },
                              );
                              go(
                                n.record_kind || "activity",
                                n.record_id || undefined,
                              );
                              refresh();
                            } catch (e) {
                              notify((e as Error).message);
                            }
                          }}
                        >
                          {n.read_at ? "Open record" : "Read and open"}
                        </button>
                      </div>
                    </article>
                  ))}
                  <p>
                    {overdue
                      ? `${overdue} follow-ups need your attention.`
                      : "You’re all caught up."}
                  </p>
                  {summary?.activity?.slice(0, 8).map((a: any) => (
                    <article key={a.id}>
                      <span className="activity-dot" />
                      <div>
                        <b>{a.text}</b>
                        <small>{new Date(a.created).toLocaleString()}</small>
                      </div>
                    </article>
                  ))}
                  <button
                    className="button outline"
                    onClick={() => go("follow-ups")}
                  >
                    Review follow-ups
                  </button>
                </div>
              ) : (
                <div className="menu-list">
                  <p>
                    <b>{user?.name || "Alex Morgan"}</b>
                    <small>{demo ? "Demo explorer" : user?.email}</small>
                  </p>
                  <button onClick={() => go("settings")}>
                    <Icon name="Settings2" />
                    Workspace settings
                  </button>
                  <button
                    onClick={() => {
                      setPanel("");
                      setTour(0);
                    }}
                  >
                    <Icon name="CirclePlay" />
                    Replay product tour
                  </button>
                  <button onClick={() => (demo ? navigate("/") : onLogout())}>
                    <Icon name="LogOut" />
                    {demo ? "Exit demo" : "Sign out"}
                  </button>
                </div>
              )}
            </div>
          )}
          <main className="content" id="main-content">
            <a className="skip-link" href="#page-content">
              Skip to page content
            </a>
            {loadError ? (
              <div className="error" role="alert">
                {loadError}
                <button onClick={refresh}>Retry</button>
              </div>
            ) : !summary ? (
              <Skeleton />
            ) : (
              <div id="page-content" key={`${page}/${recordId || ""}`}>
                {page === "dashboard" ? (
                  <Dashboard />
                ) : page === "vendors" ? (
                  recordId ? (
                    <VendorProfile id={recordId} />
                  ) : (
                    <Directory version={version} />
                  )
                ) : [
                    "brands",
                    "contacts",
                    "products",
                    "prices",
                    "rfqs",
                    "follow-ups",
                    "documents",
                  ].includes(page) ? (
                  <RecordList
                    kind={page === "prices" ? "products" : page}
                    version={version}
                    recordId={recordId}
                  />
                ) : ["reports", "analytics"].includes(page) ? (
                  <Suspense fallback={<Skeleton />}>
                    <Reports />
                  </Suspense>
                ) : page === "categories" ? (
                  <div>
                    <PageHeader
                      title="Product categories"
                      description="A clear taxonomy for your supplier network."
                    />
                    <div className="category-grid">
                      {[
                        "Apparel",
                        "Electronics",
                        "Luggage",
                        "Bags",
                        "Drinkware",
                        "Stationery",
                        "Printing",
                        "Packaging",
                      ].map((c, i) => (
                        <button
                          key={c}
                          className="card category-card"
                          onClick={() => {
                            go("vendors");
                            sessionStorage.setItem(
                              "ofneeds-crm.next-filter",
                              JSON.stringify({ category: c }),
                            );
                          }}
                        >
                          <Icon
                            name={
                              [
                                "Shirt",
                                "Headphones",
                                "Luggage",
                                "Backpack",
                                "CupSoda",
                                "NotebookPen",
                                "Printer",
                                "Package",
                              ][i]
                            }
                            size={32}
                          />
                          <h3>{c}</h3>
                          <span>
                            Explore suppliers
                            <Icon name="ArrowRight" size={14} />
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : page === "activity" ? (
                  <>
                    <PageHeader
                      title="Recent activity"
                      description="A trace of changes across your workspace."
                    />
                    <div className="card activity-page">
                      {summary.activity.map((a: any) => (
                        <article key={a.id}>
                          <span className="activity-dot" />
                          <div>
                            <h3>{a.text}</h3>
                            <small>
                              {new Date(a.created).toLocaleString()}
                            </small>
                          </div>
                        </article>
                      ))}
                      {!summary.activity.length && (
                        <Empty title="No activity yet" />
                      )}
                    </div>
                  </>
                ) : page === "supplier-preview" ? (
                  <SupplierPreview />
                ) : [
                    "projects",
                    "purchase-orders",
                    "customization",
                    "samples",
                    "approvals",
                    "verifications",
                    "supplier-access",
                    "stock-freshness",
                    "performance",
                    "scheduled-reports",
                    "collaboration",
                    "automations",
                    "data-quality",
                    "delivery",
                    "account-security",
                    "integrations",
                    "billing",
                    "audit",
                    "service-health",
                  ].includes(page) ? (
                  <Suspense fallback={<Skeleton />}>
                    <Operations />
                  </Suspense>
                ) : page === "settings" ? (
                  <Settings />
                ) : page === "import" ? (
                  <ImportExport />
                ) : page === "team" ? (
                  <Team />
                ) : (
                  <Empty
                    title="Page not found"
                    description="Choose a module from the sidebar."
                    action={() => go("dashboard")}
                  />
                )}
              </div>
            )}
          </main>
          <footer className="workspace-footer">
            <span>
              OfNeeds Vendor CRM <span className="footer-divider">/</span> A
              more connected way to source.
            </span>
            <span>
              <i className="dot" />
              {demo ? "Isolated demo workspace" : "Private workspace"}
            </span>
          </footer>
        </div>
        {message && (
          <div className="toast" role="status">
            <Icon name="CircleCheck" />
            {message}
            <button
              aria-label="Dismiss notification"
              onClick={() => setMessage("")}
            >
              <Icon name="X" size={14} />
            </button>
          </div>
        )}
        {summary && !demo && <Onboarding />}
        {palette && <CommandPalette onClose={() => setPalette(false)} />}
        {form &&
          (form.kind === "vendors" ? (
            <VendorWizard row={form.row} onClose={() => setForm(null)} />
          ) : (
            <RecordForm
              kind={form.kind}
              row={form.row}
              onClose={() => setForm(null)}
            />
          ))}
        {tour !== null && summary && (
          <GuidedTour step={tour} setStep={setTour} />
        )}
        {entry && summary && (
          <Modal
            wide
            title="Welcome to the OfNeeds CRM Interactive Demo"
            onClose={() => {
              setEntry(false);
              sessionStorage.setItem("ofneeds-crm.demo.entered", "yes");
            }}
          >
            <div className="demo-entry">
              <span className="entry-icon">
                <Icon name="Network" size={38} />
              </span>
              <h2>
                A little exploring.
                <br />A lot of possibilities.
              </h2>
              <p>
                Experience how easily you can discover suppliers, manage brands,
                compare quotations, and organize your vendor network.
              </p>
              <Badge tone="blue">
                Fictional sample data · No login required
              </Badge>
              <div className="demo-entry-actions">
                {[
                  ["Start guided tour", "CirclePlay", () => setTour(0)],
                  [
                    "Explore dashboard",
                    "LayoutDashboard",
                    () => go("dashboard"),
                  ],
                  ["Try vendor search", "Search", () => go("vendors")],
                  [
                    "Compare supplier prices",
                    "GitCompareArrows",
                    () => go("products"),
                  ],
                ].map(([label, icon, action], i) => (
                  <button
                    key={String(label)}
                    className={`button ${i === 0 ? "primary" : "outline"}`}
                    onClick={() => {
                      setEntry(false);
                      sessionStorage.setItem("ofneeds-crm.demo.entered", "yes");
                      (action as () => void)();
                    }}
                  >
                    <Icon name={String(icon)} />
                    {String(label)}
                    <Icon name="ArrowRight" size={15} />
                  </button>
                ))}
              </div>
              <small>
                Changes stay in this tab. Reset anytime to start fresh.
              </small>
            </div>
          </Modal>
        )}
        {confirmReset && (
          <Modal
            title="Reset your sample workspace?"
            onClose={() => setConfirmReset(false)}
          >
            <div className="modal-body">
              <p>
                This restores the fictional dataset and removes changes made in
                this demo tab. Real workspaces are unaffected.
              </p>
              <div className="form-actions">
                <button
                  className="button outline"
                  onClick={() => setConfirmReset(false)}
                >
                  Cancel
                </button>
                <button
                  className="button primary"
                  onClick={() => {
                    setData(resetDemo());
                    setConfirmReset(false);
                    setForm(null);
                    go("dashboard");
                    refresh();
                    notify("Demo restored to its original sample data.");
                  }}
                >
                  Reset demo
                </button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </CRM.Provider>
  );
}
export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  const c = useCRMOptional();
  return (
    <header className="page-header">
      <div>
        <span className="eyebrow">
          {c?.demo ? "SAMPLE WORKSPACE" : "YOUR CONNECTED WORKSPACE"}
        </span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="page-actions">
        {children}
        <button
          className="button ghost small show-how"
          onClick={() =>
            c?.startTour(
              c.page === "vendors"
                ? 2
                : c.page === "brands"
                  ? 3
                  : c.page === "products"
                    ? 5
                    : c.page === "rfqs"
                      ? 6
                      : c.page === "follow-ups"
                        ? 7
                        : 0,
            )
          }
        >
          <Icon name="CircleHelp" size={15} />
          Show me how
        </button>
      </div>
    </header>
  );
}
import { useCRM } from "./context";
function useCRMOptional() {
  return useCRM();
}
function CommandPalette({ onClose }: { onClose: () => void }) {
  const c = useCRM(),
    [query, setQuery] = useState(""),
    [results, setResults] = useState<
      { id: string; kind: string; name: string }[]
    >([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(async () => {
      if (!query) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const result = c.demo
          ? Object.entries(c.data)
              .flatMap(([kind, rows]) =>
                Array.isArray(rows)
                  ? rows
                      .filter((r) =>
                        JSON.stringify(r)
                          .toLowerCase()
                          .includes(query.toLowerCase()),
                      )
                      .map((r) => ({ id: r.id, name: r.name, kind }))
                  : [],
              )
              .slice(0, 30)
          : await api("/api/crm/search?q=" + encodeURIComponent(query));
        if (alive) {
          setResults(result);
          setError("");
        }
      } catch (e) {
        if (alive) setError((e as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    }, 220);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query]);
  return (
    <Modal title="Search your workspace" onClose={onClose}>
      <div className="command-input">
        <Icon name="Search" />
        <input
          autoFocus
          aria-label="Global search"
          placeholder="Vendors, brands, contacts, products, RFQs…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <kbd>ESC</kbd>
      </div>
      <div className="command-results">
        {error && <p className="error">{error}</p>}
        {loading ? (
          <p>Searching…</p>
        ) : (
          results.map((r) => (
            <button
              key={r.kind + r.id}
              onClick={() => {
                c.go(r.kind, r.id);
                onClose();
              }}
            >
              <Icon name={r.kind === "vendors" ? "Building2" : "Search"} />
              <span>
                {r.name}
                <small>
                  {labelOf(r.kind)}
                  {c.demo ? " · Sample" : ""}
                </small>
              </span>
              <Icon name="CornerDownLeft" size={15} />
            </button>
          ))
        )}
        {!query &&
          modules
            .flatMap((g) => g.items)
            .map(([id, name, icon]) => (
              <button
                key={id}
                onClick={() => {
                  c.go(id);
                  onClose();
                }}
              >
                <Icon name={icon} />
                <span>Go to {name}</span>
                <Icon name="ArrowRight" size={15} />
              </button>
            ))}
        {query && !loading && !results.length && (
          <Empty
            title="No matching records"
            description="Try a different name or keyword."
          />
        )}
      </div>
    </Modal>
  );
}
