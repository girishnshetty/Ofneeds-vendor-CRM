import { landedCost } from "./operations.mjs";
export const categories = [
  "Apparel",
  "Electronics",
  "Luggage",
  "Bags",
  "Drinkware",
  "Stationery",
  "Printing",
  "Packaging",
];
export const kinds = [
  "vendors",
  "brands",
  "contacts",
  "products",
  "rfqs",
  "follow-ups",
  "documents",
];
export function emptyData() {
  return Object.fromEntries(kinds.map((k) => [k, []]));
}
export function demoData(now = new Date()) {
  const data = emptyData();
  const date = (days) =>
    new Date(now.getTime() + days * 86400000).toISOString();
  const brandNames = [
    "Aster & Oak",
    "Nook Audio",
    "Roamwell",
    "Paperfolk",
    "Morrow Studio",
    "Fable Carry",
    "Emberware",
    "Kindred Works",
    "Forma Print",
    "Parcel & Co",
    "Loop Living",
    "Daybreak",
    "Northloom",
    "Fieldnote",
    "Cobalt Tech",
  ];
  data.brands = brandNames.map((name, i) => ({
    id: `brand-${i + 1}`,
    name,
    category: categories[i % 8],
    description: "Fictional corporate gifting brand",
    sample: true,
    createdAt: date(-90 + i),
  }));
  const names = [
    "Northstar Gifting Studio",
    "Atlas Corporate Supply",
    "Willow & Co. Merchants",
    "Meridian Brand House",
    "Kitework Distributors",
    "Evergreen Gift Collective",
    "Bluepeak Enterprises",
    "Cedarline Trading",
    "Pebble Procurement",
    "Avenue Supply Studio",
    "Westhaven Partners",
    "Brightnest Merchandising",
    "Copperleaf Exports",
    "Orchard Corporate Gifts",
    "Summit Printworks",
    "Littlewood Packaging",
    "Bridgewell Commerce",
    "Meadowline Distributors",
    "Silverfern Supply",
    "Oakridge Merchants",
    "Seabrook Gifting",
    "Daylight Corporate",
    "Pinecrest Products",
    "Brookfield Brands",
    "Cloudline Ventures",
  ];
  const cities = [
    "Bengaluru",
    "Mumbai",
    "New Delhi",
    "Hyderabad",
    "Chennai",
    "Pune",
  ];
  const states = [
    "Karnataka",
    "Maharashtra",
    "Delhi",
    "Telangana",
    "Tamil Nadu",
    "Maharashtra",
  ];
  data.vendors = names.map((name, i) => ({
    id: `vendor-${i + 1}`,
    name,
    contact: [
      "Aarav Sen",
      "Mira Kapoor",
      "Dev Anand",
      "Tara Mehta",
      "Rohan Das",
    ][i % 5],
    email: `hello${i + 1}@supplier.example`,
    phone: "Not dialable · sample",
    city: cities[i % 6],
    state: states[i % 6],
    address: `Sample Business Park, Unit ${i + 1}`,
    warehouse: "Sample logistics district",
    dispatch: "Registered office",
    type: i % 3 ? "Distributor" : "Manufacturer",
    status: i % 7 ? "Active" : "Pending",
    authorization:
      i % 5 === 0 ? "Unverified" : i % 7 === 0 ? "Expired" : "Authorized",
    authorizationUntil: date(i % 7 === 0 ? -2 : 15 + i * 9),
    brandIds: [`brand-${(i % 15) + 1}`, `brand-${((i + 3) % 15) + 1}`],
    category: categories[i % 8],
    terms: "30 days from invoice",
    moq: 25,
    leadTime: 5 + (i % 5),
    gst: "Not registered · sample",
    website: "https://supplier.example",
    lastContact: date(-i % 12),
    createdAt: date(-90 + i * 3),
    stock: i % 4 ? "Available" : "On request",
    sample: true,
  }));
  data.contacts = Array.from({ length: 50 }, (_, i) => ({
    id: `contact-${i + 1}`,
    name:
      ["Aarav Sen", "Mira Kapoor", "Dev Anand", "Tara Mehta", "Rohan Das"][
        i % 5
      ] + (i > 4 ? ` ${i + 1}` : ""),
    vendorId: `vendor-${(i % 25) + 1}`,
    email: `person${i + 1}@supplier.example`,
    phone: "Not dialable · sample",
    role: i < 25 ? "Sales manager" : "Accounts contact",
    sample: true,
    createdAt: date(-i),
  }));
  const productNames = [
    "Organic cotton polo",
    "Desk speaker",
    "Weekender cabin case",
    "Everyday laptop backpack",
    "Insulated tumbler",
    "Hardcover notebook",
    "Welcome card set",
    "Presentation gift box",
  ];
  data.products = Array.from({ length: 40 }, (_, i) => ({
    id: `product-${i + 1}`,
    name: `${productNames[i % 8]}${i >= 8 ? " · " + ["Classic", "Studio", "Essential", "Signature"][Math.floor(i / 8) - 1] : ""}`,
    category: categories[i % 8],
    brandId: `brand-${(i % 15) + 1}`,
    description:
      "A fictional product for sourcing practice. Customisation available on request.",
    sku: `OF-SAMPLE-${String(i + 1).padStart(3, "0")}`,
    sample: true,
    createdAt: date(-i),
    quotes: Array.from({ length: 3 }, (_, j) => ({
      vendorId: `vendor-${((i + j * 6) % 25) + 1}`,
      price: Math.round((260 + i * 45) * (1 + j * 0.12)),
      moq: 25 + j * 25,
      stock: 120 + j * 60,
      leadTime: 4 + j * 3,
    })),
  }));
  data["follow-ups"] = Array.from({ length: 15 }, (_, i) => ({
    id: `task-${i + 1}`,
    name: [
      "Confirm sample availability",
      "Request updated catalogue",
      "Review brand authorization",
      "Follow up on quotation",
      "Discuss delivery timeline",
    ][i % 5],
    vendorId: `vendor-${i + 1}`,
    date: date((i % 5) - 2).slice(0, 10),
    status: i % 4 === 0 ? "Completed" : "Open",
    priority: i % 3 === 0 ? "High" : "Normal",
    createdAt: date(-i),
    sample: true,
  }));
  data.rfqs = Array.from({ length: 8 }, (_, i) => ({
    id: `rfq-${i + 1}`,
    name: [
      "New joiner welcome kits",
      "Leadership offsite essentials",
      "Festive appreciation boxes",
      "Client thank-you collection",
      "Conference merchandise",
      "Team travel collection",
      "Quarterly recognition gifts",
      "Sustainable desk essentials",
    ][i],
    productId: `product-${i + 1}`,
    quantity: 100 + i * 50,
    vendorIds: [`vendor-${i + 1}`, `vendor-${i + 7}`],
    responses:
      i % 4 === 0
        ? []
        : [
            {
              vendorId: `vendor-${i + 1}`,
              price: 260 + i * 45,
              moq: 25,
              stock: 120 + i * 50,
              leadTime: 4,
              notes: "Fictional supplier response for demonstration.",
            },
            {
              vendorId: `vendor-${i + 7}`,
              price: Math.round((260 + i * 45) * 1.12),
              moq: 50,
              stock: 200 + i * 50,
              leadTime: 7,
              notes: "Fictional alternative quotation.",
            },
          ],
    status: ["Open", "Quoted", "Reviewing", "Closed"][i % 4],
    deadline: date(5 + i).slice(0, 10),
    notes: "Fictional sourcing brief. Prices exclude shipping and taxes.",
    sample: true,
    createdAt: date(-14 + i),
  }));
  data.documents = [
    {
      id: "document-1",
      name: "Sample supplier catalogue.txt",
      vendorId: "vendor-1",
      description:
        "Fictional catalogue reference. No real certificates or authorizations.",
      sample: true,
      createdAt: date(-7),
    },
  ];
  return data;
}
export function filterRecords(records, filters = {}) {
  return records.filter((row) => {
    if (
      filters.q &&
      !JSON.stringify(row)
        .toLowerCase()
        .includes(String(filters.q).toLowerCase())
    )
      return false;
    return (
      [
        "city",
        "state",
        "category",
        "type",
        "authorization",
        "status",
        "stock",
        "vendorId",
      ].every((k) => !filters[k] || row[k] === filters[k]) &&
      (!filters.brandId ||
        row.brandId === filters.brandId ||
        row.brandIds?.includes(filters.brandId))
    );
  });
}
export function paginate(records, filters = {}) {
  const filtered = filterRecords(records, filters);
  const page = Math.max(1, Number(filters.page) || 1),
    limit = Math.min(100, Math.max(1, Number(filters.limit) || 12));
  const dir = filters.direction === "desc" ? -1 : 1,
    sort = ["name", "city", "status", "createdAt", "date"].includes(
      filters.sort,
    )
      ? filters.sort
      : "name";
  filtered.sort(
    (a, b) => String(a[sort] || "").localeCompare(String(b[sort] || "")) * dir,
  );
  return {
    rows: filtered.slice((page - 1) * limit, page * limit),
    total: filtered.length,
    page,
    limit,
  };
}
export function validateRecord(kind, value) {
  if (!kinds.includes(kind)) throw new Error("Unknown record type.");
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Enter record details.");
  /** @type {Record<string, any>} */
  const row = {};
  const fields = {
    vendors: [
      "name",
      "contact",
      "email",
      "phone",
      "city",
      "state",
      "address",
      "warehouse",
      "dispatch",
      "type",
      "status",
      "authorization",
      "authorizationUntil",
      "brandIds",
      "category",
      "terms",
      "moq",
      "leadTime",
      "gst",
      "website",
      "lastContact",
      "stock",
    ],
    brands: ["name", "category", "description"],
    contacts: ["name", "vendorId", "email", "phone", "role"],
    products: ["name", "category", "brandId", "description", "sku", "quotes"],
    rfqs: [
      "name",
      "productId",
      "quantity",
      "vendorIds",
      "responses",
      "status",
      "deadline",
      "notes",
    ],
    "follow-ups": ["name", "vendorId", "date", "status", "priority"],
    documents: ["name", "vendorId", "description"],
  }[kind];
  for (const key of fields)
    if (value[key] !== undefined)
      row[key] = Array.isArray(value[key])
        ? structuredClone(value[key])
        : typeof value[key] === "number"
          ? value[key]
          : String(value[key]).trim().slice(0, 2000);
  if (!row.name || row.name.length > 160)
    throw new Error("Use a name between 1 and 160 characters.");
  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email))
    throw new Error("Enter a valid email address.");
  if (["contacts", "documents"].includes(kind) && !row.vendorId)
    throw new Error("Choose a vendor for this record.");
  if (kind === "vendors") {
    if (!row.city) throw new Error("Enter the vendor city.");
    if (row.status && !["Active", "Pending", "Archived"].includes(row.status))
      throw new Error("Invalid vendor status.");
    if (
      row.authorization &&
      !["Authorized", "Unverified", "Expired"].includes(row.authorization)
    )
      throw new Error("Invalid authorization status.");
    if (
      row.brandIds &&
      (!Array.isArray(row.brandIds) ||
        row.brandIds.some((v) => typeof v !== "string"))
    )
      throw new Error("Choose valid brands.");
  }
  if (
    kind === "rfqs" &&
    (!Number.isSafeInteger(Number(row.quantity)) || Number(row.quantity) < 1)
  )
    throw new Error("Enter a positive whole quantity.");
  if (
    kind === "rfqs" &&
    (!Array.isArray(row.vendorIds) || !row.vendorIds.length)
  )
    throw new Error("Choose at least one vendor.");
  if (kind === "rfqs" && !row.productId)
    throw new Error("Choose a product for the RFQ.");
  if (
    kind === "follow-ups" &&
    (!row.vendorId ||
      !/^\d{4}-\d{2}-\d{2}$/.test(row.date || "") ||
      !Number.isFinite(Date.parse(row.date)))
  )
    throw new Error("Choose a vendor and valid follow-up date.");
  if (kind === "follow-ups" && !["Open", "Completed"].includes(row.status))
    throw new Error("Invalid follow-up status.");
  if (
    kind === "rfqs" &&
    row.status &&
    !["Open", "Quoted", "Reviewing", "Closed"].includes(row.status)
  )
    throw new Error("Invalid RFQ status.");
  for (const key of ["moq", "leadTime"])
    if (
      row[key] !== undefined &&
      (!Number.isFinite(Number(row[key])) || Number(row[key]) < 0)
    )
      throw new Error("MOQ and lead time must be non-negative numbers.");
  for (const key of ["authorizationUntil", "lastContact", "deadline"])
    if (row[key] && !Number.isFinite(Date.parse(row[key])))
      throw new Error("Enter a valid date.");
  if (kind === "rfqs" && row.responses) {
    if (!Array.isArray(row.responses) || row.responses.length > 30)
      throw new Error("Use up to 30 quotation responses.");
    const seen = new Set();
    row.responses = row.responses.map((q) => {
      if (
        !row.vendorIds?.includes(q.vendorId) ||
        seen.has(q.vendorId) ||
        !Number.isFinite(Number(q.price)) ||
        Number(q.price) <= 0 ||
        !Number.isFinite(Number(q.moq)) ||
        Number(q.moq) < 1 ||
        !Number.isFinite(Number(q.stock)) ||
        Number(q.stock) < 0 ||
        !Number.isFinite(Number(q.leadTime)) ||
        Number(q.leadTime) < 0
      )
        throw new Error(
          "Enter valid, unique quotations from selected RFQ suppliers.",
        );
      landedCost(q, 1);
      if (q.validUntil && !Number.isFinite(Date.parse(q.validUntil)))
        throw Error("Enter a valid quote expiry date.");
      seen.add(q.vendorId);
      return {
        vendorId: String(q.vendorId),
        price: Number(q.price),
        moq: Number(q.moq),
        stock: Number(q.stock),
        leadTime: Number(q.leadTime),
        notes: String(q.notes || "").slice(0, 1000),
        customization: Number(q.customization || 0),
        packaging: Number(q.packaging || 0),
        freight: Number(q.freight || 0),
        taxRate: Number(q.taxRate || 0),
        validUntil: String(q.validUntil || "").slice(0, 10),
        confirmedAt: q.confirmedAt
          ? String(q.confirmedAt).slice(0, 30)
          : undefined,
      };
    });
  }
  if (kind === "products" && row.quotes) {
    if (!Array.isArray(row.quotes) || row.quotes.length > 30)
      throw new Error("Use up to 30 supplier prices.");
    row.quotes = row.quotes.map((q) => {
      if (
        !q.vendorId ||
        !Number.isFinite(Number(q.price)) ||
        Number(q.price) <= 0 ||
        !Number.isFinite(Number(q.moq)) ||
        Number(q.moq) < 1 ||
        !Number.isFinite(Number(q.stock)) ||
        Number(q.stock) < 0 ||
        !Number.isFinite(Number(q.leadTime)) ||
        Number(q.leadTime) < 0
      )
        throw new Error(
          "Enter valid supplier price, MOQ, stock and lead time.",
        );
      return {
        vendorId: String(q.vendorId),
        price: Number(q.price),
        moq: Number(q.moq),
        stock: Number(q.stock),
        leadTime: Number(q.leadTime),
        confirmedAt: q.confirmedAt
          ? String(q.confirmedAt).slice(0, 30)
          : undefined,
        validUntil: String(q.validUntil || "").slice(0, 10),
      };
    });
  }
  return row;
}
export function validateLinks(kind, row, data) {
  if (row.vendorId && !data.vendors.some((v) => v.id === row.vendorId))
    throw new Error("Choose an existing vendor in this workspace.");
  if (row.brandId && !data.brands.some((b) => b.id === row.brandId))
    throw new Error("Choose an existing brand.");
  if (row.brandIds?.some((id) => !data.brands.some((b) => b.id === id)))
    throw new Error("Choose existing brands.");
  if (row.vendorIds?.some((id) => !data.vendors.some((v) => v.id === id)))
    throw new Error("Choose existing suppliers.");
  if (row.productId && !data.products.some((p) => p.id === row.productId))
    throw new Error("Choose an existing product.");
  if (row.quotes?.some((q) => !data.vendors.some((v) => v.id === q.vendorId)))
    throw new Error("Choose existing quote suppliers.");
}
export function metrics(data, today = new Date().toISOString().slice(0, 10)) {
  return {
    vendors: data.vendors.length,
    active: data.vendors.filter((v) => v.status === "Active").length,
    brands: data.brands.length,
    authorized: data.vendors.filter(
      (v) =>
        v.authorization === "Authorized" &&
        (!v.authorizationUntil || v.authorizationUntil.slice(0, 10) >= today),
    ).length,
    products: data.products.length,
    rfqs: data.rfqs.filter((r) => r.status !== "Closed").length,
    due: data["follow-ups"].filter(
      (t) => t.date === today && t.status !== "Completed",
    ).length,
    pending: data.vendors.filter(
      (v) => v.authorization === "Unverified" || v.status === "Pending",
    ).length,
  };
}
export function csv(rows, columns) {
  const cell = (value) =>
    '"' +
    String(value ?? "")
      .replace(/^[\s]*[=+@-]/, (m) => "'" + m)
      .replaceAll('"', '""') +
    '"';
  return [
    columns.map(cell).join(","),
    ...rows.map((row) =>
      columns
        .map((k) => cell(Array.isArray(row[k]) ? row[k].join("; ") : row[k]))
        .join(","),
    ),
  ].join("\r\n");
}
export function canDelete(data, kind, id) {
  if (
    kind === "vendors" &&
    (data.contacts.some((r) => r.vendorId === id) ||
      data["follow-ups"].some((r) => r.vendorId === id) ||
      data.documents.some((r) => r.vendorId === id) ||
      data.rfqs.some((r) => r.vendorIds?.includes(id)) ||
      data.products.some((r) => r.quotes?.some((q) => q.vendorId === id)))
  )
    throw new Error(
      "This vendor has related records. Archive it to preserve history.",
    );
  if (
    kind === "brands" &&
    (data.vendors.some((r) => r.brandIds?.includes(id)) ||
      data.products.some((r) => r.brandId === id))
  )
    throw new Error(
      "This brand is linked to vendors or products. Remove those relationships first.",
    );
  if (kind === "products" && data.rfqs.some((r) => r.productId === id))
    throw new Error(
      "This product is linked to RFQs. Keep it for procurement history.",
    );
}
