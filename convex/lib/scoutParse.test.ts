import { describe, expect, test } from "vitest";
import {
  ALLOWED_DOMAINS,
  MAX_SEARCH_DOMAINS,
  isAllowedUrl,
  articlesFromSearch,
  withPageDetails,
  scoutQuery,
  sortByRotation,
} from "./scoutParse";

describe("ALLOWED_DOMAINS", () => {
  // The guard that matters most: context.dev caps includeDomains at 100, so an
  // outlet past that would never be searched. Import-time throw + this test
  // make that impossible to ship.
  test("stays within the search's includeDomains cap", () => {
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

test("the search names the candidate exactly and the office they are running for", () => {
  expect(scoutQuery({ name: "Tom Tiffany", office: "Governor of Wisconsin" })).toBe('"Tom Tiffany" Governor of Wisconsin');
});

describe("articlesFromSearch", () => {
  const result = (url: string, title = "Headline", description = "A snippet.") => ({ url, title, description });

  test("turns a search result into an article: outlet from the address, the outlet's own headline and snippet, no invented date", () => {
    const out = articlesFromSearch({
      results: [result("https://www.jsonline.com/story/news/politics/2026/10/14/crowley-energy/92220084007/", "Crowley says renewables can lower costs", "Crowley said Tuesday...")],
    });
    expect(out).toEqual({
      articles: [
        {
          url: "https://www.jsonline.com/story/news/politics/2026/10/14/crowley-energy/92220084007/",
          outlet: "Milwaukee Journal Sentinel",
          headline: "Crowley says renewables can lower costs",
          whyRelevant: "Crowley said Tuesday...",
        },
      ],
    });
  });

  test("drops tracking and AMP parameters, then keeps one copy of each article", () => {
    const out = articlesFromSearch({
      results: [
        result("https://www.wbay.com/video/2026/10/13/one-on-one/"),
        result("https://www.wbay.com/video/2026/10/13/one-on-one/?outputType=amp"),
      ],
    });
    expect("articles" in out && out.articles.map((a) => a.url)).toEqual(["https://www.wbay.com/video/2026/10/13/one-on-one/"]);
  });

  test("leaves out pages that are not articles", () => {
    const out = articlesFromSearch({
      results: [
        result("https://www.wispolitics.com/category/news/", "WisPolitics News Archives - WisPolitics"),
        result("https://www.wispolitics.com/tag/kaul/"),
        result("https://www.wpr.org/author/someone"),
        result("https://madison.com/content/tncms/assets/jenna-jacobson-100626-01.jpg", "Jenna Jacobson 100626 01.jpg"),
        result("https://madison.com/news/local/business/development/collection_225982d4-e82f-485f-b6cc-b37e2a3dd423.html", "Recent stories by Wisconsin State Journal reporter Mitchell ..."),
        result("https://www.wpr.org/news", "News"),
        result("https://www.wpr.org/", "WPR"),
        result("https://www.wpr.org/news/real-story"),
      ],
    });
    expect("articles" in out && out.articles.map((a) => a.url)).toEqual(["https://www.wpr.org/news/real-story"]);
  });

  test("leaves out campaign press releases reposted by outlets", () => {
    const out = articlesFromSearch({
      results: [
        result("https://urbanmilwaukee.com/pressrelease/david-crowley-announces-ai-plan/", "David Crowley Announces Artificial Intelligence Policy Plan"),
        result("https://www.wispolitics.com/2026/dccc-dccc-releases-new-tv-ad-in-wi-03/", "DCCC: DCCC Releases New TV Ad in WI-03"),
        result("https://www.wispolitics.com/2026/van-orden-cooke-set-to-meet-in-oct-20-debate/", "Van Orden, Cooke set to meet in Oct. 20 debate"),
      ],
    });
    expect("articles" in out && out.articles.map((a) => a.headline)).toEqual(["Van Orden, Cooke set to meet in Oct. 20 debate"]);
  });

  test("leaves out outlets not on the list and results with no address or headline", () => {
    const out = articlesFromSearch({
      results: [result("https://www.nytimes.com/2026/10/13/us/politics/wisconsin.html"), { url: "https://www.wpr.org/x", title: "" }, { title: "No address" }],
    });
    expect(out).toEqual({ articles: [] });
  });

  test("says what went wrong when the response has no results list, instead of throwing", () => {
    expect(articlesFromSearch(null)).toEqual({ error: "search response missing 'results' array" });
    expect(articlesFromSearch({ results: "nope" })).toEqual({ error: "search response missing 'results' array" });
  });
});

describe("withPageDetails", () => {
  const article = {
    url: "https://www.jsonline.com/story/news/politics/elections/2026/10/12/tom-tiffany-income-tax/92174504007/",
    outlet: "Milwaukee Journal Sentinel",
    headline: "Tom Tiffany says he's open to eliminating the state income ...",
    whyRelevant: "snippet",
  };

  test("the page's own headline replaces the search's shortened one, and its image comes along", () => {
    expect(withPageDetails(article, { title: "Tom Tiffany says he's open to eliminating the state income tax", image: "https://www.jsonline.com/img.jpg" })).toEqual({
      ...article,
      headline: "Tom Tiffany says he's open to eliminating the state income tax",
      imageUrl: "https://www.jsonline.com/img.jpg",
    });
  });

  test("a press release that only shows itself in the page's real title is left out", () => {
    const wispolitics = { ...article, url: "https://www.wispolitics.com/2026/crowley-campaign-ai-plan/", outlet: "WisPolitics", headline: "David Crowley announces artificial intelligence policy plan ..." };
    expect(withPageDetails(wispolitics, { title: "Crowley campaign: David Crowley announces artificial intelligence policy plan" })).toBeNull();
  });

  test("when the page could not be read, the article is kept as the search found it", () => {
    expect(withPageDetails(article, {})).toEqual(article);
  });

  test("an image address that is not a web address is ignored", () => {
    expect(withPageDetails(article, { image: "data:image/png;base64,AAAA" })).toEqual(article);
  });
});
