import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import PricingPage from "./pricing/page";
import PrivacyPage from "./privacy/page";
import TermsPage from "./terms/page";

describe("marketing pages", () => {
  it("pricing offers only what exists today and labels the rest as not available", () => {
    render(<PricingPage />);
    expect(screen.getByRole("heading", { name: /free while we.re in early access/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /create a free account/i })).toHaveAttribute("href", "/register");
    expect(screen.getByText("Not available yet")).toBeInTheDocument();
    // Features that used to be listed as if they were part of a paid tier
    expect(screen.queryByText(/priority support/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/dedicated onboarding/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/up to 3 teammates/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/unlimited teammates/i)).not.toBeInTheDocument();
  });

  it("privacy describes export, deletion and who else receives data", () => {
    render(<PrivacyPage />);
    expect(screen.getByText(/Settings → Your data/)).toBeInTheDocument();
    expect(screen.getByText(/Settings → Delete account/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /other services that receive data/i })).toBeInTheDocument();
    expect(screen.queryByText(/contact us/i)).not.toBeInTheDocument(); // deletion is self-service now
  });

  it("terms cover the demo workspace and forecasts being rough", () => {
    render(<TermsPage />);
    expect(screen.getByRole("heading", { name: /the demo workspace/i })).toBeInTheDocument();
    expect(screen.getByText(/rough projections/i)).toBeInTheDocument();
  });
});
