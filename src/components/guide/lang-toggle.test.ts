// @vitest-environment node
import { describe, expect, test } from "vitest";
import { langToggleFor } from "./lang-toggle";

describe("langToggleFor", () => {
  test("on /es/vote, offers English back to /vote", () => {
    expect(langToggleFor("/es/vote")).toEqual({ label: "English", href: "/vote" });
  });

  test("on /vote, offers Español to /es/vote", () => {
    expect(langToggleFor("/vote")).toEqual({ label: "Español", href: "/es/vote" });
  });

  test("on any other page, points at the Spanish guide", () => {
    expect(langToggleFor("/races/wi-gov-2026")).toEqual({ label: "Español", href: "/es/vote" });
    expect(langToggleFor("/")).toEqual({ label: "Español", href: "/es/vote" });
  });
});
