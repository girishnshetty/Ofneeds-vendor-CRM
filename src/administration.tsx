import { useEffect, useState } from "react";
import { InvitationsPanel } from "./Workspaces";
import { useCRM } from "./context";
import { PageHeader } from "./Workspace";
import { Field, Icon, Avatar, Badge, Empty } from "./ui";
import { api, download, saveDemo, demoSave } from "./client";
import { categories, csv, validateRecord } from "../shared/core.mjs";
import type { Row } from "./types";
export function Settings() {
  const c = useCRM(),
    profile = (() => {
      try {
        return JSON.parse(c.workspace.profile || "{}");
      } catch {
        return {};
      }
    })();
  const [name, setName] = useState(c.workspace.name),
    [business, setBusiness] = useState(profile.businessType || ""),
    [locations, setLocations] = useState(profile.locations || ""),
    [selected, setSelected] = useState<string[]>(profile.categories || []),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <PageHeader
        title="Make it your workspace"
        description="Your company, your preferences, your way of working."
      />
      <div className="settings-grid">
        <section className="card detail-card">
          <span className="eyebrow">COMPANY PROFILE</span>
          <h2>The business behind your network.</h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                const body = {
                  name,
                  businessType: business,
                  locations,
                  categories: selected,
                };
                if (!c.demo) await api("/api/crm/workspace", "PATCH", body);
                c.setWorkspace({ name, profile: JSON.stringify(body) });
                c.refresh();
                c.notify("Company profile saved.");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Company name">
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={160}
              />
            </Field>
            <Field label="Business type">
              <select
                required
                value={business}
                onChange={(e) => setBusiness(e.target.value)}
              >
                <option value="">Choose business type</option>
                {[
                  "Corporate gifting company",
                  "Procurement team",
                  "Brand distributor",
                  "Manufacturer",
                  "Agency",
                  "Other",
                ].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </Field>
            <Field label="Operating locations">
              <input
                value={locations}
                onChange={(e) => setLocations(e.target.value)}
                placeholder="Bengaluru, Mumbai…"
              />
            </Field>
            <fieldset>
              <legend>Relevant product categories</legend>
              <div className="checkbox-grid">
                {categories.map((v) => (
                  <label key={v}>
                    <input
                      type="checkbox"
                      checked={selected.includes(v)}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, v]
                            : selected.filter((n) => n !== v),
                        )
                      }
                    />
                    {v}
                  </label>
                ))}
              </div>
            </fieldset>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button
              className="button primary"
              disabled={busy || (!c.demo && c.user?.role !== "owner")}
            >
              {busy ? "Saving…" : "Save company profile"}
            </button>
            {!c.demo && c.user?.role !== "owner" && (
              <p className="muted">
                The workspace owner manages company details.
              </p>
            )}
          </form>
        </section>
        <div>
          <section className="card detail-card">
            <span className="eyebrow">PERSONAL PREFERENCES</span>
            <h2>A workspace that feels like you.</h2>
            <Field label="Color theme">
              <select
                value={c.prefs.theme || "light"}
                onChange={(e) => c.updatePrefs({ theme: e.target.value })}
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </Field>
            <Field label="Default landing page">
              <select
                value={c.prefs.defaultPage || "dashboard"}
                onChange={(e) => c.updatePrefs({ defaultPage: e.target.value })}
              >
                <option value="dashboard">Overview</option>
                <option value="vendors">Vendor directory</option>
                <option value="follow-ups">My tasks</option>
                <option value="rfqs">RFQs & quotations</option>
              </select>
            </Field>
            <fieldset>
              <legend>Default product categories</legend>
              <div className="checkbox-grid">
                {categories.map((n) => (
                  <label key={n}>
                    <input
                      type="checkbox"
                      checked={c.prefs.categories?.includes(n) || false}
                      onChange={(e) =>
                        c.updatePrefs({
                          categories: e.target.checked
                            ? [...(c.prefs.categories || []), n]
                            : (c.prefs.categories || []).filter((v) => v !== n),
                        })
                      }
                    />
                    {n}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="toggle-row">
              <span>
                <b>Compact sidebar</b>
                <small>Give your content more room</small>
              </span>
              <input
                type="checkbox"
                checked={!!c.prefs.collapsed}
                onChange={(e) => c.updatePrefs({ collapsed: e.target.checked })}
              />
            </label>
            <label className="toggle-row">
              <span>
                <b>Notification indicators</b>
                <small>Show task and activity badges</small>
              </span>
              <input
                type="checkbox"
                checked={c.prefs.notifications !== false}
                onChange={(e) =>
                  c.updatePrefs({ notifications: e.target.checked })
                }
              />
            </label>
            <p className="muted">
              Table columns, saved views, favorite vendors and dashboard layout
              are also remembered{" "}
              {c.demo ? "in this browser" : "on your account"}.
            </p>
          </section>
          <section className="card detail-card">
            <Icon name="CirclePlay" size={28} />
            <h3>A refresher, anytime.</h3>
            <p>
              Walk through the actual CRM screens and discover a better way to
              work.
            </p>
            <button className="button outline" onClick={() => c.startTour()}>
              Replay product tour
              <Icon name="ArrowRight" size={16} />
            </button>
          </section>
          <section className="card detail-card">
            <h3>Local app connections</h3>
            <p>
              Email delivery, WhatsApp notifications and automatic password
              recovery require provider configuration. Manage MFA, verification
              and sessions in Account security.
            </p>
            <Badge tone="amber">Local workspace · no outbound messages</Badge>
          </section>
        </div>
      </div>
    </>
  );
}
export function ImportExport() {
  const c = useCRM(),
    [rows, setRows] = useState<Record<string, any>[]>([]),
    [errors, setErrors] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [filename, setFilename] = useState(""),
    [imported, setImported] = useState(0);
  const columns = [
    "name",
    "contact",
    "email",
    "phone",
    "city",
    "state",
    "category",
    "type",
    "status",
    "authorization",
    "terms",
  ];
  const parseCsv = (text: string) => {
    const result: string[][] = [];
    let row: string[] = [],
      cell = "",
      quoted = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"') {
        if (quoted && text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = !quoted;
      } else if (char === "," && !quoted) {
        row.push(cell);
        cell = "";
      } else if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && text[i + 1] === "\n") i++;
        row.push(cell);
        if (row.some(Boolean)) result.push(row);
        row = [];
        cell = "";
      } else cell += char;
    }
    if (quoted) throw new Error("CSV contains an unclosed quoted field.");
    row.push(cell);
    if (row.some(Boolean)) result.push(row);
    return result;
  };
  return (
    <>
      <PageHeader
        title="Bring your network with you"
        description="Import a vendor sheet, review it, then make the connection."
      />
      <div className="import-layout">
        <section className="card detail-card">
          <span className="eyebrow">STEP 1 · PREPARE YOUR SHEET</span>
          <h2>One well-organized start.</h2>
          <p>
            Use an Excel workbook (.xlsx) or CSV file with column headers.
            Company name and city are required. Brand relationships can be
            assigned after import.
          </p>
          <div className="import-columns">
            {columns.map((v) => (
              <code key={v}>
                {v}
                {["name", "city"].includes(v) ? " *" : ""}
              </code>
            ))}
          </div>
          <button
            className="button outline"
            onClick={() =>
              download(
                "ofneeds-vendor-import-template.csv",
                csv(
                  [
                    {
                      name: "Example Supplier",
                      contact: "Sample Contact",
                      email: "hello@supplier.example",
                      phone: "Not dialable",
                      city: "Bengaluru",
                      state: "Karnataka",
                      category: "Apparel",
                      type: "Distributor",
                      status: "Active",
                      authorization: "Unverified",
                      terms: "30 days from invoice",
                    },
                  ],
                  columns,
                ),
              )
            }
          >
            <Icon name="Download" size={16} />
            Download CSV template
          </button>
        </section>
        <section className="card detail-card">
          <span className="eyebrow">STEP 2 · CHOOSE & REVIEW</span>
          <h2>Ready when you are.</h2>
          <label className="upload-zone">
            <Icon name="FileSpreadsheet" size={35} />
            <b>Choose your vendor sheet</b>
            <span>Excel or CSV · up to 500 rows · 5 MB maximum</span>
            <input
              type="file"
              accept=".xlsx,.csv"
              disabled={busy || !c.write}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setBusy(true);
                setErrors([]);
                setRows([]);
                setImported(0);
                setFilename(file.name);
                try {
                  if (file.size > 5000000)
                    throw new Error("Choose a file under 5 MB.");
                  let matrix: any[][] = [];
                  if (file.name.toLowerCase().endsWith(".csv"))
                    matrix = parseCsv(await file.text());
                  else if (file.name.toLowerCase().endsWith(".xlsx")) {
                    const ExcelJS = (await import("exceljs")).default;
                    const workbook = new ExcelJS.Workbook();
                    await workbook.xlsx.load(await file.arrayBuffer());
                    const sheet = workbook.worksheets[0];
                    if (!sheet) throw new Error("The workbook has no sheets.");
                    if (sheet.rowCount > 501)
                      throw new Error("Use at most 500 data rows per import.");
                    sheet.eachRow((r) => {
                      matrix.push(
                        (r.values as any[])
                          .slice(1)
                          .map((v) =>
                            typeof v === "object" && v !== null
                              ? (v.text ?? v.result ?? "")
                              : v,
                          ),
                      );
                    });
                  } else throw new Error("Choose .xlsx or .csv.");
                  if (matrix.length < 2 || matrix.length > 501)
                    throw new Error("Include a header and 1–500 data rows.");
                  const headers = matrix[0].map((v) =>
                    String(v || "")
                      .replace(/^\uFEFF/, "")
                      .trim()
                      .toLowerCase(),
                  );
                  if (!headers.includes("name") || !headers.includes("city"))
                    throw new Error(
                      "Your sheet needs name and city column headers.",
                    );
                  const parsed: Record<string, any>[] = matrix
                    .slice(1)
                    .filter((r) => r.some((v) => String(v ?? "").trim()))
                    .map((values) => ({
                      ...Object.fromEntries(
                        headers.map((k, i) => [
                          k,
                          String(values[i] ?? "").trim(),
                        ]),
                      ),
                      status: "Active",
                      authorization: "Unverified",
                      brandIds: [],
                    }));
                  const validation: string[] = [];
                  const seen = new Set<string>();
                  parsed.forEach((row, i) => {
                    try {
                      validateRecord("vendors", row);
                      const key = row.name.toLowerCase();
                      if (seen.has(key))
                        throw new Error("Duplicate company name in sheet.");
                      seen.add(key);
                    } catch (e) {
                      validation.push(`Row ${i + 2}: ${(e as Error).message}`);
                    }
                  });
                  setRows(parsed);
                  setErrors(validation);
                } catch (e) {
                  setErrors([(e as Error).message]);
                } finally {
                  setBusy(false);
                }
              }}
            />
          </label>
          {busy && <p role="status">Processing your sheet…</p>}
        </section>
      </div>
      {(rows.length > 0 || errors.length > 0) && (
        <section className="card detail-card">
          <div className="quote-heading">
            <div>
              <span className="eyebrow">STEP 3 · CONFIRM IMPORT</span>
              <h2>{filename}</h2>
              <p>
                {rows.length} rows found · {errors.length} validation issues. No
                records are changed until you confirm.
              </p>
            </div>
            <button
              disabled={busy || errors.length > 0 || !rows.length || !c.write}
              className="button primary"
              onClick={async () => {
                setBusy(true);
                try {
                  if (c.demo) {
                    let next = c.data;
                    for (const raw of rows) next = demoSaveForImport(next, raw);
                    saveDemo(next);
                    location.reload();
                  } else {
                    const result = await api("/api/crm/import", "POST", {
                      rows,
                    });
                    setImported(result.count);
                    setRows([]);
                    c.refresh();
                    c.notify(`Imported ${result.count} vendors.`);
                  }
                } catch (e) {
                  setErrors([(e as Error).message]);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Icon name="Upload" size={16} />
              {busy ? "Importing…" : `Import ${rows.length} vendors`}
            </button>
          </div>
          {errors.length > 0 && (
            <div className="error" role="alert">
              {errors.map((e, i) => (
                <p key={i}>{e}</p>
              ))}
              <p>
                Fix the sheet and upload it again. The import is all-or-nothing.
              </p>
            </div>
          )}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {["name", "city", "email", "category"].map((k) => (
                    <th key={k}>{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 30).map((row, i) => (
                  <tr key={i}>
                    {["name", "city", "email", "category"].map((k) => (
                      <td key={k}>{row[k]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 30 && (
            <p className="muted">
              Previewing the first 30 rows; all {rows.length} rows will be
              validated and imported.
            </p>
          )}
        </section>
      )}
      {imported > 0 && (
        <div className="success" role="status">
          {imported} vendors imported successfully.{" "}
          <button onClick={() => c.go("vendors")}>
            Open vendor directory →
          </button>
        </div>
      )}
      <section className="card detail-card">
        <h3>Export your vendor records</h3>
        <p>
          Export all filtered records from the directory page by page, or export
          the selected rows. CSV cells are protected against spreadsheet formula
          injection.
        </p>
        <button className="button outline" onClick={() => c.go("vendors")}>
          Open directory
          <Icon name="ArrowUpRight" size={15} />
        </button>
      </section>
    </>
  );
}
function demoSaveForImport(data: any, raw: any) {
  const previous = sessionStorage.getItem("ofneeds-vendor-crm.demo.v1");
  try {
    return demoSave(data, "vendors", { ...raw, imported: true }).data;
  } finally {
    if (previous)
      sessionStorage.setItem("ofneeds-vendor-crm.demo.v1", previous);
  }
}
export function Team() {
  const c = useCRM(),
    [members, setMembers] = useState<any[]>([]),
    [show, setShow] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = () => {
    if (c.demo) {
      setMembers([
        {
          id: "sample-owner",
          name: "Alex Morgan",
          email: "alex@workspace.example",
          role: "owner",
        },
        ...JSON.parse(sessionStorage.getItem("ofneeds-crm.demo.team") || "[]"),
      ]);
      return;
    }
    api("/api/crm/team")
      .then(setMembers)
      .catch((e) => setError(e.message));
  };
  useEffect(load, []);
  return (
    <>
      <PageHeader
        title="Better together"
        description="The people behind your supplier network."
      >
        <button
          disabled={!c.demo && c.user?.role !== "owner"}
          className="button primary"
          onClick={() => setShow(!show)}
        >
          <Icon name="UserPlus" size={16} />
          Add local member
        </button>
      </PageHeader>
      <InvitationsPanel />
      <div className="report-note">
        <Icon name="Info" size={17} />
        Invite teammates above to let them set their own credentials. Use local
        member creation for local testing. Email delivery requires a configured
        provider; invitation links can be copied privately.
        {c.demo ? " Demo members are fictional and cannot sign in." : ""}
      </div>
      {show && (
        <section className="card detail-card">
          <h3>Create a workspace member</h3>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                const body = Object.fromEntries(new FormData(e.currentTarget));
                if (c.demo) {
                  const previous = JSON.parse(
                    sessionStorage.getItem("ofneeds-crm.demo.team") || "[]",
                  );
                  sessionStorage.setItem(
                    "ofneeds-crm.demo.team",
                    JSON.stringify([
                      ...previous,
                      {
                        id: crypto.randomUUID(),
                        name: body.name,
                        email: body.email,
                        role: body.role,
                      },
                    ]),
                  );
                } else await api("/api/crm/team", "POST", body);
                setShow(false);
                load();
                c.notify(
                  "Workspace member created. No invitation email was sent.",
                );
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="form-grid">
              <Field label="Name">
                <input name="name" required maxLength={100} />
              </Field>
              <Field label="Email">
                <input name="email" required type="email" />
              </Field>
              <Field label="Initial password">
                <input
                  name="password"
                  required
                  type="password"
                  minLength={12}
                  autoComplete="new-password"
                  maxLength={200}
                />
              </Field>
              <Field label="Role">
                <select name="role">
                  <option value="member">Member · edit CRM records</option>
                  <option value="viewer">Viewer · read-only</option>
                </select>
              </Field>
            </div>
            <button disabled={busy} className="button primary">
              {busy ? "Creating…" : "Create member"}
            </button>
          </form>
        </section>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <section className="card team-list">
        {members.map((member) => (
          <article key={member.id}>
            <Avatar name={member.name} />
            <div>
              <b>{member.name}</b>
              <small>
                {member.email}
                {c.demo ? " · Sample" : ""}
              </small>
            </div>
            <Badge tone={member.role === "owner" ? "blue" : "neutral"}>
              {member.role}
            </Badge>
          </article>
        ))}
        {!members.length && <Empty title="No members found" />}
      </section>
    </>
  );
}
