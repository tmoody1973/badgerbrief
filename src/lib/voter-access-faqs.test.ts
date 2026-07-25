import { describe, expect, test } from "vitest";
import { voterAccessToFaqs } from "./voter-access-faqs";

describe("voterAccessToFaqs", () => {
  test("maps title→q and summary→a", () => {
    const out = voterAccessToFaqs([
      { title: "Can I vote with a felony conviction?", summary: "Yes, once off paper." },
    ]);
    expect(out).toEqual([{ q: "Can I vote with a felony conviction?", a: "Yes, once off paper." }]);
  });

  test("empty input → empty array", () => {
    expect(voterAccessToFaqs([])).toEqual([]);
  });
});
