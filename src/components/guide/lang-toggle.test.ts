// @vitest-environment node
import { describe, expect, test } from "vitest";
import { langToggleFor } from "./lang-toggle";

describe("langToggleFor", () => {
  test("on an /es/* path, offers English at the EN twin", () => {
    expect(langToggleFor("/es/vote")).toEqual({ label: "English", href: "/vote" });
    expect(langToggleFor("/es/about")).toEqual({ label: "English", href: "/about" });
    expect(langToggleFor("/es")).toEqual({ label: "English", href: "/" });
  });
  test("on a translated EN path, offers Español at the ES twin", () => {
    expect(langToggleFor("/about")).toEqual({ label: "Español", href: "/es/about" });
    expect(langToggleFor("/")).toEqual({ label: "Español", href: "/es" });
  });
  test("on an untranslated EN path, sends to the Spanish home (no dead 404)", () => {
    expect(langToggleFor("/races/wi-gov-2026")).toEqual({ label: "Español", href: "/es" });
    expect(langToggleFor("/news")).toEqual({ label: "Español", href: "/es" });
  });
});
