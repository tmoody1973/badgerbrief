import { describe, expect, test } from "vitest";
import { isAllowedImage, remotePatterns } from "./image-hosts";

describe("isAllowedImage", () => {
  test("accepts a reviewed outlet's own image host and its shared CDN", () => {
    expect(isAllowedImage("https://www.jsonline.com/gcdn/x.jpg")).toBe(true);
    expect(isAllowedImage("https://wisconsinexaminer.com/wp-content/x.jpg")).toBe(true);
    expect(isAllowedImage("https://bloximages.chicago2.vip.townnews.com/captimes.com/x.jpg")).toBe(true);
  });

  test("accepts Wisconsin Watch's photos on WordPress's image service, and nothing else there", () => {
    expect(isAllowedImage("https://i0.wp.com/wisconsinwatch.org/wp-content/uploads/x.jpg")).toBe(true);
    expect(isAllowedImage("https://i0.wp.com/someone-else.org/x.jpg")).toBe(false);
  });

  test("refuses an unreviewed host and anything that is not an https URL", () => {
    expect(isAllowedImage("https://example.com/x.jpg")).toBe(false);
    expect(isAllowedImage("http://www.jsonline.com/x.jpg")).toBe(false);
    expect(isAllowedImage("not a url")).toBe(false);
  });

  test("stays within Next.js's 50-pattern limit, which fails the build when exceeded", () => {
    expect(remotePatterns.length).toBeLessThanOrEqual(50);
  });
});
