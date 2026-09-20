import { describe, it, expect, vi, afterEach } from "vitest";
import { formatMoney, parseServerDate, timeAgo } from "./ui";

afterEach(() => vi.useRealTimers());

describe("ui helpers", () => {
  it("parses naive backend timestamps as UTC", () => {
    expect(parseServerDate("2026-09-20T03:22:57").toISOString()).toBe("2026-09-20T03:22:57.000Z");
    expect(parseServerDate("2026-09-20T03:22:57+05:30").toISOString()).toBe("2026-09-19T21:52:57.000Z");
  });

  it("describes elapsed time relative to now", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-20T10:00:00Z"));
    expect(timeAgo("2026-09-20T09:59:40")).toBe("just now");
    expect(timeAgo("2026-09-20T09:30:00")).toBe("30 min ago");
    expect(timeAgo("2026-09-20T04:00:00")).toBe("6 hr ago");
    expect(timeAgo("2026-09-18T10:00:00")).toBe("2 d ago");
    expect(timeAgo(null)).toBe("never");
  });

  it("formats money with two decimals", () => {
    expect(formatMoney(1234.5)).toBe("$1,234.50");
    expect(formatMoney(undefined)).toBe("$0.00");
  });
});
