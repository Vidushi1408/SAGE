import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach } from "vitest";
import { ChartPanel, EmptyChart } from "./ChartPanel";
import { LegendRow, TooltipCard } from "./chartKit";
import DonutChart from "./DonutChart";
import CalendarHeatmap from "./CalendarHeatmap";
import { resetColorRegistry } from "../../lib/chartTheme";

beforeEach(() => resetColorRegistry());

const table = {
  columns: [{ key: "name", label: "Day" }, { key: "revenue", label: "Revenue", align: "right" as const, format: (v: unknown) => `$${v}` }],
  rows: [{ name: "Mon", revenue: 10 }, { name: "Tue", revenue: 20 }],
};

describe("ChartPanel", () => {
  it("shows the chart by default and swaps to an accessible table with the same numbers", async () => {
    render(<ChartPanel title="Sales by day" subtitle="Average" icon={<span />} table={table} summary="Bars of sales by weekday"><div data-testid="plot" /></ChartPanel>);
    expect(screen.getByTestId("plot")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Bars of sales by weekday" })).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: "table" }));
    expect(screen.queryByTestId("plot")).not.toBeInTheDocument();
    const grid = screen.getByRole("table");
    expect(within(grid).getByRole("columnheader", { name: "Revenue" })).toBeInTheDocument();
    expect(within(grid).getByText("$20")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "table" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.setup().click(screen.getByRole("button", { name: "chart" }));
    expect(screen.getByTestId("plot")).toBeInTheDocument();
  });

  it("offers no switch when there is no table, and hides the legend while the table is open", async () => {
    const { unmount } = render(<ChartPanel title="T" icon={<span />}><p>plot</p></ChartPanel>);
    expect(screen.queryByRole("button", { name: "table" })).not.toBeInTheDocument();
    unmount();

    render(<ChartPanel title="T" icon={<span />} table={table} legend={<p>legend text</p>}><p>plot</p></ChartPanel>);
    expect(screen.getByText("legend text")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "table" }));
    expect(screen.queryByText("legend text")).not.toBeInTheDocument();
  });

  it("falls back to the title for the screen-reader description", () => {
    render(<ChartPanel title="Growth rate" subtitle="Weekly" icon={<span />}><p /></ChartPanel>);
    expect(screen.getByRole("img", { name: "Growth rate. Weekly" })).toBeInTheDocument();
  });

  it("renders a friendly empty message", () => {
    render(<EmptyChart label="Nothing yet" />);
    expect(screen.getByText("Nothing yet")).toBeInTheDocument();
  });
});

describe("tooltip and legend", () => {
  it("keeps tooltip text in ink and lets the swatch carry the colour", () => {
    render(<TooltipCard title="Sep 28 – Oct 4" rows={[{ color: "#b8601c", text: "Revenue $300.00" }]} note="Still in progress" />);
    const row = screen.getByText("Revenue $300.00");
    expect(row).toHaveStyle({ color: "#3d3335" });
    expect(row.previousElementSibling).toHaveStyle({ background: "#b8601c" });
    expect(screen.getByText("Still in progress")).toBeInTheDocument();
  });

  it("lists every series in the legend, and renders nothing for an empty one", () => {
    const { container, rerender } = render(<LegendRow items={[{ label: "Revenue", color: "#b8601c", kind: "line" }, { label: "Projected", color: "#b8601c", kind: "dash-light" }]} />);
    expect(screen.getAllByRole("listitem").map(li => li.textContent)).toEqual(["Revenue", "Projected"]);
    rerender(<LegendRow items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("DonutChart", () => {
  const slices = [
    { name: "Coffee", value: 600 }, { name: "Bakery", value: 300 }, { name: "Tea", value: 50 }, { name: "Juice", value: 20 },
    { name: "Snacks", value: 15 }, { name: "Water", value: 10 }, { name: "Gum", value: 5 },
  ];

  it("shows the total in the centre and lists each slice with value and share", () => {
    render(<DonutChart slices={slices.slice(0, 2)} />);
    expect(screen.getByText("$900")).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Coffee");
    expect(items[0]).toHaveTextContent("$600.00");
    expect(items[0]).toHaveTextContent("67%");
  });

  it("never shows more than six slices: the smallest fold into Other", () => {
    render(<DonutChart slices={slices} />);
    const names = screen.getAllByRole("listitem").map(li => li.textContent ?? "");
    expect(names).toHaveLength(6);
    expect(names[5]).toContain("Other");
    expect(names[4]).toContain("Snacks"); // the five largest keep their own slice
    expect(names[5]).toContain("$15.00"); // Water 10 + Gum 5
  });

  it("swaps the centre to the slice you point at", async () => {
    render(<DonutChart slices={slices.slice(0, 2)} />);
    await userEvent.setup().hover(screen.getAllByRole("listitem")[1]);
    expect(screen.getByText("$300")).toBeInTheDocument();
    expect(screen.getAllByText("Bakery").length).toBeGreaterThan(1); // list + centre caption
  });

  it("ignores zero-value slices", () => {
    render(<DonutChart slices={[{ name: "Coffee", value: 10 }, { name: "Ghost", value: 0 }]} />);
    expect(screen.queryByText("Ghost")).not.toBeInTheDocument();
  });
});

describe("CalendarHeatmap", () => {
  const daily = Array.from({ length: 14 }, (_, i) => ({ date: `2026-10-${String(5 + i).padStart(2, "0")}`, revenue: (i + 1) * 10, transactions: i + 1 }));

  it("draws one labelled cell per day", () => {
    render(<CalendarHeatmap daily={daily} />);
    expect(screen.getAllByRole("button")).toHaveLength(14);
    expect(screen.getByRole("button", { name: "2026-10-05: $10.00, 1 sales" })).toBeInTheDocument();
  });

  it("reads out a day's figures on hover and clears when you leave", async () => {
    render(<CalendarHeatmap daily={daily} />);
    const user = userEvent.setup();
    await user.hover(screen.getByRole("button", { name: /2026-10-06/ }));
    expect(screen.getByText("Tuesday Oct 6: $20.00 from 2 sales")).toBeInTheDocument();
    await user.unhover(screen.getByRole("button", { name: /2026-10-06/ }));
    expect(screen.getByText("Point at a day to see its sales.")).toBeInTheDocument();
  });

  it("marks days with no sales as such instead of as the lowest level", async () => {
    const gap = [{ date: "2026-10-05", revenue: 50, transactions: 2 }, { date: "2026-10-07", revenue: 80, transactions: 3 }];
    render(<CalendarHeatmap daily={gap} />);
    await userEvent.setup().hover(screen.getByRole("button", { name: "2026-10-06: no sales" }));
    expect(screen.getByText("Tuesday Oct 6: no sales recorded")).toBeInTheDocument();
  });

  it("includes the colour scale legend", () => {
    render(<CalendarHeatmap daily={daily} />);
    expect(screen.getByText("Less")).toBeInTheDocument();
    expect(screen.getByText("More")).toBeInTheDocument();
    expect(screen.getByText("No sales")).toBeInTheDocument();
  });
});
