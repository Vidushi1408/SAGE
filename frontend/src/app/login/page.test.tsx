import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("../../lib/api", () => ({
  default: { login: vi.fn(), demoLogin: vi.fn(), listSheets: vi.fn(), getLatestProfile: vi.fn() },
  errorMessage: (e: unknown) => (e instanceof Error ? e.message : ""),
}));

import api from "../../lib/api";
import Login from "./page";

const mocked = vi.mocked(api, true);

async function signIn() {
  const user = userEvent.setup();
  render(<Login />);
  await user.type(screen.getByLabelText(/email address/i), "a@b.com");
  await user.type(screen.getByLabelText(/^password$/i), "secret123");
  await user.click(screen.getByRole("button", { name: /sign in/i }));
}

describe("Login", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends a brand-new workspace to onboarding", async () => {
    mocked.login.mockResolvedValue(undefined as never);
    mocked.listSheets.mockResolvedValue([]);
    mocked.getLatestProfile.mockRejectedValue(new Error("none"));
    await signIn();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/onboarding"));
    expect(mocked.login).toHaveBeenCalledWith("a@b.com", "secret123");
  });

  it("sends a workspace that already has analysed data to the dashboard", async () => {
    mocked.login.mockResolvedValue(undefined as never);
    mocked.listSheets.mockResolvedValue([]);
    mocked.getLatestProfile.mockResolvedValue({} as never);
    await signIn();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
  });

  it("shows the server's error and does not navigate on a failed login", async () => {
    mocked.login.mockRejectedValue(new Error("Incorrect email or password"));
    await signIn();
    expect(await screen.findByText("Incorrect email or password")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("enters the demo through the dedicated endpoint, never with a hard-coded password", async () => {
    mocked.demoLogin.mockResolvedValue(undefined as never);
    mocked.listSheets.mockResolvedValue([{ id: "s" }] as never);
    mocked.getLatestProfile.mockResolvedValue({} as never);
    render(<Login />);
    await userEvent.setup().click(screen.getByRole("button", { name: /explore the demo/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
    expect(mocked.demoLogin).toHaveBeenCalledTimes(1);
    expect(mocked.login).not.toHaveBeenCalled();
  });

  it("explains when the server has the demo switched off", async () => {
    mocked.demoLogin.mockRejectedValue(new Error("Demo mode isn't available on this server."));
    render(<Login />);
    await userEvent.setup().click(screen.getByRole("button", { name: /explore the demo/i }));
    expect(await screen.findByText("Demo mode isn't available on this server.")).toBeInTheDocument();
  });
});
