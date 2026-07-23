const SCHEMA = {
  type: "object",
  properties: {
    type: { type: "string", description: "One of: nonprofit, public_media, corporate_daily, wire, trade, tv, national, other." },
    ownership: { type: "string", description: "1-2 neutral sentences: who owns/operates this news outlet." },
    funding: { type: "string", description: "1-2 neutral sentences: how the outlet is funded (ads, subscriptions, donations, grants, public funding, etc.)." },
    sourceUrl: { type: "string", description: "The URL this information was drawn from." },
  },
};

const PROMPT =
  "For a nonpartisan voter guide, extract a neutral factual profile of this news outlet: its ownership structure, its funding model, and its outlet type. Only use what the page states.";

/** Ordered civic-source allowlist for one outlet name. */
export function buildOutletSourceUrls(name: string, url?: string): string[] {
  const q = encodeURIComponent(name);
  const wiki = name.trim().replace(/\s+/g, "_");
  return [
    ...(url ? [url] : []),
    `https://en.wikipedia.org/wiki/${wiki}`,
    `https://www.google.com/search?q=${q}+ownership+funding`,
  ];
}

/** Scrape the top allowlist URLs with Firecrawl json-format; return the
 * first hit. Thin network wrapper — untested by design (mirrors
 * fetchSponsorNarrative in firecrawlSponsor.ts). */
export async function fetchOutletFacts(name: string, url?: string): Promise<unknown> {
  if (!process.env.FIRECRAWL_API_KEY) return {};
  const urls = buildOutletSourceUrls(name, url).slice(0, 2);
  for (const u of urls) {
    try {
      const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ url: u, formats: [{ type: "json", prompt: PROMPT, schema: SCHEMA }] }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) continue;
      const body = (await res.json()) as { data?: { json?: unknown } };
      if (body.data?.json) return { ...body.data.json as Record<string, unknown>, sourceUrl: (body.data.json as { sourceUrl?: string }).sourceUrl ?? u };
    } catch {
      // try next url
    }
  }
  return {};
}
