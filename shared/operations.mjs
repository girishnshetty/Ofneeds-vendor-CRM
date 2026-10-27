export const operationKinds = [
  "projects",
  "orders",
  "customizations",
  "samples",
  "scorecards",
  "comments",
  "automations",
  "verifications",
  "report-schedules",
];
export const cents = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100000000)
    throw Error("Enter a non-negative amount below ₹100,000,000.");
  return Math.round(number * 100);
};
export function landedCost(quote, quantity) {
  if (
    !Number.isSafeInteger(Number(quantity)) ||
    Number(quantity) < 1 ||
    Number(quantity) > 1000000
  )
    throw Error("Quantity must be a whole number between 1 and 1,000,000.");
  const product = cents(quote.price) * Number(quantity),
    customization = cents(quote.customization || 0) * Number(quantity),
    packaging = cents(quote.packaging || 0) * Number(quantity),
    freight = cents(quote.freight || 0);
  const base = product + customization + packaging + freight,
    taxRate = Number(quote.taxRate || 0);
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100)
    throw Error("Enter a tax rate between 0 and 100.");
  const tax = Math.round((base * taxRate) / 100);
  if (!Number.isSafeInteger(base + tax))
    throw Error("Total exceeds supported precision.");
  return {
    product,
    customization,
    packaging,
    freight,
    subtotal: base,
    tax,
    total: base + tax,
    currency: "INR",
  };
}
export function orderTotals(lines) {
  if (!Array.isArray(lines) || !lines.length || lines.length > 100)
    throw Error("An order needs 1–100 lines.");
  return lines.reduce(
    (sum, line) => {
      const cost = landedCost(line, line.quantity);
      for (const key of ["subtotal", "tax", "total"]) {
        sum[key] += cost[key];
        if (!Number.isSafeInteger(sum[key]))
          throw Error("Order total exceeds supported precision.");
      }
      return sum;
    },
    { subtotal: 0, tax: 0, total: 0, currency: "INR" },
  );
}
export function validateOperation(kind, raw) {
  if (!operationKinds.includes(kind)) throw Error("Unknown operations module.");
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw Error("Enter record details.");
  const name = String(raw.name || "").trim();
  if (!name || name.length > 160)
    throw Error("Use a name of 1–160 characters.");
  const fields = {
    projects: [
      "client",
      "budget",
      "deadline",
      "ownerId",
      "status",
      "notes",
      "deliveryAddress",
      "event",
      "projectId",
    ],
    orders: [
      "vendorId",
      "rfqId",
      "projectId",
      "lines",
      "dueDate",
      "notes",
      "shippingAddress",
    ],
    customizations: [
      "projectId",
      "productId",
      "vendorId",
      "method",
      "placement",
      "colours",
      "sizes",
      "artworkDocumentId",
      "version",
      "notes",
    ],
    samples: [
      "vendorId",
      "productId",
      "projectId",
      "quantity",
      "dueDate",
      "notes",
    ],
    scorecards: [
      "vendorId",
      "period",
      "quality",
      "communication",
      "value",
      "notes",
    ],
    comments: ["targetKind", "targetId", "mentions", "notes"],
    automations: [
      "vendorId",
      "assigneeId",
      "frequencyDays",
      "nextDate",
      "priority",
      "escalateAfterDays",
      "enabled",
      "notes",
    ],
    verifications: ["vendorId", "documentId", "brandId", "validUntil", "notes"],
    "report-schedules": [
      "frequencyDays",
      "nextDate",
      "report",
      "recipient",
      "enabled",
      "notes",
    ],
  }[kind];
  const row = { name };
  for (const key of fields)
    if (raw[key] !== undefined) {
      if (["lines", "mentions"].includes(key)) {
        row[key] = structuredClone(raw[key]);
      } else if (["enabled"].includes(key))
        row[key] = raw[key] === true || raw[key] === "true";
      else if (
        [
          "budget",
          "quantity",
          "quality",
          "communication",
          "value",
          "version",
          "frequencyDays",
          "escalateAfterDays",
        ].includes(key)
      )
        row[key] = Number(raw[key]);
      else
        row[key] = String(raw[key])
          .trim()
          .slice(0, key === "notes" ? 4000 : 1200);
    }
  if (kind === "projects") {
    cents(row.budget || 0);
    row.status = [
      "Planning",
      "Sourcing",
      "In progress",
      "Completed",
      "Cancelled",
    ].includes(raw.status)
      ? raw.status
      : "Planning";
  }
  if (kind === "orders") {
    if (!row.vendorId) throw Error("Choose a supplier.");
    row.lines = (row.lines || []).map((line, i) => {
      if (!line.productId) throw Error("Choose a product for each order line.");
      landedCost(line, line.quantity);
      return {
        id: String(line.id || "line-" + i),
        productId: String(line.productId),
        description: String(line.description || "").slice(0, 250),
        quantity: Number(line.quantity),
        price: Number(line.price),
        customization: Number(line.customization || 0),
        packaging: Number(line.packaging || 0),
        freight: Number(line.freight || 0),
        taxRate: Number(line.taxRate || 0),
      };
    });
    if (new Set(row.lines.map((l) => l.id)).size !== row.lines.length)
      throw Error("Order line IDs must be unique.");
    row.totals = orderTotals(row.lines);
  }
  if (["customizations", "samples"].includes(kind) && !row.productId)
    throw Error("Choose a product.");
  if (
    kind === "samples" &&
    (!Number.isSafeInteger(row.quantity) ||
      row.quantity < 1 ||
      row.quantity > 10000)
  )
    throw Error("Sample quantity must be a positive whole number.");
  if (kind === "scorecards") {
    if (!row.vendorId) throw Error("Choose a vendor.");
    for (const key of ["quality", "communication", "value"])
      if (!Number.isInteger(row[key]) || row[key] < 1 || row[key] > 5)
        throw Error("Ratings must be integers from 1 to 5.");
  }
  if (kind === "comments" && (!row.targetKind || !row.targetId || !row.notes))
    throw Error("Choose a record and enter a comment.");
  if (kind === "automations") {
    if (!row.vendorId || !row.nextDate)
      throw Error("Choose a vendor and next reminder date.");
    if (
      !Number.isInteger(row.frequencyDays) ||
      row.frequencyDays < 1 ||
      row.frequencyDays > 365
    )
      throw Error("Repeat interval must be 1–365 days.");
    row.enabled = raw.enabled !== false;
    row.escalateAfterDays = Number(row.escalateAfterDays || 3);
    if (row.escalateAfterDays < 1 || row.escalateAfterDays > 90)
      throw Error("Escalation period must be 1–90 days.");
  }
  if (kind === "report-schedules") {
    if (
      !["network", "sourcing", "tasks"].includes(row.report) ||
      !/^\S+@\S+\.\S+$/.test(row.recipient || "")
    )
      throw Error("Choose a report and recipient email.");
    if (
      !Number.isInteger(row.frequencyDays) ||
      row.frequencyDays < 1 ||
      row.frequencyDays > 365
    )
      throw Error("Report interval must be 1–365 days.");
    row.enabled = raw.enabled !== false;
  }
  if (kind === "verifications" && (!row.vendorId || !row.documentId))
    throw Error("Choose a vendor and supporting document.");
  for (const key of ["deadline", "dueDate", "nextDate", "validUntil"])
    if (
      row[key] &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(row[key]) ||
        !Number.isFinite(Date.parse(row[key])))
    )
      throw Error("Use a valid date.");
  return row;
}
export function operationLinks(row, base, operations, members = []) {
  for (const [field, collection] of [
    ["vendorId", "vendors"],
    ["productId", "products"],
    ["artworkDocumentId", "documents"],
    ["documentId", "documents"],
    ["brandId", "brands"],
    ["rfqId", "rfqs"],
  ])
    if (row[field] && !base[collection]?.some((r) => r.id === row[field]))
      throw Error("Choose a related record from this workspace.");
  if (
    row.projectId &&
    !operations.projects?.some((p) => p.id === row.projectId)
  )
    throw Error("Choose an existing gifting project.");
  for (const field of ["ownerId", "assigneeId"])
    if (row[field] && !members.some((m) => m.id === row[field]))
      throw Error("Choose a current workspace member.");
  if (row.mentions?.some((id) => !members.some((m) => m.id === id)))
    throw Error("Mention current workspace members only.");
  if (row.lines?.some((l) => !base.products.some((p) => p.id === l.productId)))
    throw Error("Choose an existing product on every line.");
  if (
    row.documentId &&
    row.vendorId &&
    base.documents.find((d) => d.id === row.documentId)?.vendorId !==
      row.vendorId
  )
    throw Error("The evidence document must belong to this supplier.");
  if (
    row.targetKind &&
    !(base[row.targetKind] || operations[row.targetKind] || []).some(
      (r) => r.id === row.targetId,
    )
  )
    throw Error("Choose an existing record for the comment.");
}
export function receiveOrder(order, input) {
  if (!["Accepted", "Partially received", "Dispatched"].includes(order.status))
    throw Error("Only accepted or dispatched orders can receive goods.");
  if (!Array.isArray(input) || !input.length)
    throw Error("Enter received quantities.");
  const used = new Set(),
    prior = order.received || {};
  const received = { ...prior };
  for (const line of input) {
    if (used.has(line.lineId)) throw Error("Duplicate receipt line.");
    used.add(line.lineId);
    const original = order.lines.find((l) => l.id === line.lineId),
      quantity = Number(line.quantity);
    if (
      !original ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity + (received[line.lineId] || 0) > original.quantity
    )
      throw Error("Receipt exceeds remaining quantity or has an invalid line.");
    received[line.lineId] = (received[line.lineId] || 0) + quantity;
  }
  return {
    received,
    status: order.lines.every((l) => (received[l.id] || 0) === l.quantity)
      ? "Completed"
      : "Partially received",
  };
}
export function performance(orders, ratings, vendorId) {
  const completed = orders.filter(
    (o) => o.vendorId === vendorId && o.status === "Completed" && o.completedAt,
  );
  const dated = completed.filter((o) => o.dueDate);
  const onTime = dated.filter(
    (o) => o.completedAt.slice(0, 10) <= o.dueDate,
  ).length;
  const reviews = ratings.filter((r) => r.vendorId === vendorId);
  return {
    completedOrders: completed.length,
    deliveryObservations: dated.length,
    onTimePercent: dated.length
      ? Math.round((onTime / dated.length) * 100)
      : null,
    reviewCount: reviews.length,
    quality: reviews.length
      ? reviews.reduce((s, r) => s + r.quality, 0) / reviews.length
      : null,
    communication: reviews.length
      ? reviews.reduce((s, r) => s + r.communication, 0) / reviews.length
      : null,
    value: reviews.length
      ? reviews.reduce((s, r) => s + r.value, 0) / reviews.length
      : null,
  };
}
export function demoOperations(now = new Date()) {
  const createdAt = now.toISOString(),
    date = (days) =>
      new Date(now.getTime() + days * 86400000).toISOString().slice(0, 10);
  const data = Object.fromEntries(operationKinds.map((k) => [k, []]));
  data.projects = [
    {
      id: "project-sample-1",
      name: "Year-end appreciation collection",
      client: "Fictional Acme Studio",
      budget: 250000,
      deadline: date(30),
      status: "Sourcing",
      event: "Team appreciation",
      notes: "Fictional gifting project",
      createdAt,
      sample: true,
    },
  ];
  data.customizations = [
    {
      id: "artwork-sample-1",
      name: "Welcome-kit brand application",
      projectId: "project-sample-1",
      productId: "product-1",
      method: "Embroidery",
      placement: "Left chest",
      colours: "Navy / white",
      sizes: "S, M, L, XL",
      version: 1,
      status: "Draft",
      createdAt,
      sample: true,
    },
  ];
  data.orders = [
    {
      id: "order-sample-1",
      name: "Sample appreciation order",
      number: "PO-SAMPLE-0001",
      vendorId: "vendor-2",
      projectId: "project-sample-1",
      lines: [
        {
          id: "line-1",
          productId: "product-2",
          description: "Desk speaker",
          quantity: 100,
          price: 305,
          customization: 15,
          packaging: 20,
          freight: 500,
          taxRate: 0,
        },
      ],
      status: "Draft",
      received: {},
      createdAt,
      sample: true,
    },
  ];
  data.orders[0].totals = orderTotals(data.orders[0].lines);
  return data;
}
