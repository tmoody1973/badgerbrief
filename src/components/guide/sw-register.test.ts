import { describe, expect, test, vi, beforeEach } from "vitest";

describe("registerSw", () => {
  beforeEach(() => vi.resetModules());

  test("no-ops when serviceWorker is unavailable", async () => {
    const { registerSw } = await import("./sw-register");
    // navigator without serviceWorker must not throw
    expect(() => registerSw({} as Navigator, "production")).not.toThrow();
  });

  test("does not register outside production", () => {
    const register = vi.fn();
    const nav = { serviceWorker: { register } } as unknown as Navigator;
    // dynamic import to get the fresh module
    return import("./sw-register").then(({ registerSw }) => {
      registerSw(nav, "development");
      expect(register).not.toHaveBeenCalled();
    });
  });

  test("registers /sw.js in production when supported", () => {
    const register = vi.fn(() => Promise.resolve());
    const nav = { serviceWorker: { register } } as unknown as Navigator;
    return import("./sw-register").then(({ registerSw }) => {
      registerSw(nav, "production");
      expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
    });
  });
});
