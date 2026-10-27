export type Row = { id: string; name: string; [key: string]: any };
export type Data = Record<string, Row[]>;
export type User = {
  id: string;
  name: string;
  email: string;
  role: "owner" | "member" | "viewer";
  workspaceId: string;
  preferences: Prefs;
};
export type Prefs = {
  theme?: string;
  collapsed?: boolean;
  pinned?: string[];
  columns?: string[];
  favorites?: string[];
  widgets?: string[];
  views?: { name: string; filters: Record<string, string> }[];
  defaultPage?: string;
  categories?: string[];
  notifications?: boolean;
  widgetOrder?: string[];
  widths?: Record<string, number>;
};
export type PageResult = {
  rows: Row[];
  total: number;
  page: number;
  limit: number;
};
export const modules = [
  {
    group: "WORKSPACE",
    items: [
      ["dashboard", "Overview", "LayoutDashboard"],
      ["follow-ups", "My tasks", "ListTodo"],
      ["activity", "Recent activity", "Activity"],
    ],
  },
  {
    group: "SUPPLIER NETWORK",
    items: [
      ["vendors", "Vendors", "Building2"],
      ["brands", "Brands", "BadgeCheck"],
      ["contacts", "Contacts", "ContactRound"],
      ["categories", "Categories", "Layers3"],
      ["verifications", "Verification reviews", "ShieldCheck"],
      ["supplier-access", "Supplier access", "Network"],
      ["stock-freshness", "Stock freshness", "Warehouse"],
    ],
  },
  {
    group: "PROCUREMENT",
    items: [
      ["products", "Product catalogue", "Package"],
      ["prices", "Price lists", "Tags"],
      ["rfqs", "RFQs & quotations", "ClipboardList"],
      ["documents", "Documents", "Files"],
      ["projects", "Gifting projects", "Boxes"],
      ["purchase-orders", "Purchase orders", "ClipboardList"],
      ["customization", "Branding & artwork", "Pencil"],
      ["samples", "Sample requests", "Package"],
      ["approvals", "Approvals", "ShieldCheck"],
    ],
  },
  {
    group: "INSIGHTS",
    items: [
      ["reports", "Reports", "ChartNoAxesCombined"],
      ["analytics", "Analytics", "ChartPie"],
      ["performance", "Supplier performance", "ChartNoAxesCombined"],
      ["scheduled-reports", "Scheduled reports", "Files"],
    ],
  },
  {
    group: "ADMINISTRATION",
    items: [
      ["import", "Import / export", "ArrowLeftRight"],
      ["team", "Team management", "UsersRound"],
      ["settings", "Settings", "Settings2"],
      ["collaboration", "Collaboration", "MessageCircle"],
      ["automations", "Automations", "CalendarClock"],
      ["data-quality", "Data quality", "ArrowLeftRight"],
      ["delivery", "Delivery center", "Mail"],
      ["account-security", "Account security", "LockKeyhole"],
      ["integrations", "Connections", "Network"],
      ["billing", "Plans & usage", "Tags"],
      ["audit", "Audit trail", "Activity"],
      ["service-health", "Service health", "CircleCheck"],
    ],
  },
];
export const labelOf = (id: string) =>
  modules.flatMap((g) => g.items).find((i) => i[0] === id)?.[1] ||
  (id === "supplier-preview" ? "Supplier preview" : id);
