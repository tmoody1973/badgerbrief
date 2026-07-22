export type SponsorNarrative = {
  narrative?: string;
  leadership?: { name: string; role: string }[];
  sources: { label: string; url: string }[];
};

const SCHEMA = {
  type: "object",
  properties: {
    narrative: { type: "string", description: "2-4 neutral sentences: what kind of group this is, its agenda, who funds/backs it. No opinion." },
    leadership: { type: "array", items: { type: "object", properties: { name: { type: "string" }, role: { type: "string" } } } },
  },
};

const PROMPT =
  "For a nonpartisan voter guide, extract a neutral factual profile of this political ad sponsor: what kind of organization it is, its agenda, and who funds or leads it. Only use what the page states.";

/** Ordered civic-source allowlist for one sponsor name. */
export function buildSourceUrls(name: string): string[] {
  const q = encodeURIComponent(name);
  const wiki = name.trim().replace(/\s+/g, "_");
  return [
    `https://projects.propublica.org/nonprofits/search?q=${q}`,
    `https://www.opensecrets.org/search?q=${q}&type=pacs`,
    `https://ballotpedia.org/${wiki}`,
    `https://en.wikipedia.org/wiki/${wiki}`,
  ];
}

const NAME_STOPWORDS = new Set(["for", "the", "and", "committee", "pac", "inc", "fund"]);

/** Significant tokens of a sponsor name: lowercased words length >= 4, minus
 * generic org stopwords. Used to reject wrong-entity extractions. */
function significantTokens(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4 && !NAME_STOPWORDS.has(t));
}

export function mergeNarrative(
  results: { url: string; json: { narrative?: string; leadership?: { name: string; role: string }[] } | null }[],
  name: string,
): SponsorNarrative {
  // Search pages (ProPublica/OpenSecrets) can extract the wrong entity. Require
  // the narrative to share a significant token with the sponsor name, else drop
  // the whole result (its leadership too). No significant tokens → skip guard.
  const tokens = significantTokens(name);
  const relevant = (r: { json: { narrative?: string } | null }) => {
    if (!r.json) return false;
    if (!tokens.length) return true;
    const narrative = r.json.narrative?.toLowerCase();
    if (!narrative) return false;
    return tokens.some((t) => narrative.includes(t));
  };
  const live = results.filter(relevant);
  const narrative = live.map((r) => r.json!.narrative).find((n) => n && n.trim());
  const leadership: { name: string; role: string }[] = [];
  const seen = new Set<string>();
  for (const r of live) {
    for (const p of r.json!.leadership ?? []) {
      const k = p.name.toLowerCase();
      if (p.name && !seen.has(k)) { seen.add(k); leadership.push(p); }
    }
  }
  const sources = live.map((r) => {
    let label = r.url;
    try { label = new URL(r.url).hostname.replace(/^www\./, ""); } catch { /* keep */ }
    return { label, url: r.url };
  });
  return { narrative, leadership: leadership.length ? leadership : undefined, sources };
}

/** Scrape the top allowlist URLs with Firecrawl json-format and merge. */
export async function fetchSponsorNarrative(name: string): Promise<SponsorNarrative> {
  if (!process.env.FIRECRAWL_API_KEY) return { sources: [] };
  const urls = buildSourceUrls(name).slice(0, 3);
  const results = await Promise.all(
    urls.map(async (url) => {
      try {
        const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ url, formats: [{ type: "json", prompt: PROMPT, schema: SCHEMA }] }),
          signal: AbortSignal.timeout(30_000),
        });
        if (!res.ok) return { url, json: null };
        const body = (await res.json()) as { data?: { json?: { narrative?: string; leadership?: { name: string; role: string }[] } } };
        return { url, json: body.data?.json ?? null };
      } catch {
        return { url, json: null };
      }
    }),
  );
  return mergeNarrative(results, name);
}
