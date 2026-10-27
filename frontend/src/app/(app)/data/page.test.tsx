import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const runAnalysis = vi.fn();
const workspace = {
  canWrite: true, isAdmin: true, sheets: [], selectedSheetId: "", selectedSheetName: "",
  selectSheet: vi.fn(), selectSheetName: vi.fn(), refreshAnalysis: vi.fn(), refreshing: false,
  syncRows: null, runAnalysis, slack: { connected: false }, setSlack: vi.fn(),
  google: { connected: false, is_mock: true }, reloadGoogle: vi.fn(),
};

vi.mock("../../../components/workspace/WorkspaceProvider", () => ({
  useWorkspace: () => workspace,
  friendlyPipelineError: (m: string) => m,
}));
vi.mock("../../../lib/api", () => ({
  default: { getTransactions: vi.fn(), uploadFile: vi.fn() },
  errorMessage: (e: unknown) => (e instanceof Error ? e.message : ""),
}));

import api from "../../../lib/api";
import DataPage from "./page";

const mocked = vi.mocked(api, true);
const ROWS = [
  { Date: "2026-01-01", Amount: 10, Category: "Coffee" },
  { Date: "2026-01-02", Amount: 25, Category: "Bakery" },
];
const csv = () => new File(["Date,Amount\n2026-01-01,10\n"], "sales.csv", { type: "text/csv" });
const chooseFile = (file: File) =>
  userEvent.setup().upload(document.querySelector<HTMLInputElement>("input[type=file]")!, file);

describe("DataPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspace.canWrite = true;
    workspace.isAdmin = true;
    mocked.getTransactions.mockResolvedValue({ data: ROWS, count: 2 } as never);
    runAnalysis.mockResolvedValue(undefined);
  });

  it("shows an empty state when nothing has been imported", async () => {
    mocked.getTransactions.mockResolvedValue({ data: [], count: 0 } as never);
    render(<DataPage />);
    expect(await screen.findByText("No data imported yet")).toBeInTheDocument();
  });

  it("lists imported rows and filters them", async () => {
    render(<DataPage />);
    expect(await screen.findByText("Bakery")).toBeInTheDocument();
    await userEvent.setup().type(screen.getByLabelText("Filter transactions"), "coffee");
    expect(screen.getByText("Coffee")).toBeInTheDocument();
    expect(screen.queryByText("Bakery")).not.toBeInTheDocument();
    await userEvent.setup().type(screen.getByLabelText("Filter transactions"), "zzz");
    expect(screen.getByText("No rows match your filter.")).toBeInTheDocument();
  });

  it("uploads a file, re-runs the analysis and reports the import", async () => {
    mocked.uploadFile.mockResolvedValue({ rows_synced: 3, warnings: [] } as never);
    render(<DataPage />);
    await chooseFile(csv());
    expect(await screen.findByText(/Imported 3 rows from sales\.csv/)).toBeInTheDocument();
    expect(runAnalysis).toHaveBeenCalledTimes(1);
  });

  it("surfaces column warnings returned by the upload", async () => {
    mocked.uploadFile.mockResolvedValue({ rows_synced: 2, warnings: ["No Amount column found"] } as never);
    render(<DataPage />);
    await chooseFile(csv());
    expect(await screen.findByText("No Amount column found")).toBeInTheDocument();
  });

  it("shows the server error when the upload is rejected and skips the analysis", async () => {
    mocked.uploadFile.mockRejectedValue(new Error("Only .csv and .xlsx files are supported."));
    render(<DataPage />);
    await chooseFile(csv());
    expect(await screen.findByText("Only .csv and .xlsx files are supported.")).toBeInTheDocument();
    expect(runAnalysis).not.toHaveBeenCalled();
  });

  it("tells the user the rows were imported when only the analysis fails", async () => {
    mocked.uploadFile.mockResolvedValue({ rows_synced: 5, warnings: [] } as never);
    runAnalysis.mockRejectedValue(new Error("model unavailable"));
    render(<DataPage />);
    await chooseFile(csv());
    expect(await screen.findByText(/Imported 5 rows, but the analysis failed: model unavailable/)).toBeInTheDocument();
  });

  it("hides upload and warns for read-only members", async () => {
    workspace.canWrite = false;
    render(<DataPage />);
    await waitFor(() => expect(screen.getByText(/read-only access/i)).toBeInTheDocument());
    expect(document.querySelector("input[type=file]")).toBeNull();
  });
});
