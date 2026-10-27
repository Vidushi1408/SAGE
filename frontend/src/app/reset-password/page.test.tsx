import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../../lib/api", () => ({
  default: { resetPassword: vi.fn() },
  errorMessage: (e: unknown) => (e instanceof Error ? e.message : ""),
}));

import api from "../../lib/api";
import ResetPassword from "./page";

const mocked = vi.mocked(api, true);

async function fill(pw: string, confirm: string) {
  const user = userEvent.setup();
  render(<ResetPassword />);
  const fields = document.querySelectorAll<HTMLInputElement>("input[type=password]");
  await user.type(fields[0], pw);
  await user.type(fields[1], confirm);
  await user.click(screen.getByRole("button", { name: /reset|update|set|save/i }));
}

describe("ResetPassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.pushState({}, "", "/reset-password?token=abc123");
  });

  it("rejects mismatched passwords without calling the API", async () => {
    await fill("Str0ngPass!", "different");
    expect(await screen.findByText(/do not match/i)).toBeInTheDocument();
    expect(mocked.resetPassword).not.toHaveBeenCalled();
  });

  it("submits the token from the URL with the new password", async () => {
    mocked.resetPassword.mockResolvedValue(undefined as never);
    await fill("Str0ngPass!", "Str0ngPass!");
    await waitFor(() => expect(mocked.resetPassword).toHaveBeenCalledWith("abc123", "Str0ngPass!"));
  });

  it("asks for a new link when the token is missing", async () => {
    window.history.pushState({}, "", "/reset-password");
    await fill("Str0ngPass!", "Str0ngPass!");
    expect(await screen.findByText(/missing its token/i)).toBeInTheDocument();
    expect(mocked.resetPassword).not.toHaveBeenCalled();
  });
});
