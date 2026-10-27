import Lookup from "./Lookup";
import { useEffect, useRef, useState } from "react";
import { useCRM } from "./context";
import { Field, Icon, Modal, Badge } from "./ui";
import { categories } from "../shared/core.mjs";
import type { Row } from "./types";
import { api } from "./client";
export function VendorWizard({
  row,
  onClose,
}: {
  row?: Partial<Row>;
  onClose: () => void;
}) {
  const c = useCRM(),
    draftKey = `ofneeds-crm.draft.${c.demo ? "demo" : c.user?.id}.${row?.id || "new"}`;
  const [value, setValue] = useState<Record<string, any>>(() => {
    if (row?.id) return { ...row };
    try {
      const stored = JSON.parse(sessionStorage.getItem(draftKey) || "null");
      if (stored) return stored;
    } catch {}
    return {
      name: "",
      city: "",
      contact: "",
      email: "",
      phone: "",
      type: "Distributor",
      status: "Active",
      authorization: "Unverified",
      category: c.prefs.categories?.[0] || categories[0],
      brandIds: [],
      terms: "30 days from invoice",
      moq: 25,
      leadTime: 5,
      stock: "On request",
      ...row,
    };
  });
  const [step, setStep] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [brandQuery, setBrandQuery] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const steps = [
    "Company",
    "Contacts",
    "Addresses",
    "Brands & categories",
    "Commercials",
    "Review & save",
  ];
  const update = (key: string, v: any) =>
    setValue((old) => ({ ...old, [key]: v }));
  useEffect(() => {
    formRef.current
      ?.querySelector<HTMLInputElement>("input,select,button")
      ?.focus();
  }, [step]);
  const field = (
    label: string,
    key: string,
    type = "text",
    required = false,
    hint?: string,
  ) => (
    <Field key={key} label={label} hint={hint}>
      <input
        type={type}
        required={required}
        value={value[key] ?? ""}
        onChange={(e) =>
          update(
            key,
            type === "number"
              ? e.target.value === ""
                ? ""
                : Number(e.target.value)
              : e.target.value,
          )
        }
        min={type === "number" ? 0 : undefined}
        maxLength={type === "text" ? 160 : undefined}
      />
    </Field>
  );
  return (
    <Modal
      wide
      title={row?.id ? "Edit vendor" : "Add a vendor to your network"}
      onClose={onClose}
    >
      <div className="wizard-steps">
        {steps.map((name, i) => (
          <div
            className={i === step ? "current" : i < step ? "done" : ""}
            key={name}
          >
            <span>{i < step ? <Icon name="Check" size={13} /> : i + 1}</span>
            <small>{name}</small>
          </div>
        ))}
      </div>
      <form
        className="modal-body wizard-form"
        ref={formRef}
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          if (step < 5) {
            setStep(step + 1);
            return;
          }
          if (busy) return;
          setBusy(true);
          try {
            const saved = await c.save("vendors", value, row?.id);
            sessionStorage.removeItem(draftKey);
            c.notify(
              row?.id ? "Vendor updated." : "Vendor added to your network.",
            );
            onClose();
            c.go("vendors", saved.id);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="wizard-heading">
          <span className="eyebrow">STEP {step + 1} OF 6</span>
          <h3>
            {
              [
                "Start with the company.",
                "The people behind the partnership.",
                "Where your supplier operates.",
                "Connect brands and categories.",
                "Set clear commercial expectations.",
                "Looking good. Ready to connect?",
              ][step]
            }
          </h3>
          <p>
            {
              [
                "A few essentials to make this vendor easy to find.",
                "Add a primary contact. You can add more contacts from the vendor profile.",
                "Record the locations that matter to your sourcing team.",
                "These are your recorded relationships. Authorization requires your own evidence review.",
                "Commercial terms are recorded references, not binding agreements.",
                "Review the details before saving to your workspace.",
              ][step]
            }
          </p>
        </div>
        {step === 0 && (
          <div className="form-grid">
            {field("Company name *", "name", "text", true)}
            <Field label="Vendor type">
              <select
                value={value.type}
                onChange={(e) => update("type", e.target.value)}
              >
                {[
                  "Manufacturer",
                  "Distributor",
                  "Dealer",
                  "Service provider",
                ].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </Field>
            {field("Website", "website", "url")}
            <Field label="Relationship status">
              <select
                value={value.status}
                onChange={(e) => update("status", e.target.value)}
              >
                {["Active", "Pending", "Archived"].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </Field>
          </div>
        )}
        {step === 1 && (
          <div className="form-grid">
            {field("Primary contact", "contact")}
            {field("Business email", "email", "email")}
            {field(
              "Phone / WhatsApp",
              "phone",
              "tel",
              false,
              "Use a fictional, non-dialable number in the demo.",
            )}
          </div>
        )}
        {step === 2 && (
          <div className="form-grid">
            {field("City *", "city", "text", true)}
            {field("State", "state")}
            {field("Registered office", "address")}
            {field("Warehouse address", "warehouse")}
            {field("Dispatch location", "dispatch")}
          </div>
        )}
        {step === 3 && (
          <>
            <div className="form-grid">
              <Field label="Primary product category">
                <select
                  value={value.category}
                  onChange={(e) => update("category", e.target.value)}
                >
                  {categories.map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </Field>
              <Field label="Recorded authorization status">
                <select
                  value={value.authorization}
                  onChange={(e) => update("authorization", e.target.value)}
                >
                  {["Unverified", "Authorized", "Expired"].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </Field>
              {field("Authorization valid until", "authorizationUntil", "date")}
            </div>
            <Field label="Search brands">
              <input
                value={brandQuery}
                placeholder="Search your brand directory…"
                onChange={(e) => setBrandQuery(e.target.value)}
              />
            </Field>
            <div className="checkbox-grid">
              {c.options.brands
                .filter((b) =>
                  b.name.toLowerCase().includes(brandQuery.toLowerCase()),
                )
                .map((b) => (
                  <label key={b.id}>
                    <input
                      type="checkbox"
                      checked={value.brandIds?.includes(b.id) || false}
                      onChange={(e) =>
                        update(
                          "brandIds",
                          e.target.checked
                            ? [...(value.brandIds || []), b.id]
                            : value.brandIds.filter(
                                (id: string) => id !== b.id,
                              ),
                        )
                      }
                    />
                    {b.name}
                  </label>
                ))}
            </div>
            {!c.options.brands.length && (
              <p className="muted">
                No brands yet. Save this vendor first, add a brand, then assign
                it from the profile.
              </p>
            )}
          </>
        )}
        {step === 4 && (
          <div className="form-grid">
            {field("Payment terms", "terms")}
            {field("Minimum order quantity", "moq", "number")}
            {field("Lead time (days)", "leadTime", "number")}
            {field("GST details (optional)", "gst")}
            <Field label="Stock availability">
              <select
                value={value.stock}
                onChange={(e) => update("stock", e.target.value)}
              >
                <option>On request</option>
                <option>Available</option>
              </select>
            </Field>
            {field("Last contacted", "lastContact", "date")}
          </div>
        )}
        {step === 5 && (
          <>
            <div className="review-summary">
              <h2>{value.name}</h2>
              <Badge tone="blue">
                {c.demo ? "Sample vendor" : "New supplier relationship"}
              </Badge>
              <dl>
                {[
                  ["Primary contact", value.contact],
                  ["Email", value.email],
                  ["City", value.city],
                  ["Category", value.category],
                  [
                    "Brands",
                    (value.brandIds || [])
                      .map(
                        (id: string) =>
                          c.options.brands.find((b) => b.id === id)?.name,
                      )
                      .join(", "),
                  ],
                  ["Payment terms", value.terms],
                  ["Lead time", value.leadTime + " days"],
                  ["Authorization", value.authorization],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v || "Not provided"}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <p className="muted">
              Duplicate company names or email addresses are checked before
              saving.
            </p>
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button
            type="button"
            className="button ghost"
            onClick={() => {
              sessionStorage.setItem(draftKey, JSON.stringify(value));
              c.notify("Draft saved in this browser tab.");
              onClose();
            }}
          >
            Save draft
          </button>
          <span className="spacer" />
          {step > 0 && (
            <button
              type="button"
              className="button outline"
              onClick={() => {
                setError("");
                setStep(step - 1);
              }}
            >
              <Icon name="ArrowLeft" size={15} />
              Previous
            </button>
          )}
          <button disabled={busy} className="button primary" type="submit">
            {busy ? "Saving…" : step === 5 ? "Save vendor" : "Continue"}
            <Icon name={step === 5 ? "Check" : "ArrowRight"} size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function RecordForm({
  kind,
  row,
  onClose,
}: {
  kind: string;
  row?: Partial<Row>;
  onClose: () => void;
}) {
  const c = useCRM(),
    [value, setValue] = useState<Record<string, any>>(() => ({
      name: "",
      category: categories[0],
      status:
        kind === "follow-ups" ? "Open" : kind === "rfqs" ? "Open" : undefined,
      date: new Date().toISOString().slice(0, 10),
      priority: "Normal",
      quantity: 100,
      vendorIds: [],
      quotes: [],
      responses: [],
      ...row,
    })),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [supplierQuery, setSupplierQuery] = useState("");
  const update = (key: string, v: any) =>
    setValue((old) => ({ ...old, [key]: v }));
  const select = (
    label: string,
    key: string,
    options: { id: string; name: string }[],
    required = false,
  ) =>
    ["vendorId", "brandId", "productId"].includes(key) ? (
      <Field label={label}>
        <Lookup
          kind={
            key === "vendorId"
              ? "vendors"
              : key === "brandId"
                ? "brands"
                : "products"
          }
          value={value[key] || ""}
          onChange={(v) => update(key, v)}
          label={label}
        />
      </Field>
    ) : (
      <Field label={label}>
        <select
          required={required}
          value={value[key] || ""}
          onChange={(e) => update(key, e.target.value)}
        >
          <option value="">Choose…</option>
          {options.map((o) => (
            <option value={o.id} key={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </Field>
    );
  const input = (
    label: string,
    key: string,
    type = "text",
    required = false,
  ) => (
    <Field label={label}>
      <input
        value={value[key] ?? ""}
        type={type}
        required={required}
        min={type === "number" ? 1 : undefined}
        onChange={(e) =>
          update(
            key,
            type === "number" ? Number(e.target.value) : e.target.value,
          )
        }
        maxLength={type === "text" ? 160 : undefined}
      />
    </Field>
  );
  const label =
    kind === "follow-ups"
      ? "follow-up"
      : kind === "rfqs"
        ? "RFQ"
        : kind.slice(0, -1);
  return (
    <Modal
      wide={["products", "rfqs"].includes(kind)}
      title={`${row?.id ? "Edit" : "Create"} ${label}`}
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
            if (
              kind === "documents" &&
              file &&
              (![
                "application/pdf",
                "image/png",
                "image/jpeg",
                "text/plain",
              ].includes(file.type) ||
                file.size > 4000000)
            )
              throw new Error("Choose a PDF, PNG, JPG or TXT under 4 MB.");
            const saved = await c.save(kind, value, row?.id);
            if (kind === "documents" && file) {
              const bytes = await file.arrayBuffer();
              let binary = "";
              new Uint8Array(bytes).forEach(
                (b) => (binary += String.fromCharCode(b)),
              );
              const attachment = { base64: btoa(binary), mime: file.type };
              if (c.demo)
                sessionStorage.setItem(
                  "ofneeds-crm.demo.file." + saved.id,
                  JSON.stringify(attachment),
                );
              else
                await api(
                  `/api/crm/documents/${saved.id}/file`,
                  "POST",
                  attachment,
                );
            }
            c.notify(
              `${label} saved${c.demo ? " in your sample workspace" : ""}.`,
            );
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {c.demo && (
          <p className="form-notice">
            <Icon name="Info" size={15} />
            Fictional sample workspace. Nothing is sent to suppliers.
          </p>
        )}
        {input(
          kind === "rfqs"
            ? "Sourcing requirement *"
            : kind === "follow-ups"
              ? "Activity description *"
              : "Name *",
          "name",
          "text",
          true,
        )}
        {["brands", "products"].includes(kind) &&
          select(
            "Category",
            "category",
            categories.map((n) => ({ id: n, name: n })),
          )}
        {["contacts", "follow-ups", "documents"].includes(kind) &&
          select("Vendor *", "vendorId", c.options.vendors, true)}
        {kind === "contacts" && (
          <div className="form-grid">
            {input("Business email", "email", "email")}
            {input("Phone", "phone", "tel")}
            {input("Role / title", "role")}
          </div>
        )}
        {kind === "brands" && (
          <Field label="Brand description">
            <textarea
              value={value.description || ""}
              onChange={(e) => update("description", e.target.value)}
              rows={3}
            />
          </Field>
        )}
        {kind === "follow-ups" && (
          <div className="form-grid">
            {input("Follow-up date *", "date", "date", true)}
            {select(
              "Priority",
              "priority",
              ["Normal", "High"].map((n) => ({ id: n, name: n })),
            )}
            {select(
              "Status",
              "status",
              ["Open", "Completed"].map((n) => ({ id: n, name: n })),
            )}
          </div>
        )}
        {kind === "products" && (
          <>
            <div className="form-grid">
              {input("SKU", "sku")}
              {select("Brand", "brandId", c.options.brands)}
            </div>
            <Field label="Product description">
              <textarea
                rows={3}
                value={value.description || ""}
                onChange={(e) => update("description", e.target.value)}
              />
            </Field>
            <div className="quote-heading">
              <h3>Recorded supplier prices</h3>
              <button
                className="button outline small"
                type="button"
                onClick={() =>
                  update("quotes", [
                    ...(value.quotes || []),
                    { vendorId: "", price: 1, moq: 25, stock: 0, leadTime: 5 },
                  ])
                }
              >
                <Icon name="Plus" size={14} />
                Add supplier price
              </button>
            </div>
            {(value.quotes || []).map((q: any, i: number) => (
              <div className="quote-editor" key={i}>
                <Field label="Supplier">
                  <select
                    required
                    value={q.vendorId}
                    onChange={(e) =>
                      update(
                        "quotes",
                        value.quotes.map((r: any, j: number) =>
                          j === i ? { ...r, vendorId: e.target.value } : r,
                        ),
                      )
                    }
                  >
                    <option value="">Choose supplier</option>
                    {c.options.vendors.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </Field>
                {[
                  ["Price (₹)", "price", 1],
                  ["MOQ", "moq", 1],
                  ["Stock", "stock", 0],
                  ["Lead days", "leadTime", 0],
                  ["Branding / unit ₹", "customization", 0],
                  ["Packaging / unit ₹", "packaging", 0],
                  ["Freight total ₹", "freight", 0],
                  ["Tax %", "taxRate", 0],
                ].map(([label, key, min]) => (
                  <Field label={String(label)} key={key}>
                    <input
                      required
                      type="number"
                      min={Number(min)}
                      step={key === "price" ? ".01" : "1"}
                      value={q[key]}
                      onChange={(e) =>
                        update(
                          "quotes",
                          value.quotes.map((r: any, j: number) =>
                            j === i
                              ? { ...r, [key]: Number(e.target.value) }
                              : r,
                          ),
                        )
                      }
                    />
                  </Field>
                ))}
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Remove supplier price"
                  onClick={() =>
                    update(
                      "quotes",
                      value.quotes.filter((_: any, j: number) => j !== i),
                    )
                  }
                >
                  <Icon name="Trash2" size={15} />
                </button>
              </div>
            ))}
          </>
        )}
        {kind === "rfqs" && (
          <>
            <div className="form-grid">
              {select("Product *", "productId", c.options.products, true)}
              {input("Quantity *", "quantity", "number", true)}
              {input("Response deadline", "deadline", "date")}
              {select(
                "Status",
                "status",
                ["Open", "Quoted", "Reviewing", "Closed"].map((n) => ({
                  id: n,
                  name: n,
                })),
              )}
            </div>
            <Field label="Select suppliers">
              <Lookup
                kind="vendors"
                multiple
                value={value.vendorIds}
                onChange={(v) => update("vendorIds", v)}
                label="RFQ suppliers"
              />
            </Field>
            <RfqResponseFields value={value} update={update} />
            <Field label="Brief / customisation requirements">
              <textarea
                rows={3}
                value={value.notes || ""}
                onChange={(e) => update("notes", e.target.value)}
              />
            </Field>
            <p className="muted">
              This saves your RFQ and selected suppliers. Queue email or
              WhatsApp from the RFQ detail; an owner dispatches configured
              delivery. Record received quotations in the response section.
              Product reference prices are shown separately.
            </p>
          </>
        )}
        {kind === "documents" && (
          <>
            <Field label="Description">
              <textarea
                value={value.description || ""}
                onChange={(e) => update("description", e.target.value)}
                rows={2}
              />
            </Field>
            <Field
              label="Attachment (optional)"
              hint="PDF, PNG, JPG or TXT · up to 4 MB · private to your workspace"
            >
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.txt"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setFile(f);
                    if (!value.name) update("name", f.name);
                  }
                }}
              />
            </Field>
          </>
        )}
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
            {busy ? "Saving…" : `Save ${label}`}
            <Icon name="Check" size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
function RfqResponseFields({
  value,
  update,
}: {
  value: Record<string, any>;
  update: (key: string, value: any) => void;
}) {
  const c = useCRM(),
    [supplierNames, setSupplierNames] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    const ids: string[] = value.vendorIds || [];
    const missing = ids.filter(
      (id) => !c.options.vendors.some((v) => v.id === id),
    );
    Promise.all(missing.map((id) => c.get("vendors", id)))
      .then((rows) => {
        if (alive)
          setSupplierNames(Object.fromEntries(rows.map((r) => [r.id, r.name])));
      })
      .catch((e) => c.notify(e.message));
    return () => {
      alive = false;
    };
  }, [JSON.stringify(value.vendorIds)]);
  return (
    <details className="response-fields">
      <summary>
        Record supplier quotation responses ({value.responses?.length || 0})
      </summary>
      <p className="muted">
        Enter quotations received from the selected suppliers. This does not
        contact suppliers.
      </p>
      {(value.responses || []).map((q: any, i: number) => (
        <div key={i} className="quote-editor">
          <Field label="Supplier">
            <select
              required
              value={q.vendorId}
              onChange={(e) =>
                update(
                  "responses",
                  value.responses.map((r: any, j: number) =>
                    j === i ? { ...r, vendorId: e.target.value } : r,
                  ),
                )
              }
            >
              <option value="">Choose supplier</option>
              {(value.vendorIds || []).map((id: string) => (
                <option key={id} value={id}>
                  {c.options.vendors.find((v) => v.id === id)?.name ||
                    supplierNames[id] ||
                    "Loading supplier…"}
                </option>
              ))}
            </select>
          </Field>
          {[
            ["Price ₹", "price", 0],
            ["Branding / unit ₹", "customization", 0],
            ["Packaging / unit ₹", "packaging", 0],
            ["Freight total ₹", "freight", 0],
            ["Tax %", "taxRate", 0],
            ["MOQ", "moq", 1],
            ["Stock", "stock", 0],
            ["Lead days", "leadTime", 0],
          ].map(([label, key, min]) => (
            <Field label={String(label)} key={key}>
              <input
                type="number"
                required
                min={Number(min)}
                step={
                  [
                    "price",
                    "customization",
                    "packaging",
                    "freight",
                    "taxRate",
                  ].includes(String(key))
                    ? ".01"
                    : "1"
                }
                value={q[key] ?? 0}
                onChange={(e) =>
                  update(
                    "responses",
                    value.responses.map((r: any, j: number) =>
                      j === i ? { ...r, [key]: Number(e.target.value) } : r,
                    ),
                  )
                }
              />
            </Field>
          ))}
          <Field label="Quote valid until">
            <input
              type="date"
              value={q.validUntil || ""}
              onChange={(e) =>
                update(
                  "responses",
                  value.responses.map((r: any, j: number) =>
                    j === i ? { ...r, validUntil: e.target.value } : r,
                  ),
                )
              }
            />
          </Field>
          <button
            type="button"
            className="icon-button"
            aria-label="Remove quotation response"
            onClick={() =>
              update(
                "responses",
                value.responses.filter((_: any, j: number) => j !== i),
              )
            }
          >
            <Icon name="Trash2" size={15} />
          </button>
        </div>
      ))}
      <button
        className="button outline small"
        type="button"
        disabled={!value.vendorIds?.length}
        onClick={() =>
          update("responses", [
            ...(value.responses || []),
            { vendorId: "", price: 1, moq: 1, stock: 0, leadTime: 0 },
          ])
        }
      >
        <Icon name="Plus" size={14} />
        Add quotation response
      </button>
    </details>
  );
}
