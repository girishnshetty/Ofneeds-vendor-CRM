import { useState } from "react";
import { useCRM } from "./context";
import { PageHeader } from "./Workspace";
import { BarChart, WidgetHeader, counts } from "./Dashboard";
import { Icon } from "./ui";
import { download } from "./client";
import { csv } from "../shared/core.mjs";
export default function Reports() {
  const c = useCRM(),
    [range, setRange] = useState(
      () => sessionStorage.getItem("ofneeds-crm.report-range") || "30",
    );
  const charts = c.summary.charts,
    cutoff = new Date(Date.now() - Number(range) * 86400000)
      .toISOString()
      .slice(0, 10);
  const onboarding = charts.onboarding
    .filter((d: string) => d >= cutoff)
    .map((d: string) => d.slice(0, 7));
  const followups = charts.followups
    .filter((t: any) => t.date >= cutoff)
    .map((t: any) => `${t.date.slice(0, 7)} · ${t.status}`);
  const datasets = [
    ["Vendors by category", charts.categories, "All current vendor records"],
    ["Vendors by location", charts.cities, "All current vendor records"],
    [
      "Brand coverage",
      charts.brands.map(
        (id: string) =>
          c.options.brands.find((b) => b.id === id)?.name || "Unknown brand",
      ),
      "Recorded supplier-brand relationships",
    ],
    [
      "Vendor onboarding trend",
      onboarding,
      `Vendors created in the last ${range} days`,
    ],
    ["RFQ status", charts.rfqs, "All current requests"],
    [
      "Follow-up completion trend",
      followups,
      `Scheduled in the last ${range} days`,
    ],
  ];
  return (
    <>
      <PageHeader
        title={
          c.page === "analytics" ? "Network analytics" : "Reports & insights"
        }
        description="A clear picture of your network, based on the records you maintain."
      >
        <select
          value={range}
          onChange={(e) => setRange(e.target.value)}
          aria-label="Report date range"
        >
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="365">Last 12 months</option>
        </select>
        <button
          className="button outline"
          onClick={() => {
            const rows = datasets.flatMap(([name, values]) =>
              counts(values as string[]).map(([group, count]) => ({
                report: name,
                group,
                count,
                sample: c.demo ? "Sample data" : "Workspace data",
              })),
            );
            download(
              "ofneeds-network-report.csv",
              csv(rows, ["report", "group", "count", "sample"]),
            );
          }}
        >
          <Icon name="Download" size={16} />
          Export report
        </button>
      </PageHeader>
      <div className="report-note">
        <Icon name="Info" size={17} />
        {c.demo
          ? "Every chart shows fictional sample records."
          : "Charts use current workspace records; no growth figures are estimated."}{" "}
        Date filters apply to onboarding and follow-up trends.
      </div>
      <div className="reports-grid">
        {datasets.map(([title, values, description]) => (
          <section className="card report-card" key={String(title)}>
            <WidgetHeader
              title={String(title)}
              subtitle={String(description)}
            />
            <BarChart
              values={values as string[]}
              onSelect={
                String(title).includes("category")
                  ? (category) => {
                      sessionStorage.setItem(
                        "ofneeds-crm.next-filter",
                        JSON.stringify({ category }),
                      );
                      c.go("vendors");
                    }
                  : String(title).includes("location")
                    ? (city) => {
                        sessionStorage.setItem(
                          "ofneeds-crm.next-filter",
                          JSON.stringify({ city }),
                        );
                        c.go("vendors");
                      }
                    : undefined
              }
            />
            <p className="chart-caption">
              {(values as string[]).length} recorded observations
              {c.demo ? " · Sample data" : ""}
            </p>
          </section>
        ))}
      </div>
    </>
  );
}
