import { useEffect, useState } from "react";
import { useCRM } from "./context";
import { PageHeader } from "./Workspace";
import {
  Avatar,
  Badge,
  Empty,
  Icon,
  Modal,
  Money,
  Skeleton,
  Status,
  Field,
} from "./ui";
import { categories, csv } from "../shared/core.mjs";
import { api, download } from "./client";
import { landedCost } from "../shared/operations.mjs";
import type { PageResult, Row } from "./types";
const defaultColumns = [
  "name",
  "contact",
  "brands",
  "category",
  "city",
  "authorization",
  "status",
  "lastContact",
];
const columnLabels: Record<string, string> = {
  name: "Vendor name",
  contact: "Primary contact",
  brands: "Brands",
  category: "Category",
  city: "City",
  authorization: "Authorization",
  phone: "Phone",
  email: "Email",
  status: "Status",
  lastContact: "Last contact",
};
function QuotationResponses({ row }: { row: Row }) {
  const c = useCRM();
  return (
    <section className="card detail-card">
      <div className="quote-heading">
        <div>
          <span className="eyebrow">RFQ RESPONSE COMPARISON</span>
          <h2>Supplier quotations</h2>
        </div>
        <button
          className="button outline small"
          disabled={!c.write}
          onClick={() => c.openForm("rfqs", row)}
        >
          Record a response
        </button>
      </div>
      <p className="muted">
        {c.demo
          ? "Fictional quotations for this sample sourcing requirement."
          : "Quotations recorded by your team for this RFQ."}{" "}
        Landed totals include the entered branding, packaging, freight and tax
        amounts.
      </p>
      <div className="button-row">
        <button
          className="button outline small"
          onClick={() => c.go("approvals", row.id)}
        >
          Review and award
        </button>
        {!c.demo &&
          ["email", "whatsapp"].map((channel) => (
            <button
              key={channel}
              className="button outline small"
              disabled={!c.write}
              onClick={async () => {
                try {
                  await api(`/api/ops/rfqs/${row.id}/queue`, "POST", {
                    channel,
                  });
                  c.notify(
                    "RFQ queued. An owner can dispatch it from Delivery center.",
                  );
                } catch (e) {
                  c.notify((e as Error).message);
                }
              }}
            >
              Queue {channel === "email" ? "email" : "WhatsApp"}
            </button>
          ))}
        <button
          className="button ghost small"
          onClick={() => c.go("supplier-access")}
        >
          Invite suppliers
        </button>
      </div>
      {row.responses?.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Unit price</th>
                <th>Landed total</th>
                <th>MOQ</th>
                <th>Stock</th>
                <th>Lead days</th>
                <th>Valid until</th>
                <th>Quantity fit</th>
              </tr>
            </thead>
            <tbody>
              {[...row.responses]
                .sort(
                  (a: any, b: any) =>
                    landedCost(a, row.quantity).total -
                    landedCost(b, row.quantity).total,
                )
                .map((q: any) => (
                  <tr key={q.vendorId}>
                    <td>
                      <button onClick={() => c.go("vendors", q.vendorId)}>
                        {c.options.vendors.find((v) => v.id === q.vendorId)
                          ?.name || "Supplier"}
                      </button>
                    </td>
                    <td>
                      <Money value={q.price} />
                    </td>
                    <td>
                      <b>
                        <Money
                          value={landedCost(q, row.quantity).total / 100}
                        />
                      </b>
                    </td>
                    <td>{q.moq}</td>
                    <td>{q.stock}</td>
                    <td>{q.leadTime}</td>
                    <td>{q.validUntil || "Not supplied"}</td>
                    <td>
                      <Badge
                        tone={
                          row.quantity >= q.moq && row.quantity <= q.stock
                            ? "green"
                            : "amber"
                        }
                      >
                        {row.quantity < q.moq
                          ? "Below MOQ"
                          : row.quantity > q.stock
                            ? "Stock shortfall"
                            : "Fits quantity"}
                      </Badge>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="Awaiting supplier responses"
          description="Record quotations you receive to compare this sourcing requirement."
        />
      )}
    </section>
  );
}
export function Directory({ version }: { version: number }) {
  const c = useCRM(),
    [filters, setFilters] = useState<Record<string, string>>(() => {
      try {
        const stored = sessionStorage.getItem("ofneeds-crm.next-filter");
        sessionStorage.removeItem("ofneeds-crm.next-filter");
        return stored ? JSON.parse(stored) : {};
      } catch {
        return {};
      }
    }),
    [query, setQuery] = useState(""),
    [result, setResult] = useState<PageResult>({
      rows: [],
      total: 0,
      page: 1,
      limit: 12,
    }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [page, setPage] = useState(1),
    [sort, setSort] = useState("name"),
    [direction, setDirection] = useState("asc"),
    [view, setView] = useState("table"),
    [showFilters, setShowFilters] = useState(false),
    [showColumns, setShowColumns] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [viewName, setViewName] = useState(""),
    [saveView, setSaveView] = useState(false),
    [bulk, setBulk] = useState(false),
    [busy, setBusy] = useState(false);
  const columns = c.prefs.columns || defaultColumns;
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => ({ ...f, q: query }));
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    c.list("vendors", {
      ...filters,
      ...(view === "favorites"
        ? { favoriteIds: (c.prefs.favorites || []).join(",") || "no-favorites" }
        : {}),
      page: String(page),
      sort,
      direction,
    })
      .then((r) => {
        if (alive) {
          setResult(r);
          setError("");
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [
    JSON.stringify(filters),
    page,
    sort,
    direction,
    version,
    c.options,
    view,
  ]);
  const setFilter = (key: string, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
    setSelected([]);
  };
  const exportRows = () => {
    const rows = result.rows
      .filter((r) => !selected.length || selected.includes(r.id))
      .map((r) => ({
        ...r,
        sample: c.demo ? "Sample data" : "Workspace record",
        brands: r.brandIds
          ?.map((id: string) => c.options.brands.find((b) => b.id === id)?.name)
          .join("; "),
      }));
    download(
      "ofneeds-vendors.csv",
      csv(rows, [
        "name",
        "contact",
        "email",
        "phone",
        "city",
        "state",
        "category",
        "brands",
        "authorization",
        "status",
        "sample",
      ]),
    );
    c.notify(
      `Exported ${rows.length} ${selected.length ? "selected" : "visible"} vendors.`,
    );
  };
  const cell = (v: Row, key: string) =>
    key === "name" ? (
      <button className="vendor-name" onClick={() => c.go("vendors", v.id)}>
        <Avatar name={v.name} />
        <span>
          <b>{v.name}</b>
          <small>
            {v.type}
            {c.demo ? " · Sample" : ""}
          </small>
        </span>
      </button>
    ) : key === "authorization" || key === "status" ? (
      <Status value={v[key]} />
    ) : key === "brands" ? (
      <div className="brand-tags">
        {v.brandIds?.slice(0, 2).map((id: string) => (
          <button key={id} onClick={() => setFilter("brandId", id)}>
            {c.options.brands.find((b) => b.id === id)?.name || "Brand"}
          </button>
        ))}
        {v.brandIds?.length > 2 && <span>+{v.brandIds.length - 2}</span>}
      </div>
    ) : key === "lastContact" ? (
      <span className="muted">
        {v.lastContact
          ? new Date(v.lastContact).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
            })
          : "Not recorded"}
      </span>
    ) : (
      <span>{v[key] || "—"}</span>
    );
  const activeFilters = Object.entries(filters).filter(([, v]) => v);
  return (
    <>
      <PageHeader
        title="Vendor directory"
        description="The right connections. All in one place."
      >
        <button className="button outline" onClick={() => c.go("import")}>
          <Icon name="Upload" size={16} />
          Import Excel
        </button>
        <button
          className="button primary"
          disabled={!c.write}
          onClick={() => c.openForm("vendors")}
          data-tour="add-vendor"
        >
          <Icon name="Plus" size={17} />
          Add vendor
        </button>
      </PageHeader>
      <div className="directory-tabs">
        <div className="section-tabs">
          <button
            className={!filters.status ? "selected" : ""}
            onClick={() => setFilter("status", "")}
          >
            All vendors <span>{c.summary.metrics.vendors}</span>
          </button>
          <button
            className={filters.status === "Active" ? "selected" : ""}
            onClick={() => setFilter("status", "Active")}
          >
            Active <span>{c.summary.metrics.active}</span>
          </button>
          <button
            className={filters.authorization === "Unverified" ? "selected" : ""}
            onClick={() => setFilter("authorization", "Unverified")}
          >
            Needs review <span>{c.summary.metrics.pending}</span>
          </button>
        </div>
        <button
          className="button ghost small"
          onClick={() => {
            const ids = c.prefs.favorites || [];
            setQuery("");
            if (!ids.length)
              c.notify(
                "Open a vendor profile and star it to build your favorites.",
              );
            setFilters({});
            setView(view === "favorites" ? "table" : "favorites");
          }}
        >
          <Icon name="Star" size={15} />
          Favorites
        </button>
      </div>
      <section className="card directory-card" data-tour="vendor-directory">
        <div className="table-toolbar">
          <div className="search-field">
            <Icon name="Search" size={17} />
            <input
              aria-label="Search vendors"
              placeholder="Search vendors, contacts or brands…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button
                className="icon-button"
                aria-label="Clear search"
                onClick={() => setQuery("")}
              >
                <Icon name="X" size={14} />
              </button>
            )}
          </div>
          <button
            className={`button outline small ${showFilters ? "selected" : ""}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Icon name="ListFilter" size={16} />
            Filters
            {activeFilters.length > 0 && (
              <span className="filter-count">{activeFilters.length}</span>
            )}
          </button>
          <select
            aria-label="Saved vendor views"
            value=""
            onChange={(e) => {
              const saved = c.prefs.views?.find(
                (v) => v.name === e.target.value,
              );
              if (saved) {
                setFilters(saved.filters);
                setQuery(saved.filters.q || "");
                setPage(1);
              }
            }}
          >
            <option value="">Saved views</option>
            {c.prefs.views?.map((v) => (
              <option key={v.name}>{v.name}</option>
            ))}
          </select>
          <div className="toolbar-spacer" />
          <button
            className="icon-button"
            title="Save current view"
            aria-label="Save current view"
            onClick={() => setSaveView(true)}
          >
            <Icon name="BookmarkPlus" size={17} />
          </button>
          <button
            className="icon-button"
            title="Column visibility"
            aria-label="Column visibility"
            onClick={() => setShowColumns(!showColumns)}
          >
            <Icon name="Columns3" size={17} />
          </button>
          <button
            className="icon-button"
            title={
              view === "cards" ? "Switch to table view" : "Switch to card view"
            }
            aria-label={
              view === "cards" ? "Switch to table view" : "Switch to card view"
            }
            onClick={() => setView(view === "cards" ? "table" : "cards")}
          >
            <Icon name={view === "cards" ? "List" : "LayoutGrid"} size={17} />
          </button>
          <button className="button outline small" onClick={exportRows}>
            <Icon name="Download" size={15} />
            Export{selected.length ? " selected" : ""}
          </button>
        </div>
        {showFilters && (
          <div className="filter-panel">
            {[
              [
                "brandId",
                "Brand",
                c.options.brands.map((b) => ({ value: b.id, label: b.name })),
              ],
              [
                "category",
                "Category",
                categories.map((v) => ({ value: v, label: v })),
              ],
              [
                "city",
                "City",
                [
                  ...new Set(
                    c.options.vendors.map((v) => v.city).filter(Boolean),
                  ),
                ].map((v) => ({ value: v, label: v })),
              ],
              [
                "state",
                "State",
                [
                  "Karnataka",
                  "Maharashtra",
                  "Delhi",
                  "Telangana",
                  "Tamil Nadu",
                  "Gujarat",
                  "West Bengal",
                ].map((v) => ({ value: v, label: v })),
              ],
              [
                "type",
                "Vendor type",
                [
                  "Manufacturer",
                  "Distributor",
                  "Dealer",
                  "Service provider",
                ].map((v) => ({ value: v, label: v })),
              ],
              [
                "authorization",
                "Authorization",
                ["Authorized", "Unverified", "Expired"].map((v) => ({
                  value: v,
                  label: v,
                })),
              ],
              [
                "status",
                "Relationship",
                ["Active", "Pending", "Archived"].map((v) => ({
                  value: v,
                  label: v,
                })),
              ],
              [
                "stock",
                "Stock",
                ["Available", "On request"].map((v) => ({
                  value: v,
                  label: v,
                })),
              ],
            ].map(([key, label, options]) => (
              <Field key={String(key)} label={String(label)}>
                <select
                  value={filters[String(key)] || ""}
                  onChange={(e) => setFilter(String(key), e.target.value)}
                >
                  <option value="">All {String(label).toLowerCase()}</option>
                  {(options as { value: string; label: string }[]).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
        )}
        {showColumns && (
          <div className="columns-panel">
            <b>Visible columns</b>
            {Object.entries(columnLabels).map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={columns.includes(key)}
                  disabled={key === "name"}
                  onChange={(e) =>
                    c.updatePrefs({
                      columns: e.target.checked
                        ? [...columns, key]
                        : columns.filter((k) => k !== key),
                    })
                  }
                />
                {label}
              </label>
            ))}
          </div>
        )}
        {activeFilters.length > 0 && (
          <div className="filter-chips">
            {activeFilters.map(([key, value]) => (
              <button
                key={key}
                onClick={() => {
                  setFilter(key, "");
                  if (key === "q") setQuery("");
                }}
              >
                {key === "brandId"
                  ? c.options.brands.find((b) => b.id === value)?.name
                  : value}
                <Icon name="X" size={12} />
              </button>
            ))}
            <button
              className="clear-filters"
              onClick={() => {
                setFilters({});
                setQuery("");
                setPage(1);
              }}
            >
              Clear all filters
            </button>
          </div>
        )}
        {selected.length > 0 && (
          <div className="bulk-bar">
            <b>{selected.length} selected</b>
            <button disabled={!c.write} onClick={() => setBulk(true)}>
              Archive selected
            </button>
            <button onClick={exportRows}>Export selected</button>
            <button onClick={() => setSelected([])}>Clear selection</button>
          </div>
        )}
        {error ? (
          <div className="error" role="alert">
            {error}
            <button onClick={c.refresh}>Retry</button>
          </div>
        ) : loading ? (
          <Skeleton />
        ) : !result.rows.length ? (
          <Empty
            title="No vendors found"
            description={
              activeFilters.length
                ? "Try changing your filters or search."
                : "Build your supplier network by adding your first vendor or importing an Excel sheet."
            }
            action={() => c.openForm("vendors")}
          >
            <button className="button ghost" onClick={() => c.go("import")}>
              Import Excel
            </button>
          </Empty>
        ) : (
          <>
            <div
              className={`table-scroll ${view === "cards" || view === "favorites" ? "hidden-table" : ""}`}
            >
              <table className="vendor-table">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        aria-label="Select visible vendors"
                        checked={
                          result.rows.length > 0 &&
                          result.rows.every((r) => selected.includes(r.id))
                        }
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? result.rows.map((r) => r.id)
                              : [],
                          )
                        }
                      />
                    </th>
                    {columns.map((key) => (
                      <th
                        key={key}
                        style={{
                          minWidth:
                            c.prefs.widths?.[key] ||
                            (key === "name" ? 250 : 140),
                        }}
                      >
                        <button
                          onClick={() => {
                            if (["name", "city", "status"].includes(key)) {
                              setSort(key);
                              setDirection(
                                sort === key && direction === "asc"
                                  ? "desc"
                                  : "asc",
                              );
                            }
                          }}
                        >
                          {columnLabels[key]}
                          {["name", "city", "status"].includes(key) && (
                            <Icon
                              name={
                                sort === key && direction === "desc"
                                  ? "ArrowDown"
                                  : "ArrowUpDown"
                              }
                              size={12}
                            />
                          )}
                        </button>
                        <input
                          className="column-resizer"
                          type="range"
                          aria-label={`Width of ${columnLabels[key]} column`}
                          min="90"
                          max="420"
                          value={
                            c.prefs.widths?.[key] ||
                            (key === "name" ? 250 : 140)
                          }
                          onChange={(e) =>
                            c.updatePrefs({
                              widths: {
                                ...c.prefs.widths,
                                [key]: Number(e.target.value),
                              },
                            })
                          }
                        />
                      </th>
                    ))}
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((v) => (
                    <tr
                      key={v.id}
                      className={selected.includes(v.id) ? "row-selected" : ""}
                    >
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Select ${v.name}`}
                          checked={selected.includes(v.id)}
                          onChange={(e) =>
                            setSelected(
                              e.target.checked
                                ? [...selected, v.id]
                                : selected.filter((id) => id !== v.id),
                            )
                          }
                        />
                      </td>
                      {columns.map((key) => (
                        <td key={key}>{cell(v, key)}</td>
                      ))}
                      <td>
                        <button
                          className="icon-button"
                          aria-label={`Open ${v.name}`}
                          onClick={() => c.go("vendors", v.id)}
                        >
                          <Icon name="ArrowUpRight" size={17} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`Edit ${v.name}`}
                          disabled={!c.write}
                          onClick={() => c.openForm("vendors", v)}
                        >
                          <Icon name="Pencil" size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div
              className={`vendor-cards ${view === "cards" || view === "favorites" ? "force-cards" : ""}`}
            >
              {result.rows
                .filter(
                  (v) =>
                    view !== "favorites" || c.prefs.favorites?.includes(v.id),
                )
                .map((v) => (
                  <article key={v.id} className="vendor-card">
                    <div>
                      <Avatar name={v.name} />
                      <Status value={v.status} />
                    </div>
                    <button
                      className="vendor-card-name"
                      onClick={() => c.go("vendors", v.id)}
                    >
                      {v.name}
                    </button>
                    <p>
                      <Icon name="MapPin" size={14} />
                      {v.city} · {v.category}
                    </p>
                    <div className="brand-tags">{cell(v, "brands")}</div>
                    <footer>
                      <Status value={v.authorization} />
                      <button
                        className="button ghost small"
                        onClick={() => c.go("vendors", v.id)}
                      >
                        View profile
                        <Icon name="ArrowRight" size={14} />
                      </button>
                    </footer>
                    {c.demo && (
                      <small className="sample-label">Sample vendor</small>
                    )}
                  </article>
                ))}
            </div>
          </>
        )}
        <div className="pagination">
          <span>
            {result.total
              ? `${(page - 1) * 12 + 1}–${Math.min(page * 12, result.total)}`
              : "0"}{" "}
            of {result.total} vendors{c.demo ? " · Sample data" : ""}
          </span>
          <div>
            <button
              disabled={page <= 1 || loading}
              className="button outline small"
              onClick={() => setPage(page - 1)}
            >
              <Icon name="ChevronLeft" size={14} />
              Previous
            </button>
            <span>
              Page {page} of {Math.max(1, Math.ceil(result.total / 12))}
            </span>
            <button
              className="button outline small"
              disabled={page * 12 >= result.total || loading}
              onClick={() => setPage(page + 1)}
            >
              Next
              <Icon name="ChevronRight" size={14} />
            </button>
          </div>
        </div>
      </section>
      {saveView && (
        <Modal title="Save this vendor view" onClose={() => setSaveView(false)}>
          <form
            className="modal-body"
            onSubmit={(e) => {
              e.preventDefault();
              c.updatePrefs({
                views: [
                  ...(c.prefs.views || []).filter((v) => v.name !== viewName),
                  { name: viewName, filters },
                ].slice(-20),
              });
              setSaveView(false);
              c.notify("View saved.");
            }}
          >
            <Field label="View name">
              <input
                required
                maxLength={80}
                value={viewName}
                onChange={(e) => setViewName(e.target.value)}
                placeholder="Bengaluru · Apparel"
              />
            </Field>
            <button className="button primary">Save view</button>
          </form>
        </Modal>
      )}
      {bulk && (
        <Modal title="Archive selected vendors?" onClose={() => setBulk(false)}>
          <div className="modal-body">
            <p>
              Archive {selected.length} selected vendors on this page. Related
              contacts, quotes and history will be preserved.
            </p>
            <div className="form-actions">
              <button className="button outline" onClick={() => setBulk(false)}>
                Cancel
              </button>
              <button
                disabled={busy}
                className="button primary"
                onClick={async () => {
                  setBusy(true);
                  try {
                    for (const row of result.rows.filter((v) =>
                      selected.includes(v.id),
                    ))
                      await c.save(
                        "vendors",
                        { ...row, status: "Archived" },
                        row.id,
                      );
                    setSelected([]);
                    setBulk(false);
                    c.notify("Selected vendors archived.");
                  } catch (e) {
                    c.notify((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Archiving…" : "Archive selected"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
export function VendorProfile({ id }: { id: string }) {
  const c = useCRM(),
    [vendor, setVendor] = useState<Row | null>(null),
    [related, setRelated] = useState<Record<string, Row[]>>({}),
    [tab, setTab] = useState("Overview"),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    setVendor(null);
    Promise.all([
      c.get("vendors", id),
      ...["contacts", "follow-ups", "documents"].map((kind) =>
        c.list(kind, { vendorId: id, limit: "100" }),
      ),
      c.list("products", { vendorId: id, limit: "100" }),
      c.list("rfqs", { vendorId: id, limit: "100" }),
    ])
      .then(([v, contacts, tasks, docs, products, rfqs]) => {
        if (alive) {
          setVendor(v);
          setRelated({
            contacts: contacts.rows,
            activities: tasks.rows,
            documents: docs.rows,
            products: products.rows.filter((p: Row) =>
              p.quotes?.some((q: any) => q.vendorId === id),
            ),
            rfqs: rfqs.rows.filter((r: Row) => r.vendorIds?.includes(id)),
          });
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [id, c.options]);
  if (error) return <p className="error">{error}</p>;
  if (!vendor) return <Skeleton />;
  const v = vendor;
  const detail = (title: string, entries: [string, any][]) => (
    <section className="card detail-card">
      <h3>{title}</h3>
      <dl>
        {entries.map(([key, val]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>{val || "Not recorded"}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
  return (
    <>
      <button className="back-link" onClick={() => c.go("vendors")}>
        <Icon name="ArrowLeft" size={15} />
        Back to vendor directory
      </button>
      <section className="card profile-header" data-tour="vendor-profile">
        <div>
          <Avatar name={v.name} large />
          <div>
            <span className="eyebrow">
              {c.demo ? "SAMPLE VENDOR" : v.id.slice(0, 8).toUpperCase()}
            </span>
            <h1>{v.name}</h1>
            <p>
              <Icon name="MapPin" size={14} />
              {v.city}, {v.state || "State not recorded"}
              <span>•</span>
              {v.type}
            </p>
            <div>
              <Status value={v.status} />
              <Status value={v.authorization} />
              <Badge>{v.brandIds?.length || 0} brands</Badge>
            </div>
          </div>
          <button
            className={`icon-button favorite ${c.prefs.favorites?.includes(id) ? "selected" : ""}`}
            aria-label="Favorite vendor"
            onClick={() =>
              c.updatePrefs({
                favorites: c.prefs.favorites?.includes(id)
                  ? c.prefs.favorites.filter((v) => v !== id)
                  : [...(c.prefs.favorites || []), id],
              })
            }
          >
            <Icon name="Star" size={22} />
          </button>
        </div>
        <footer>
          {!c.demo && v.phone && (
            <a
              className="button outline small"
              href={`tel:${v.phone.replace(/[^+\d]/g, "")}`}
            >
              <Icon name="Phone" size={15} />
              Call
            </a>
          )}
          {!c.demo && v.email && (
            <a className="button outline small" href={`mailto:${v.email}`}>
              <Icon name="Mail" size={15} />
              Email
            </a>
          )}
          {!c.demo && /^\+?\d{10,15}$/.test(v.phone || "") && (
            <a
              className="button outline small"
              href={`https://wa.me/${v.phone.replace(/\D/g, "")}`}
              target="_blank"
              rel="noreferrer"
            >
              <Icon name="MessageCircle" size={15} />
              WhatsApp
            </a>
          )}
          {c.demo && (
            <span className="muted">
              External calls and messages unavailable for sample contacts.
            </span>
          )}
          <span className="spacer" />
          <button
            className="button outline small"
            disabled={!c.write}
            onClick={() => c.openForm("follow-ups", { vendorId: id })}
          >
            <Icon name="CalendarPlus" size={15} />
            Add follow-up
          </button>
          <button
            className="button outline small"
            disabled={!c.write}
            onClick={() => c.openForm("rfqs", { vendorIds: [id] })}
          >
            <Icon name="ClipboardPlus" size={15} />
            Create RFQ
          </button>
          <button
            className="button primary small"
            disabled={!c.write}
            onClick={() => c.openForm("vendors", v)}
          >
            <Icon name="Pencil" size={15} />
            Edit vendor
          </button>
        </footer>
      </section>
      <div className="section-tabs profile-tabs">
        {[
          "Overview",
          "Contacts",
          "Brands",
          "Products",
          "Pricing",
          "Documents",
          "Activities",
          "RFQs",
          "Commercial terms",
        ].map((t) => (
          <button
            key={t}
            className={tab === t ? "selected" : ""}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="profile-content">
        {tab === "Overview" ? (
          <div className="profile-overview">
            <div>
              {detail("Company details", [
                ["Company", v.name],
                ["Business type", v.type],
                ["Category", v.category],
                ["Website", v.website],
                ["Registered office", v.address],
                ["City / state", `${v.city} / ${v.state || "Not recorded"}`],
              ])}
              {detail("Primary contact", [
                ["Name", v.contact],
                ["Email", v.email],
                ["Phone", v.phone],
              ])}
            </div>
            <div>
              {detail("Supplier relationship", [
                ["Authorization", v.authorization],
                [
                  "Valid until",
                  v.authorizationUntil
                    ? new Date(v.authorizationUntil).toLocaleDateString()
                    : "Not recorded",
                ],
                [
                  "Last contact",
                  v.lastContact
                    ? new Date(v.lastContact).toLocaleDateString()
                    : "Not recorded",
                ],
                ["Payment terms", v.terms],
              ])}
              <section className="card detail-card">
                <h3>Upcoming follow-ups</h3>
                {related.activities
                  ?.filter((t) => t.status !== "Completed")
                  .map((t) => (
                    <button
                      className="related-row"
                      key={t.id}
                      onClick={() => c.go("follow-ups", t.id)}
                    >
                      <Icon name="CalendarDays" />
                      <span>
                        {t.name}
                        <small>{t.date}</small>
                      </span>
                      <Icon name="ArrowUpRight" size={14} />
                    </button>
                  ))}
                {!related.activities?.length && (
                  <p className="muted">No follow-ups scheduled.</p>
                )}
              </section>
            </div>
          </div>
        ) : tab === "Brands" ? (
          <section className="card detail-card">
            <div className="quote-heading">
              <h3>Recorded brand relationships</h3>
              <button
                className="button outline small"
                disabled={!c.write}
                onClick={() => c.openForm("vendors", v)}
              >
                Assign brands
              </button>
            </div>
            {v.brandIds?.map((id: string) => {
              const b = c.options.brands.find((b) => b.id === id);
              return (
                <button
                  className="related-row"
                  key={id}
                  onClick={() => c.go("brands", id)}
                >
                  <Icon name="BadgeCheck" />
                  <span>
                    {b?.name}
                    <small>
                      {b?.category}
                      {c.demo ? " · Fictional brand" : ""}
                    </small>
                  </span>
                  <Status value={v.authorization} />
                </button>
              );
            })}
            {!v.brandIds?.length && <Empty title="No brands assigned yet" />}
          </section>
        ) : tab === "Commercial terms" ? (
          detail("Commercial terms", [
            ["Payment terms", v.terms],
            ["MOQ", v.moq],
            ["Lead time", `${v.leadTime || "Not recorded"} days`],
            ["GST", v.gst],
            ["Warehouse", v.warehouse],
            ["Dispatch", v.dispatch],
            ["Stock availability", v.stock],
          ])
        ) : tab === "Pricing" ? (
          <section className="card detail-card">
            <h3>Recorded product pricing</h3>
            {related.products?.map((p) => (
              <div className="related-row" key={p.id}>
                <button onClick={() => c.go("products", p.id)}>{p.name}</button>
                <b>
                  <Money
                    value={p.quotes.find((q: any) => q.vendorId === id).price}
                  />
                </b>
              </div>
            ))}
            {!related.products?.length && <Empty title="No prices recorded" />}
          </section>
        ) : (
          <section className="card detail-card">
            <div className="quote-heading">
              <h3>{tab}</h3>
              {["Contacts", "Documents", "Activities"].includes(tab) && (
                <button
                  className="button primary small"
                  disabled={!c.write}
                  onClick={() =>
                    c.openForm(
                      tab === "Activities" ? "follow-ups" : tab.toLowerCase(),
                      { vendorId: id },
                    )
                  }
                >
                  <Icon name="Plus" size={14} />
                  Add{" "}
                  {tab === "Activities"
                    ? "follow-up"
                    : tab.slice(0, -1).toLowerCase()}
                </button>
              )}
            </div>
            {(related[tab.toLowerCase()] || []).map((r) => (
              <button
                key={r.id}
                className="related-row"
                onClick={() =>
                  c.go(
                    tab === "Activities" ? "follow-ups" : tab.toLowerCase(),
                    r.id,
                  )
                }
              >
                <Icon
                  name={
                    tab === "Contacts"
                      ? "ContactRound"
                      : tab === "Documents"
                        ? "FileText"
                        : "ArrowUpRight"
                  }
                />
                <span>
                  {r.name}
                  <small>
                    {r.email ||
                      r.date ||
                      r.description ||
                      r.category ||
                      r.status}
                    {c.demo ? " · Sample" : ""}
                  </small>
                </span>
                <Icon name="ChevronRight" size={16} />
              </button>
            ))}
            {!(related[tab.toLowerCase()] || []).length && (
              <Empty
                title={`No ${tab.toLowerCase()} yet`}
                description="Add related records to build a complete supplier profile."
              />
            )}
          </section>
        )}
      </div>
    </>
  );
}
export function RecordList({
  kind,
  version,
  recordId,
}: {
  kind: string;
  version: number;
  recordId?: string;
}) {
  const c = useCRM(),
    [rows, setRows] = useState<Row[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [record, setRecord] = useState<Row | null>(null),
    [deleteConfirm, setDeleteConfirm] = useState<Row | null>(null);
  const titles: Record<string, string> = {
    brands: "Brand directory",
    contacts: "People & contacts",
    products:
      c.page === "prices" ? "Supplier price lists" : "Product catalogue",
    rfqs: "RFQs & quotations",
    "follow-ups": "Follow-ups & tasks",
    documents: "Documents",
  };
  useEffect(() => {
    let alive = true;
    setLoading(true);
    const timer = setTimeout(() => {
      Promise.all([
        c.list(kind, { q: query, status, page: String(page) }),
        recordId ? c.get(kind, recordId) : Promise.resolve(null),
      ])
        .then(([r, detail]) => {
          if (alive) {
            setRows(r.rows);
            setTotal(r.total);
            setRecord(detail);
            setError("");
          }
        })
        .catch((e) => {
          if (alive) setError(e.message);
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    }, 180);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [kind, page, query, status, version, c.options, recordId]);
  return (
    <>
      <PageHeader
        title={titles[kind] || kind}
        description={
          kind === "products"
            ? "Discover products. Compare the details that make the difference."
            : kind === "rfqs"
              ? "From sourcing requirements to informed supplier decisions."
              : kind === "follow-ups"
                ? "The next conversation, at the right time."
                : "The details behind a more connected supplier network."
        }
      >
        <button
          className="button primary"
          disabled={!c.write}
          onClick={() => c.openForm(kind)}
        >
          <Icon name="Plus" size={17} />
          Add{" "}
          {kind === "rfqs"
            ? "RFQ"
            : kind === "follow-ups"
              ? "follow-up"
              : kind.slice(0, -1)}
        </button>
      </PageHeader>
      {error && (
        <p className="error" role="alert">
          {error}
          <button onClick={c.refresh}>Retry</button>
        </p>
      )}
      {recordId && record ? (
        <RecordDetail kind={kind} row={record} />
      ) : (
        <>
          <div className="card table-toolbar">
            <div className="search-field">
              <Icon name="Search" size={17} />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                aria-label={`Search ${kind}`}
                placeholder={`Search ${kind.replace("-", " ")}…`}
              />
            </div>
            {["rfqs", "follow-ups"].includes(kind) && (
              <select
                aria-label="Filter status"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All statuses</option>
                {(kind === "rfqs"
                  ? ["Open", "Quoted", "Reviewing", "Closed"]
                  : ["Open", "Completed"]
                ).map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            )}
            <span className="toolbar-spacer" />
            <span className="muted">
              {total} {kind}
              {c.demo ? " · Sample data" : ""}
            </span>
            <button
              className="button outline small"
              onClick={() =>
                download(
                  `ofneeds-${kind}.csv`,
                  csv(rows, [
                    "name",
                    ...(kind === "contacts"
                      ? ["email", "phone", "role"]
                      : kind === "follow-ups"
                        ? ["date", "status", "priority"]
                        : kind === "rfqs"
                          ? ["quantity", "status", "deadline"]
                          : ["category", "description"]),
                  ]),
                )
              }
            >
              <Icon name="Download" size={15} />
              Export page
            </button>
          </div>
          {loading ? (
            <Skeleton />
          ) : !rows.length ? (
            <Empty
              title={`No ${kind.replace("-", " ")} yet`}
              description="Add your first record, or try a different search."
              action={() => c.openForm(kind)}
            />
          ) : (
            <div
              className={
                kind === "products" || kind === "brands"
                  ? "record-grid"
                  : "card record-list"
              }
              data-tour={
                kind === "products"
                  ? "products"
                  : kind === "rfqs"
                    ? "rfqs"
                    : kind === "brands"
                      ? "brands"
                      : "tasks"
              }
            >
              {rows.map((r) => (
                <article
                  key={r.id}
                  className={
                    kind === "products" || kind === "brands"
                      ? "card record-card"
                      : "record-row"
                  }
                >
                  {kind === "products" ? (
                    <div
                      className={`product-art product-${categories.indexOf(r.category) % 8}`}
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
                          ][categories.indexOf(r.category)] || "Package"
                        }
                        size={55}
                      />
                      <span>{r.category}</span>
                    </div>
                  ) : kind === "brands" ? (
                    <div className="brand-card-top">
                      <Avatar name={r.name} large />
                      <span>{r.category}</span>
                    </div>
                  ) : kind === "follow-ups" ? (
                    <button
                      className={`task-checkbox ${r.status === "Completed" ? "checked" : ""}`}
                      aria-label={`Toggle completion of ${r.name}`}
                      disabled={!c.write}
                      onClick={async () => {
                        try {
                          await c.save(
                            kind,
                            {
                              ...r,
                              status:
                                r.status === "Completed" ? "Open" : "Completed",
                            },
                            r.id,
                          );
                        } catch (e) {
                          c.notify((e as Error).message);
                        }
                      }}
                    >
                      {r.status === "Completed" && (
                        <Icon name="Check" size={12} />
                      )}
                    </button>
                  ) : (
                    <span className="record-icon">
                      <Icon
                        name={
                          kind === "contacts"
                            ? "ContactRound"
                            : kind === "documents"
                              ? "FileText"
                              : "ClipboardList"
                        }
                        size={22}
                      />
                    </span>
                  )}
                  <div className="record-main">
                    <button
                      className="record-title"
                      onClick={() => c.go(kind, r.id)}
                    >
                      {r.name}
                    </button>
                    <p>
                      {kind === "products"
                        ? c.options.brands.find((b) => b.id === r.brandId)
                            ?.name || "No brand assigned"
                        : kind === "contacts"
                          ? `${r.role || "Contact"} · ${c.options.vendors.find((v) => v.id === r.vendorId)?.name || "No vendor"}`
                          : kind === "follow-ups"
                            ? `${r.date} · ${c.options.vendors.find((v) => v.id === r.vendorId)?.name || ""}`
                            : kind === "rfqs"
                              ? `${r.quantity} units · ${r.vendorIds?.length || 0} suppliers`
                              : r.description || r.category}
                    </p>
                    {c.demo && (
                      <small className="sample-label">
                        Sample {kind === "rfqs" ? "RFQ" : kind.slice(0, -1)}
                      </small>
                    )}
                    {kind === "products" && (
                      <div className="product-price">
                        <span>
                          From{" "}
                          <b>
                            {r.quotes?.length ? (
                              <Money
                                value={Math.min(
                                  ...r.quotes.map((q: any) => q.price),
                                )}
                              />
                            ) : (
                              "No price"
                            )}
                          </b>
                        </span>
                        <small>{r.quotes?.length || 0} supplier prices</small>
                      </div>
                    )}
                  </div>
                  <div className="record-actions">
                    {r.status && <Status value={r.status} />}
                    <button
                      className="icon-button"
                      aria-label={`Edit ${r.name}`}
                      disabled={!c.write}
                      onClick={() => c.openForm(kind, r)}
                    >
                      <Icon name="Pencil" size={15} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Open ${r.name}`}
                      onClick={() => c.go(kind, r.id)}
                    >
                      <Icon name="ArrowUpRight" size={18} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
          <div className="pagination">
            <span>{total} records</span>
            <div>
              <button
                className="button outline small"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <span>Page {page}</span>
              <button
                className="button outline small"
                disabled={page * 12 >= total}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
      {loading && recordId && <Skeleton />}
    </>
  );
}
function RecordDetail({ kind, row }: { kind: string; row: Row }) {
  const c = useCRM(),
    [product, setProduct] = useState<Row | null>(null),
    [deleteConfirm, setDeleteConfirm] = useState(false),
    [relatedVendors, setRelatedVendors] = useState<Row[]>([]);
  useEffect(() => {
    if (kind === "rfqs" && row.productId)
      c.get("products", row.productId)
        .then(setProduct)
        .catch(() => setProduct(null));
    if (kind === "brands")
      c.list("vendors", { brandId: row.id, limit: "100" }).then((r) =>
        setRelatedVendors(r.rows),
      );
  }, [row, kind]);
  const p = kind === "products" ? row : product;
  return (
    <>
      <button className="back-link" onClick={() => c.go(kind)}>
        <Icon name="ArrowLeft" size={14} />
        Back to {kind}
      </button>
      <section className="card detail-card">
        <div className="record-detail-header">
          <span className="feature-icon">
            <Icon
              name={
                kind === "products"
                  ? "Package"
                  : kind === "brands"
                    ? "BadgeCheck"
                    : "FileText"
              }
              size={28}
            />
          </span>
          <div>
            <span className="eyebrow">
              {c.demo ? "SAMPLE RECORD" : "WORKSPACE RECORD"}
            </span>
            <h2>{row.name}</h2>
            <p>
              {row.description ||
                row.notes ||
                row.email ||
                row.role ||
                row.date ||
                row.category}
            </p>
          </div>
          <button
            className="button outline small"
            disabled={!c.write}
            onClick={() => c.openForm(kind, row)}
          >
            <Icon name="Pencil" size={14} />
            Edit
          </button>
          <button
            className="icon-button danger"
            disabled={!c.write}
            aria-label="Delete record"
            onClick={() => setDeleteConfirm(true)}
          >
            <Icon name="Trash2" size={17} />
          </button>
        </div>
        {row.status && <Status value={row.status} />}
        <dl className="inline-details">
          {[
            "city",
            "email",
            "phone",
            "role",
            "category",
            "sku",
            "date",
            "priority",
            "quantity",
            "deadline",
          ]
            .filter((k) => row[k])
            .map((k) => (
              <div key={k}>
                <dt>{k[0].toUpperCase() + k.slice(1)}</dt>
                <dd>{row[k]}</dd>
              </div>
            ))}
        </dl>
        {row.vendorId && (
          <button
            className="button outline small"
            onClick={() => c.go("vendors", row.vendorId)}
          >
            <Icon name="Building2" size={15} />
            {c.options.vendors.find((v) => v.id === row.vendorId)?.name ||
              "Open vendor"}
          </button>
        )}
        {kind === "documents" && (
          <button
            className="button primary"
            onClick={async () => {
              try {
                if (c.demo) {
                  const stored = sessionStorage.getItem(
                    "ofneeds-crm.demo.file." + row.id,
                  );
                  if (stored) {
                    const file = JSON.parse(stored),
                      binary = atob(file.base64),
                      bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0)),
                      url = URL.createObjectURL(
                        new Blob([bytes], { type: file.mime }),
                      );
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = row.name;
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  } else
                    download(
                      "sample-catalogue.txt",
                      "OfNeeds sample catalogue\nFictional product reference. No supplier authorization is implied.",
                      "text/plain",
                    );
                } else {
                  const response = await fetch(
                    `/api/crm/documents/${row.id}/file`,
                  );
                  if (!response.ok)
                    throw new Error(
                      "No attachment uploaded. Edit this document to attach a file.",
                    );
                  const url = URL.createObjectURL(await response.blob()),
                    a = document.createElement("a");
                  a.href = url;
                  a.download = row.name;
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                }
              } catch (e) {
                c.notify((e as Error).message);
              }
            }}
          >
            <Icon name="Download" size={16} />
            Download attachment
          </button>
        )}
      </section>
      {kind === "rfqs" && <QuotationResponses row={row} />}
      {p && (
        <section
          className="card detail-card price-comparison"
          data-tour="pricing"
        >
          <div className="quote-heading">
            <div>
              <span className="eyebrow">COMPARE YOUR OPTIONS</span>
              <h2>Supplier pricing{kind === "rfqs" ? ` · ${p.name}` : ""}</h2>
            </div>
            <Badge tone="blue">
              {c.demo ? "Fictional sample prices" : "Recorded reference prices"}
            </Badge>
          </div>
          <p className="muted">
            Compare price, minimum order quantity, available stock and lead
            time. Prices exclude tax and shipping.
            {kind === "rfqs"
              ? " These are product reference prices, not supplier responses to this RFQ."
              : ""}
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th>Unit price</th>
                  <th>MOQ</th>
                  <th>Stock</th>
                  <th>Lead time</th>
                  {kind === "rfqs" && <th>Quantity total</th>}
                  <th>Profile</th>
                </tr>
              </thead>
              <tbody>
                {p.quotes
                  ?.filter(
                    (q: any) =>
                      kind !== "rfqs" || row.vendorIds.includes(q.vendorId),
                  )
                  .sort((a: any, b: any) => a.price - b.price)
                  .map((q: any, i: number) => (
                    <tr key={q.vendorId + i}>
                      <td>
                        <span className="supplier-cell">
                          <Avatar
                            name={
                              c.options.vendors.find((v) => v.id === q.vendorId)
                                ?.name || "Supplier"
                            }
                          />
                          {
                            c.options.vendors.find((v) => v.id === q.vendorId)
                              ?.name
                          }
                        </span>
                      </td>
                      <td>
                        <b>
                          <Money value={q.price} />
                        </b>
                        {i === 0 && (
                          <small className="lowest-label">
                            Lowest recorded
                          </small>
                        )}
                      </td>
                      <td>{q.moq} units</td>
                      <td>{q.stock} units</td>
                      <td>{q.leadTime} days</td>
                      {kind === "rfqs" && (
                        <td>
                          <Money value={q.price * row.quantity} />
                        </td>
                      )}
                      <td>
                        <button
                          className="icon-button"
                          aria-label="View supplier profile"
                          onClick={() => c.go("vendors", q.vendorId)}
                        >
                          <Icon name="ArrowUpRight" />
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {!p.quotes?.length && (
            <Empty
              title="No supplier prices recorded"
              description="Edit the product to add supplier quotations."
            />
          )}
        </section>
      )}
      {kind === "brands" && (
        <section className="card detail-card">
          <h3>Vendors associated with this brand</h3>
          <p className="muted">
            Authorized, unverified and expired reflect your recorded supplier
            relationship. Review evidence before relying on a status.
          </p>
          {relatedVendors.map((v) => (
            <button
              className="related-row"
              key={v.id}
              onClick={() => c.go("vendors", v.id)}
            >
              <Avatar name={v.name} />
              <span>
                {v.name}
                <small>{v.city}</small>
              </span>
              <Status value={v.authorization} />
            </button>
          ))}
          {!relatedVendors.length && (
            <Empty title="No vendors associated yet" />
          )}
        </section>
      )}
      {deleteConfirm && (
        <Modal
          title="Delete this record?"
          onClose={() => setDeleteConfirm(false)}
        >
          <div className="modal-body">
            <p>
              This removes “{row.name}” from the {c.demo ? "sample" : "current"}{" "}
              workspace. Records used by other modules are protected.
            </p>
            <div className="form-actions">
              <button
                className="button outline"
                onClick={() => setDeleteConfirm(false)}
              >
                Cancel
              </button>
              <button
                className="button danger"
                onClick={async () => {
                  try {
                    await c.remove(kind, row.id);
                    setDeleteConfirm(false);
                    c.go(kind);
                    c.notify("Record deleted.");
                  } catch (e) {
                    c.notify((e as Error).message);
                  }
                }}
              >
                Delete record
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
