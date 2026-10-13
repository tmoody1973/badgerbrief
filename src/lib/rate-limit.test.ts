// @vitest-environment node
import { describe, expect, test } from "vitest";
import { createLimiter } from "./rate-limit";

const MINUTE = 60_000;

describe("createLimiter", () => {
  test("allows up to the limit inside the window, then refuses with a wait", () => {
    const check = createLimiter({ limit: 3, windowMs: 10 * MINUTE });
    expect(check("a", 0)).toEqual({ ok: true });
    expect(check("a", 1_000)).toEqual({ ok: true });
    expect(check("a", 2_000)).toEqual({ ok: true });
    expect(check("a", 3_000)).toEqual({ ok: false, retryAfterSeconds: 597 });
  });

  test("a refused call does not push the wait further out", () => {
    const check = createLimiter({ limit: 1, windowMs: MINUTE });
    check("a", 0);
    check("a", 30_000);
    expect(check("a", 59_500)).toEqual({ ok: false, retryAfterSeconds: 1 });
  });

  test("each visitor has their own count", () => {
    const check = createLimiter({ limit: 1, windowMs: MINUTE });
    expect(check("a", 0)).toEqual({ ok: true });
    expect(check("b", 0)).toEqual({ ok: true });
    expect(check("a", 1).ok).toBe(false);
  });

  test("allows again once the window has passed", () => {
    const check = createLimiter({ limit: 1, windowMs: MINUTE });
    check("a", 0);
    expect(check("a", MINUTE - 1).ok).toBe(false);
    expect(check("a", MINUTE)).toEqual({ ok: true });
  });

  test("forgets visitors whose window has passed, so memory does not grow without bound", () => {
    const check = createLimiter({ limit: 1, windowMs: MINUTE });
    for (let i = 0; i < 1000; i++) check(`visitor-${i}`, 0);
    expect(check.size()).toBe(1000);
    check("late", MINUTE);
    expect(check.size()).toBe(1);
  });
});
