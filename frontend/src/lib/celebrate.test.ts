import { beforeEach, describe, expect, it, vi } from "vitest";
import { firstTime } from "./celebrate";

describe("firstTime", () => {
  beforeEach(() => localStorage.clear());

  it("is true once per account and key, then false", () => {
    expect(firstTime("first-insights", "u1")).toBe(true);
    expect(firstTime("first-insights", "u1")).toBe(false);
  });

  it("is tracked separately per account and per key", () => {
    firstTime("first-insights", "u1");
    expect(firstTime("first-insights", "u2")).toBe(true);
    expect(firstTime("other", "u1")).toBe(true);
  });

  it("skips the celebration rather than repeating it when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(firstTime("first-insights", "u1")).toBe(false);
    vi.restoreAllMocks();
  });
});
