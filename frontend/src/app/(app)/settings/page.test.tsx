import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const signOut = vi.fn();
const showToast = vi.fn();
const workspace = {
  user: { id: "1", email: "owner@biz.com", name: "Owner", role: "admin", workspace_owner_id: undefined, is_demo: false } as Record<string, unknown>,
  updateUser: vi.fn(), showToast, signOut,
};
vi.mock("../../../components/workspace/WorkspaceProvider", () => ({ useWorkspace: () => workspace }));
vi.mock("../../../lib/download", () => ({ saveBlob: vi.fn() }));
vi.mock("../../../lib/api", () => ({
  default: { updateMe: vi.fn(), changePassword: vi.fn(), exportData: vi.fn(), deleteAccount: vi.fn() },
  errorMessage: (e: unknown) => (e instanceof Error ? e.message : ""),
}));

import api from "../../../lib/api";
import { saveBlob } from "../../../lib/download";
import SettingsPage from "./page";

const mocked = vi.mocked(api, true);

describe("SettingsPage: your data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspace.user = { id: "1", email: "owner@biz.com", name: "Owner", role: "admin", is_demo: false };
  });

  it("downloads the export as a zip", async () => {
    const blob = new Blob(["zip"]);
    mocked.exportData.mockResolvedValue(blob);
    render(<SettingsPage />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Export my data" }));
    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(blob, "sage-export.zip"));
    expect(showToast).toHaveBeenCalledWith("Your export is downloading.");
  });

  it("shows why an export failed", async () => {
    mocked.exportData.mockRejectedValue(new Error("Server unavailable"));
    render(<SettingsPage />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Export my data" }));
    expect(await screen.findByText("Server unavailable")).toBeInTheDocument();
    expect(saveBlob).not.toHaveBeenCalled();
  });
});

describe("SettingsPage: delete account", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspace.user = { id: "1", email: "owner@biz.com", name: "Owner", role: "admin", is_demo: false };
  });

  const deleteButton = () => screen.getByRole("button", { name: /^delete my/i });

  it("stays disabled until a password is typed and the warning is acknowledged", async () => {
    render(<SettingsPage />);
    const user = userEvent.setup();
    expect(deleteButton()).toBeDisabled();
    await user.type(screen.getByLabelText("Confirm your password"), "ownerpassword");
    expect(deleteButton()).toBeDisabled();
    await user.click(screen.getByRole("checkbox"));
    expect(deleteButton()).toBeEnabled();
  });

  it("deletes the account then signs out", async () => {
    mocked.deleteAccount.mockResolvedValue({ status: "deleted" });
    render(<SettingsPage />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Confirm your password"), "ownerpassword");
    await user.click(screen.getByRole("checkbox"));
    await user.click(deleteButton());
    await waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(mocked.deleteAccount).toHaveBeenCalledWith("ownerpassword");
  });

  it("stays signed in and shows the reason when the password is wrong", async () => {
    mocked.deleteAccount.mockRejectedValue(new Error("That password is incorrect."));
    render(<SettingsPage />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Confirm your password"), "nope");
    await user.click(screen.getByRole("checkbox"));
    await user.click(deleteButton());
    expect(await screen.findByText("That password is incorrect.")).toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();
    expect(deleteButton()).toBeEnabled();
  });

  it("warns owners that teammates go too, and members that only they do", () => {
    const { unmount } = render(<SettingsPage />);
    expect(screen.getByText(/every teammate's account/i)).toBeInTheDocument();
    unmount();
    workspace.user = { ...workspace.user, role: "analyst", workspace_owner_id: "owner-id" };
    render(<SettingsPage />);
    expect(screen.getByText(/stay with the owner/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete my account" })).toBeInTheDocument();
  });

  it("offers neither export nor deletion to the demo visitor", () => {
    workspace.user = { ...workspace.user, role: "viewer", is_demo: true };
    render(<SettingsPage />);
    expect(screen.queryByRole("button", { name: "Export my data" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Confirm your password")).not.toBeInTheDocument();
  });
});
