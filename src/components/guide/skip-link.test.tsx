import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";

afterEach(() => vi.resetModules());

async function render(pathname: string) {
  vi.resetModules();
  vi.doMock("next/navigation", () => ({ usePathname: () => pathname }));
  const { SkipLink } = await import("./skip-link");
  return renderToStaticMarkup(<SkipLink />);
}

describe("SkipLink", () => {
  test("lets a keyboard user jump past the header to the page's main content", async () => {
    const html = await render("/races/wi-gov-2026");
    expect(html).toMatch(/href="#main"/);
    expect(html).toContain("Skip to main content");
  });

  test("speaks Spanish on the Spanish pages", async () => {
    expect(await render("/es/vote")).toContain("Saltar al contenido principal");
  });
});
