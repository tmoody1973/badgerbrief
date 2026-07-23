import { describe, expect, test } from "vitest";
import { extractPublishedDate, extractOgImage } from "./publishedDate";

const NOW = Date.parse("2026-07-22T12:00:00Z");

describe("extractPublishedDate", () => {
  test("reads OpenGraph article:published_time", () => {
    const html = `<html><head>
      <meta property="article:published_time" content="2026-06-15T09:30:00-05:00">
    </head></html>`;
    expect(extractPublishedDate(html, NOW)).toBe("2026-06-15");
  });

  test("reads it with the attributes in the other order", () => {
    const html = `<meta content="2026-05-02T00:00:00Z" property="article:published_time">`;
    expect(extractPublishedDate(html, NOW)).toBe("2026-05-02");
  });

  test("falls back to schema.org JSON-LD datePublished", () => {
    const html = `<script type="application/ld+json">
      {"@type":"NewsArticle","headline":"x","datePublished":"2026-04-01T12:00:00Z"}
    </script>`;
    expect(extractPublishedDate(html, NOW)).toBe("2026-04-01");
  });

  test("prefers OpenGraph over a weaker <time> tag", () => {
    const html = `
      <meta property="article:published_time" content="2026-06-15">
      <time datetime="2026-01-01">Jan 1</time>`;
    expect(extractPublishedDate(html, NOW)).toBe("2026-06-15");
  });

  test("uses <time datetime> only when nothing better exists", () => {
    expect(extractPublishedDate(`<time datetime="2026-03-09">Mar 9</time>`, NOW)).toBe("2026-03-09");
  });

  test("returns undefined when the page states no date", () => {
    expect(extractPublishedDate("<html><body>no metadata here</body></html>", NOW)).toBeUndefined();
    expect(extractPublishedDate("", NOW)).toBeUndefined();
  });

  test("rejects a metadata date that is impossible (future) or malformed", () => {
    expect(extractPublishedDate(`<meta property="article:published_time" content="2026-09-30">`, NOW)).toBeUndefined();
    expect(extractPublishedDate(`<meta property="article:published_time" content="N/A">`, NOW)).toBeUndefined();
  });

  test("skips an untrustworthy first hit and keeps looking", () => {
    // OG date is in the future (untrustworthy) but the JSON-LD one is real.
    const html = `
      <meta property="article:published_time" content="2027-01-01">
      <script type="application/ld+json">{"datePublished":"2026-02-10"}</script>`;
    expect(extractPublishedDate(html, NOW)).toBe("2026-02-10");
  });
});

describe("extractOgImage", () => {
  test("reads og:image", () => {
    const html = `<meta property="og:image" content="https://urbanmilwaukee.com/wp/x.jpg">`;
    expect(extractOgImage(html)).toBe("https://urbanmilwaukee.com/wp/x.jpg");
  });
  test("handles reversed attribute order and unescapes &amp;", () => {
    const html = `<meta content="https://o.com/i.jpg?a=1&amp;b=2" property="og:image">`;
    expect(extractOgImage(html)).toBe("https://o.com/i.jpg?a=1&b=2");
  });
  test("falls back to twitter:image", () => {
    expect(extractOgImage(`<meta name="twitter:image" content="https://o.com/t.png">`))
      .toBe("https://o.com/t.png");
  });
  test("rejects relative, data: and missing URLs — we never guess an origin", () => {
    expect(extractOgImage(`<meta property="og:image" content="/local/x.jpg">`)).toBeUndefined();
    expect(extractOgImage(`<meta property="og:image" content="data:image/png;base64,AAA">`)).toBeUndefined();
    expect(extractOgImage("<html><body>nothing</body></html>")).toBeUndefined();
    expect(extractOgImage("")).toBeUndefined();
  });
});
