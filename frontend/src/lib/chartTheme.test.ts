import { describe, it, expect, beforeEach } from "vitest";
import { CATEGORICAL, OTHER_COLOR, colorFor, compactMoney, compactNumber, foldTail, resetColorRegistry } from "./chartTheme";

beforeEach(() => resetColorRegistry());

describe("colorFor", () => {
  it("gives each new name the next slot, in order", () => {
    expect(["Coffee", "Bakery", "Tea"].map(colorFor)).toEqual([CATEGORICAL[0], CATEGORICAL[1], CATEGORICAL[2]]);
  });

  it("keeps a name's colour when other names appear, disappear or reorder", () => {
    colorFor("Coffee"); colorFor("Bakery"); colorFor("Tea");
    const before = colorFor("Tea");
    // A filter hides Coffee and Bakery; Tea must not slide into slot 1
    expect(colorFor("Tea")).toBe(before);
    expect(colorFor("Coffee")).toBe(CATEGORICAL[0]);
  });

  it("never cycles: names beyond the eighth slot share the neutral Other grey", () => {
    const names = Array.from({ length: 10 }, (_, i) => `Cat ${i}`);
    const colors = names.map(colorFor);
    expect(colors.slice(0, 8)).toEqual([...CATEGORICAL]);
    expect(colors.slice(8)).toEqual([OTHER_COLOR, OTHER_COLOR]);
  });

  it("always paints Other in grey without using up a slot", () => {
    expect(colorFor("Other")).toBe(OTHER_COLOR);
    expect(colorFor("Coffee")).toBe(CATEGORICAL[0]);
  });
});

describe("foldTail", () => {
  const rows = [10, 9, 8, 7, 6, 5, 4, 3].map((revenue, i) => ({ category: `C${i}`, revenue, volume: i + 1 }));

  it("leaves short lists alone", () => {
    expect(foldTail(rows.slice(0, 6), "category", ["revenue"])).toHaveLength(6);
  });

  it("folds everything past the limit into one summed Other row", () => {
    const folded = foldTail(rows, "category", ["revenue", "volume"]);
    expect(folded).toHaveLength(6);
    expect(folded.slice(0, 5).map(r => r.category)).toEqual(["C0", "C1", "C2", "C3", "C4"]);
    expect(folded[5]).toEqual({ category: "Other", revenue: 5 + 4 + 3, volume: 6 + 7 + 8 });
  });
});

describe("compact formatters", () => {
  it("shortens thousands and millions", () => {
    expect([950, 1000, 1234, 12_900, 1_500_000].map(compactNumber)).toEqual(["950", "1K", "1.2K", "12.9K", "1.5M"]);
    expect(compactMoney(4200)).toBe("$4.2K");
    expect(compactMoney(-1500)).toBe("-$1.5K");
  });

  it("keeps exact cents below a thousand", () => {
    expect(compactMoney(90.3)).toBe("$90.30");
    expect(compactMoney(468.83)).toBe("$468.83");
    expect(compactMoney(50)).toBe("$50");
    expect(compactMoney(-5)).toBe("-$5");
    expect(compactMoney(0)).toBe("$0");
  });
});
