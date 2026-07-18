/** Deterministic prefetch handed to the compose LLM — entity IDs + availability flags only. */
export type BriefContext = {
  electionSlug: string;
  districts: { congressional: number; senate: number; assembly: number };
  votingInfo: { primaryDate: string; available: boolean };
  races: Array<{
    raceId: string;
    office: string;
    level: string;
    candidates: Array<{
      slug: string;
      name: string;
      party?: string;
      publishedIssueSlugs: string[]; // issues with a published position
      quoteCount: number;
      hasFinance: boolean;
    }>;
  }>;
  preferences: {
    savedRaceIds: string[];
    savedIssues: string[];
    detailLevel: "short" | "standard" | "deep";
  };
};

const DETAIL_DIRECTIVES: Record<BriefContext["preferences"]["detailLevel"], string> = {
  short:
    "Detail level SHORT: BriefHeader, VotingChecklist, DeadlineBanner if a deadline is near, and one RaceCard per race. Skip QuoteCard, IssueStanceCard, FinanceSnapshot, and CandidateCompareCard.",
  standard:
    "Detail level STANDARD: RaceCard per race, CandidateCompareCard for contested races (max 4 slugs), IssueStanceCard for the user's saved issues where a candidate lists that issue.",
  deep:
    "Detail level DEEP: everything in STANDARD, plus QuoteCard and FinanceSnapshot for candidates in starred races — but only where the candidate lists quotes/finance data.",
};

/** The compose call's single user message: context JSON + composition directives. */
export function buildBriefUserMessage(context: BriefContext): string {
  return [
    "Compose a personal voter brief from this ballot data. Use ONLY the entity IDs listed here — never invent a raceId, candidateSlug, or issueSlug.",
    "```json",
    JSON.stringify(context, null, 2),
    "```",
    `Preferences: starred races ${JSON.stringify(context.preferences.savedRaceIds)} come first (after header/checklist); saved issues ${JSON.stringify(context.preferences.savedIssues)}.`,
    DETAIL_DIRECTIVES[context.preferences.detailLevel],
    "Data availability is authoritative: only emit IssueStanceCard for (candidateSlug, issueSlug) pairs present in that candidate's publishedIssueSlugs; only emit QuoteCard where quoteCount > 0; only emit FinanceSnapshot where hasFinance is true. Where coverage is sparse, a brief AssistantNote may say published coverage is limited.",
  ].join("\n");
}

/** Retry feedback: the parser's structured failure, re-anchored to the contract. */
export function buildCorrectiveMessage(summary: string): string {
  return [
    "Your previous output failed OpenUI Lang validation:",
    summary,
    "Regenerate the FULL brief from the same ballot data. Output only components from the registry, resolve every reference, and follow the component arg shapes exactly.",
  ].join("\n");
}
