import type { Doc } from "../../../convex/_generated/dataModel";

const TYPE_LABEL: Record<string, string> = {
  nonprofit: "nonprofit newsroom", public_media: "public media",
  corporate_daily: "daily newspaper", wire: "wire service", trade: "trade press",
  tv: "broadcast TV", national: "national outlet", other: "news outlet",
};

/**
 * Compact variant for dense surfaces (the /news front page): one mono stamp
 * line — outlet · type — with ownership + funding folded into a native
 * <details>. Repeating the full card under 70 headlines made boilerplate, not
 * news, the dominant text on the page; this keeps the disclosure one tap away
 * rather than removing it. <details> works without JS and prints correctly.
 */
export function SourceTransparencyStamp({
  outlet, outletName,
}: { outlet: Doc<"outlets"> | null; outletName: string }) {
  const type = outlet ? (TYPE_LABEL[outlet.type] ?? "news outlet") : "outlet profile pending";
  const hasDetail = !!(outlet?.ownership || outlet?.fundingNote);
  const stamp = (
    <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
      <span className="text-foreground">{outlet?.displayName ?? outletName}</span>
      {" · "}{type}
    </span>
  );
  if (!hasDetail) return stamp;
  return (
    <details className="group">
      <summary className="cursor-pointer list-none marker:content-none">
        {stamp}
        <span className="ml-1 font-mono text-[11px] text-muted-foreground group-open:hidden">+</span>
        <span className="ml-1 hidden font-mono text-[11px] text-muted-foreground group-open:inline">−</span>
      </summary>
      <div className="mt-1 border-t-2 border-dashed border-border pt-1 font-mono text-[11px] leading-relaxed text-muted-foreground">
        {outlet?.fundingNote ? <div>{outlet.fundingNote}</div> : null}
        {outlet?.ownership ? <div>{outlet.ownership}</div> : null}
        {outlet?.ownershipSourceUrl ? (
          <a href={outlet.ownershipSourceUrl} target="_blank" rel="noopener noreferrer" className="underline">
            source&nbsp;↗
          </a>
        ) : null}
      </div>
    </details>
  );
}

export function SourceTransparencyCard({
  outlet, outletName,
}: { outlet: Doc<"outlets"> | null; outletName: string }) {
  if (!outlet) {
    return (
      <p className="font-mono text-xs text-muted-foreground">
        {outletName} · outlet profile pending
      </p>
    );
  }
  return (
    <div className="font-mono text-xs text-muted-foreground">
      <span className="font-bold text-foreground">{outlet.displayName}</span>
      {" · "}{TYPE_LABEL[outlet.type] ?? "news outlet"}
      {outlet.fundingNote ? ` · ${outlet.fundingNote}` : ""}
      {outlet.ownership ? (
        <div className="mt-0.5">
          {outlet.ownership}
          {outlet.ownershipSourceUrl ? (
            <>
              {" "}
              <a href={outlet.ownershipSourceUrl} target="_blank" rel="noopener noreferrer" className="underline">
                source&nbsp;↗
              </a>
            </>
          ) : null}
        </div>
      ) : null}
      {/* v1: no bias/factuality badge rendered (data-ready in outlet.thirdPartyRatings). */}
    </div>
  );
}
