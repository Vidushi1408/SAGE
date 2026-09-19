import "@testing-library/jest-dom/vitest";

// Recharts' ResponsiveContainer relies on ResizeObserver, which jsdom does not implement.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = global.ResizeObserver || (ResizeObserverStub as unknown as typeof ResizeObserver);
