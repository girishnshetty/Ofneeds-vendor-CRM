import {
  demoData,
  paginate,
  emptyData,
  validateRecord,
  validateLinks,
} from "../shared/core.mjs";
import type { Data, Row, Prefs } from "./types";
export const DEMO_KEY = "ofneeds-vendor-crm.demo.v1";
export async function api(path: string, method = "GET", body?: unknown) {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "Unable to complete this request.");
  return result;
}
export function readDemo(): Data {
  try {
    const data = JSON.parse(sessionStorage.getItem(DEMO_KEY) || "null");
    if (data && Array.isArray(data.vendors) && data.version === 1) return data;
  } catch {}
  const data = { ...demoData(), version: 1 };
  sessionStorage.setItem(DEMO_KEY, JSON.stringify(data));
  return data as unknown as Data;
}
export function saveDemo(data: Data) {
  sessionStorage.setItem(DEMO_KEY, JSON.stringify({ ...data, version: 1 }));
}
export function resetDemo() {
  sessionStorage.removeItem(DEMO_KEY);
  sessionStorage.removeItem("ofneeds-crm.demo.operations.v1");
  sessionStorage.removeItem("ofneeds-crm.demo.supplier-preview");
  for (const key of Object.keys(sessionStorage))
    if (key.startsWith("ofneeds-crm.demo.meta."))
      sessionStorage.removeItem(key);
  for (const key of Object.keys(sessionStorage))
    if (
      key.startsWith("ofneeds-crm.demo.file.") ||
      key === "ofneeds-crm.demo.team" ||
      key === "ofneeds-crm.demo.activity" ||
      key.startsWith("ofneeds-crm.draft.demo.")
    )
      sessionStorage.removeItem(key);
  return readDemo();
}
export function demoList(
  data: Data,
  kind: string,
  filters: Record<string, string>,
): any {
  let rows = data[kind] || [];
  if (filters.favoriteIds)
    rows = rows.filter((r) => filters.favoriteIds.split(",").includes(r.id));
  if (filters.vendorId && kind === "products")
    rows = rows.filter((r) =>
      r.quotes?.some((q: any) => q.vendorId === filters.vendorId),
    );
  if (filters.vendorId && kind === "rfqs")
    rows = rows.filter((r) => r.vendorIds?.includes(filters.vendorId));
  const filtered = { ...filters };
  if (["products", "rfqs"].includes(kind)) delete filtered.vendorId;
  const q = filters.q?.toLowerCase();
  if (kind === "vendors" && q) {
    rows = rows.filter(
      (row) =>
        JSON.stringify(row).toLowerCase().includes(q) ||
        row.brandIds?.some((id: string) =>
          data.brands
            .find((b) => b.id === id)
            ?.name.toLowerCase()
            .includes(q),
        ),
    );
    return paginate(rows, { ...filters, q: "" });
  }
  return paginate(rows, filtered);
}
export function demoSave(
  data: Data,
  kind: string,
  raw: Record<string, any>,
  id?: string,
): { data: Data; row: Row } {
  const value = validateRecord(kind, raw);
  validateLinks(kind, value, data);
  if (
    kind === "vendors" &&
    data.vendors.some(
      (v) =>
        v.id !== id &&
        (v.name.toLowerCase() === value.name.toLowerCase() ||
          (value.email &&
            v.email?.toLowerCase() === value.email.toLowerCase())),
    )
  )
    throw new Error("A vendor with this name or email already exists.");
  const old = data[kind].find((r) => r.id === id);
  const row = {
    ...old,
    ...value,
    id: id || crypto.randomUUID(),
    sample: true,
    createdAt: old?.createdAt || new Date().toISOString(),
  } as Row;
  const next: Data = {
    ...data,
    [kind]: id
      ? data[kind].map((r) => (r.id === id ? row : r))
      : [row, ...data[kind]],
  };
  saveDemo(next);
  return { data: next, row };
}
export function defaultData(): Data {
  return emptyData();
}
export function preferences(demo: boolean, userId?: string): Prefs {
  try {
    return JSON.parse(
      localStorage.getItem(
        `ofneeds-crm.prefs.${demo ? "demo" : userId || "public"}`,
      ) || "{}",
    );
  } catch {
    return {};
  }
}
export function download(
  name: string,
  body: string,
  type = "text/csv;charset=utf-8",
) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
