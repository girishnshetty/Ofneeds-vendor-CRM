import { useEffect, useState } from "react";
import { useCRM } from "./context";
import { useOperations, readOps } from "./opsClient";
import { PageHeader } from "./Workspace";
import {
  Icon,
  Modal,
  Field,
  Badge,
  Status,
  Empty,
  Money,
  Skeleton,
} from "./ui";
import Lookup from "./Lookup";
import { orderTotals, performance } from "../shared/operations.mjs";
import type { Row } from "./types";
import { api, download } from "./client";
import {
  Approvals,
  Collaboration,
  DataQuality,
  Connections,
  SecurityCenter,
  SupplierAccess,
} from "./Workspaces";
const pages: Record<
  string,
  { kind: string; title: string; description: string; icon: string }
> = {
  projects: {
    kind: "projects",
    title: "Gifting projects",
    description:
      "Bring the client, budget, event and delivery deadline together.",
    icon: "Boxes",
  },
  "purchase-orders": {
    kind: "orders",
    title: "Purchase orders",
    description:
      "From an approved sourcing decision to acknowledged, received goods.",
    icon: "ClipboardList",
  },
  customization: {
    kind: "customizations",
    title: "Branding & artwork",
    description: "Version product customization and record artwork approvals.",
    icon: "Pencil",
  },
  samples: {
    kind: "samples",
    title: "Sample requests",
    description: "Track sample requests, receipt and quality acceptance.",
    icon: "Package",
  },
  performance: {
    kind: "scorecards",
    title: "Supplier performance",
    description:
      "Review delivery outcomes and your team’s recorded supplier ratings.",
    icon: "ChartNoAxesCombined",
  },
  automations: {
    kind: "automations",
    title: "Follow-up automation",
    description: "Assign recurring tasks and surface overdue work.",
    icon: "CalendarClock",
  },
  verifications: {
    kind: "verifications",
    title: "Supplier verification",
    description: "Review supporting documents and authorization validity.",
    icon: "ShieldCheck",
  },
  "scheduled-reports": {
    kind: "report-schedules",
    title: "Scheduled reports",
    description: "Generate private report snapshots and queue delivery.",
    icon: "Files",
  },
};
export default function Operations() {
  const c = useCRM(),
    ops = useOperations(),
    page = pages[c.page],
    [result, setResult] = useState<any>({ rows: [], total: 0 }),
    [overview, setOverview] = useState<any>(null),
    [loading, setLoading] = useState(true),
    [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [form, setForm] = useState<Row | {} | null>(null),
    [order, setOrder] = useState<Row | null>(null),
    [pageNumber, setPageNumber] = useState(1),
    [projectRows, setProjectRows] = useState<Row[]>([]);
  useEffect(() => {
    if (!page) return;
    let alive = true;
    setLoading(true);
    const timer = setTimeout(
      () =>
        Promise.all([
          ops.request(
            `/records/${page.kind}?${new URLSearchParams({ q: query, page: String(pageNumber) })}`,
          ),
          ops.request("/overview"),
          ops.request("/records/projects?limit=100"),
        ])
          .then(([r, o, p]) => {
            if (alive) {
              setResult(r);
              setOverview(o);
              setProjectRows(p.rows);
              setError("");
            }
          })
          .catch((e) => {
            if (alive) setError(e.message);
          })
          .finally(() => {
            if (alive) setLoading(false);
          }),
      150,
    );
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [c.page, ops.version, query, pageNumber]);
  if (c.page === "approvals") return <Approvals />;
  if (c.page === "collaboration") return <Collaboration />;
  if (c.page === "data-quality") return <DataQuality />;
  if (
    [
      "delivery",
      "integrations",
      "billing",
      "audit",
      "service-health",
      "stock-freshness",
    ].includes(c.page)
  )
    return <Connections section={c.page} />;
  if (c.page === "account-security") return <SecurityCenter />;
  if (c.page === "supplier-access") return <SupplierAccess />;
  if (!page) return <Empty title="Choose an operations module" />;
  const run = async (path: string, body: any) => {
    try {
      await ops.request(path, "POST", body);
      ops.refresh();
      c.notify("Workflow updated.");
    } catch (e) {
      c.notify((e as Error).message);
    }
  };
  return (
    <>
      <PageHeader title={page.title} description={page.description}>
        <button
          disabled={
            !c.write ||
            (!c.demo &&
              ["verifications", "report-schedules"].includes(page.kind) &&
              c.user?.role !== "owner")
          }
          className="button primary"
          onClick={() => setForm({})}
        >
          <Icon name="Plus" size={16} />
          New{" "}
          {page.kind === "orders"
            ? "purchase order"
            : page.kind === "scorecards"
              ? "evaluation"
              : page.kind === "report-schedules"
                ? "schedule"
                : page.kind.slice(0, -1)}
        </button>
      </PageHeader>
      <div className="ops-intro card">
        <span className="feature-icon">
          <Icon name={page.icon} size={24} />
        </span>
        <div>
          <b>
            {c.demo
              ? "Practice the complete workflow with sample records."
              : "A connected sourcing workflow, with a clear history."}
          </b>
          <p>
            {page.kind === "orders"
              ? "Draft → Submit → Owner approval → Issue → Supplier acknowledgement → Receive. Creating or issuing a record here does not send a message."
              : page.kind === "automations"
                ? "The local worker creates due tasks and notifications. External delivery requires a configured provider and explicit dispatch."
                : page.kind === "customizations"
                  ? "Approved artwork is retained. Create a new version to change the specification."
                  : page.kind === "verifications"
                    ? "Approval requires an uploaded supporting file belonging to this supplier. Recorded verification is performed by your team."
                    : page.kind === "report-schedules"
                      ? "Reports are generated locally and saved privately. Queued messages are not automatically sent."
                      : "All figures come from stored records. Demo data is fictional."}
          </p>
        </div>
      </div>
      <div className="card table-toolbar">
        <div className="search-field">
          <Icon name="Search" size={17} />
          <input
            aria-label={`Search ${page.title}`}
            placeholder="Search records…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPageNumber(1);
            }}
          />
        </div>
        <span className="toolbar-spacer" />
        <span className="muted">
          {result.total} records{c.demo ? " · Sample data" : ""}
        </span>
        {["automations", "report-schedules"].includes(page.kind) && (
          <button
            disabled={c.demo || c.user?.role !== "owner"}
            className="button outline small"
            onClick={async () => {
              try {
                const r = await api("/api/services/process-jobs", "POST", {});
                c.notify(r.notice);
                ops.refresh();
              } catch (e) {
                c.notify((e as Error).message);
              }
            }}
          >
            <Icon name="Play" size={14} />
            Process due jobs
          </button>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <Skeleton />
      ) : result.rows.length ? (
        <div className="ops-grid">
          {result.rows.map((r: Row) => (
            <article className="card ops-record" key={r.id}>
              <div className="ops-record-top">
                <span className="feature-icon">
                  <Icon name={page.icon} />
                </span>
                <Status value={r.status || "Draft"} />
              </div>
              <span className="eyebrow">
                {r.number || (c.demo ? "SAMPLE RECORD" : r.id.slice(0, 8))}
              </span>
              <h2>{r.name}</h2>
              <p>
                {r.client ||
                  c.options.vendors.find((v) => v.id === r.vendorId)?.name ||
                  r.method ||
                  r.report ||
                  ""}
              </p>
              <dl>
                {(page.kind === "projects"
                  ? [
                      ["Budget", <Money value={r.budget || 0} />],
                      ["Delivery deadline", r.deadline || "Not set"],
                    ]
                  : page.kind === "orders"
                    ? [
                        [
                          "Order total",
                          <Money value={(r.totals?.total || 0) / 100} />,
                        ],
                        ["Lines", r.lines?.length || 0],
                        ["Delivery due", r.dueDate || "Not set"],
                      ]
                    : page.kind === "scorecards"
                      ? [
                          ["Quality", `${r.quality}/5`],
                          ["Communication", `${r.communication}/5`],
                          ["Value", `${r.value}/5`],
                        ]
                      : page.kind === "automations" ||
                          page.kind === "report-schedules"
                        ? [
                            ["Repeats", `Every ${r.frequencyDays} days`],
                            ["Next run", r.nextDate],
                            ["Enabled", r.enabled === false ? "No" : "Yes"],
                          ]
                        : [
                            ["Version", r.version || 1],
                            [
                              "Due / valid until",
                              r.dueDate || r.validUntil || "Not set",
                            ],
                          ]
                ).map(([label, value], i) => (
                  <div key={i}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              {r.notes && <p className="ops-notes">{r.notes}</p>}
              <div className="ops-record-actions">
                {(page.kind !== "orders" || r.status === "Draft") && (
                  <button
                    disabled={!c.write}
                    className="button outline small"
                    onClick={() => setForm(r)}
                  >
                    <Icon name="Pencil" size={13} />
                    Edit
                  </button>
                )}
                {page.kind === "orders" && (
                  <>
                    <button
                      className="button outline small"
                      onClick={() => setOrder(r)}
                    >
                      Open order
                      <Icon name="ArrowUpRight" size={13} />
                    </button>
                    {r.status === "Draft" && (
                      <button
                        disabled={!c.write}
                        className="button primary small"
                        onClick={() => run(`/orders/${r.id}/submit`, {})}
                      >
                        Submit for approval
                      </button>
                    )}
                    {r.status === "Approved" && (
                      <button
                        disabled={
                          !c.write || (!c.demo && c.user?.role !== "owner")
                        }
                        className="button primary small"
                        onClick={() =>
                          run(`/orders/${r.id}/action`, { action: "issue" })
                        }
                      >
                        Issue to portal
                      </button>
                    )}
                  </>
                )}
                {[
                  "customizations",
                  "samples",
                  "verifications",
                  "projects",
                ].includes(page.kind) && (
                  <TransitionButtons
                    kind={page.kind}
                    row={r}
                    request={ops.request}
                    refresh={ops.refresh}
                  />
                )}
              </div>
              {page.kind === "scorecards" && (
                <PerformanceSummary vendorId={r.vendorId} />
              )}
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title={`No ${page.kind.replace("-", " ")} yet`}
          description="Create your first record to start this workflow."
          action={() => setForm({})}
        />
      )}
      <div className="pagination">
        <span>{result.total} records</span>
        <div>
          <button
            className="button outline small"
            disabled={pageNumber === 1}
            onClick={() => setPageNumber((p) => p - 1)}
          >
            Previous
          </button>
          <span>Page {pageNumber}</span>
          <button
            className="button outline small"
            disabled={c.demo || pageNumber * 20 >= result.total}
            onClick={() => setPageNumber((p) => p + 1)}
          >
            Next
          </button>
        </div>
      </div>
      {form && (
        <OperationForm
          kind={page.kind}
          row={form as Row}
          members={overview?.members || []}
          projects={projectRows}
          request={ops.request}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            ops.refresh();
          }}
        />
      )}
      {order && (
        <OrderDetail
          row={order}
          onClose={() => setOrder(null)}
          request={ops.request}
          refresh={() => {
            setOrder(null);
            ops.refresh();
          }}
        />
      )}
    </>
  );
}
function TransitionButtons({
  kind,
  row,
  request,
  refresh,
}: {
  kind: string;
  row: Row;
  request: any;
  refresh: () => void;
}) {
  const c = useCRM(),
    [decision, setDecision] = useState(""),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false);
  const choices: Record<string, Record<string, string[]>> = {
    customizations: {
      Draft: ["Submitted"],
      Submitted: ["Approved", "Changes requested"],
      "Changes requested": ["Draft"],
    },
    samples: {
      Draft: ["Requested"],
      Requested: ["Received", "Cancelled"],
      Received: ["Accepted", "Rejected"],
    },
    verifications: { Draft: ["Approved", "Rejected"] },
    projects: {
      Planning: ["Sourcing", "Cancelled"],
      Sourcing: ["In progress", "Cancelled"],
      "In progress": ["Completed", "Cancelled"],
    },
  };
  return (
    <>
      {(choices[kind]?.[row.status] || []).map((status) => (
        <button
          disabled={!c.write}
          className="button ghost small"
          key={status}
          onClick={() => setDecision(status)}
        >
          {status === "Submitted" ? "Submit for review" : status}
        </button>
      ))}
      {kind === "customizations" && row.status === "Approved" && (
        <span className="badge green">Approved version retained</span>
      )}
      {decision && (
        <Modal title={`Move to ${decision}?`} onClose={() => setDecision("")}>
          <form
            className="modal-body"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await request(`/records/${kind}/${row.id}/transition`, "POST", {
                  status: decision,
                  reason,
                });
                setDecision("");
                refresh();
                c.notify("Status updated.");
              } catch (e) {
                c.notify((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Review / decision note">
              <textarea
                required={[
                  "Approved",
                  "Rejected",
                  "Changes requested",
                ].includes(decision)}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <button disabled={busy} className="button primary">
              {busy ? "Saving…" : "Confirm transition"}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
function PerformanceSummary({ vendorId }: { vendorId: string }) {
  const c = useCRM(),
    [value, setValue] = useState<any>(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (c.demo) {
      const data = readOps();
      setValue(performance(data.orders, data.scorecards, vendorId));
    } else
      api("/api/ops/scorecards/" + vendorId)
        .then(setValue)
        .catch((e) => setError(e.message));
  }, [vendorId, c.summary]);
  if (error) return <p className="error">{error}</p>;
  if (!value) return null;
  return (
    <div className="performance-strip">
      <span>{value.completedOrders} completed orders</span>
      <span>
        {value.onTimePercent === null
          ? "No dated delivery observations"
          : `${value.onTimePercent}% on time · ${value.deliveryObservations} deliveries`}
      </span>
    </div>
  );
}
function OperationForm({
  kind,
  row,
  members,
  projects,
  request,
  onClose,
  onSaved,
}: {
  kind: string;
  row: Partial<Row>;
  members: any[];
  projects: Row[];
  request: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const c = useCRM(),
    [v, setV] = useState<any>({
      name: "",
      budget: 0,
      quantity: 1,
      frequencyDays: 7,
      nextDate: new Date().toISOString().slice(0, 10),
      escalateAfterDays: 3,
      enabled: true,
      version: 1,
      quality: 3,
      communication: 3,
      value: 3,
      report: "network",
      lines: [],
      ...row,
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const set = (key: string, value: any) =>
    setV((p: any) => ({ ...p, [key]: value }));
  const input = (
    label: string,
    key: string,
    type = "text",
    required = false,
  ) => (
    <Field label={label}>
      <input
        type={type}
        required={required}
        value={v[key] ?? ""}
        min={type === "number" ? 0 : undefined}
        onChange={(e) =>
          set(key, type === "number" ? Number(e.target.value) : e.target.value)
        }
      />
    </Field>
  );
  const lookup = (label: string, key: string, collection: string) => (
    <Field label={label}>
      <Lookup
        kind={collection}
        value={v[key] || ""}
        onChange={(value) => set(key, value)}
        label={label}
      />
    </Field>
  );
  const project = (
    <Field label="Gifting project">
      <select
        value={v.projectId || ""}
        onChange={(e) => set("projectId", e.target.value)}
      >
        <option value="">No project</option>
        {projects.map((p) => (
          <option value={p.id} key={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </Field>
  );
  let total: any;
  try {
    total = v.lines.length ? orderTotals(v.lines) : null;
  } catch {
    total = null;
  }
  return (
    <Modal
      wide
      title={`${row.id ? "Edit" : "Create"} ${kind === "orders" ? "purchase order" : kind === "scorecards" ? "supplier evaluation" : kind.replace("-", " ").replace(/s$/, "")}`}
      onClose={onClose}
    >
      <form
        className="modal-body"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError("");
          try {
            await request(
              `/records/${kind}${row.id ? "/" + row.id : ""}`,
              row.id ? "PATCH" : "POST",
              v,
            );
            onSaved();
            c.notify("Record saved.");
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {input("Name *", "name", "text", true)}
        <div className="form-grid">
          {kind === "projects" && (
            <>
              {input("Client / company", "client")}
              {input("Event or campaign", "event")}
              {input("Budget (₹)", "budget", "number")}
              {input("Delivery deadline", "deadline", "date")}
              {input("Delivery address", "deliveryAddress")}
              <Field label="Project owner">
                <select
                  value={v.ownerId || ""}
                  onChange={(e) => set("ownerId", e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option value={m.id} key={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          )}
          {[
            "orders",
            "samples",
            "scorecards",
            "automations",
            "verifications",
          ].includes(kind) && lookup("Supplier *", "vendorId", "vendors")}
          {["customizations", "samples"].includes(kind) &&
            lookup("Product *", "productId", "products")}
          {["orders", "customizations", "samples"].includes(kind) && project}
          {kind === "orders" && (
            <>
              {input("Delivery due", "dueDate", "date")}
              {input("Shipping address", "shippingAddress")}
            </>
          )}
          {kind === "customizations" && (
            <>
              {lookup("Supplier", "vendorId", "vendors")}
              {input("Customization method", "method")}
              {input("Logo placement", "placement")}
              {input("Colours", "colours")}
              {input("Sizes", "sizes")}
              {input("Version", "version", "number")}
              {lookup("Artwork document", "artworkDocumentId", "documents")}
            </>
          )}
          {kind === "samples" && (
            <>
              {input("Sample quantity *", "quantity", "number", true)}
              {input("Due date", "dueDate", "date")}
            </>
          )}
          {kind === "scorecards" && (
            <>
              {input("Evaluation period", "period")}
              {["quality", "communication", "value"].map((key) => (
                <Field label={key[0].toUpperCase() + key.slice(1)} key={key}>
                  <select
                    value={v[key]}
                    onChange={(e) => set(key, Number(e.target.value))}
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n} / 5
                      </option>
                    ))}
                  </select>
                </Field>
              ))}
            </>
          )}
          {["automations", "report-schedules"].includes(kind) && (
            <>
              {input("Repeat every (days)", "frequencyDays", "number", true)}
              {input("Next scheduled date", "nextDate", "date", true)}
              <Field label="Enabled">
                <select
                  value={String(v.enabled)}
                  onChange={(e) => set("enabled", e.target.value === "true")}
                >
                  <option value="true">Enabled</option>
                  <option value="false">Paused</option>
                </select>
              </Field>
            </>
          )}
          {kind === "automations" && (
            <>
              <Field label="Assignee">
                <select
                  value={v.assigneeId || ""}
                  onChange={(e) => set("assigneeId", e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </Field>
              {input(
                "Escalate after (days overdue)",
                "escalateAfterDays",
                "number",
              )}
            </>
          )}
          {kind === "verifications" && (
            <>
              {lookup("Supporting document *", "documentId", "documents")}
              {lookup("Brand (optional)", "brandId", "brands")}
              {input("Authorization valid until", "validUntil", "date")}
            </>
          )}
          {kind === "report-schedules" && (
            <>
              <Field label="Report">
                <select
                  value={v.report}
                  onChange={(e) => set("report", e.target.value)}
                >
                  <option value="network">Vendor network</option>
                  <option value="sourcing">Sourcing activity</option>
                  <option value="tasks">Follow-up tasks</option>
                </select>
              </Field>
              {input("Recipient email", "recipient", "email", true)}
            </>
          )}
        </div>
        {kind === "orders" && (
          <>
            <div className="quote-heading">
              <h3>Order lines</h3>
              <button
                type="button"
                className="button outline small"
                onClick={() =>
                  set("lines", [
                    ...v.lines,
                    {
                      id: crypto.randomUUID(),
                      productId: "",
                      quantity: 1,
                      price: 0,
                      customization: 0,
                      packaging: 0,
                      freight: 0,
                      taxRate: 0,
                    },
                  ])
                }
              >
                <Icon name="Plus" size={14} />
                Add line
              </button>
            </div>
            {v.lines.map((line: any, i: number) => (
              <div className="order-line-editor" key={line.id}>
                <Field label={`Product · line ${i + 1}`}>
                  <Lookup
                    kind="products"
                    value={line.productId}
                    onChange={(id) =>
                      set(
                        "lines",
                        v.lines.map((l: any, j: number) =>
                          j === i ? { ...l, productId: id } : l,
                        ),
                      )
                    }
                    label={`Order product ${i + 1}`}
                  />
                </Field>
                <div className="quote-editor">
                  {[
                    ["Quantity", "quantity", 1],
                    ["Unit price ₹", "price", 0],
                    ["Branding / unit ₹", "customization", 0],
                    ["Packaging / unit ₹", "packaging", 0],
                    ["Freight ₹", "freight", 0],
                    ["Tax %", "taxRate", 0],
                  ].map(([label, key, min]) => (
                    <Field key={key} label={String(label)}>
                      <input
                        required
                        type="number"
                        min={Number(min)}
                        step={key === "quantity" ? "1" : ".01"}
                        value={line[key]}
                        onChange={(e) =>
                          set(
                            "lines",
                            v.lines.map((l: any, j: number) =>
                              j === i
                                ? { ...l, [key]: Number(e.target.value) }
                                : l,
                            ),
                          )
                        }
                      />
                    </Field>
                  ))}
                  <button
                    type="button"
                    className="icon-button danger"
                    aria-label="Remove order line"
                    onClick={() =>
                      set(
                        "lines",
                        v.lines.filter((_: any, j: number) => j !== i),
                      )
                    }
                  >
                    <Icon name="Trash2" size={15} />
                  </button>
                </div>
              </div>
            ))}
            {total && (
              <div className="order-total">
                Subtotal <Money value={total.subtotal / 100} /> · Tax{" "}
                <Money value={total.tax / 100} />
                <strong>
                  Total <Money value={total.total / 100} />
                </strong>
              </div>
            )}
            <p className="muted">
              Amounts are calculated from your entered costs and tax rates. An
              order stays in Draft until submitted and approved.
            </p>
          </>
        )}
        <Field label="Notes / requirements">
          <textarea
            value={v.notes || ""}
            onChange={(e) => set("notes", e.target.value)}
            rows={3}
          />
        </Field>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="button outline" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Saving…" : "Save record"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function OrderDetail({
  row,
  onClose,
  request,
  refresh,
}: {
  row: Row;
  onClose: () => void;
  request: any;
  refresh: () => void;
}) {
  const c = useCRM(),
    [reference, setReference] = useState(""),
    [reason, setReason] = useState(""),
    [quantities, setQuantities] = useState<Record<string, number>>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const act = async (action: string) => {
    setBusy(true);
    try {
      await request(`/orders/${row.id}/action`, "POST", {
        action,
        reference,
        reason,
        lines: Object.entries(quantities)
          .filter(([, quantity]) => quantity > 0)
          .map(([lineId, quantity]) => ({ lineId, quantity })),
      });
      refresh();
      c.notify("Order updated.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal wide title={`${row.number} · ${row.name}`} onClose={onClose}>
      <div className="modal-body">
        <div className="quote-heading">
          <Status value={row.status} />
          <button
            className="button outline small"
            onClick={() =>
              download(
                `${row.number}.csv`,
                [
                  "Product,Quantity,Unit price,Branding per unit,Packaging per unit,Freight,Tax rate",
                  ...row.lines.map((l: any) =>
                    [
                      l.productId,
                      l.quantity,
                      l.price,
                      l.customization,
                      l.packaging,
                      l.freight,
                      l.taxRate,
                    ].join(","),
                  ),
                ].join("\r\n"),
              )
            }
          >
            <Icon name="Download" size={14} />
            Export order
          </button>
        </div>
        <p>
          {c.options.vendors.find((v) => v.id === row.vendorId)?.name} ·
          Delivery due {row.dueDate || "not set"}
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Ordered</th>
                <th>Received</th>
                <th>Unit price</th>
                <th>Receive now</th>
              </tr>
            </thead>
            <tbody>
              {row.lines.map((l: any) => (
                <tr key={l.id}>
                  <td>
                    {c.options.products.find((p) => p.id === l.productId)
                      ?.name ||
                      l.description ||
                      l.productId}
                  </td>
                  <td>{l.quantity}</td>
                  <td>{row.received?.[l.id] || 0}</td>
                  <td>
                    <Money value={l.price} />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      max={l.quantity - (row.received?.[l.id] || 0)}
                      aria-label={`Receive ${l.description || l.productId}`}
                      disabled={
                        ![
                          "Accepted",
                          "Partially received",
                          "Dispatched",
                        ].includes(row.status)
                      }
                      value={quantities[l.id] || 0}
                      onChange={(e) =>
                        setQuantities((q) => ({
                          ...q,
                          [l.id]: Number(e.target.value),
                        }))
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="order-total">
          <strong>
            Total <Money value={(row.totals?.total || 0) / 100} />
          </strong>
        </div>
        <Field label="Supplier acknowledgement / receipt reference">
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Unique reference for this receipt"
            maxLength={100}
          />
        </Field>
        {row.status === "Issued" && (
          <button
            disabled={busy || !c.write}
            className="button outline"
            onClick={() => act("accept")}
          >
            Record supplier acknowledgement
          </button>
        )}
        {["Accepted", "Partially received", "Dispatched"].includes(
          row.status,
        ) && (
          <button
            disabled={busy || !c.write}
            className="button primary"
            onClick={() => act("receive")}
          >
            Save goods receipt
          </button>
        )}
        {!["Completed", "Partially received", "Cancelled"].includes(
          row.status,
        ) && (
          <details className="danger-zone">
            <summary>Cancel this order</summary>
            <Field label="Cancellation reason">
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <button
              disabled={busy || !c.write}
              className="button danger"
              onClick={() => act("cancel")}
            >
              Cancel order
            </button>
          </details>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <p className="muted">
          Receipt references are idempotent: submitting the same reference again
          will not receive goods twice.
        </p>
      </div>
    </Modal>
  );
}
