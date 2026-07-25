import { describe, expect, test } from "vitest";
import manifest from "./manifest";

describe("PWA manifest", () => {
  test("declares an installable standalone app with icons", () => {
    const m = manifest();
    expect(m.name).toMatch(/BadgerBrief/);
    expect(m.short_name).toBe("BadgerBrief");
    expect(m.start_url).toBe("/");
    expect(m.display).toBe("standalone");
    expect(m.background_color).toBe("#fff7ed");
    expect(m.theme_color).toBe("#c5050c");
    // at least one icon, and a maskable one
    expect(m.icons?.length).toBeGreaterThanOrEqual(1);
    expect(m.icons?.some((i) => i.purpose?.includes("maskable"))).toBe(true);
  });
});
