"use client";

import { createLibrary, defineComponent } from "@openuidev/react-lang";
import { z } from "zod";
import { SourceTrustLabel as GuideSourceTrustLabel } from "@/components/guide/labels";

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
    kind: z.string().describe("source kind, e.g. \"official\", \"FEC\", \"news\""),
  }),
  component: ({ props }) => <GuideSourceTrustLabel kind={props.kind} />,
});

export const briefLibrary = createLibrary({
  root: "Stack",
  components: [Stack, Grid, AssistantNote, SourceTrustLabel],
  // Tasks 2-4 append: BriefHeader, DeadlineBanner, VotingChecklist, RaceCard,
  // CandidateCompareCard, IssueStanceCard, QuoteCard, FinanceSnapshot.
});
