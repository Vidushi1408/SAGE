import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import InsightChart from "./InsightChart";
import { InsightObject } from "../lib/api";

describe("InsightChart", () => {
  it("renders nothing when chart_type is none", () => {
    const insight: InsightObject = {
      title: "No chart insight",
      explanation: "Text only",
      chart_type: "none",
      chart_data: []
    };
    const { container } = render(<InsightChart insight={insight} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when chart_data is empty even if a chart_type is set", () => {
    const insight: InsightObject = {
      title: "Empty data",
      explanation: "No points",
      chart_type: "bar",
      chart_data: []
    };
    const { container } = render(<InsightChart insight={insight} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a chart container when chart_data is present", () => {
    const insight: InsightObject = {
      title: "Weekly Revenue",
      explanation: "Trending up",
      chart_type: "area",
      chart_data: [{ name: "Mon", value: 100 }, { name: "Tue", value: 150 }]
    };
    const { container } = render(<InsightChart insight={insight} idx={0} />);
    expect(container.querySelector(".recharts-responsive-container")).toBeTruthy();
  });
});
