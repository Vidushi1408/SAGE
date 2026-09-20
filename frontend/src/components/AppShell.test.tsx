import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({ usePathname: () => "/insights" }));
vi.mock("./ChatPanel", () => ({ default: () => <div data-testid="chat-panel" /> }));
vi.mock("./workspace/WorkspaceProvider", () => ({
  useWorkspace: () => ({
    canWrite: true, refreshing: false, refreshStep: "", refreshAnalysis: vi.fn(), lastAnalysedAt: null,
    error: "", setError: vi.fn(), toast: "", loading: false, signOut: vi.fn(),
    user: { id: "1", email: "demo@sage.ai", name: "Demo", role: "admin", is_active: true, created_at: "" },
    profile: { anomalies: [{ transaction_id: "TX_1", date: "2026-07-19", amount: 950, reason: "High value outlier" }] }
  })
}));

import AppShell from "./AppShell";

describe("AppShell", () => {
  it("shows the main navigation with the current page marked", () => {
    render(<AppShell><p>page body</p></AppShell>);
    const nav = screen.getByRole("navigation", { name: "Main" });
    for (const label of ["Overview", "Insights", "Data", "Ask SAGE", "Team", "Settings"]) {
      expect(nav).toHaveTextContent(label);
    }
    expect(screen.getByRole("link", { name: /^insights$/i, current: "page" })).toHaveAttribute("href", "/insights");
    expect(screen.getByText("page body")).toBeInTheDocument();
  });

  it("badges the bell with the anomaly count and lists them", async () => {
    render(<AppShell><p /></AppShell>);
    await userEvent.setup().click(screen.getByRole("button", { name: /notifications, 1 flagged/i }));
    expect(screen.getByText(/High value outlier/)).toBeInTheDocument();
  });

  it("shows the floating chat on every page except /ask", () => {
    render(<AppShell><p /></AppShell>);
    expect(screen.getByTestId("chat-panel")).toBeInTheDocument();
  });
});
