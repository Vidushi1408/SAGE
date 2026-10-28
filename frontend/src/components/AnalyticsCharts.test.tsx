import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AnalyticsCharts from "./AnalyticsCharts";
import { resetColorRegistry } from "../lib/chartTheme";

beforeEach(() => resetColorRegistry());

const month = (m: string, revenue: number, transactions: number, extra = {}) =>
  ({ month: m, revenue, transactions, growth_pct: null as number | null, is_complete: true, ...extra });

const profile = {
  period_metrics: {
    monthly: [
      month("2026-07", 100, 10),
      month("2026-08", 200, 12, { growth_pct: 100 }),
      month("2026-09", 300, 15, { growth_pct: 50 }),
      month("2026-10", 40, 3, { is_complete: false, days_covered: 2, days_in_period: 31 }),
    ],
    weekly: [],
    daily: Array.from({ length: 10 }, (_, i) => ({ date: `2026-09-${String(20 + i).padStart(2, "0")}`, revenue: 10 + i, transactions: 1 + i, growth_pct: null })),
  },
  forecast: { weekly: null, monthly: { projected_period: "2026-10", projected_revenue: 400 } },
  anomalies: [{ transaction_id: "TX1", date: "2026-08-14", amount: 950, reason: "High value outlier", z_score: 3.2 }],
  category_metrics: { all_categories: [{ category: "Coffee", revenue: 600, volume: 30, share_pct: 75 }, { category: "Bakery", revenue: 200, volume: 10, share_pct: 25 }] },
};

const open = (name: string) => screen.getByRole("region", { name });

describe("AnalyticsCharts", () => {
  it("renders nothing when there is no period data", () => {
    const { container } = render(<AnalyticsCharts profile={{ period_metrics: { daily: [], weekly: [], monthly: [] } }} />);
    expect(container).toBeEmptyDOMElement();
    expect(render(<AnalyticsCharts profile={null} />).container).toBeEmptyDOMElement();
  });

  it("explains dashed lines and flagged transactions in the legend when they are on the chart", async () => {
    render(<AnalyticsCharts profile={profile} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Monthly" }));
    const legend = within(open("Revenue & transactions"));
    expect(legend.getByText("In progress (unfinished month)")).toBeInTheDocument();
    expect(legend.getByText("Projected")).toBeInTheDocument();
    expect(legend.getByText("Flagged transactions")).toBeInTheDocument();
  });

  it("leaves the extras out of the legend when the data has none", async () => {
    const plain = { ...profile, forecast: undefined, anomalies: [], period_metrics: { ...profile.period_metrics, monthly: profile.period_metrics.monthly.slice(0, 3) } };
    render(<AnalyticsCharts profile={plain} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Monthly" }));
    const panel = within(open("Revenue & transactions"));
    expect(panel.queryByText(/In progress/)).not.toBeInTheDocument();
    expect(panel.queryByText("Projected")).not.toBeInTheDocument();
    expect(panel.queryByText("Flagged transactions")).not.toBeInTheDocument();
    expect(panel.getByText("Transactions")).toBeInTheDocument();
  });

  it("offers the same numbers as a table, marking the unfinished and projected periods", async () => {
    render(<AnalyticsCharts profile={profile} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Monthly" }));
    await user.click(within(open("Revenue & transactions")).getByRole("button", { name: "table" }));
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1).map(r => within(r).getAllByRole("cell").map(c => c.textContent));
    expect(rows[2]).toEqual(["Sep '26", "$300.00", "", "15", "Finished"]);
    expect(rows[3]).toEqual(["Oct '26", "$40.00", "$400.00", "3", "In progress (2 of 31 days)"]);
  });

  it("never compares an unfinished period: growth lists only finished ones", async () => {
    render(<AnalyticsCharts profile={profile} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Monthly" }));
    await user.click(within(open("Growth rate")).getByRole("button", { name: "table" }));
    const periods = within(screen.getByRole("table")).getAllByRole("row").slice(1).map(r => within(r).getAllByRole("cell")[0].textContent);
    expect(periods).toEqual(["Aug '26", "Sep '26"]);
  });

  it("says why there is no growth chart when nothing can be compared", () => {
    render(<AnalyticsCharts profile={{ ...profile, period_metrics: { ...profile.period_metrics, weekly: [{ week: "2026-09-28/2026-10-04", revenue: 5, transactions: 1, growth_pct: null, is_complete: false }] } }} />);
    expect(screen.getByText(/Growth needs two finished weeks/)).toBeInTheDocument();
  });

  it("shows the sales calendar only when there are at least a week of days", () => {
    const { rerender } = render(<AnalyticsCharts profile={profile} />);
    expect(screen.getByRole("region", { name: "Sales calendar" })).toBeInTheDocument();
    rerender(<AnalyticsCharts profile={{ ...profile, period_metrics: { ...profile.period_metrics, daily: profile.period_metrics.daily.slice(0, 3) } }} />);
    expect(screen.queryByRole("region", { name: "Sales calendar" })).not.toBeInTheDocument();
  });

  it("gives every chart panel a table view", () => {
    render(<AnalyticsCharts profile={profile} />);
    const panels = screen.getAllByRole("region");
    expect(panels.length).toBeGreaterThanOrEqual(7);
    for (const panel of panels) expect(within(panel).getByRole("button", { name: "table" })).toBeInTheDocument();
  });

  it("lists each category once in the share table", async () => {
    render(<AnalyticsCharts profile={profile} />);
    await userEvent.setup().click(within(open("Revenue share by category")).getByRole("button", { name: "table" }));
    const names = within(screen.getByRole("table")).getAllByRole("row").slice(1).map(r => within(r).getAllByRole("cell")[0].textContent);
    expect(names).toEqual(["Coffee", "Bakery"]);
  });
});
