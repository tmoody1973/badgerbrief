import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { MethodologyGuide } from "./methodology-guide";
import { methodologyEn } from "@/lib/i18n/methodology-en";
import { methodologyEs } from "@/lib/i18n/methodology-es";

describe("Methodology: where candidates' questionnaire answers come from", () => {
  test.each([
    ["en", methodologyEn],
    ["es", methodologyEs],
  ] as const)("%s names Wisconsin Watch and Voter Guide Commons as the source", (lang, dict) => {
    const html = renderToStaticMarkup(<MethodologyGuide dict={dict} lang={lang} />);
    expect(html).toContain("Wisconsin Watch");
    expect(html).toContain("Voter Guide Commons");
    expect(html).toContain('href="https://voterguide26.wisconsinwatch.org/');
    expect(html).toMatch(/href="https:\/\/voterguidecommons\.org\/[^"]*"[^>]*>Voter Guide Commons</);
  });
});
