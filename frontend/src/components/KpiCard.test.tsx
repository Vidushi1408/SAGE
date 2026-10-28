import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import KpiCard, { Sparkline } from "./KpiCard";

describe("KpiCard", () => {
  it("exposes the final value to assistive tech while it counts up", () => {
    render(<KpiCard label="Total Sales" value={1234.5} format={n => `$${n.toFixed(2)}`} hint="h" icon={null} tone="" />);
    expect(screen.getByLabelText("$1234.50")).toBeInTheDocument();
  });

  it("shows the fallback text when there is no number", () => {
    render(<KpiCard label="Weekly Growth" value={null} text="n/a" hint="h" icon={null} tone="" />);
    expect(screen.getByText("n/a")).toBeInTheDocument();
  });

  it("draws a labelled sparkline only with two or more points", () => {
    const { container, rerender } = render(<Sparkline values={[1]} label="x" />);
    expect(container.querySelector("svg")).toBeNull();
    rerender(<Sparkline values={[1, 3, 2]} label="Weekly sales" />);
    expect(screen.getByRole("img", { name: "Weekly sales" })).toBeInTheDocument();
  });
});
