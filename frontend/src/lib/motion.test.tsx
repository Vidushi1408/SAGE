import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { useCountUp, useReducedMotion } from "./motion";

function stubMatchMedia(reduced: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduced && query.includes("reduce"), media: query,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

function Counter({ target }: { target: number }) {
  return <p data-testid="n">{Math.round(useCountUp(target, 500))}</p>;
}
function Reduced() { return <p data-testid="r">{String(useReducedMotion())}</p>; }

afterEach(() => vi.useRealTimers());

describe("motion hooks", () => {
  it("reads the reduce-motion preference", () => {
    stubMatchMedia(true);
    render(<Reduced />);
    expect(screen.getByTestId("r")).toHaveTextContent("true");
  });

  it("shows the final number immediately when motion is reduced", () => {
    stubMatchMedia(true);
    render(<Counter target={1234} />);
    expect(screen.getByTestId("n")).toHaveTextContent("1234");
  });

  it("counts up from zero to the target otherwise", async () => {
    stubMatchMedia(false);
    vi.useFakeTimers();
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(cb => setTimeout(() => cb(now), 16) as unknown as number);
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(id => clearTimeout(id));

    render(<Counter target={1000} />);
    expect(screen.getByTestId("n")).toHaveTextContent("0");
    await act(async () => { now = 250; vi.advanceTimersByTime(20); });
    const mid = Number(screen.getByTestId("n").textContent);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1000);
    await act(async () => { now = 600; vi.advanceTimersByTime(20); });
    expect(screen.getByTestId("n")).toHaveTextContent("1000");
  });
});
