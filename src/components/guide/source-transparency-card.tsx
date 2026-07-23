import type { Doc } from "../../../convex/_generated/dataModel";

const TYPE_LABEL: Record<string, string> = {
  nonprofit: "nonprofit newsroom", public_media: "public media",
  corporate_daily: "daily newspaper", wire: "wire service", trade: "trade press",
  tv: "broadcast TV", national: "national outlet", other: "news outlet",
};

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
