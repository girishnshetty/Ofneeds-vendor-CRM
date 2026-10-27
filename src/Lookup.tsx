import { useEffect, useState, useRef, useId } from "react";
import { useCRM } from "./context";
import { api } from "./client";
import { Icon } from "./ui";
export default function Lookup({
  kind,
  value,
  onChange,
  label,
  multiple = false,
}: {
  kind: string;
  value: string | string[];
  onChange: (value: any) => void;
  label: string;
  multiple?: boolean;
}) {
  const c = useCRM(),
    listId = useId(),
    [query, setQuery] = useState(""),
    [open, setOpen] = useState(false),
    [rows, setRows] = useState<{ id: string; name: string }[]>([]),
    [page, setPage] = useState(1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [known, setKnown] = useState<Record<string, string>>(() =>
      Object.fromEntries((c.options[kind] || []).map((r) => [r.id, r.name])),
    ),
    host = useRef<HTMLDivElement>(null);
  const selected = Array.isArray(value) ? value : value ? [value] : [];
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(async () => {
      if (!open) return;
      setBusy(true);
      try {
        const result = c.demo
          ? (c.data[kind] || [])
              .filter((r) => r.name.toLowerCase().includes(query.toLowerCase()))
              .slice((page - 1) * 30, page * 30)
          : await api(
              `/api/services/lookup/${kind}?${new URLSearchParams({ q: query, page: String(page) })}`,
            );
        if (alive) {
          setRows((old) => (page === 1 ? result : [...old, ...result]));
          setKnown((old) => ({
            ...old,
            ...Object.fromEntries(result.map((r: any) => [r.id, r.name])),
          }));
          setError("");
        }
      } catch (e) {
        if (alive) setError((e as Error).message);
      } finally {
        if (alive) setBusy(false);
      }
    }, 180);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, page, open]);
  useEffect(() => {
    for (const id of selected)
      if (!known[id])
        c.get(kind, id)
          .then((r) => setKnown((old) => ({ ...old, [id]: r.name })))
          .catch(() => {});
  }, [JSON.stringify(selected)]);
  return (
    <div className="lookup" ref={host}>
      <div className="lookup-selection">
        {selected.map((id) => (
          <span key={id}>
            {known[id] || "Selected record"}
            <button
              type="button"
              aria-label={`Remove ${known[id] || "selection"}`}
              onClick={() =>
                onChange(multiple ? selected.filter((v) => v !== id) : "")
              }
            >
              <Icon name="X" size={12} />
            </button>
          </span>
        ))}
        <input
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-autocomplete="list"
          placeholder={`Search ${kind}…`}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setOpen(false);
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              host.current
                ?.querySelector<HTMLButtonElement>("[role=option]")
                ?.focus();
            }
          }}
        />
      </div>
      {open && (
        <div className="lookup-menu">
          <div className="lookup-menu-header">
            <small>{busy ? "Searching…" : "Choose a workspace record"}</small>
            <button type="button" onClick={() => setOpen(false)}>
              Done
            </button>
          </div>
          {error && <p className="error">{error}</p>}
          <div
            role="listbox"
            id={listId}
            aria-label={label}
            aria-multiselectable={multiple}
          >
            {rows.map((r) => (
              <button
                role="option"
                aria-selected={selected.includes(r.id)}
                type="button"
                key={r.id}
                onClick={() => {
                  onChange(
                    multiple
                      ? selected.includes(r.id)
                        ? selected.filter((v) => v !== r.id)
                        : [...selected, r.id]
                      : r.id,
                  );
                  if (!multiple) {
                    setOpen(false);
                    setQuery("");
                  }
                }}
              >
                {r.name}
                {selected.includes(r.id) && <Icon name="Check" size={14} />}
              </button>
            ))}
          </div>
          {!rows.length && !busy && <p>No matching records.</p>}
          {rows.length >= page * 30 && (
            <button
              type="button"
              className="button ghost small"
              disabled={busy}
              onClick={() => setPage(page + 1)}
            >
              Load more
            </button>
          )}
        </div>
      )}
    </div>
  );
}
