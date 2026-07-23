import { describe, expect, test } from "vitest";
import {
  ALLOWED_DOMAINS,
  MAX_SEARCH_DOMAINS,
  isAllowedUrl,
  parseScoutResponse,
  sortByRotation,
} from "./scoutParse";

describe("ALLOWED_DOMAINS", () => {
  // The guard that matters most: Perplexity truncates search_domain_filter past
  // 20 WITHOUT erroring, so a 21st outlet would look added but never be
  // searched. Import-time throw + this test make that impossible to ship.
  test("stays within Perplexity's search_domain_filter cap", () => {
    expect(ALLOWED_DOMAINS.length).toBeLessThanOrEqual(MAX_SEARCH_DOMAINS);
  });

  test("has no duplicates — a repeat silently wastes a capped slot", () => {
    expect(new Set(ALLOWED_DOMAINS).size).toBe(ALLOWED_DOMAINS.length);
  });

  test("lists bare registrable domains, not URLs or hosts with www", () => {
    for (const d of ALLOWED_DOMAINS) {
      expect(d).toMatch(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/);
      expect(d.startsWith("www.")).toBe(false);
    }
  });

  test("covers Milwaukee, Madison and statewide newsrooms", () => {
    // Regression lock on the discovery gap this list was widened to fix: a
    // 4-outlet allowlist made most of the state's political press invisible.
    for (const d of [
      "jsonline.com", "urbanmilwaukee.com", "wuwm.com", "wpr.org", // pre-existing
      "madison.com", "captimes.com", "channel3000.com", "wkow.com", // Madison
      "wmtv15news.com", "isthmus.com", "pbswisconsin.org",
      "tmj4.com", "wisn.com", "fox6now.com", "cbs58.com",           // Milwaukee TV
      "wisconsinwatch.org", "wisconsinexaminer.com", "wispolitics.com", "wiseye.org",
    ]) {
      expect(ALLOWED_DOMAINS).toContain(d);
    }
  });

  test("uses the host articles publish on, not the vanity redirect", () => {
    // nbc15.com 301s to wmtv15news.com and wisconsineye.org 301s to wiseye.org;
    // filtering on the pre-redirect host matches zero article URLs.
    expect(ALLOWED_DOMAINS).not.toContain("nbc15.com");
    expect(ALLOWED_DOMAINS).not.toContain("wisconsineye.org");
  });
});

describe("isAllowedUrl", () => {
  test("accepts exact-host URLs on allowed domains", () => {
    expect(isAllowedUrl("https://urbanmilwaukee.com/x")).toBe(true);
    expect(isAllowedUrl("https://jsonline.com/story")).toBe(true);
  });

  test("accepts subdomains of allowed domains", () => {
    expect(isAllowedUrl("https://www.wpr.org/y")).toBe(true);
  });

  test("accepts http, not just https", () => {
    expect(isAllowedUrl("http://wuwm.com/z")).toBe(true);
  });

  test("rejects a host that merely contains an allowed domain as a path segment", () => {
    expect(isAllowedUrl("https://evil.com/urbanmilwaukee.com")).toBe(false);
  });

  test("rejects lookalike hosts that append an allowed domain as a prefix", () => {
    expect(isAllowedUrl("https://urbanmilwaukee.com.evil.com/z")).toBe(false);
  });

  test("rejects non-http(s) schemes", () => {
    expect(isAllowedUrl("ftp://urbanmilwaukee.com/x")).toBe(false);
    expect(isAllowedUrl("javascript:alert(1)")).toBe(false);
  });

  test("rejects unparseable URLs without throwing", () => {
    expect(isAllowedUrl("not a url")).toBe(false);
  });

  test("rejects domains not on the allowlist", () => {
    expect(isAllowedUrl("https://cnn.com/story")).toBe(false);
  });
});

