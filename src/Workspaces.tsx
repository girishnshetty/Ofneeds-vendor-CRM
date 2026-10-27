import { useEffect, useState } from "react";
import { useCRM } from "./context";
import { useOperations, readOps } from "./opsClient";
import { PageHeader } from "./Workspace";
import { api, download } from "./client";
import {
  Icon,
  Field,
  Modal,
  Badge,
  Status,
  Empty,
  Skeleton,
  Avatar,
  Money,
} from "./ui";
import Lookup from "./Lookup";
import type { Row } from "./types";
import { landedCost } from "../shared/operations.mjs";
import { parseCsv, mapImport } from "../shared/import.mjs";
import { validateRecord, csv, filterRecords } from "../shared/core.mjs";
import { demoSave, saveDemo } from "./client";
export function Approvals() {
  const c = useCRM(),
    ops = useOperations(),
    [rows, setRows] = useState<any[]>([]),
    [rfqId, setRfqId] = useState(c.recordId || ""),
    [rfq, setRfq] = useState<Row | null>(null),
    [vendorId, setVendorId] = useState(""),
    [reviewVendor, setReviewVendor] = useState(""),
    [documentId, setDocumentId] = useState(""),
    [authorization, setAuthorization] = useState("Unverified"),
    [validUntil, setValidUntil] = useState(""),
    [reason, setReason] = useState(""),
    [decision, setDecision] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const load = () =>
    ops
      .request("/approvals")
      .then(setRows)
      .catch((e: any) => setError(e.message));
  useEffect(() => {
    load();
  }, [ops.version]);
  useEffect(() => {
    if (rfqId)
      c.get("rfqs", rfqId)
        .then(setRfq)
        .catch((e) => setError(e.message));
    else setRfq(null);
    setVendorId("");
  }, [rfqId]);
  const run = async (path: string, body: any) => {
    setBusy(true);
    setError("");
    try {
      await ops.request(path, "POST", body);
      load();
      c.refresh();
      c.notify("Workflow saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader
        title="Reviews & approvals"
        description="A clear decision, tied to the version that was reviewed."
      />
      <div className="report-note">
        <Icon name="ShieldCheck" />
        Workspace owners decide approval requests. If a record changes after
        submission, its approval must be requested again.
      </div>
      <div className="settings-grid">
        <section className="card detail-card">
          <span className="eyebrow">SOURCING DECISION</span>
          <h2>Award a quotation</h2>
          <Field label="RFQ">
            <Lookup
              kind="rfqs"
              value={rfqId}
              onChange={setRfqId}
              label="Choose RFQ"
            />
          </Field>
          {rfq && (
            <>
              <p>
                {rfq.quantity} units · {rfq.status}
              </p>
              <Field label="Supplier quotation">
                <select
                  value={vendorId}
                  onChange={(e) => setVendorId(e.target.value)}
                >
                  <option value="">Choose a recorded response</option>
                  {rfq.responses?.map((q: any) => (
                    <option key={q.vendorId} value={q.vendorId}>
                      {c.options.vendors.find((v) => v.id === q.vendorId)
                        ?.name || q.vendorId}{" "}
                      · ₹{q.price}/unit
                    </option>
                  ))}
                </select>
              </Field>
              {vendorId && (
                <div className="order-total">
                  Landed total{" "}
                  <Money
                    value={
                      landedCost(
                        rfq.responses.find((q: any) => q.vendorId === vendorId),
                        Number(rfq.quantity),
                      ).total / 100
                    }
                  />
                </div>
              )}
              <div className="form-actions">
                <button
                  className="button outline"
                  disabled={!c.write || busy || !vendorId}
                  onClick={() => run(`/rfqs/${rfqId}/award`, { vendorId })}
                >
                  Request award approval
                </button>
                <button
                  className="button primary"
                  disabled={!c.write || busy}
                  onClick={() => run(`/rfqs/${rfqId}/create-order`, {})}
                >
                  Create approved-award order
                </button>
              </div>
            </>
          )}
        </section>
        <section className="card detail-card">
          <span className="eyebrow">SUPPLIER RELATIONSHIP</span>
          <h2>Request a vendor review</h2>
          <Field label="Vendor">
            <Lookup
              kind="vendors"
              value={reviewVendor}
              onChange={setReviewVendor}
              label="Vendor to review"
            />
          </Field>
          <Field label="Authorization">
            <select
              value={authorization}
              onChange={(e) => setAuthorization(e.target.value)}
            >
              <option>Unverified</option>
              <option>Authorized</option>
            </select>
          </Field>
          <Field label="Supporting document">
            <Lookup
              kind="documents"
              value={documentId}
              onChange={setDocumentId}
              label="Verification evidence"
            />
          </Field>
          <Field label="Valid until">
            <input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
            />
          </Field>
          <Field label="Review context">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <button
            className="button primary"
            disabled={!c.write || busy || !reviewVendor}
            onClick={() =>
              run(`/vendors/${reviewVendor}/review-request`, {
                authorization,
                documentId,
                validUntil,
                reason,
              })
            }
          >
            Request review
          </button>
        </section>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <section className="card detail-card">
        <h2>Approval register</h2>
        {rows.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Record</th>
                  <th>Created</th>
                  <th>Status</th>
                  <th>Decision</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.type.replaceAll("-", " ")}</td>
                    <td>
                      {r.targetName ||
                        c.options.rfqs.find((v) => v.id === r.target_id)
                          ?.name ||
                        c.options.vendors.find((v) => v.id === r.target_id)
                          ?.name ||
                        r.target_id?.slice(0, 12)}
                    </td>
                    <td>{new Date(r.created).toLocaleDateString()}</td>
                    <td>
                      <Status value={r.status} />
                    </td>
                    <td>
                      {r.status === "Pending" ? (
                        <button
                          disabled={!c.demo && c.user?.role !== "owner"}
                          className="button outline small"
                          onClick={() => {
                            setDecision(r);
                            setReason("");
                          }}
                        >
                          Review request
                        </button>
                      ) : (
                        r.reason
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="No approval requests yet"
            description="Submit a purchase order, quotation award or vendor review."
          />
        )}
      </section>
      {decision && (
        <Modal title="Review this request" onClose={() => setDecision(null)}>
          <div className="modal-body">
            <p>
              {decision.type.replaceAll("-", " ")} ·{" "}
              {decision.targetName || decision.target_id}
            </p>
            <ApprovalSummary proposal={decision.proposal} />
            <Field label="Decision reason">
              <textarea
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <div className="form-actions">
              <button
                className="button outline"
                disabled={busy || !reason.trim()}
                onClick={async () => {
                  await run(`/approvals/${decision.id}/decide`, {
                    decision: "Rejected",
                    reason,
                  });
                  setDecision(null);
                }}
              >
                Reject
              </button>
              <button
                className="button primary"
                disabled={busy || !reason.trim()}
                onClick={async () => {
                  await run(`/approvals/${decision.id}/decide`, {
                    decision: "Approved",
                    reason,
                  });
                  setDecision(null);
                }}
              >
                Approve reviewed version
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
function ApprovalSummary({ proposal: p }: { proposal: any }) {
  const c = useCRM();
  const vendor = (id: string) =>
    c.options.vendors.find((v) => v.id === id)?.name || id;
  if (p.order)
    return (
      <section className="approval-summary">
        <h3>{p.order.name}</h3>
        <p>
          {vendor(p.order.vendorId)} · {p.order.number}
        </p>
        <p>Delivery due: {p.order.dueDate || "Not specified"}</p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Quantity</th>
                <th>Unit price</th>
                <th>Landed total</th>
              </tr>
            </thead>
            <tbody>
              {p.order.lines.map((l: any) => (
                <tr key={l.id}>
                  <td>
                    {c.options.products.find((v) => v.id === l.productId)
                      ?.name ||
                      l.description ||
                      l.productId}
                  </td>
                  <td>{l.quantity}</td>
                  <td>
                    <Money value={l.price} />
                  </td>
                  <td>
                    <Money value={landedCost(l, l.quantity).total / 100} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="order-total">
          <strong>
            Approval total <Money value={p.order.totals.total / 100} />
          </strong>
        </div>
        <p>{p.order.shippingAddress || ""}</p>
        <p>{p.order.notes || ""}</p>
      </section>
    );
  return (
    <dl className="approval-summary">
      {Object.entries(p)
        .filter(
          ([k]) =>
            ![
              "orderId",
              "rfqId",
              "documentId",
              "quote",
              "evidenceHash",
            ].includes(k),
        )
        .map(([k, v]) => (
          <div key={k}>
            <dt>
              {k === "vendorId" ? "Supplier" : k.replace(/([A-Z])/g, " $1")}
            </dt>
            <dd>
              {k === "vendorId" ? (
                vendor(String(v))
              ) : k === "cost" ? (
                <Money value={(v as any).total / 100} />
              ) : typeof v === "object" ? (
                JSON.stringify(v)
              ) : (
                String(v || "Not recorded")
              )}
            </dd>
          </div>
        ))}
      {p.documentId && (
        <button
          className="button outline small"
          onClick={() => c.go("documents", p.documentId)}
        >
          Open supporting document
        </button>
      )}
    </dl>
  );
}
export function SecurityCenter() {
  const c = useCRM(),
    [status, setStatus] = useState<any>(null),
    [sessions, setSessions] = useState<any[]>([]),
    [error, setError] = useState(""),
    [password, setPassword] = useState(""),
    [code, setCode] = useState(""),
    [setup, setSetup] = useState<any>(null),
    [codes, setCodes] = useState<string[]>([]),
    [link, setLink] = useState(""),
    [busy, setBusy] = useState(false);
  const load = () => {
    if (c.demo) return;
    Promise.all([api("/api/security/status"), api("/api/security/sessions")])
      .then(([s, l]) => {
        setStatus(s);
        setSessions(l);
      })
      .catch((e) => setError(e.message));
  };
  useEffect(() => {
    load();
  }, []);
  const run = async (path: string, body: any) => {
    setBusy(true);
    setError("");
    try {
      const r = await api("/api/security/" + path, "POST", body);
      load();
      return r;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
      setPassword("");
    }
  };
  return (
    <>
      <PageHeader
        title="Account security"
        description="Protect your sign-in and stay in control of active sessions."
      />
      {c.demo ? (
        <div className="report-note">
          <Icon name="LockKeyhole" />
          MFA, email verification and device management are available in private
          accounts. The public demo has no authentication credentials.
        </div>
      ) : (
        <>
          <div className="settings-grid">
            <section className="card detail-card">
              <Icon name="ShieldCheck" size={30} />
              <h2>Authenticator protection</h2>
              <Badge tone={status?.mfaEnabled ? "green" : "amber"}>
                {status?.mfaEnabled
                  ? "Two-factor authentication enabled"
                  : "Two-factor authentication not enabled"}
              </Badge>
              <p className="section-description">
                Use an authenticator app with a time-based code. Keep your
                recovery codes offline.
              </p>
              <Field label="Confirm current password">
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              {!status?.mfaEnabled && !setup && (
                <button
                  disabled={busy || !password}
                  className="button primary"
                  onClick={async () => {
                    const r = await run("mfa/enroll", { password });
                    if (r) setSetup(r);
                  }}
                >
                  Set up authenticator
                </button>
              )}
              {setup && (
                <>
                  <p>
                    Enter this setup key manually in your authenticator app:
                  </p>
                  <code className="secret-display">{setup.secret}</code>
                  <Field label="Current six-digit code">
                    <input
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                    />
                  </Field>
                  <button
                    className="button primary"
                    disabled={busy || code.length !== 6}
                    onClick={async () => {
                      const r = await run("mfa/confirm", { code });
                      if (r) {
                        setCodes(r.recoveryCodes);
                        setSetup(null);
                        setCode("");
                      }
                    }}
                  >
                    Confirm and enable
                  </button>
                </>
              )}
              {status?.mfaEnabled && (
                <>
                  <p>{status.recoveryCodesRemaining} recovery codes remain.</p>
                  <Field label="Authenticator or unused recovery code">
                    <input
                      value={code}
                      autoComplete="one-time-code"
                      onChange={(e) => setCode(e.target.value)}
                    />
                  </Field>
                  <button
                    disabled={busy || !password || !code}
                    className="button danger"
                    onClick={() => run("mfa/disable", { password, code })}
                  >
                    Disable MFA after verification
                  </button>
                </>
              )}
              {codes.length > 0 && (
                <div className="recovery-codes">
                  <h3>Save these recovery codes now</h3>
                  <p>They are shown once. Each code works once.</p>
                  <pre>{codes.join("\n")}</pre>
                  <button
                    className="button outline small"
                    onClick={() => {
                      download(
                        "ofneeds-recovery-codes.txt",
                        codes.join("\n"),
                        "text/plain",
                      );
                    }}
                  >
                    Download codes
                  </button>
                  <button
                    className="button ghost small"
                    onClick={() => setCodes([])}
                  >
                    I have saved them
                  </button>
                </div>
              )}
            </section>
            <section className="card detail-card">
              <Icon name="Mail" size={30} />
              <h2>Email ownership</h2>
              <Badge tone={status?.emailVerified ? "green" : "amber"}>
                {status?.emailVerified
                  ? "Email verified"
                  : "Email not verified"}
              </Badge>
              <p className="section-description">
                Verification messages are queued for your configured provider. A
                local test link exercises the flow without claiming email
                ownership.
              </p>
              <button
                disabled={busy}
                className="button outline"
                onClick={async () => {
                  const r = await run("verification-request", {});
                  if (r) {
                    setLink(r.localTestLink || "");
                    c.notify(
                      `Verification message ${r.status}. Dispatch it from Delivery when configured.`,
                    );
                  }
                }}
              >
                Request verification
              </button>
              {link && (
                <div className="copy-link">
                  <b>Local flow test only</b>
                  <a href={link} data-route>
                    Open local test link
                  </a>
                  <small>This does not verify email ownership.</small>
                </div>
              )}
            </section>
          </div>
          <section className="card detail-card">
            <h2>Active sessions</h2>
            <p>
              Sessions expire after 12 hours. Revoke a session you no longer
              recognize.
            </p>
            {sessions.map((s) => (
              <article className="session-row" key={s.id}>
                <Icon name="Monitor" />
                <div>
                  <b>{s.current ? "This session" : "Other session"}</b>
                  <small>{s.agent}</small>
                  <small>Expires {new Date(s.expires).toLocaleString()}</small>
                </div>
                {s.current ? (
                  <Badge tone="blue">Current</Badge>
                ) : (
                  <button
                    className="button outline small"
                    onClick={async () => {
                      try {
                        await api(
                          "/api/security/sessions/" + s.id,
                          "DELETE",
                          {},
                        );
                        load();
                        c.notify("Session revoked.");
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    Revoke
                  </button>
                )}
              </article>
            ))}
          </section>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </>
      )}
    </>
  );
}
export function InvitationsPanel() {
  const c = useCRM(),
    [email, setEmail] = useState(""),
    [role, setRole] = useState("member"),
    [password, setPassword] = useState(""),
    [rows, setRows] = useState<any[]>([]),
    [link, setLink] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = () => {
    if (!c.demo && c.user?.role === "owner")
      api("/api/security/invitations")
        .then(setRows)
        .catch((e) => setError(e.message));
  };
  useEffect(() => {
    load();
  }, []);
  return (
    <section className="card detail-card">
      <span className="eyebrow">SECURE TEAM SETUP</span>
      <h2>Invite a teammate</h2>
      <p>
        Invitees choose their own password. Links expire in 72 hours and can be
        revoked.
      </p>
      {c.demo ? (
        <p className="report-note">
          Invitations create private account access and are unavailable in the
          public demo.
        </p>
      ) : c.user?.role !== "owner" ? (
        <p>Only the workspace owner can invite members.</p>
      ) : (
        <>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                const r = await api("/api/security/invitations", "POST", {
                  email,
                  role,
                  password,
                });
                setLink(r.invitationLink);
                load();
                c.notify(
                  `Invitation saved · delivery ${r.status}. No message has been sent automatically.`,
                );
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
                setPassword("");
              }
            }}
          >
            <div className="form-grid">
              <Field label="Teammate email">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Field label="Role">
                <select value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="member">Member</option>
                  <option value="viewer">Viewer · read-only</option>
                </select>
              </Field>
            </div>
            <Field label="Confirm your current password">
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </Field>
            <button disabled={busy} className="button primary">
              {busy ? "Creating…" : "Create invitation"}
            </button>
          </form>
          {link && (
            <div className="copy-link">
              <b>Private invitation link</b>
              <input
                readOnly
                aria-label="Private invitation link"
                value={link}
              />
              <small>
                Share only with the intended teammate. Anyone holding this link
                can accept the assigned role.
              </small>
            </div>
          )}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>State</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.email}</td>
                    <td>{r.role}</td>
                    <td>
                      {r.used_at
                        ? "Used or revoked"
                        : r.expires < Date.now()
                          ? "Expired"
                          : "Pending"}
                    </td>
                    <td>
                      {!r.used_at && (
                        <button
                          className="button ghost small"
                          onClick={async () => {
                            await api(
                              "/api/security/invitations/" + r.id,
                              "DELETE",
                              {},
                            );
                            load();
                          }}
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
export function SupplierAccess() {
  const c = useCRM(),
    ops = useOperations(),
    [vendorId, setVendorId] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [link, setLink] = useState(""),
    [rows, setRows] = useState<any[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = () => {
    ops
      .request("/overview")
      .then((r: any) => setRows(r.portalLinks || []))
      .catch((e: any) => setError(e.message));
  };
  useEffect(() => {
    load();
  }, []);
  return (
    <>
      <PageHeader
        title="Supplier portal access"
        description="A secure, limited workspace for each invited supplier."
      />
      <div className="report-note">
        <Icon name="ShieldCheck" />
        Suppliers see only their own records, product prices, assigned RFQs and
        issued orders. They cannot access your CRM account APIs or competing
        quotations.
      </div>
      <section className="card detail-card">
        <h2>Invite a supplier</h2>
        {c.demo ? (
          <>
            <p>
              The public demo has no real supplier credentials. Preview a
              supplier’s limited view with fictional records.
            </p>
            <button
              className="button outline"
              onClick={() => c.go("supplier-preview")}
            >
              Explore sample supplier view
              <Icon name="ArrowUpRight" size={15} />
            </button>
          </>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                const r = await ops.request("/portal/invite", "POST", {
                  vendorId,
                  email,
                  password,
                });
                setLink(r.link);
                load();
                c.notify(
                  "Private supplier link created. Delivery is queued, not sent.",
                );
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
                setPassword("");
              }
            }}
          >
            <Field label="Supplier">
              <Lookup
                kind="vendors"
                value={vendorId}
                onChange={setVendorId}
                label="Invite supplier"
              />
            </Field>
            <div className="form-grid">
              <Field label="Supplier recipient email">
                <input
                  type="email"
                  value={email}
                  required
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Field label="Confirm your password">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </Field>
            </div>
            <button
              disabled={busy || c.user?.role !== "owner"}
              className="button primary"
            >
              {busy ? "Creating…" : "Create supplier access link"}
            </button>
          </form>
        )}
        {link && (
          <div className="copy-link">
            <b>Supplier access link · expires in 72 hours</b>
            <input aria-label="Private supplier link" readOnly value={link} />
            <small>
              Share only with the intended supplier. Redeeming this link creates
              a supplier session.
            </small>
          </div>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </section>
      {rows.length > 0 && (
        <section className="card detail-card">
          <h2>Supplier access register</h2>
          {rows.map((r) => (
            <article className="session-row" key={r.id}>
              <Icon name="Building2" />
              <div>
                <b>{r.email}</b>
                <small>
                  {c.options.vendors.find((v) => v.id === r.vendor_id)?.name ||
                    r.vendor_id}{" "}
                  · Expires {new Date(r.expires).toLocaleString()}
                </small>
              </div>
              <button
                className="button outline small"
                disabled={r.expires === 0}
                onClick={async () => {
                  await ops.request("/portal/" + r.id, "DELETE", {});
                  load();
                }}
              >
                Revoke access
              </button>
            </article>
          ))}
        </section>
      )}
    </>
  );
}
export function Collaboration() {
  const c = useCRM(),
    ops = useOperations(),
    [kind, setKind] = useState("vendors"),
    [id, setId] = useState(c.recordId || ""),
    [notes, setNotes] = useState(""),
    [ownerId, setOwnerId] = useState(""),
    [tags, setTags] = useState(""),
    [custom, setCustom] = useState<Record<string, string>>({}),
    [fieldKey, setFieldKey] = useState(""),
    [fieldLabel, setFieldLabel] = useState(""),
    [overview, setOverview] = useState<any>({ config: {}, members: [] }),
    [comments, setComments] = useState<any[]>([]),
    [comment, setComment] = useState(""),
    [mentions, setMentions] = useState<string[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    ops.request("/overview").then(setOverview);
  }, []);
  const load = () => {
    if (c.demo) {
      const data = readOps();
      const saved = JSON.parse(
        sessionStorage.getItem(`ofneeds-crm.demo.meta.${kind}.${id}`) || "{}",
      );
      setNotes(saved.notes || "");
      setTags(saved.tags || "");
      setOwnerId(saved.ownerId || "");
      setCustom(saved.custom || {});
      setComments(
        (data.comments || []).filter(
          (r: any) => r.targetKind === kind && r.targetId === id,
        ),
      );
      return;
    }
    Promise.all([
      api(`/api/ops/metadata/${kind}/${id}`),
      ops.request("/records/comments?limit=100"),
    ])
      .then(([m, r]) => {
        setNotes(m.notes || "");
        setTags((m.tags || []).join(", "));
        setOwnerId(m.ownerId || "");
        setCustom(m.customFields || {});
        setComments(
          r.rows.filter((r: any) => r.targetKind === kind && r.targetId === id),
        );
      })
      .catch((e) => setError(e.message));
  };
  useEffect(() => {
    if (id) load();
  }, [kind, id]);
  return (
    <>
      <PageHeader
        title="Team collaboration"
        description="Keep context, ownership and decisions next to the record."
      />
      <div className="card detail-card">
        <div className="form-grid">
          <Field label="Record module">
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setId("");
              }}
            >
              {["vendors", "products", "rfqs", "contacts"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Record">
            <Lookup
              kind={kind}
              value={id}
              onChange={setId}
              label="Collaboration record"
            />
          </Field>
        </div>
      </div>
      {id && (
        <div className="settings-grid">
          <section className="card detail-card">
            <h2>Shared record context</h2>
            <Field label="Internal notes">
              <textarea
                value={notes}
                rows={4}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
            <Field label="Tags (comma separated)">
              <input value={tags} onChange={(e) => setTags(e.target.value)} />
            </Field>
            <Field label="Record owner">
              <select
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
              >
                <option value="">Unassigned</option>
                {overview.members.map((m: any) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
            {overview.config.customFields?.map((f: any) => (
              <Field key={f.key} label={f.label}>
                <input
                  value={custom[f.key] || ""}
                  onChange={(e) =>
                    setCustom((p) => ({ ...p, [f.key]: e.target.value }))
                  }
                />
              </Field>
            ))}
            <button
              className="button primary"
              disabled={!c.write}
              onClick={async () => {
                try {
                  if (c.demo) {
                    sessionStorage.setItem(
                      `ofneeds-crm.demo.meta.${kind}.${id}`,
                      JSON.stringify({ notes, tags, ownerId, custom }),
                    );
                  } else
                    await api(`/api/ops/metadata/${kind}/${id}`, "PATCH", {
                      notes,
                      tags: tags
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                      ownerId,
                      customFields: custom,
                    });
                  c.notify("Record context saved.");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Save record context
            </button>
          </section>
          <section className="card detail-card">
            <h2>Conversation & mentions</h2>
            {comments.map((r) => (
              <article className="comment" key={r.id}>
                <Avatar
                  name={
                    overview.members.find((m: any) => m.id === r.createdBy)
                      ?.name || "Teammate"
                  }
                />
                <div>
                  <b>{r.name}</b>
                  <p>{r.notes}</p>
                  <small>{new Date(r.createdAt).toLocaleString()}</small>
                </div>
              </article>
            ))}
            <Field label="Internal comment">
              <textarea
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </Field>
            <Field label="Mention teammates">
              <select
                multiple
                value={mentions}
                onChange={(e) =>
                  setMentions(
                    Array.from(e.target.selectedOptions).map((o) => o.value),
                  )
                }
              >
                {overview.members.map((m: any) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
            <button
              className="button primary"
              disabled={!c.write || !comment.trim()}
              onClick={async () => {
                try {
                  await ops.request("/records/comments", "POST", {
                    name: comment.slice(0, 80),
                    notes: comment,
                    targetKind: kind,
                    targetId: id,
                    mentions,
                  });
                  setComment("");
                  load();
                  c.notify("Comment added.");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Post internal comment
            </button>
          </section>
        </div>
      )}
      {!c.demo && c.user?.role === "owner" && (
        <section className="card detail-card">
          <h2>Workspace custom fields</h2>
          <div className="form-grid">
            <Field label="Field key">
              <input
                value={fieldKey}
                placeholder="preferred_material"
                onChange={(e) => setFieldKey(e.target.value)}
              />
            </Field>
            <Field label="Field label">
              <input
                value={fieldLabel}
                placeholder="Preferred material"
                onChange={(e) => setFieldLabel(e.target.value)}
              />
            </Field>
          </div>
          <button
            className="button outline"
            onClick={async () => {
              try {
                await ops.request("/config", "PATCH", {
                  customFields: [
                    ...(overview.config.customFields || []),
                    { key: fieldKey, label: fieldLabel },
                  ],
                });
                setOverview(await ops.request("/overview"));
                setFieldKey("");
                setFieldLabel("");
                c.notify("Custom field added.");
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Add custom field
          </button>
        </section>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
export function DataQuality() {
  const c = useCRM(),
    [matrix, setMatrix] = useState<any[][]>([]),
    [mapping, setMapping] = useState<Record<string, number>>({}),
    [preview, setPreview] = useState<any[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [source, setSource] = useState(""),
    [target, setTarget] = useState(""),
    [reason, setReason] = useState(""),
    [password, setPassword] = useState(""),
    [exportQuery, setExportQuery] = useState("");
  const fields = [
    "name",
    "city",
    "contact",
    "email",
    "phone",
    "state",
    "category",
    "type",
    "terms",
  ];
  return (
    <>
      <PageHeader
        title="Data quality & portability"
        description="Map your sheets, reconcile duplicates and export the complete selection."
      />
      <div className="settings-grid">
        <section className="card detail-card">
          <h2>Map an Excel or CSV import</h2>
          <Field label="Vendor sheet (.xlsx or .csv)">
            <input
              type="file"
              accept=".xlsx,.csv"
              disabled={busy || !c.write}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setBusy(true);
                setError("");
                setPreview([]);
                try {
                  if (file.size > 5000000)
                    throw Error("Choose a file under 5 MB.");
                  let m: any[][];
                  if (file.name.toLowerCase().endsWith(".xlsx")) {
                    const Excel = (await import("exceljs")).default,
                      w = new Excel.Workbook();
                    await w.xlsx.load(await file.arrayBuffer());
                    const sheet = w.worksheets[0];
                    if (!sheet || sheet.rowCount > 501)
                      throw Error("Use a header and up to 500 rows.");
                    m = [];
                    sheet.eachRow((row) =>
                      m.push(
                        (row.values as any[])
                          .slice(1)
                          .map((v) =>
                            typeof v === "object" && v !== null
                              ? (v.text ?? v.result ?? "")
                              : v,
                          ),
                      ),
                    );
                  } else m = parseCsv(await file.text());
                  if (m.length < 2 || m.length > 501)
                    throw Error("Use a header and 1–500 rows.");
                  setMatrix(m);
                  setMapping(
                    Object.fromEntries(
                      fields.map((key) => [
                        key,
                        m[0].findIndex(
                          (v: any) => String(v).toLowerCase().trim() === key,
                        ),
                      ]),
                    ),
                  );
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            />
          </Field>
          {matrix.length > 0 && (
            <>
              <div className="form-grid">
                {fields.map((key) => (
                  <Field
                    key={key}
                    label={key + (["name", "city"].includes(key) ? " *" : "")}
                  >
                    <select
                      value={mapping[key] ?? -1}
                      onChange={(e) =>
                        setMapping((p) => ({
                          ...p,
                          [key]: Number(e.target.value),
                        }))
                      }
                    >
                      <option value={-1}>Do not import</option>
                      {matrix[0].map((label, i) => (
                        <option key={i} value={i}>
                          {String(label) || `Column ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </Field>
                ))}
              </div>
              <button
                className="button outline"
                onClick={() => {
                  try {
                    const rows = mapImport(matrix, mapping);
                    rows.forEach((row) => validateRecord("vendors", row));
                    setPreview(rows);
                    setError("");
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Validate mapped rows
              </button>
            </>
          )}
          {preview.length > 0 && (
            <>
              <p>
                {preview.length} mapped rows ready. Preview:{" "}
                {preview
                  .slice(0, 3)
                  .map((r) => r.name)
                  .join(", ")}
                .
              </p>
              <button
                className="button primary"
                disabled={busy || !c.write}
                onClick={async () => {
                  setBusy(true);
                  try {
                    if (c.demo) {
                      let next = c.data;
                      const previous = sessionStorage.getItem(
                        "ofneeds-vendor-crm.demo.v1",
                      );
                      try {
                        for (const row of preview)
                          next = demoSave(next, "vendors", row).data;
                      } catch (e) {
                        if (previous)
                          sessionStorage.setItem(
                            "ofneeds-vendor-crm.demo.v1",
                            previous,
                          );
                        throw e;
                      }
                      saveDemo(next);
                      location.reload();
                    } else {
                      await api("/api/crm/import", "POST", { rows: preview });
                      setPreview([]);
                      c.refresh();
                      c.notify("Mapped vendor import complete.");
                    }
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Confirm import
              </button>
            </>
          )}
        </section>
        <section className="card detail-card">
          <h2>Merge duplicate vendor relationships</h2>
          <p>
            The source is archived; contacts, prices and workflow links move to
            the retained vendor. Conflicting quotations must be reconciled
            first.
          </p>
          <Field label="Duplicate source">
            <Lookup
              kind="vendors"
              value={source}
              onChange={setSource}
              label="Duplicate vendor"
            />
          </Field>
          <Field label="Retain this vendor">
            <Lookup
              kind="vendors"
              value={target}
              onChange={setTarget}
              label="Retained vendor"
            />
          </Field>
          <Field label="Merge reason">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          {!c.demo && (
            <Field label="Confirm owner password">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
          )}
          <button
            className="button outline"
            disabled={
              busy ||
              c.demo ||
              !c.write ||
              !source ||
              !target ||
              source === target ||
              !reason.trim()
            }
            onClick={async () => {
              setBusy(true);
              try {
                if (c.demo) {
                  throw Error(
                    "Vendor merging requires an owner account. Demo records can be archived individually.",
                  );
                }
                await api("/api/services/vendors/merge", "POST", {
                  sourceId: source,
                  targetId: target,
                  reason,
                  password,
                });
                setSource("");
                setPassword("");
                c.refresh();
                c.notify(
                  "Relationships merged; source retained as archived history.",
                );
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Merge and preserve history
          </button>
          {c.demo && (
            <small className="muted">
              Merge is available in private owner accounts; sample archive
              remains available in Vendors.
            </small>
          )}
        </section>
      </div>
      <section className="card detail-card">
        <h2>Export all matching vendors</h2>
        <p>
          This covers all matching records, up to 25,000 rows per export,
          including records beyond the current page.
        </p>
        <Field label="Filter by keyword">
          <input
            value={exportQuery}
            onChange={(e) => setExportQuery(e.target.value)}
          />
        </Field>
        <button
          className="button outline"
          onClick={async () => {
            try {
              if (c.demo)
                download(
                  "ofneeds-all-vendors.csv",
                  csv(
                    filterRecords(c.data.vendors, { q: exportQuery }),
                    fields,
                  ),
                );
              else
                await downloadPrivate(
                  "/api/services/export/vendors?q=" +
                    encodeURIComponent(exportQuery),
                  "ofneeds-all-vendors.csv",
                );
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <Icon name="Download" size={16} />
          Export all matching vendors
        </button>
      </section>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
export async function downloadPrivate(path: string, name: string) {
  const response = await fetch(path, { credentials: "same-origin" });
  if (!response.ok) {
    const body = await response.json();
    throw Error(body.error || "Download failed");
  }
  const url = URL.createObjectURL(await response.blob()),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function Connections({ section }: { section: string }) {
  const c = useCRM(),
    [rows, setRows] = useState<any[]>([]),
    [info, setInfo] = useState<any>(null),
    [status, setStatus] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [password, setPassword] = useState(""),
    [name, setName] = useState(""),
    [scopes, setScopes] = useState<string[]>(["products:read"]),
    [key, setKey] = useState(""),
    [webhookUrl, setWebhookUrl] = useState(""),
    [webhooks, setWebhooks] = useState<any[]>([]),
    [auditRow, setAuditRow] = useState<any>(null);
  const restricted = ["delivery", "integrations", "billing", "audit"].includes(
      section,
    ),
    canManage = c.user?.role === "owner";
  const titles: Record<string, string> = {
    delivery: "Delivery & report center",
    integrations: "Developer connections",
    billing: "Plans & workspace usage",
    audit: "Audit history",
    "service-health": "Service health",
    "stock-freshness": "Price & stock freshness",
  };
  const load = async () => {
    if (c.demo) return;
    try {
      setStatus(await api("/api/services/status"));
      if (restricted && !canManage) return;
      if (section === "delivery") {
        const [messages, reports] = await Promise.all([
          api("/api/ops/outbox"),
          api("/api/services/report-snapshots"),
        ]);
        setRows(messages);
        setInfo({ reports });
      } else if (section === "integrations") {
        const [keys, jobs] = await Promise.all([
          api("/api/services/api-keys"),
          api("/api/services/webhooks"),
        ]);
        setRows(keys);
        setWebhooks(jobs);
      } else if (section === "billing")
        setInfo(await api("/api/services/billing"));
      else if (section === "audit") {
        const result = await api("/api/ops/audit");
        setRows(result.rows);
        setInfo(result);
      } else if (section === "stock-freshness")
        setRows(await api("/api/services/stock-freshness"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    load();
  }, [section]);
  const action = async (path: string, body: any) => {
    setBusy(true);
    try {
      const r = await api(path, "POST", body);
      c.notify(
        r.notice || `Action complete${r.status ? " · " + r.status : ""}`,
      );
      await load();
      return r;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader
        title={titles[section] || section}
        description={
          section === "stock-freshness"
            ? "Know when a supplier last confirmed a price or availability."
            : "Private workspace controls with explicit delivery and integration states."
        }
      />
      {c.demo ? (
        <div className="report-note">
          <Icon name="LockKeyhole" />
          This service requires a private workspace. Demo access never creates
          API keys, sends messages, changes a subscription or reads a real audit
          history.
        </div>
      ) : restricted && !canManage ? (
        <div className="report-note">
          These controls are available to the workspace owner.
        </div>
      ) : (
        <>
          {section === "service-health" && status && (
            <>
              <div className="metrics-grid">
                {[
                  ["Email", status.email],
                  ["WhatsApp", status.whatsapp],
                  ["Document scanning", status.scanner],
                  ["Billing webhook", status.billingWebhook],
                ].map(([label, ready]) => (
                  <div className="metric-card" key={String(label)}>
                    <span className="metric-label">{String(label)}</span>
                    <strong>
                      <Icon
                        name={ready ? "CircleCheck" : "CircleHelp"}
                        size={28}
                      />
                    </strong>
                    <Badge tone={ready ? "green" : "amber"}>
                      {ready ? "Configured" : "Not configured"}
                    </Badge>
                  </div>
                ))}
              </div>
              <section className="card detail-card">
                <h2>Storage & local jobs</h2>
                <p>
                  Last scheduled encrypted backup:{" "}
                  {status.lastBackup
                    ? new Date(status.lastBackup).toLocaleString()
                    : "No completed scheduled backup recorded"}
                  . Backup interval:{" "}
                  {status.backupIntervalHours
                    ? `${status.backupIntervalHours} hours`
                    : "Disabled for this local server"}
                  .
                </p>
                <p>
                  {(status.storageBytes / 1000000).toFixed(2)} MB used of{" "}
                  {(status.quota.storage / 1000000).toFixed(0)} MB. Jobs
                  generate local tasks, notifications and report snapshots; they
                  do not automatically dispatch messages.
                </p>
                <button
                  className="button primary"
                  disabled={busy || !canManage}
                  onClick={() => action("/api/services/process-jobs", {})}
                >
                  Process due local jobs
                </button>
                <p className="section-description">
                  Encrypted full-server backup and restore commands are included
                  in the runbook. Only an operator with server access can
                  restore the database.
                </p>
              </section>
            </>
          )}
          {section === "delivery" && (
            <>
              <div className="report-note">
                <Icon name="Info" />
                Queueing is separate from dispatch. Provider failures remain
                visible. Verify receipt before retrying an uncertain delivery.
              </div>
              <section className="card detail-card">
                <div className="quote-heading">
                  <h2>Message outbox</h2>
                  <button className="button outline small" onClick={load}>
                    Refresh
                  </button>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Recipient</th>
                        <th>Subject</th>
                        <th>Channel</th>
                        <th>Status</th>
                        <th>Attempts</th>
                        <th>Dispatch</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id}>
                          <td>{r.recipient}</td>
                          <td>
                            {r.subject}
                            {r.last_error && <small>{r.last_error}</small>}
                          </td>
                          <td>{r.channel}</td>
                          <td>
                            <Status value={r.status} />
                          </td>
                          <td>{r.attempts}</td>
                          <td>
                            <button
                              disabled={
                                busy ||
                                r.status === "sent" ||
                                (r.channel === "email"
                                  ? !status?.email
                                  : !status?.whatsapp)
                              }
                              className="button outline small"
                              onClick={() =>
                                action("/api/ops/outbox/" + r.id + "/send", {})
                              }
                            >
                              Dispatch message
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!rows.length && (
                  <Empty
                    title="No queued messages"
                    description="RFQs, invitations and scheduled reports appear here."
                  />
                )}
              </section>
              <section className="card detail-card">
                <h2>Private report snapshots</h2>
                {info?.reports?.map((r: any) => (
                  <button
                    className="related-row"
                    key={r.id}
                    onClick={() =>
                      downloadPrivate(
                        "/api/services/report-snapshots/" + r.id,
                        "ofneeds-report.csv",
                      ).catch((e) => setError(e.message))
                    }
                  >
                    <Icon name="FileSpreadsheet" />
                    <span>
                      {r.name}
                      <small>{new Date(r.created).toLocaleString()}</small>
                    </span>
                    <Icon name="Download" size={16} />
                  </button>
                ))}
                <button
                  className="button outline"
                  onClick={() => c.go("scheduled-reports")}
                >
                  Manage report schedules
                  <Icon name="ArrowRight" size={15} />
                </button>
              </section>
            </>
          )}
          {section === "integrations" && (
            <>
              <div className="settings-grid">
                <section className="card detail-card">
                  <h2>Create a scoped API key</h2>
                  <p>
                    Keys are read-only, expire after 30 days by default and only
                    access this workspace.
                  </p>
                  <Field label="Connection name">
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </Field>
                  <div className="checkbox-grid">
                    {["vendors:read", "products:read", "rfqs:read"].map((s) => (
                      <label key={s}>
                        <input
                          type="checkbox"
                          checked={scopes.includes(s)}
                          onChange={(e) =>
                            setScopes(
                              e.target.checked
                                ? [...scopes, s]
                                : scopes.filter((v) => v !== s),
                            )
                          }
                        />
                        {s}
                      </label>
                    ))}
                  </div>
                  <Field label="Confirm owner password">
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </Field>
                  <button
                    disabled={busy || !password}
                    className="button primary"
                    onClick={async () => {
                      const r = await action("/api/services/api-keys", {
                        name,
                        scopes,
                        password,
                      });
                      if (r) setKey(r.key);
                      setPassword("");
                    }}
                  >
                    Create key
                  </button>
                  {key && (
                    <div className="copy-link">
                      <b>Copy now · shown once</b>
                      <input
                        aria-label="New integration secret"
                        readOnly
                        value={key}
                      />
                      <button
                        className="button ghost small"
                        onClick={() => setKey("")}
                      >
                        Hide key
                      </button>
                    </div>
                  )}
                </section>
                <section className="card detail-card">
                  <h2>Signed webhook events</h2>
                  <p>
                    Configure a receiver. The operator must allowlist its HTTPS
                    hostname before any dispatch.
                  </p>
                  <Field label="Confirm owner password for receiver changes">
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                    />
                  </Field>
                  <Field label="HTTPS receiver URL">
                    <input
                      type="url"
                      value={webhookUrl}
                      onChange={(e) => setWebhookUrl(e.target.value)}
                    />
                  </Field>
                  <button
                    className="button outline"
                    onClick={async () => {
                      try {
                        const r = await api("/api/ops/config", "PATCH", {
                          webhook: { url: webhookUrl },
                          password,
                        });
                        if (r.webhookSecret) setKey(r.webhookSecret);
                        setPassword("");
                        c.notify(
                          "Webhook configured. Process local jobs to prepare event deliveries.",
                        );
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    Configure receiver
                  </button>
                  <button
                    className="button ghost"
                    disabled={busy}
                    onClick={() => action("/api/services/process-jobs", {})}
                  >
                    Prepare pending events
                  </button>
                </section>
              </div>
              <section className="card detail-card">
                <h2>Existing keys</h2>
                {rows.map((r) => (
                  <article className="session-row" key={r.id}>
                    <Icon name="KeyRound" />
                    <div>
                      <b>{r.name}</b>
                      <small>
                        {JSON.parse(r.scopes).join(", ")} · Expires{" "}
                        {new Date(r.expires).toLocaleDateString()}
                      </small>
                    </div>
                    {r.revoked ? (
                      <Badge>Revoked</Badge>
                    ) : (
                      <button
                        className="button outline small"
                        onClick={async () => {
                          await api(
                            "/api/services/api-keys/" + r.id,
                            "DELETE",
                            {},
                          );
                          load();
                        }}
                      >
                        Revoke
                      </button>
                    )}
                  </article>
                ))}
              </section>
              <section className="card detail-card">
                <h2>Webhook delivery register</h2>
                {webhooks.map((r) => (
                  <article className="session-row" key={r.id}>
                    <div>
                      <b>{r.event_id}</b>
                      <small>
                        {r.error || new Date(r.created).toLocaleString()}
                      </small>
                    </div>
                    <Status value={r.status} />
                    <button
                      disabled={busy || r.status === "sent"}
                      className="button outline small"
                      onClick={() =>
                        action("/api/services/webhooks/" + r.id + "/send", {})
                      }
                    >
                      Dispatch event
                    </button>
                  </article>
                ))}
              </section>
            </>
          )}
          {section === "billing" && info && (
            <>
              <div className="report-note">
                <Icon name="Info" />
                Plan requests do not charge a card or activate a paid
                subscription. Paid activation requires a verified provider
                webhook matching the configured amount and currency.
              </div>
              <div className="metrics-grid">
                {[
                  ["Vendors", info.usage.vendors, info.limits.vendors],
                  ["Team seats", info.usage.seats, info.limits.seats],
                  [
                    "Storage MB",
                    ((status?.storageBytes || 0) / 1000000).toFixed(1),
                    info.limits.storage / 1000000,
                  ],
                ].map(([label, n, limit]) => (
                  <div className="metric-card" key={label}>
                    <span className="metric-label">{label}</span>
                    <strong>{n}</strong>
                    <span className="metric-foot">of {limit}</span>
                  </div>
                ))}
              </div>
              <section className="card detail-card">
                <h2>Current plan: {info.subscription.plan}</h2>
                <Badge tone="blue">{info.subscription.status}</Badge>
                <p className="section-description">
                  {info.subscription.notice ||
                    `Term ends ${info.subscription.termEnd || "not recorded"}`}
                </p>
                <div className="form-actions">
                  {["team", "enterprise"].map((plan) => (
                    <button
                      key={plan}
                      className="button outline"
                      disabled={busy}
                      onClick={() =>
                        action("/api/services/billing/request", { plan })
                      }
                    >
                      Request {plan}
                      {info.catalog[plan]?.amountPaise
                        ? ` · ₹${info.catalog[plan].amountPaise / 100}`
                        : ""}
                    </button>
                  ))}
                </div>
              </section>
              <section className="card detail-card">
                <h2>Plan request history</h2>
                {info.requests.map((r: any) => (
                  <article className="session-row" key={r.id}>
                    <div>
                      <b>{r.plan}</b>
                      <small>{new Date(r.created).toLocaleString()}</small>
                    </div>
                    <Status value={r.status} />
                  </article>
                ))}
              </section>
            </>
          )}
          {section === "audit" && (
            <section className="card detail-card">
              <div className="quote-heading">
                <h2>Append-only workspace history</h2>
                <Badge tone={info?.valid ? "green" : "red"}>
                  {info?.valid ? "Hash chain verified" : "Checking integrity"}
                </Badge>
              </div>
              <p>
                The server records the actor, record, before/after state and
                decision reason. This is tamper-evident application history, not
                protection against a privileged server administrator.
              </p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Actor</th>
                      <th>Action</th>
                      <th>Module</th>
                      <th>Record</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td>{new Date(r.created).toLocaleString()}</td>
                        <td>{r.actor.slice(0, 15)}</td>
                        <td>{r.action}</td>
                        <td>{r.kind}</td>
                        <td>{r.record_id?.slice(0, 12)}</td>
                        <td>
                          <button
                            className="button ghost small"
                            onClick={() => setAuditRow(r)}
                          >
                            View changes
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="section-description">
                Showing the latest 50 of {info?.total || 0} events.
              </p>
            </section>
          )}
          {section === "stock-freshness" && (
            <section className="card detail-card">
              <p>
                Availability is recorded supplier information, not a guaranteed
                live reservation. Missing confirmations and confirmations older
                than seven days are marked stale.
              </p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Supplier</th>
                      <th>Price</th>
                      <th>Stock</th>
                      <th>Confirmed</th>
                      <th>Freshness</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i}>
                        <td>{r.product}</td>
                        <td>{r.vendor}</td>
                        <td>
                          <Money value={r.price} />
                        </td>
                        <td>{r.stock}</td>
                        <td>
                          {r.confirmedAt
                            ? new Date(r.confirmedAt).toLocaleDateString()
                            : "Not recorded"}
                        </td>
                        <td>
                          <Badge
                            tone={
                              r.expired ? "red" : r.stale ? "amber" : "green"
                            }
                          >
                            {r.expired
                              ? "Expired"
                              : r.stale
                                ? "Confirm again"
                                : "Recently confirmed"}
                          </Badge>
                        </td>
                        <td>
                          <button
                            className="button outline small"
                            disabled={busy || !c.write}
                            onClick={() =>
                              action("/api/services/stock-confirmation", {
                                productId: r.productId,
                                vendorId: r.vendorId,
                              })
                            }
                          >
                            Record confirmation
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {auditRow && (
            <Modal
              wide
              title="Recorded changes"
              onClose={() => setAuditRow(null)}
            >
              <div className="modal-body">
                <h3>{auditRow.action}</h3>
                <div className="settings-grid">
                  <div>
                    <h4>Before</h4>
                    <pre className="json-preview">
                      {JSON.stringify(
                        JSON.parse(auditRow.before_json || "null"),
                        null,
                        2,
                      )}
                    </pre>
                  </div>
                  <div>
                    <h4>After</h4>
                    <pre className="json-preview">
                      {JSON.stringify(
                        JSON.parse(auditRow.after_json || "null"),
                        null,
                        2,
                      )}
                    </pre>
                  </div>
                </div>
              </div>
            </Modal>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </>
  );
}
