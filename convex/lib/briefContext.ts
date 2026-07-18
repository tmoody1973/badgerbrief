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
