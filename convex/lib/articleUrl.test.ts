import { describe, expect, test } from "vitest";
import { canonicalArticleKey, isSameArticle } from "./articleUrl";

describe("canonicalArticleKey", () => {
  test("collapses the real duplicates that reached /news", () => {
    // Same Gannett asset id, rewritten slug — shown as two articles on the hub.
    expect(
      isSameArticle(
        "https://www.jsonline.com/story/news/politics/elections/2026/06/16/what-ag-josh-kaul-says-about-the-democrat-field-for-wisconsin-governor/90561349007/",
        "https://www.jsonline.com/story/news/politics/elections/2026/06/16/what-ag-josh-kaul-says-about-the-dem-field-for-governor/90561349007/",
      ),
    ).toBe(true);

    // Same asset id, different section path (/politics vs /politics/elections).
    expect(
      isSameArticle(
        "https://www.jsonline.com/story/news/politics/2026/06/14/sara-rodriguez-leads-field-for-governor-in-wisconsin-dems-straw-poll/90529831007/",
        "https://www.jsonline.com/story/news/politics/elections/2026/06/14/sara-rodriguez-leads-field-for-governor-in-wisconsin-dems-straw-poll/90529831007/",
      ),
    ).toBe(true);
  });

  test("two different articles from the same outlet stay separate", () => {
    // The failure that actually matters: a wrong merge hides coverage, where a
    // missed duplicate is only untidy.
    expect(
      isSameArticle(
        "https://www.jsonline.com/story/news/politics/2026/06/14/story-one/90529831007/",
        "https://www.jsonline.com/story/news/politics/2026/06/14/story-two/90561349007/",
      ),
    ).toBe(false);
  });

  test("ignores tracking query strings and trailing slashes", () => {
    expect(
      isSameArticle(
        "https://wpr.org/news/some-story",
        "https://wpr.org/news/some-story/?utm_source=twitter&utm_medium=social",
      ),
    ).toBe(true);
  });

  test("treats www/eu/amp hosts as the same site", () => {
    expect(isSameArticle("https://www.wpr.org/a/b", "https://eu.wpr.org/a/b")).toBe(true);
    expect(isSameArticle("https://amp.jsonline.com/a/b", "https://jsonline.com/a/b")).toBe(true);
  });

  test("different outlets are never the same article", () => {
    // Even with an identical path, two publishers are two articles.
    expect(isSameArticle("https://wpr.org/a/b", "https://wisconsinwatch.org/a/b")).toBe(false);
  });

  test("a short trailing number is not treated as a publisher id", () => {
    // "/2026/" must not become the article's identity.
    expect(canonicalArticleKey("https://example.org/news/2026")).toBe("example.org/news/2026");
    expect(isSameArticle("https://example.org/news/2026", "https://example.org/sports/2026")).toBe(
      false,
    );
  });

  test("a malformed url still yields a stable key instead of throwing", () => {
    expect(canonicalArticleKey("not a url")).toBe("not a url");
  });
});
