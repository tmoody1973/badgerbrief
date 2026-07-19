import { describe, expect, test } from "vitest";
import { sourceLabel } from "./source-label";

describe("sourceLabel", () => {
  test("explicit outlet wins", () => {
    expect(sourceLabel("https://www.wuwm.com/x", "WUWM 89.7")).toBe("WUWM 89.7");
  });
  test("known outlet domains map to display names", () => {
    expect(sourceLabel("https://www.wuwm.com/article")).toBe("WUWM");
    expect(sourceLabel("https://urbanmilwaukee.com/2026/x")).toBe("Urban Milwaukee");
    expect(sourceLabel("https://www.jsonline.com/story")).toBe("Milwaukee Journal Sentinel");
  });
  test("unknown domain falls back to hostname; garbage falls back to 'source'", () => {
    expect(sourceLabel("https://www.crowleyforwi.com/Plan")).toBe("crowleyforwi.com");
    expect(sourceLabel("not a url")).toBe("source");
  });
});
