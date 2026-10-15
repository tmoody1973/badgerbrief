import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { AnnouncementBar } from "./announcement-bar";

describe("AnnouncementBar", () => {
  test("marks its English text as English, so the Spanish pages read it with English pronunciation", () => {
    const html = renderToStaticMarkup(
      <AnnouncementBar id="t" href="/vote">General election: Tuesday, Nov 3.</AnnouncementBar>,
    );
    expect(html).toMatch(/^<div[^>]*lang="en"/);
  });
});
