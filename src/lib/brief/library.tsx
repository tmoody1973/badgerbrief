"use client";

import { createLibrary, defineComponent } from "@openuidev/react-lang";
import { z } from "zod";
import { SourceTrustLabel as GuideSourceTrustLabel } from "@/components/guide/labels";
import {
  BriefHeaderView,
  DeadlineBannerView,
  VotingChecklistView,
} from "@/components/brief/voting";
import { BriefRaceCardView, CandidateCompareCardView } from "@/components/brief/race";
import {
  FinanceSnapshotView,
  IssueStanceCardView,
  QuoteCardView,
} from "@/components/brief/candidate";

/**
 * MOO-305 registry. Safety contract: props are entity IDs and enums only —
 * AssistantNote is the single free-text exception. Data components resolve
 * published Convex records at render time; the LLM never writes facts.
 */

export const Stack = defineComponent({
  name: "Stack",
  description: "Vertical layout container. Children render top to bottom.",
  props: z.object({
    children: z.array(z.any()).describe("child components in order"),
  }),
  component: ({ props, renderNode }) => (
    <div className="flex flex-col gap-6">
      {(props.children as unknown[]).map((child, i) => (
        <div key={i}>{renderNode(child)}</div>
      ))}
    </div>
  ),
});

export const Grid = defineComponent({
  name: "Grid",
  description: "Two-column grid on wide screens, single column on mobile.",
  props: z.object({
    children: z.array(z.any()).describe("child components"),
  }),
  component: ({ props, renderNode }) => (
    <div className="grid gap-6 md:grid-cols-2">
      {(props.children as unknown[]).map((child, i) => (
        <div key={i}>{renderNode(child)}</div>
      ))}
    </div>
  ),
});

export const AssistantNote = defineComponent({
  name: "AssistantNote",
  description:
    "The ONLY free-text component. Short assistant commentary (section intro, why this matters). Visually distinct from sourced data.",
  props: z.object({ text: z.string().describe("1-3 sentences of plain text") }),
  component: ({ props }) => (
    <aside className="border-2 border-dashed border-border bg-secondary/40 p-4">
      <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        Assistant note
      </p>
      <p className="mt-1 text-sm">{props.text}</p>
    </aside>
  ),
});

export const SourceTrustLabel = defineComponent({
  name: "SourceTrustLabel",
  description:
    "Small trust label naming the kind of source backing nearby content. Data components already carry their own source footers — use this only for standalone labeling.",
  props: z.object({
    kind: z
      .enum(["official", "campaign", "reported", "reference", "ad-library"])
      .describe(
        "source kind: \"official\" | \"campaign\" | \"reported\" | \"reference\" | \"ad-library\"",
      ),
  }),
  component: ({ props }) => <GuideSourceTrustLabel kind={props.kind} />,
});

export const BriefHeader = defineComponent({
  name: "BriefHeader",
  description:
    "Brief masthead with primary date and days-to-election countdown. Always place first. Takes no arguments.",
  props: z.object({}),
  component: () => <BriefHeaderView />,
});

export const DeadlineBanner = defineComponent({
  name: "DeadlineBanner",
  description: "High-visibility banner for one voting deadline.",
  props: z.object({
    kind: z.enum([
      "registration",
      "absentee_request",
      "absentee_return",
      "early_voting",
    ]),
  }),
  component: ({ props }) => <DeadlineBannerView kind={props.kind} />,
});

export const VotingChecklist = defineComponent({
  name: "VotingChecklist",
  description:
    "Actionable checklist of registration, absentee, early-voting and election-day steps with official deadlines. Place near the top. Takes no arguments.",
  props: z.object({}),
  component: () => <VotingChecklistView />,
});

export const RaceCard = defineComponent({
  name: "RaceCard",
  description:
    "Summary card for one race: office, level, incumbent, candidate names. raceId is a natural key like \"WI-GOV-2026\".",
  props: z.object({ raceId: z.string().describe("race natural key") }),
  component: ({ props }) => <BriefRaceCardView raceId={props.raceId} />,
});

export const CandidateCompareCard = defineComponent({
  name: "CandidateCompareCard",
  description:
    "Side-by-side matrix comparing up to 4 candidates in one race (party, status, priorities, cash on hand) with a link to the full race.",
  props: z.object({
    raceId: z.string().describe("race natural key"),
    candidateSlugs: z
      .array(z.string())
      .max(4)
      .describe("up to 4 candidate slugs from that race"),
  }),
  component: ({ props }) => (
    <CandidateCompareCardView
      raceId={props.raceId}
      candidateSlugs={props.candidateSlugs}
    />
  ),
});

export const IssueStanceCard = defineComponent({
  name: "IssueStanceCard",
  description:
    "One candidate's published stance on one issue, with summary and source link.",
  props: z.object({
    candidateSlug: z.string().describe("candidate slug"),
    issueSlug: z.string().describe("issue slug, e.g. \"abortion\""),
  }),
  component: ({ props }) => (
    <IssueStanceCardView
      candidateSlug={props.candidateSlug}
      issueSlug={props.issueSlug}
    />
  ),
});

export const QuoteCard = defineComponent({
  name: "QuoteCard",
  description:
    "Up to two published, sourced quotes from one candidate. Renders nothing if none are published.",
  props: z.object({ candidateSlug: z.string().describe("candidate slug") }),
  component: ({ props }) => <QuoteCardView candidateSlug={props.candidateSlug} />,
});

export const FinanceSnapshot = defineComponent({
  name: "FinanceSnapshot",
  description:
    "Campaign money panel for one candidate: raised/spent/cash/debts, top org donors, and pass-through funding drill-down.",
  props: z.object({ candidateSlug: z.string().describe("candidate slug") }),
  component: ({ props }) => (
    <FinanceSnapshotView candidateSlug={props.candidateSlug} />
  ),
});

export const briefLibrary = createLibrary({
  root: "Stack",
  components: [Stack, Grid, AssistantNote, SourceTrustLabel, BriefHeader, DeadlineBanner, VotingChecklist, RaceCard, CandidateCompareCard, IssueStanceCard, QuoteCard, FinanceSnapshot],
});
