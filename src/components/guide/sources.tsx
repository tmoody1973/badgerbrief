import { SourceTrustLabel } from "./labels";

const OFFICIAL_HOSTS = [
  "myvote.wi.gov",
  "elections.wi.gov",
  "campaignfinance.wi.gov",
  "fec.gov",
  "ethics.wi.gov",
];

function classify(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (OFFICIAL_HOSTS.some((h) => host === h || host.endsWith("." + h)))
      return "official";
    if (host.includes("ballotpedia") || host.includes("wikipedia"))
      return "reference";
    if (
      host.includes("wuwm") ||
      host.includes("pbswisconsin") ||
      host.includes("wisconsinwatch") ||
      host.includes("jsonline")
    )
      return "reported";
    return "campaign";
  } catch {
    return "reference";
  }
}

export function SourceList({
  sources,
  title = "Sources",
}: {
  sources: { name: string; url: string }[];
  title?: string;
}) {
  if (sources.length === 0) return null;
  return (
    <div className="border-t-2 border-dashed border-border pt-3">
      <h3 className="font-mono text-xs font-bold uppercase tracking-widest">
        {title}
      </h3>
      <ul className="mt-2 space-y-1">
        {sources.map((s) => (
          <li key={s.url} className="flex items-baseline gap-2 text-sm">
            <SourceTrustLabel kind={classify(s.url)} />
            <a
              href={s.url}
              rel="noopener noreferrer"
              target="_blank"
              className="underline decoration-2 underline-offset-2 hover:bg-secondary"
            >
              {s.name}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
