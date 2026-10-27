import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("../../lib/api", () => ({
  default: { register: vi.fn(), login: vi.fn() },
  errorMessage: (e: unknown) => (e instanceof Error ? e.message : ""),
}));

import api from "../../lib/api";
import Register from "./page";

const mocked = vi.mocked(api, true);

async function submit() {
  const user = userEvent.setup();
  render(<Register />);
  await user.type(screen.getByLabelText(/email address/i), "new@b.com");
  await user.type(screen.getByLabelText(/create password/i), "Str0ngPass!");
  await user.click(screen.getByRole("button", { name: /create|sign up|register/i }));
}

describe("Register", () => {
  beforeEach(() => vi.clearAllMocks());

  it("registers, signs in and starts onboarding", async () => {
    mocked.register.mockResolvedValue(undefined as never);
    mocked.login.mockResolvedValue(undefined as never);
    await submit();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/onboarding"));
    expect(mocked.register).toHaveBeenCalledWith("new@b.com", "Str0ngPass!");
    expect(mocked.login).toHaveBeenCalledWith("new@b.com", "Str0ngPass!");
  });

  it("shows the error and stays put when registration is rejected", async () => {
    mocked.register.mockRejectedValue(new Error("Email already registered"));
    await submit();
    expect(await screen.findByText("Email already registered")).toBeInTheDocument();
    expect(mocked.login).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});
