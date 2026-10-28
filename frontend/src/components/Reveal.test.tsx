import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Reveal from "./Reveal";
import { EmptyState, TypingDots } from "./ui";

describe("small delight components", () => {
  it("Reveal shows its content and keeps the anchor id", () => {
    render(<Reveal as="section" id="features">hello</Reveal>);
    expect(screen.getByText("hello").closest("#features")).not.toBeNull();
  });

  it("TypingDots is announced as a status", () => {
    render(<TypingDots />);
    expect(screen.getByRole("status", { name: "SAGE is thinking" })).toBeInTheDocument();
  });

  it("EmptyState still shows title, body and action", () => {
    render(<EmptyState icon={null} title="Nothing yet" body="Add data" action={<button>Go</button>} />);
    expect(screen.getByText("Nothing yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go" })).toBeInTheDocument();
  });
});
