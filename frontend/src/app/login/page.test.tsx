import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock })
}));

vi.mock("../../lib/api", () => ({
  errorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e ?? "")),
  default: {
    login: vi.fn().mockResolvedValue({ access_token: "tok" }),
    listSheets: vi.fn().mockResolvedValue([]),
    getLatestProfile: vi.fn().mockRejectedValue(new Error("no profile"))
  }
}));

import Login from "./page";
import api from "../../lib/api";

describe("Login page", () => {
  beforeEach(() => {
    pushMock.mockClear();
    vi.mocked(api.login).mockClear();
  });

  it("submits credentials and redirects to onboarding when no sheets are connected", async () => {
    const user = userEvent.setup();
    render(<Login />);

    await user.type(screen.getByPlaceholderText("name@business.com"), "demo@sage.ai");
    await user.type(screen.getByPlaceholderText("••••••••"), "sage_demo_pass");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(api.login).toHaveBeenCalledWith("demo@sage.ai", "sage_demo_pass");
    });
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/onboarding");
    });
  });

  it("sends users with uploaded (CSV-only) data straight to the dashboard", async () => {
    vi.mocked(api.getLatestProfile).mockResolvedValueOnce({ summary: {} });
    const user = userEvent.setup();
    render(<Login />);

    await user.type(screen.getByPlaceholderText("name@business.com"), "csv@sage.ai");
    await user.type(screen.getByPlaceholderText("••••••••"), "pw");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/dashboard"));
  });

  it("shows an error message when login fails", async () => {
    vi.mocked(api.login).mockRejectedValueOnce(new Error("Incorrect email or password"));
    const user = userEvent.setup();
    render(<Login />);

    await user.type(screen.getByPlaceholderText("name@business.com"), "demo@sage.ai");
    await user.type(screen.getByPlaceholderText("••••••••"), "wrongpassword");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText("Incorrect email or password")).toBeInTheDocument();
  });

  it("associates labels with inputs for accessibility", () => {
    render(<Login />);
    expect(screen.getByLabelText(/email address/i)).toHaveAttribute("type", "email");
    expect(screen.getByLabelText(/^password$/i)).toHaveAttribute("autocomplete", "current-password");
  });

  it("has a link to the forgot-password page", () => {
    render(<Login />);
    expect(screen.getByText(/forgot password\?/i).closest("a")).toHaveAttribute("href", "/forgot-password");
  });
});
