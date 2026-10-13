import { describe, expect, test } from "vitest";
import { checkCitation, describeProblem, isWatched, problemSubject, sameAddress, sentenceOnPage } from "./citedPage";

// Cases below are taken from real pages read on 2026-10-13
// (docs/evidence/2026-10-13-position-source-audit/reader-comparison.md).

describe("sentenceOnPage", () => {
  test("finds a sentence the page prints with bold markers and a curly apostrophe", () => {
    const stored =
      "Crowley's plan includes universal early childhood education, new investments in public schools, and closing the special education reimbursement gap.";
    const page =
      "## Strong Schools and Early Learning\n\nCrowley’s plan includes **universal early childhood education**, new investments in public schools, and closing the special education reimbursement gap. He’ll";
    expect(sentenceOnPage(stored, page)).toBe("present");
  });

  test("finds a stored sentence that is only a short heading", () => {
    expect(sentenceOnPage("Prepare Kids For Success", "#### Restore Order\n\n#### Prepare Kids For Success\n\n![icon](https://x/y.png)")).toBe("present");
  });

  test("reports a paragraph the campaign reworded as missing", () => {
    const stored =
      "Crowley will build and preserve affordable and attainable housing in rural, urban, and suburban communities alike. He'll make it easier to get projects approved.";
    const page =
      "Crowley will **build and preserve affordable housing** in rural, urban, and suburban communities across the state. He'll cut barriers that slow new housing.";
    expect(sentenceOnPage(stored, page)).toBe("missing");
  });

  test("a stored excerpt joined with an ellipsis is present only when every part is", () => {
    const page = "He will take his Building Bridges Program statewide. Later on the page: an economy rooted in local ownership and union labor.";
    expect(sentenceOnPage("take his Building Bridges Program statewide ... an economy rooted in local ownership", page)).toBe("present");
    expect(sentenceOnPage("take his Building Bridges Program statewide ... free college for all", page)).toBe("missing");
  });

  test("keeps the words of a link and ignores the words in its address", () => {
    expect(sentenceOnPage("The Common School Fund distributes money", "The [Common School Fund](https://example.com/about) distributes money annually.")).toBe("present");
    expect(sentenceOnPage("Prepare Kids For Success", "[Read more](https://example.com/prepare-kids-for-success)")).toBe("missing");
  });

  test("is not thrown by invisible characters inside a word, or by a different kind of apostrophe", () => {
    expect(sentenceOnPage("affordable housing for all", "afford\u00ADable hous\u200Bing for all")).toBe("present");
    expect(sentenceOnPage("Crowley's plan for schools", "Crowley\u00B4s plan for schools")).toBe("present");
    expect(sentenceOnPage("Crowley's plan for schools", "Crowley\u02BCs plan for schools")).toBe("present");
  });

  test("words that appear only inside a web address are not words on the page", () => {
    expect(sentenceOnPage("Prepare Kids For Success", "[![icon](https://x/y.png)](https://example.com/prepare-kids-for-success)")).toBe("missing");
    expect(sentenceOnPage("Prepare Kids For Success", "See https://example.com/prepare-kids-for-success for more.")).toBe("missing");
    expect(sentenceOnPage("Prepare Kids For Success", "<https://example.com/prepare-kids-for-success>")).toBe("missing");
  });

  test("matches whole words, so a short word is not found inside a longer one", () => {
    expect(sentenceOnPage("Lower costs", "Our followers costs nothing")).toBe("missing");
  });

  test("cannot test an excerpt with no words in it", () => {
    expect(sentenceOnPage("", "anything")).toBe("untestable");
    expect(sentenceOnPage(" … ", "anything")).toBe("untestable");
  });
});

