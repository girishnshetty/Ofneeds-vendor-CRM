import { useState } from "react";
import { useCRM } from "./context";
import { api } from "./client";
import {
  demoOperations,
  validateOperation,
  operationLinks,
  receiveOrder,
  orderTotals,
  landedCost,
} from "../shared/operations.mjs";
const key = "ofneeds-crm.demo.operations.v1";
export function readOps() {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || "null");
    if (value?.projects && value?.orders) return value;
  } catch {}
  const value = demoOperations();
  sessionStorage.setItem(key, JSON.stringify(value));
  return value;
}
export function useOperations() {
  const c = useCRM(),
    [version, setVersion] = useState(0);
  const refresh = () => {
    setVersion((v) => v + 1);
    c.refresh();
  };
  const request = async (
    path: string,
    method = "GET",
    body?: any,
  ): Promise<any> => {
    if (!c.demo) return api("/api/ops" + path, method, body);
    const data = readOps();
    let result: any;
    if (path.match(/^\/records\/[^/]+\/[^/]+\/transition$/)) {
      const [, , kind, id] = path.split("/");
      const row = data[kind].find((r: any) => r.id === id);
      if (!row) throw Error("Record not found.");
      const allowed: any = {
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
      if (!allowed[kind]?.[row.status]?.includes(body.status))
        throw Error("Unavailable transition.");
      row.status = body.status;
      row.decisionReason = body.reason;
      sessionStorage.setItem(key, JSON.stringify(data));
      refresh();
      return row;
    }
    if (path === "/overview")
      return {
        config: {},
        limits: { plan: "local", vendors: 5000, seats: 25, storage: 100000000 },
        members: [{ id: "sample-owner", name: "Alex Morgan", role: "owner" }],
        delivery: { email: false, whatsapp: false },
        portalLinks: [],
      };
    if (path.startsWith("/records/")) {
      const kind = path.split("/")[2].split("?")[0],
        id = path.split("/")[3];
      if (method === "GET") {
        const params = new URLSearchParams(path.split("?")[1] || "");
        const page = Math.max(1, Number(params.get("page")) || 1);
        const limit = Math.min(
          100,
          Math.max(1, Number(params.get("limit")) || 20),
        );
        const rows = (data[kind] || []).filter(
          (r: any) =>
            (!params.get("q") ||
              JSON.stringify(r)
                .toLowerCase()
                .includes(params.get("q")!.toLowerCase())) &&
            ["vendorId", "projectId", "status"].every(
              (k) => !params.get(k) || r[k] === params.get(k),
            ),
        );
        return {
          rows: rows.slice((page - 1) * limit, page * limit),
          total: rows.length,
          page,
          limit,
        };
      }
      const value = validateOperation(kind, body);
      operationLinks(value, c.data, data, [{ id: "sample-owner" }]);
      const previous = id ? data[kind].find((r: any) => r.id === id) : null;
      if (id && kind === "orders" && previous.status !== "Draft")
        throw Error("Only draft orders can be edited.");
      const row = {
        ...previous,
        ...value,
        id: id || crypto.randomUUID(),
        status:
          previous?.status || (kind === "projects" ? "Planning" : "Draft"),
        sample: true,
        revision: (previous?.revision || 0) + 1,
        createdAt: previous?.createdAt || new Date().toISOString(),
      };
      if (kind === "orders") {
        row.number =
          previous?.number ||
          "PO-SAMPLE-" + String(data.orders.length + 1).padStart(4, "0");
        row.received = previous?.received || {};
      }
      data[kind] = id
        ? data[kind].map((r: any) => (r.id === id ? row : r))
        : [row, ...data[kind]];
      result = row;
    } else if (path === "/approvals" && method === "GET")
      return data.approvals || [];
    else if (path.match(/^\/orders\/[^/]+\/submit$/)) {
      const id = path.split("/")[2],
        row = data.orders.find((r: any) => r.id === id);
      if (row.status !== "Draft")
        throw Error("Only draft orders can be submitted.");
      row.status = "Pending approval";
      const approval = {
        id: crypto.randomUUID(),
        type: "purchase-order",
        target_id: id,
        targetName: row.name,
        status: "Pending",
        proposal: { orderId: id, order: structuredClone(row) },
        created: new Date().toISOString(),
      };
      data.approvals = [approval, ...(data.approvals || [])];
      result = row;
    } else if (path.match(/^\/approvals\/[^/]+\/decide$/)) {
      const a = data.approvals.find((r: any) => r.id === path.split("/")[2]);
      if (!a || a.status !== "Pending")
        throw Error("This approval is no longer pending.");
      if (!["Approved", "Rejected"].includes(body.decision))
        throw Error("Choose a decision.");
      if (!body.reason) throw Error("Enter the decision reason.");
      a.status = body.decision;
      a.reason = body.reason;
      if (a.type === "purchase-order")
        data.orders.find((r: any) => r.id === a.target_id).status =
          a.status === "Approved" ? "Approved" : "Draft";
      else if (a.type === "quotation-award" && a.status === "Approved")
        data.awards = { ...(data.awards || {}), [a.target_id]: a.proposal };
      else if (a.type === "vendor-review") {
        const vendor = c.data.vendors.find((v) => v.id === a.target_id);
        if (a.status === "Approved")
          await c.save("vendors", { ...vendor, ...a.proposal }, vendor!.id);
      }
      result = { ok: true };
    } else if (path.match(/^\/orders\/[^/]+\/action$/)) {
      const row = data.orders.find((r: any) => r.id === path.split("/")[2]);
      if (body.action === "issue") {
        if (row.status !== "Approved") throw Error("Approve this order first.");
        row.status = "Issued";
      } else if (body.action === "accept") {
        if (row.status !== "Issued")
          throw Error("Only issued orders can be acknowledged.");
        row.status = "Accepted";
      } else if (body.action === "receive") {
        if (!body.reference) throw Error("Enter a receipt reference.");
        if (row.receipts?.some((r: any) => r.reference === body.reference))
          return row;
        Object.assign(row, receiveOrder(row, body.lines));
        row.receipts = [
          ...(row.receipts || []),
          { reference: body.reference, lines: body.lines },
        ];
        if (row.status === "Completed")
          row.completedAt = new Date().toISOString();
      } else if (body.action === "cancel") {
        if (["Completed", "Partially received"].includes(row.status))
          throw Error("Received orders cannot be cancelled.");
        row.status = "Cancelled";
      }
      result = row;
    } else if (path.match(/^\/records\/[^/]+\/[^/]+\/transition$/))
      throw Error("Unsupported transition");
    else if (path.match(/^\/rfqs\/[^/]+\/award$/)) {
      const id = path.split("/")[2],
        rfq = c.data.rfqs.find((r) => r.id === id),
        quote = rfq?.responses?.find((q: any) => q.vendorId === body.vendorId);
      if (!quote) throw Error("Choose a recorded supplier quotation.");
      if (
        quote.validUntil &&
        quote.validUntil < new Date().toISOString().slice(0, 10)
      )
        throw Error("This quotation has expired.");
      if (
        Number(quote.moq || 1) > rfq!.quantity ||
        Number(quote.stock || 0) < rfq!.quantity
      )
        throw Error("The quotation does not cover the requested quantity.");
      const approval = {
        id: crypto.randomUUID(),
        type: "quotation-award",
        target_id: id,
        proposal: {
          vendorId: body.vendorId,
          cost: landedCost(quote, rfq!.quantity),
        },
        status: "Pending",
        created: new Date().toISOString(),
      };
      data.approvals = [approval, ...(data.approvals || [])];
      result = approval;
    } else if (path.match(/^\/rfqs\/[^/]+\/create-order$/)) {
      const id = path.split("/")[2],
        award = data.awards?.[id],
        rfq = c.data.rfqs.find((r) => r.id === id);
      if (!award) throw Error("Approve the quotation award first.");
      if (data.orders.some((o: any) => o.rfqId === id))
        throw Error("An order already exists for this RFQ.");
      const q = rfq?.responses.find((q: any) => q.vendorId === award.vendorId),
        lines = [
          {
            ...q,
            id: "line-1",
            productId: rfq!.productId,
            quantity: rfq!.quantity,
          },
        ];
      const order = {
        id: crypto.randomUUID(),
        number: "PO-SAMPLE-" + (data.orders.length + 1),
        name: rfq!.name,
        vendorId: award.vendorId,
        rfqId: id,
        lines,
        totals: orderTotals(lines),
        received: {},
        status: "Draft",
        createdAt: new Date().toISOString(),
        sample: true,
      };
      data.orders.unshift(order);
      result = order;
    } else if (path.includes("/review-request")) {
      const id = path.split("/")[2];
      data.approvals = [
        {
          id: crypto.randomUUID(),
          type: "vendor-review",
          target_id: id,
          proposal: { authorization: body.authorization, status: "Active" },
          status: "Pending",
          created: new Date().toISOString(),
        },
        ...(data.approvals || []),
      ];
      result = { ok: true };
    } else
      throw Error(
        "This connected account action is unavailable in the public demo. Create a private workspace to configure it.",
      );
    sessionStorage.setItem(key, JSON.stringify(data));
    refresh();
    return result;
  };
  return { request, refresh, version };
}
