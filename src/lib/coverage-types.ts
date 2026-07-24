/**
 * The PUBLIC shape of tracked coverage — what `coverage.ts` actually returns to
 * the site, as opposed to the full `article_sources` / `outlets` documents.
 *
 * Declared once and shared so the narrowing holds. Typing these components
 * against `Doc<"article_sources">` is what let the whole editorial row into the
 * page payload in the first place: /news shipped 855KB of HTML carrying
 * `whyRelevant` and `relevanceReason` 145 times each, plus relevance scores and
 * review status, none of it rendered. A named narrow type makes re-widening a
 * deliberate act rather than an accident of convenience.
 */
export type PublicArticle = {
  _id: string;
  headline: string;
  url: string;
  /** The outlet's display name as recorded on the article. */
  outlet: string;
  imageUrl?: string;
  raceId?: string;
  /** Present ONLY when the date was verified against the publisher's own page. */
  publishedAt?: string;
};

export type PublicOutlet = {
  key: string;
  displayName: string;
  type: string;
  ownership?: string;
  fundingNote?: string;
  ownershipSourceUrl?: string;
  // thirdPartyRatings is deliberately ABSENT. The schema calls it "data-ready
  // for v2; NEVER rendered in v1", and the transparency card confirms it with a
  // comment where a badge would go. Shipping bias/factuality ratings the site
  // has decided not to display would publish them in the page source anyway.
};

export type CoverageRow = {
  article: PublicArticle;
  outlet: PublicOutlet | null;
};
