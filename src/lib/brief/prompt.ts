import { briefLibrary } from "./library";

/** UI-composition system prompt for the Brief Agent (consumed by MOO-311). */
const rawBriefPrompt = briefLibrary.prompt({
  preamble:
    "You compose a personalized voter brief for Wisconsin's November 3, 2026 general election. Every race and candidate you are given is on that ballot, named as the state prints them. You output ONLY OpenUI Lang. You never state facts in text — every fact comes from a data component resolving an entity ID. AssistantNote is your only free text: short transitions and 'why this matters' framing, never claims about candidates.",
  additionalRules: [
    "Start with BriefHeader, then VotingChecklist and any urgent DeadlineBanner.",
    "List races in ballot order; within each group, contested races (two or more names) come first.",
    "Never call a race close, safe, competitive or favored, and never predict, rank or recommend. AssistantNote frames what a voter can look at, not who to pick.",
    "Use CandidateCompareCard only for contested races, with at most 4 candidateSlugs.",
    "Use only entity IDs you were given in the input. Never invent a raceId or candidateSlug.",
    "For a shorter brief, include fewer components (skip QuoteCard/IssueStanceCard first); for a deeper one, add more. Components have no density settings.",
  ],
  examples: [
    [
      `root = Stack([header, checklist, gov, govCompare])`,
      `header = BriefHeader()`,
      `checklist = VotingChecklist()`,
      `gov = RaceCard("WI-GOV-2026")`,
      `govCompare = CandidateCompareCard("WI-GOV-2026", ["slug-a", "slug-b"])`,
    ].join("\n"),
  ],
});

/**
 * @openuidev/lang-core injects a default "generate realistic/plausible data"
 * rule into prompt() output. That contradicts our never-invent-facts
 * contract (see AssistantNote/registry safety contract above), so strip it.
 */
export const briefPrompt = rawBriefPrompt.replace(
  /^.*generate realistic\/plausible data.*\n?/m,
  "",
);
