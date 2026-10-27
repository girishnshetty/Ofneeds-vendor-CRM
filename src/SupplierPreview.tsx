import { useState } from "react";
import { useCRM } from "./context";
import { SupplierPortal } from "./Gateway";
import { readOps } from "./opsClient";
export function SupplierPreview() {
  const c = useCRM();
  const [data, setData] = useState(() => {
    try {
      const saved = JSON.parse(
        sessionStorage.getItem("ofneeds-crm.demo.supplier-preview") || "null",
      );
      if (saved) return saved;
    } catch {}
    const id = "vendor-2",
      ops = readOps();
    return {
      vendor: c.data.vendors.find((v) => v.id === id),
      contacts: c.data.contacts.filter((v) => v.vendorId === id),
      products: c.data.products
        .filter((p) => p.quotes?.some((q: any) => q.vendorId === id))
        .map((p) => ({
          ...p,
          quotes: p.quotes.filter((q: any) => q.vendorId === id),
        })),
      rfqs: c.data.rfqs
        .filter((r) => r.vendorIds?.includes(id))
        .map((r) => ({
          ...r,
          vendorIds: [id],
          responses: r.responses?.filter((q: any) => q.vendorId === id) || [],
        })),
      orders: ops.orders
        .filter((r: any) => r.vendorId === id)
        .map((r: any) => ({
          ...r,
          status: r.status === "Draft" ? "Issued" : r.status,
        })),
      documents: [],
      workspaceName: "Fictional Gifting Studio",
    };
  });
  return (
    <SupplierPortal
      demoData={data}
      onDemoChange={(value) => {
        setData(value);
        sessionStorage.setItem(
          "ofneeds-crm.demo.supplier-preview",
          JSON.stringify(value),
        );
      }}
    />
  );
}
