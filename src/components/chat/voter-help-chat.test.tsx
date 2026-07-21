import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { MdText } from "./voter-help-chat";

/** The chat previously rendered assistant markdown as literal characters (only
 * links were handled). These assert real markdown now renders to real elements. */
describe("MdText", () => {
  test("renders bold, bullet lists, and safe external links", () => {
    const html = renderToStaticMarkup(
      <MdText text={"**Register by Oct 15.**\n\n- Bring an ID\n- Check your ward\n\n[wisconsin.gov](https://myvote.wi.gov)"} />,
    );
    expect(html).toContain("<strong");
    expect(html).toContain("Register by Oct 15.");
    expect(html).toContain("<ul");
    expect(html).toContain("<li>Bring an ID</li>");
    // external link opens safely, not rendered as literal [text](url)
    expect(html).toContain('href="https://myvote.wi.gov"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain("**Register");
    expect(html).not.toContain("[wisconsin.gov]");
  });

  test("renders numbered lists", () => {
    const html = renderToStaticMarkup(
      <MdText text={"1. First\n2. Second"} />,
    );
    expect(html).toContain("<ol");
    expect(html).toContain("<li>First</li>");
  });

  test("does not render raw HTML from model output (no injection)", () => {
    const html = renderToStaticMarkup(
      <MdText text={"<script>alert(1)</script> plain"} />,
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("plain");
  });
});
