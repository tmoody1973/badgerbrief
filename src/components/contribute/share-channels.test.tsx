import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { ShareButton } from "./share-button";

const BALLOT = "https://badgerbrief.org/ballot#cd=7&sd=31&ad=93&co=st-croix";

describe("ShareButton channels", () => {
  test("by default offers the social networks, as it always has", () => {
    const html = renderToStaticMarkup(<ShareButton url="https://badgerbrief.org/races/wi-gov-2026" title="Governor" />);
    expect(html).toContain("twitter.com/intent/tweet");
    expect(html).toContain("facebook.com/sharer");
    expect(html).toContain("bsky.app/intent/compose");
    expect(html).toContain("mailto:");
  });

  test("with private channels only, hands the link to no social network", () => {
    const html = renderToStaticMarkup(<ShareButton url={BALLOT} title="My ballot" channels="private" />);
    expect(html).not.toMatch(/twitter\.com|facebook\.com|bsky\.app|x\.com/);
    expect(html).toContain("Copy link");
    expect(html).toContain("mailto:");
  });

  test("never puts the part after the # inside another site's address", () => {
    const html = renderToStaticMarkup(<ShareButton url={BALLOT} title="My ballot" channels="private" />);
    const outbound = [...html.matchAll(/href="(https?:[^"]*)"/g)].map((m) => decodeURIComponent(m[1]));
    expect(outbound.filter((href) => /cd=7|st-croix/.test(href))).toEqual([]);
  });
});
