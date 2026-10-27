import { useState } from "react";
import { useCRM } from "./context";
import { Modal, Field, Icon } from "./ui";
import { api } from "./client";
import { categories } from "../shared/core.mjs";
export default function Onboarding() {
  const c = useCRM(),
    [dismissed, setDismissed] = useState(false),
    [name, setName] = useState(c.workspace.name),
    [type, setType] = useState(""),
    [locations, setLocations] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const profile = JSON.parse(c.workspace.profile || "{}");
  if (
    c.demo ||
    c.user?.role !== "owner" ||
    dismissed ||
    profile.businessType ||
    profile.onboardingSkipped
  )
    return null;
  const save = async (skip: boolean) => {
    setBusy(true);
    setError("");
    try {
      const body = {
        name,
        businessType: skip ? "" : type,
        categories: selected,
        locations,
        onboardingSkipped: skip,
      };
      await api("/api/crm/workspace", "PATCH", body);
      c.setWorkspace({ name, profile: JSON.stringify(body) });
      setDismissed(true);
      c.refresh();
      c.notify(
        skip
          ? "Setup skipped. Resume anytime in Settings."
          : "Your workspace is ready. Start with your first vendor.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Welcome to OfNeeds Vendor CRM"
      wide
      onClose={() => save(true)}
    >
      <form
        className="modal-body onboarding-form"
        onSubmit={(e) => {
          e.preventDefault();
          save(false);
        }}
      >
        <span className="entry-icon">
          <Icon name="Sparkles" size={30} />
        </span>
        <h2>A workspace for the way you source.</h2>
        <p>
          Tell us a little about your business. You can skip this and come back
          anytime.
        </p>
        <div className="form-grid">
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
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="">Choose…</option>
              {[
                "Corporate gifting company",
                "Procurement team",
                "Brand distributor",
                "Manufacturer",
                "Agency",
                "Other",
              ].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Operating locations">
          <input
            value={locations}
            onChange={(e) => setLocations(e.target.value)}
            placeholder="Bengaluru, Mumbai…"
            maxLength={300}
          />
        </Field>
        <fieldset>
          <legend>Product categories</legend>
          <div className="checkbox-grid">
            {categories.map((n) => (
              <label key={n}>
                <input
                  type="checkbox"
                  checked={selected.includes(n)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, n]
                        : selected.filter((v) => v !== n),
                    )
                  }
                />
                {n}
              </label>
            ))}
          </div>
        </fieldset>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button
            disabled={busy}
            type="button"
            className="button ghost"
            onClick={() => save(true)}
          >
            Skip for now
          </button>
          <button disabled={busy} className="button primary">
            {busy ? "Saving…" : "Make it my workspace"}
            <Icon name="ArrowRight" size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
