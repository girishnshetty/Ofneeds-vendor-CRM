import { useEffect, useRef, useState } from "react";
import { api } from "./client";
import { Logo, Icon, Field, Modal, Status, Money, Badge, Empty } from "./ui";
import { downloadPrivate } from "./Workspaces";
import { readOps } from "./opsClient";
export function AccountLinkPage({
  mode,
  onUser,
}: {
  mode: string;
  onUser: (user: any) => void;
}) {
  const token = new URLSearchParams(location.search).get("token") || "",
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [invitation, setInvitation] = useState<any>(null);
  useEffect(() => {
    if (mode === "accept-invitation")
      api("/api/auth/invitation?token=" + encodeURIComponent(token))
        .then(setInvitation)
        .catch((e) => setError(e.message));
  }, [token, mode]);
  return (
    <div className="gateway-page">
      <a data-route href="/">
        <Logo />
      </a>
      <section className="card gateway-card">
        <span className="eyebrow">SECURE ACCOUNT LINK</span>
        <h1>
          {mode === "verify-email"
            ? "Verify your email"
            : mode === "accept-invitation"
              ? "Join your team"
              : "Choose a new password"}
        </h1>
        {invitation && (
          <p>
            Join {invitation.workspace} as {invitation.role} using{" "}
            {invitation.email}.
          </p>
        )}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            setError("");
            try {
              const values = Object.fromEntries(new FormData(e.currentTarget));
              if (values.password && values.password !== values.confirmation)
                throw Error("Passwords do not match.");
              const r = await api("/api/auth/" + mode, "POST", {
                ...values,
                token,
              });
              if (r.user) onUser(r.user);
              else setMessage(r.message || "Action completed.");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {mode === "accept-invitation" && (
            <Field label="Your name">
              <input required name="name" autoComplete="name" maxLength={100} />
            </Field>
          )}
          {mode !== "verify-email" && (
            <>
              <Field label="New password">
                <input
                  required
                  type="password"
                  name="password"
                  minLength={12}
                  maxLength={200}
                  autoComplete="new-password"
                />
              </Field>
              <Field label="Confirm password">
                <input
                  required
                  type="password"
                  name="confirmation"
                  minLength={12}
                  maxLength={200}
                  autoComplete="new-password"
                />
              </Field>
            </>
          )}
          {mode === "reset-password" && (
            <Field label="Authenticator or recovery code (if MFA is enabled)">
              <input name="code" autoComplete="one-time-code" />
            </Field>
          )}
          {!message && (
            <button className="button primary full" disabled={busy || !token}>
              {busy
                ? "Working…"
                : mode === "verify-email"
                  ? "Verify email"
                  : mode === "accept-invitation"
                    ? "Accept invitation"
                    : "Update password"}
            </button>
          )}
        </form>
        {message && (
          <p className="success" role="status">
            {message}
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <a data-route className="button ghost" href="/login">
          Back to sign in
          <Icon name="ArrowRight" size={15} />
        </a>
      </section>
    </div>
  );
}
export function SupplierPortal({
  demoData,
  onDemoChange,
}: {
  demoData?: any;
  onDemoChange?: (value: any) => void;
}) {
  const [data, setData] = useState<any>(demoData || null),
    [tab, setTab] = useState("Overview"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [form, setForm] = useState<any>(null),
    init = useRef<Promise<any> | null>(null);
  const demo = !!demoData;
  const load = () =>
    api("/api/portal/workspace")
      .then(setData)
      .catch((e) => setError(e.message));
  useEffect(() => {
    if (demo) return;
    const token = new URLSearchParams(location.search).get("token");
    if (!init.current)
      init.current = (
        token
          ? api("/api/portal/exchange", "POST", { token })
          : Promise.resolve()
      ).then(() => {
        history.replaceState({}, "", "/supplier-portal");
        return api("/api/portal/workspace");
      });
    let alive = true;
    init.current
      .then((r) => {
        if (alive) setData(r);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, []);
  const action = async (path: string, body: any) => {
    setBusy(true);
    setError("");
    try {
      if (demo) {
        const next = structuredClone(data);
        if (path.startsWith("/rfqs/")) {
          const r = next.rfqs.find((r: any) => r.id === path.split("/")[2]);
          r.responses = [{ ...body, vendorId: next.vendor.id }];
          r.status = "Quoted";
        } else if (path.startsWith("/products/")) {
          const p = next.products.find((p: any) => p.id === path.split("/")[2]);
          p.quotes = [
            {
              ...body,
              vendorId: next.vendor.id,
              confirmedAt: new Date().toISOString(),
            },
          ];
        } else if (path.startsWith("/orders/")) {
          const o = next.orders.find((o: any) => o.id === path.split("/")[2]);
          if (body.action === "accept" || body.action === "decline") {
            if (o.status !== "Issued")
              throw Error("Only issued orders can be acknowledged.");
            o.status = body.action === "accept" ? "Accepted" : "Declined";
          } else if (body.action === "dispatch") {
            if (o.status !== "Accepted" || !body.reference)
              throw Error("Accept the order and enter a dispatch reference.");
            o.status = "Dispatched";
            o.dispatchReference = body.reference;
          }
        } else if (path === "/profile") {
          next.pendingProfile = body;
        } else if (path === "/documents") {
          next.documents.push({
            id: crypto.randomUUID(),
            name: body.name,
            description: "Sample supplier upload",
            uploadedBySupplier: true,
          });
        }
        setData(next);
        onDemoChange?.(next);
      } else {
        await api("/api/portal" + path, "POST", body);
        await load();
      }
      setForm(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={`supplier-portal ${demo ? "supplier-preview" : ""}`}>
      <header>
        <a data-route href="/">
          <Logo />
        </a>
        <div>
          <Badge tone="blue">
            {demo ? "Fictional supplier preview" : "Private supplier portal"}
          </Badge>
          {!demo && (
            <button
              className="button ghost small"
              onClick={async () => {
                await api("/api/portal/logout", "POST", {});
                setData(null);
                setError(
                  "Signed out. Open a new supplier invitation to return.",
                );
              }}
            >
              Sign out
            </button>
          )}
        </div>
      </header>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!data ? (
        <section className="card detail-card">
          <h1>Supplier access</h1>
          <p>
            Open the private invitation link from your procurement contact. This
            portal has separate, supplier-scoped access and does not accept a
            CRM account session.
          </p>
        </section>
      ) : (
        <>
          <div className="supplier-heading">
            <span className="eyebrow">
              WORKING WITH {data.workspaceName || "YOUR PROCUREMENT TEAM"}
            </span>
            <h1>Hello, {data.vendor.name}.</h1>
            <p>
              Your products, quotations and order updates. One clear place to
              collaborate.
            </p>
          </div>
          <nav className="section-tabs">
            {["Overview", "RFQs", "Products", "Orders", "Documents"].map(
              (t) => (
                <button
                  key={t}
                  className={tab === t ? "selected" : ""}
                  onClick={() => setTab(t)}
                >
                  {t}
                </button>
              ),
            )}
          </nav>
          {tab === "Overview" ? (
            <div className="settings-grid">
              <section className="card detail-card">
                <h2>Your supplier profile</h2>
                <dl>
                  {[
                    ["Company", data.vendor.name],
                    ["Contact", data.vendor.contact],
                    ["Email", data.vendor.email],
                    ["City", data.vendor.city],
                    ["Address", data.vendor.address],
                  ].map(([key, value]) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>{value || "Not recorded"}</dd>
                    </div>
                  ))}
                </dl>
                <button
                  className="button outline"
                  onClick={() => setForm({ type: "profile", ...data.vendor })}
                >
                  Propose profile update
                </button>
                <p className="section-description">
                  Changes are submitted to procurement for review. Authorization
                  status cannot be changed from the supplier portal.
                </p>
                {data.pendingProfile && (
                  <Badge tone="amber">Profile update pending review</Badge>
                )}
              </section>
              <section className="card detail-card">
                <h2>Your sourcing desk</h2>
                <div className="supplier-counts">
                  {[
                    ["Assigned RFQs", data.rfqs.length],
                    ["Products", data.products.length],
                    ["Issued orders", data.orders.length],
                  ].map(([label, n]) => (
                    <div key={label}>
                      <strong>{n}</strong>
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
                <p>
                  Only your own pricing and assigned transactions are shown.
                  Competing supplier quotations remain private.
                </p>
              </section>
            </div>
          ) : tab === "RFQs" ? (
            <div className="ops-grid">
              {data.rfqs.map((r: any) => (
                <article className="card ops-record" key={r.id}>
                  <Status value={r.status} />
                  <h2>{r.name}</h2>
                  <p>
                    {r.quantity} units · Deadline {r.deadline || "not set"}
                  </p>
                  <p>{r.notes}</p>
                  {r.responses?.[0] && (
                    <div className="order-total">
                      Your response <Money value={r.responses[0].price} /> /
                      unit
                    </div>
                  )}
                  <button
                    disabled={busy || r.status === "Closed"}
                    className="button primary"
                    onClick={() =>
                      setForm({
                        type: "quote",
                        id: r.id,
                        price: 1,
                        moq: 1,
                        stock: 0,
                        leadTime: 1,
                        customization: 0,
                        packaging: 0,
                        freight: 0,
                        taxRate: 0,
                        ...r.responses?.[0],
                      })
                    }
                  >
                    Submit / revise your quotation
                  </button>
                </article>
              ))}
              {!data.rfqs.length && <Empty title="No RFQs assigned" />}
            </div>
          ) : tab === "Products" ? (
            <div className="ops-grid">
              {data.products.map((p: any) => (
                <article className="card ops-record" key={p.id}>
                  <span className="feature-icon">
                    <Icon name="Package" />
                  </span>
                  <h2>{p.name}</h2>
                  <p>{p.category}</p>
                  {p.quotes?.map((q: any) => (
                    <dl key={q.vendorId}>
                      <div>
                        <dt>Your price</dt>
                        <dd>
                          <Money value={q.price} />
                        </dd>
                      </div>
                      <div>
                        <dt>Stock</dt>
                        <dd>{q.stock}</dd>
                      </div>
                      <div>
                        <dt>Confirmed</dt>
                        <dd>
                          {q.confirmedAt
                            ? new Date(q.confirmedAt).toLocaleDateString()
                            : "Not recorded"}
                        </dd>
                      </div>
                    </dl>
                  ))}
                  <button
                    className="button outline"
                    onClick={() =>
                      setForm({ type: "stock", id: p.id, ...p.quotes[0] })
                    }
                  >
                    Update price & availability
                  </button>
                </article>
              ))}
            </div>
          ) : tab === "Orders" ? (
            <div className="ops-grid">
              {data.orders.map((o: any) => (
                <article className="card ops-record" key={o.id}>
                  <Status value={o.status} />
                  <span className="eyebrow">{o.number}</span>
                  <h2>{o.name}</h2>
                  <p>
                    {o.lines?.length} order lines · Due {o.dueDate || "not set"}
                  </p>
                  <div className="order-total">
                    Total <Money value={(o.totals?.total || 0) / 100} />
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Quantity</th>
                          <th>Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {o.lines.map((l: any) => (
                          <tr key={l.id}>
                            <td>{l.description || l.productId}</td>
                            <td>{l.quantity}</td>
                            <td>
                              <Money value={l.price} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="form-actions">
                    {o.status === "Issued" && (
                      <>
                        <button
                          className="button outline"
                          disabled={busy}
                          onClick={() =>
                            action(`/orders/${o.id}/action`, {
                              action: "decline",
                            })
                          }
                        >
                          Decline
                        </button>
                        <button
                          className="button primary"
                          disabled={busy}
                          onClick={() =>
                            action(`/orders/${o.id}/action`, {
                              action: "accept",
                            })
                          }
                        >
                          Accept order
                        </button>
                      </>
                    )}
                    {o.status === "Accepted" && (
                      <button
                        className="button primary"
                        onClick={() =>
                          setForm({ type: "dispatch", id: o.id, reference: "" })
                        }
                      >
                        Record dispatch
                      </button>
                    )}
                  </div>
                </article>
              ))}
              {!data.orders.length && (
                <Empty
                  title="No issued orders"
                  description="Draft orders and internal approval work remain private to procurement."
                />
              )}
            </div>
          ) : (
            <section className="card detail-card">
              <div className="quote-heading">
                <h2>Your uploaded catalogues</h2>
                <button
                  className="button primary"
                  onClick={() => setForm({ type: "document", name: "" })}
                >
                  Upload catalogue
                </button>
              </div>
              {data.documents.map((d: any) => (
                <button
                  className="related-row"
                  key={d.id}
                  onClick={() =>
                    demo
                      ? download(
                          "sample-catalogue.txt",
                          "Fictional supplier document.",
                          "text/plain",
                        )
                      : downloadPrivate(
                          "/api/portal/documents/" + d.id + "/file",
                          d.name,
                        ).catch((e) => setError(e.message))
                  }
                >
                  <Icon name="FileText" />
                  <span>
                    {d.name}
                    <small>{d.description}</small>
                  </span>
                  <Icon name="Download" size={15} />
                </button>
              ))}
            </section>
          )}
          {form && (
            <SupplierForm
              value={form}
              busy={busy}
              onClose={() => setForm(null)}
              submit={action}
            />
          )}
        </>
      )}
    </div>
  );
}
import { download } from "./client";
function SupplierForm({
  value,
  busy,
  onClose,
  submit,
}: {
  value: any;
  busy: boolean;
  onClose: () => void;
  submit: (path: string, body: any) => Promise<void>;
}) {
  const [form, setForm] = useState(value),
    [file, setFile] = useState<File | null>(null),
    [error, setError] = useState("");
  const set = (key: string, value: any) =>
    setForm((p: any) => ({ ...p, [key]: value }));
  return (
    <Modal
      wide
      title={
        value.type === "profile"
          ? "Propose supplier profile changes"
          : value.type === "quote"
            ? "Your quotation response"
            : value.type === "stock"
              ? "Confirm price and availability"
              : value.type === "document"
                ? "Upload a supplier catalogue"
                : "Record dispatch"
      }
      onClose={onClose}
    >
      <form
        className="modal-body"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          try {
            let body = { ...form };
            if (form.type === "document") {
              if (!file || file.size > 4000000)
                throw Error("Choose a PDF, PNG, JPG or TXT under 4 MB.");
              const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result));
                reader.onerror = reject;
                reader.readAsDataURL(file);
              });
              body = {
                ...body,
                base64: dataUrl.split(",")[1],
                mime: file.type,
              };
            }
            const path =
              form.type === "profile"
                ? "/profile"
                : form.type === "quote"
                  ? `/rfqs/${form.id}/respond`
                  : form.type === "stock"
                    ? `/products/${form.id}/stock`
                    : form.type === "document"
                      ? "/documents"
                      : `/orders/${form.id}/action`;
            await submit(path, {
              ...body,
              ...(form.type === "dispatch" ? { action: "dispatch" } : {}),
            });
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <div className="form-grid">
          {form.type === "profile" ? (
            [
              "name",
              "contact",
              "email",
              "phone",
              "city",
              "state",
              "address",
            ].map((key) => (
              <Field key={key} label={key[0].toUpperCase() + key.slice(1)}>
                <input
                  required={["name", "city"].includes(key)}
                  type={key === "email" ? "email" : "text"}
                  value={form[key] || ""}
                  onChange={(e) => set(key, e.target.value)}
                />
              </Field>
            ))
          ) : ["quote", "stock"].includes(form.type) ? (
            <>
              {[
                ["Unit price ₹", "price", 1],
                ["MOQ", "moq", 1],
                ["Stock", "stock", 0],
                ["Lead time days", "leadTime", 0],
                ...(form.type === "quote"
                  ? [
                      ["Customization / unit ₹", "customization", 0],
                      ["Packaging / unit ₹", "packaging", 0],
                      ["Freight total ₹", "freight", 0],
                      ["Tax rate %", "taxRate", 0],
                    ]
                  : []),
              ].map(([label, key, min]) => (
                <Field key={key} label={String(label)}>
                  <input
                    required
                    type="number"
                    min={Number(min)}
                    step={
                      ["moq", "stock", "leadTime"].includes(String(key))
                        ? "1"
                        : ".01"
                    }
                    value={form[key] ?? 0}
                    onChange={(e) => set(String(key), Number(e.target.value))}
                  />
                </Field>
              ))}
              <Field label="Quote valid until">
                <input
                  type="date"
                  value={form.validUntil || ""}
                  onChange={(e) => set("validUntil", e.target.value)}
                />
              </Field>
            </>
          ) : form.type === "dispatch" ? (
            <Field label="Dispatch / tracking reference">
              <input
                required
                value={form.reference}
                onChange={(e) => set("reference", e.target.value)}
              />
            </Field>
          ) : (
            <>
              <Field label="Document name">
                <input
                  required
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                />
              </Field>
              <Field label="Private attachment">
                <input
                  type="file"
                  required
                  accept=".pdf,.png,.jpg,.jpeg,.txt"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </Field>
            </>
          )}
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="button outline" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy
              ? "Saving…"
              : form.type === "profile"
                ? "Submit for review"
                : "Save supplier update"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
