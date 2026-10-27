import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const reloadTeam = vi.fn();
const showToast = vi.fn();
const setError = vi.fn();
const member = (over = {}) => ({ id: "m1", email: "jane@biz.com", name: "Jane", role: "analyst", is_active: true, created_at: "2026-01-01T00:00:00", ...over });
const workspace = {
  isAdmin: true, user: { id: "admin1" }, reloadTeam, showToast, setError,
  team: [member(), member({ id: "m2", email: "pending@biz.com", name: "Pat", is_active: false }), member({ id: "admin1", email: "boss@biz.com", name: "Boss", role: "admin" })],
};

vi.mock("../../../components/workspace/WorkspaceProvider", () => ({ useWorkspace: () => workspace }));
vi.mock("../../../lib/api", () => ({
  default: { inviteTeamMember: vi.fn(), resendInvite: vi.fn(), deleteTeamMember: vi.fn() },
  errorMessage: (e: unknown) => (e instanceof Error ? e.message : ""),
}));

import api from "../../../lib/api";
import TeamPage from "./page";

const mocked = vi.mocked(api, true);

describe("TeamPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspace.isAdmin = true;
  });

  it("lists members with their status and marks the current user", () => {
    render(<TeamPage />);
    expect(screen.getByText("jane@biz.com")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("(you)")).toBeInTheDocument();
  });

  it("invites a teammate, confirms it and reloads the list", async () => {
    mocked.inviteTeamMember.mockResolvedValue({ email: "new@biz.com" } as never);
    render(<TeamPage />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "new@biz.com");
    await user.selectOptions(screen.getByLabelText("Role"), "viewer");
    await user.click(screen.getByRole("button", { name: /send invite/i }));
    expect(await screen.findByText(/Invite email sent to new@biz\.com/)).toBeInTheDocument();
    expect(mocked.inviteTeamMember).toHaveBeenCalledWith({ email: "new@biz.com", name: undefined, role: "viewer" });
    expect(reloadTeam).toHaveBeenCalled();
  });

  it("shows the server's reason when an invite fails", async () => {
    mocked.inviteTeamMember.mockRejectedValue(new Error("That email is already on your team"));
    render(<TeamPage />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "jane@biz.com");
    await user.click(screen.getByRole("button", { name: /send invite/i }));
    expect(await screen.findByText("That email is already on your team")).toBeInTheDocument();
  });

  it("only offers Resend for pending members", () => {
    render(<TeamPage />);
    expect(screen.getAllByRole("button", { name: "Resend" })).toHaveLength(1);
  });

  it("never offers to remove an admin", () => {
    render(<TeamPage />);
    expect(screen.queryByRole("button", { name: "Remove boss@biz.com" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove jane@biz.com" })).toBeInTheDocument();
  });

  it("removes a member only after confirmation", async () => {
    mocked.deleteTeamMember.mockResolvedValue(undefined as never);
    const confirm = vi.spyOn(window, "confirm");
    render(<TeamPage />);
    const user = userEvent.setup();

    confirm.mockReturnValueOnce(false);
    await user.click(screen.getByRole("button", { name: "Remove jane@biz.com" }));
    expect(mocked.deleteTeamMember).not.toHaveBeenCalled();

    confirm.mockReturnValueOnce(true);
    await user.click(screen.getByRole("button", { name: "Remove jane@biz.com" }));
    await waitFor(() => expect(mocked.deleteTeamMember).toHaveBeenCalledWith("m1"));
    expect(showToast).toHaveBeenCalledWith("Jane was removed.");
  });

  it("hides invite and actions from non-admins", () => {
    workspace.isAdmin = false;
    render(<TeamPage />);
    expect(screen.getByText(/Only workspace admins can invite/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resend" })).not.toBeInTheDocument();
  });
});
