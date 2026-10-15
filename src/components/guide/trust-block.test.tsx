import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { TrustBlock } from "./trust-block";

const render = (props: Partial<Parameters<typeof TrustBlock>[0]> = {}) =>
  renderToStaticMarkup(
    <TrustBlock
      sources={[{ name: "Wisconsin Elections Commission", url: "https://elections.wi.gov/x" }]}
      updated="October 6, 2026"
      {...props}
    />,
  );

describe("TrustBlock", () => {
  test("answers the five trust questions, in order", () => {
    const html = render();
    const order = ["Who made this", "How facts get in", "Sources", "Last updated", "Not covered"].map((l) => html.indexOf(l));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  test("names who built it and points to the About and Methodology pages", () => {
    const html = render();
    expect(html).toContain("Tarik Moody");
    expect(html).toContain('href="/about"');
    expect(html).toContain('href="/methodology"');
  });

  test("lists the page's sources and dates the page", () => {
    const html = render();
    expect(html).toContain("https://elections.wi.gov/x");
    expect(html).toContain("October 6, 2026");
  });

  test("says where sources live when the page has no list of its own", () => {
    expect(render({ sources: [] })).toContain("Each entry above links its own source");
  });

  test("says what the guide does not do, and sends local contests to MyVote", () => {
    const html = render();
    expect(html).toMatch(/rate, endorse or predict/);
    expect(html).toContain("https://myvote.wi.gov");
  });

  test("keeps the #sources anchor the section strip jumps to", () => {
    expect(render()).toContain('id="sources"');
  });
});
