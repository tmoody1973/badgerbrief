// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { ArticleThumb } from "./article-thumb";

describe("ArticleThumb and the image allowlist", () => {
  test("shows the outlet's initials, not a doomed image, for a photo from an unreviewed host", () => {
    const html = renderToStaticMarkup(<ArticleThumb src="https://example.com/photo.jpg" outlet="Wisconsin Watch" />);
    expect(html).not.toContain("<img");
    expect(html).toContain("WW");
  });

  test("still shows a photo from a reviewed host", () => {
    const html = renderToStaticMarkup(<ArticleThumb src="https://www.jsonline.com/gcdn/photo.jpg" outlet="Milwaukee Journal Sentinel" />);
    expect(html).toContain("<img");
  });
});