describe("sameAddress", () => {
  test("a trailing slash, www, or http is not a move", () => {
    expect(sameAddress("https://tomtiffany.com/about", "https://tomtiffany.com/about/")).toBe(true);
    expect(sameAddress("https://crowleyforwi.com/Plan", "https://www.crowleyforwi.com/Plan")).toBe(true);
    expect(sameAddress("http://example.com/", "https://example.com")).toBe(true);
  });

  test("capital letters in the path, or tracking added to the address, are not a move", () => {
    expect(sameAddress("https://www.crowleyforwi.com/Plan", "https://www.crowleyforwi.com/plan")).toBe(true);
    expect(sameAddress("https://example.com/plan", "https://example.com/plan?utm_source=x")).toBe(true);
  });

  test("a cited address that names a page by its query still has to land on that query", () => {
    expect(sameAddress("https://example.com/page?id=4", "https://example.com/page?id=4")).toBe(true);
    expect(sameAddress("https://example.com/page?id=4", "https://example.com/page?id=9")).toBe(false);
  });

  test("a different path or site is a move", () => {
    expect(sameAddress("https://www.crowleyforwi.com/issues", "https://www.crowleyforwi.com/9d027b3e-e093-43a5-99f4-1778c76b71b6")).toBe(false);
    expect(sameAddress("https://example.com/a", "https://example.org/a")).toBe(false);
  });

  test("an address that cannot be read as one is never the same", () => {
    expect(sameAddress("https://example.com/a", "not an address")).toBe(false);
  });
});

describe("isWatched", () => {
  test("leaves out newspaper pages behind a paywall", () => {
    expect(isWatched("https://www.jsonline.com/story/news/politics/2026/03/17/x/")).toBe(false);
    expect(isWatched("https://jsonline.com/story/x")).toBe(false);
  });

  test("watches campaign sites and open news sites", () => {
    expect(isWatched("https://tomtiffany.com/")).toBe(true);
    expect(isWatched("https://www.wpr.org/news/x")).toBe(true);
  });

  test("does not watch something that is not a web address", () => {
    expect(isWatched("see the candidate's flyer")).toBe(false);
  });
});

describe("checkCitation", () => {
  const citation = { url: "https://example.com/issues", excerpt: "We will fix the roads." };

  test("no problem when the page is where we cited it and still says it", () => {
    expect(checkCitation(citation, { ok: true, text: "We will fix the roads.", landedUrl: "https://example.com/issues/" })).toBeNull();
  });

  test("a page that could not be read", () => {
    expect(checkCitation(citation, { ok: false, reason: "the page returned nothing" })).toEqual({ kind: "unreadable", reason: "the page returned nothing" });
  });

  test("a page that lands somewhere else is a move, even if the new page still says it", () => {
    expect(checkCitation(citation, { ok: true, text: "We will fix the roads.", landedUrl: "https://example.com/plan" })).toEqual({
      kind: "moved",
      landedUrl: "https://example.com/plan",
    });
  });

  test("a page that no longer carries the sentence", () => {
    expect(checkCitation(citation, { ok: true, text: "We will repave every road.", landedUrl: "https://example.com/issues" })).toEqual({ kind: "sentence-gone" });
  });

  test("an excerpt that cannot be tested raises nothing", () => {
    expect(checkCitation({ ...citation, excerpt: "" }, { ok: true, text: "x", landedUrl: citation.url })).toBeNull();
  });
});

describe("describeProblem", () => {
  test("says who, what and where in plain words", () => {
    const moved = describeProblem("david-crowley / abortion", "https://a.com/issues", { kind: "moved", landedUrl: "https://a.com/plan" });
    expect(moved).toBe("david-crowley / abortion: the cited page now lands somewhere else. Cited: https://a.com/issues Lands on: https://a.com/plan");
    expect(describeProblem("john-leiber / education", "https://b.com/", { kind: "sentence-gone" })).toBe(
      "john-leiber / education: the sentence this summary rests on was not found in today's reading of the cited page. Cited: https://b.com/",
    );
    expect(describeProblem("a / b", "https://c.com/", { kind: "unreadable", reason: "the page returned nothing" })).toBe(
      "a / b: the cited page could not be read. Cited: https://c.com/ Reason: the page returned nothing",
    );
  });

  test("two messages about the same kind of problem share a subject, whatever the details", () => {
    const first = describeProblem("a / b", "https://a.com/issues", { kind: "moved", landedUrl: "https://a.com/guid-1" });
    const second = describeProblem("a / b", "https://a.com/issues", { kind: "moved", landedUrl: "https://a.com/guid-2" });
    const other = describeProblem("a / b", "https://a.com/issues", { kind: "sentence-gone" });
    expect(problemSubject(first)).toBe(problemSubject(second));
    expect(problemSubject(first)).not.toBe(problemSubject(other));
  });
});
