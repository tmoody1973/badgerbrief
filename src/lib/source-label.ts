/** Human-readable credit for a quote/position source link (MOO-322 follow-up:
 * outlets get named credit, never a generic "source"). */

// Single source of truth, shared with the scout's domain allowlist — an outlet
// the scout can find always has a real name here, never a bare hostname.
import { WI_OUTLETS as KNOWN_OUTLETS } from "../../convex/lib/scoutParse";

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
