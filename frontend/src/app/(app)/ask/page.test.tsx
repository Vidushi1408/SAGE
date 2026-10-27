import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const workspace = { hasData: true };
vi.mock("../../../components/workspace/WorkspaceProvider", () => ({ useWorkspace: () => workspace }));
vi.mock("../../../components/InsightChart", () => ({ default: () => <div data-testid="chart" /> }));
vi.mock("../../../lib/api", () => ({
  default: { getChatHistory: vi.fn(), sendChatMessage: vi.fn() },
  errorMessage: (e: unknown) => (e instanceof Error ? e.message : ""),
}));

import api from "../../../lib/api";
import AskPage from "./page";

const mocked = vi.mocked(api, true);

describe("AskPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspace.hasData = true;
    Element.prototype.scrollTo = vi.fn();
    mocked.getChatHistory.mockResolvedValue({ history: [] } as never);
  });

  it("restores earlier conversation from history", async () => {
    mocked.getChatHistory.mockResolvedValue({ history: [
      { role: "user", content: "total revenue?" },
      { role: "assistant", content: "It is $1,000.00" },
    ] } as never);
    render(<AskPage />);
    expect(await screen.findByText("It is $1,000.00")).toBeInTheDocument();
  });

  it("sends a typed question and shows the reply", async () => {
    mocked.sendChatMessage.mockResolvedValue({ role: "assistant", content: "Coffee leads." } as never);
    render(<AskPage />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Your question"), "top category?");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Coffee leads.")).toBeInTheDocument();
    expect(screen.getByText("top category?")).toBeInTheDocument();
    expect(mocked.sendChatMessage).toHaveBeenCalledWith("top category?");
  });

  it("asks a suggested question when its chip is clicked", async () => {
    mocked.sendChatMessage.mockResolvedValue({ role: "assistant", content: "ok" } as never);
    render(<AskPage />);
    await userEvent.setup().click(await screen.findByRole("button", { name: "Are there any anomalies?" }));
    expect(mocked.sendChatMessage).toHaveBeenCalledWith("Are there any anomalies?");
  });

  it("renders a chart attached to an answer", async () => {
    mocked.sendChatMessage.mockResolvedValue({ role: "assistant", content: "Trend", chart: { chart_type: "line", chart_data: [] } } as never);
    render(<AskPage />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Your question"), "trend");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByTestId("chart")).toBeInTheDocument();
  });

  it("shows an error when the reply fails", async () => {
    mocked.sendChatMessage.mockRejectedValue(new Error("Chat is unavailable"));
    render(<AskPage />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Your question"), "hello");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Chat is unavailable");
  });

  it("does not send blank questions", async () => {
    render(<AskPage />);
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("asks for data first instead of offering suggestions when there is none", async () => {
    workspace.hasData = false;
    render(<AskPage />);
    expect(await screen.findByText(/Add your data first/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Are there any anomalies?" })).not.toBeInTheDocument();
  });
});