describe("parseScoutResponse", () => {
  test("parses a valid payload", () => {
    const raw = JSON.stringify({
      articles: [
        {
          url: "https://urbanmilwaukee.com/2026/06/01/brennan-education",
          outlet: "Urban Milwaukee",
          headline: "Brennan lays out education plan",
          publishedAt: "2026-06-01",
          whyRelevant: "Direct quotes on K-12 funding stance",
        },
      ],
    });
    const result = parseScoutResponse(raw);
    expect("error" in result).toBe(false);
    if ("articles" in result) {
      expect(result.articles).toHaveLength(1);
      expect(result.articles[0].url).toBe(
        "https://urbanmilwaukee.com/2026/06/01/brennan-education",
      );
      expect(result.articles[0].publishedAt).toBe("2026-06-01");
    }
  });

  test("tolerates extra unknown fields on articles and at the top level", () => {
    const raw = JSON.stringify({
      articles: [
        {
          url: "https://wpr.org/y",
          outlet: "WPR",
          headline: "Headline",
          whyRelevant: "Relevant",
          confidence: 0.9, // unexpected extra field
        },
      ],
      note: "unexpected top-level field",
    });
    const result = parseScoutResponse(raw);
    expect("articles" in result && result.articles).toHaveLength(1);
  });

  test("omits publishedAt when absent rather than inventing a value", () => {
    const raw = JSON.stringify({
      articles: [
        { url: "https://wpr.org/y", outlet: "WPR", headline: "H", whyRelevant: "R" },
      ],
    });
    const result = parseScoutResponse(raw);
    if ("articles" in result) {
      expect("publishedAt" in result.articles[0]).toBe(false);
    }
  });

  test("returns {error} for malformed JSON instead of throwing", () => {
    const result = parseScoutResponse("not json at all {{{");
    expect("error" in result).toBe(true);
  });

  test("returns {error} when the top-level shape is wrong", () => {
    expect("error" in parseScoutResponse(JSON.stringify({ notArticles: [] }))).toBe(true);
    expect("error" in parseScoutResponse(JSON.stringify({ articles: "nope" }))).toBe(true);
    expect("error" in parseScoutResponse(JSON.stringify(null))).toBe(true);
  });

  test("tolerates Perplexity wrapping content in a markdown code fence", () => {
    const raw = "```json\n" + JSON.stringify({ articles: [] }) + "\n```";
    const result = parseScoutResponse(raw);
    expect("articles" in result && result.articles).toEqual([]);
  });

  test("dedupes the same URL appearing twice in one response — first occurrence wins", () => {
    const raw = JSON.stringify({
      articles: [
        { url: "https://wpr.org/dupe", outlet: "WPR", headline: "First", whyRelevant: "r" },
        { url: "https://wpr.org/dupe", outlet: "WPR", headline: "Second", whyRelevant: "r" },
        { url: "https://wpr.org/other", outlet: "WPR", headline: "Other", whyRelevant: "r" },
      ],
    });
    const result = parseScoutResponse(raw);
    if ("articles" in result) {
      expect(result.articles).toHaveLength(2);
      expect(result.articles[0].headline).toBe("First");
    } else {
      expect.fail("expected articles");
    }
  });

  test("drops individual malformed articles without failing the whole batch", () => {
    const raw = JSON.stringify({
      articles: [
        { url: "https://wpr.org/y", outlet: "WPR", headline: "H", whyRelevant: "R" },
        { url: "https://wpr.org/missing-fields" }, // missing outlet/headline/whyRelevant
      ],
    });
    const result = parseScoutResponse(raw);
    expect("articles" in result && result.articles).toHaveLength(1);
  });
});

describe("sortByRotation", () => {
  test("orders least-recently-proposed first", () => {
    const items = [
      { slug: "c", lastProposedAt: 3000 },
      { slug: "a", lastProposedAt: 1000 },
      { slug: "b", lastProposedAt: 2000 },
    ];
    expect(sortByRotation(items).map((i) => i.slug)).toEqual(["a", "b", "c"]);
  });

  test("never-proposed candidates (missing lastProposedAt) sort first", () => {
    const items = [
      { slug: "seen", lastProposedAt: 1000 },
      { slug: "never" },
    ];
    expect(sortByRotation(items).map((i) => i.slug)).toEqual(["never", "seen"]);
  });

  test("does not mutate the input array", () => {
    const items = [{ slug: "b", lastProposedAt: 2 }, { slug: "a", lastProposedAt: 1 }];
    const original = [...items];
    sortByRotation(items);
    expect(items).toEqual(original);
  });
});
