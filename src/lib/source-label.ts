/** Human-readable credit for a quote/position source link (MOO-322 follow-up:
 * outlets get named credit, never a generic "source"). */

const KNOWN_OUTLETS: Record<string, string> = {
  "wuwm.com": "WUWM",
  "wpr.org": "Wisconsin Public Radio",
  "urbanmilwaukee.com": "Urban Milwaukee",
  "jsonline.com": "Milwaukee Journal Sentinel",
};

export function sourceLabel(url: string, outlet?: string): string {
  if (outlet && outlet.trim().length > 0) return outlet;
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    for (const [domain, name] of Object.entries(KNOWN_OUTLETS)) {
      if (host === domain || host.endsWith("." + domain)) return name;
    }
    return host; // campaign sites etc.: the domain itself is accurate credit
  } catch {
    return "source";
  }
}
