import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const selectInsight = vi.fn();
const anomalies = [
  { transaction_id: "TX_SMALL", date: "2026-01-05", amount: 120, reason: "High value outlier", z_score: 2.1 },
  { transaction_id: "TX_BIG", date: "2026-01-02", amount: 9000, reason: "High value outlier", z_score: 4.4 },
  { transaction_id: "=CMD()", date: "2026-01-09", amount: -50, reason: "Refund, large", z_score: 0 },
];
const workspace = {
  hasData: true, selectInsight, selectedInsightId: "latest",
  insights: { recommendation: "Promote bakery items.", insights: [{ title: "Revenue up", explanation: "Weekly growth is 8%.", chart_type: "none", chart_data: [] }] },
  insightHistory: [{ id: "h1", created_at: "2026-01-01T10:00:00", recommendation: "Older advice" }],
  profile: { anomalies },
};

vi.mock("../../../components/workspace/WorkspaceProvider", () => ({ useWorkspace: () => workspace }));
vi.mock("../../../components/InsightChart", () => ({ default: () => null }));
vi.mock("../../../components/AnalyticsCharts", () => ({ default: () => null }));

import InsightsPage from "./page";

const idsInOrder = () =>
  within(screen.getByRole("table")).getAllByRole("row").slice(1).map(r => r.querySelectorAll("td")[1].textContent);

describe("InsightsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspace.hasData = true;
  });

  it("shows the recommendation and each generated insight", () => {
    render(<InsightsPage />);
    expect(screen.getByText("Promote bakery items.")).toBeInTheDocument();
    expect(screen.getByText("Revenue up")).toBeInTheDocument();
  });

  it("shows an empty state before any analysis exists", () => {
    workspace.hasData = false;
    const original = { insights: workspace.insights, history: workspace.insightHistory };
    Object.assign(workspace, { insights: null, insightHistory: [] });
    render(<InsightsPage />);
    expect(screen.getByText("No insights yet")).toBeInTheDocument();
    Object.assign(workspace, { insights: original.insights, insightHistory: original.history });
  });

  it("sorts anomalies by absolute amount by default, then by newest date", async () => {
    render(<InsightsPage />);
    expect(idsInOrder()).toEqual(["TX_BIG", "TX_SMALL", "=CMD()"]);
    await userEvent.setup().selectOptions(screen.getByLabelText("Sort anomalies"), "date");
    expect(idsInOrder()).toEqual(["=CMD()", "TX_SMALL", "TX_BIG"]);
  });

  it("filters anomalies by search text and reports when nothing matches", async () => {
    render(<InsightsPage />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Search anomalies"), "tx_big");
    expect(idsInOrder()).toEqual(["TX_BIG"]);
    await user.clear(screen.getByLabelText("Search anomalies"));
    await user.type(screen.getByLabelText("Search anomalies"), "nothing like this");
    expect(screen.getByText("No anomalies match your search.")).toBeInTheDocument();
  });

  it("loads a past analysis from the history", async () => {
    render(<InsightsPage />);
    await userEvent.setup().click(screen.getByText("Older advice"));
    expect(selectInsight).toHaveBeenCalledWith("h1");
  });

  it("exports the visible anomalies as CSV, quoting commas and neutralising formulas", async () => {
    let blob: Blob | undefined;
    URL.createObjectURL = vi.fn((b: Blob) => { blob = b; return "blob:x"; });
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(<InsightsPage />);
    await userEvent.setup().click(screen.getByRole("button", { name: /export anomalies/i }));

    expect(click).toHaveBeenCalled();
    const text = await new Promise<string>(res => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.readAsText(blob!);
    });
    const lines = text.split("\n");
    expect(lines[0]).toBe("Date,Transaction ID,Amount,Z-Score,Reason");
    expect(lines).toContain("2026-01-09,'=CMD(),-50,0,\"Refund, large\"");
  });
});
