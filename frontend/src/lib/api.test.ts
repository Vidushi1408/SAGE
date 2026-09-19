import { describe, it, expect, beforeEach, vi } from "vitest";
import api from "./api";

function mockFetchOnce(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  });
}

describe("ApiClient", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("login stores the access token and reports isLoggedIn", async () => {
    global.fetch = mockFetchOnce({ access_token: "test-token-123" });

    expect(api.isLoggedIn()).toBe(false);
    await api.login("demo@sage.ai", "sage_demo_pass");

    expect(localStorage.getItem("sage_token")).toBe("test-token-123");
    expect(api.isLoggedIn()).toBe(true);
  });

  it("attaches the Authorization header once logged in", async () => {
    global.fetch = mockFetchOnce({ access_token: "test-token-123" });
    await api.login("demo@sage.ai", "sage_demo_pass");

    const fetchSpy = mockFetchOnce({ id: "u1", email: "demo@sage.ai", role: "admin", is_active: true, created_at: "2026-01-01" });
    global.fetch = fetchSpy;

    await api.getMe();

    const [, config] = fetchSpy.mock.calls[0];
    expect(config.headers.get("Authorization")).toBe("Bearer test-token-123");
  });

  it("clears the token when the server responds 401", async () => {
    global.fetch = mockFetchOnce({ access_token: "test-token-123" });
    await api.login("demo@sage.ai", "sage_demo_pass");
    expect(api.isLoggedIn()).toBe(true);

    global.fetch = mockFetchOnce({ detail: "Could not validate credentials" }, 401);

    await expect(api.getMe()).rejects.toThrow();
    expect(api.isLoggedIn()).toBe(false);
  });

  it("surfaces the server message on a failed login instead of treating it as an expired session", async () => {
    localStorage.setItem("sage_token", "stale-token");
    global.fetch = mockFetchOnce({ detail: "Incorrect email or password" }, 401);
    const hrefSetter = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { pathname: "/login", set href(v: string) { hrefSetter(v); } }
    });

    await expect(api.login("a@b.com", "wrong")).rejects.toThrow("Incorrect email or password");
    expect(hrefSetter).not.toHaveBeenCalled();

    Object.defineProperty(window, "location", { configurable: true, value: original });
  });

  it("turns FastAPI validation error arrays into readable messages", async () => {
    localStorage.setItem("sage_token", "t");
    global.fetch = mockFetchOnce({ detail: [{ msg: "Value error, Webhook must be an https://hooks.slack.com/... URL", loc: ["body", "webhook_url"] }] }, 422);
    await expect(api.connectSlack("http://evil.com")).rejects.toThrow("Webhook must be an https://hooks.slack.com/... URL");
  });

  it("sends an expired session (401 with a token) to the login page", async () => {
    localStorage.setItem("sage_token", "expired");
    global.fetch = mockFetchOnce({ detail: "Session expired. Please sign in again." }, 401);
    const hrefSetter = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { pathname: "/dashboard", set href(v: string) { hrefSetter(v); } }
    });

    await expect(api.getMe()).rejects.toThrow("Session expired");
    expect(hrefSetter).toHaveBeenCalledWith("/login");
    expect(api.isLoggedIn()).toBe(false);

    Object.defineProperty(window, "location", { configurable: true, value: original });
  });

  it("clearToken removes the stored token", async () => {
    global.fetch = mockFetchOnce({ access_token: "test-token-123" });
    await api.login("demo@sage.ai", "sage_demo_pass");

    api.clearToken();
    expect(api.isLoggedIn()).toBe(false);
  });
});
