import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import NotFound from "./not-found";

describe("404 page", () => {
  it("explains the error and offers a way back", () => {
    render(<NotFound />);
    expect(screen.getByText(/could not be found/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to home/i })).toHaveAttribute("href", "/");
  });
});
