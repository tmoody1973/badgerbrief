import type { UIMessage } from "@convex-dev/agent/react";

/**
 * What Voter Help looked up for an answer, in the voter's words. Keys are the
 * chat's tool names (convex/voterHelp.ts). A tool missing here is simply not
 * listed, so a new tool never shows up by its code name.
 */
const LABELS: Record<string, string> = {
  getVotingInfo: "Voting dates and rules",
  getVoterAccess: "Voter access info",
  getMyBallot: "Your ballot",
  matchBallotByIssues: "Positions by issue",
  getRaceInfo: "Race records",
  getCandidateInfo: "Candidate records",
  getQuestionnaireAnswers: "Wisconsin Watch questionnaire",
  getCoverage: "News coverage",
  getVotingRecord: "Voting record",
  getLabelGlossary: "Label definitions",
  handoffOfficialLink: "Official links",
};

/** Each source checked, once, in the order used. Only the tool's name is read, never its input. */
export function toolLabels(message: UIMessage): string[] {
  const labels = message.parts.flatMap((p) =>
    p.type.startsWith("tool-") ? [LABELS[p.type.slice("tool-".length)]].filter(Boolean) : [],
  );
  return [...new Set(labels)];
}

/** The voter's messages always; an answer once it has text or is visibly looking something up. */
export function isShown(message: UIMessage): boolean {
  return message.role === "user" || message.text.trim().length > 0 || toolLabels(message).length > 0;
}

export function ToolActivity({ message }: { message: UIMessage }) {
  const labels = toolLabels(message);
  if (labels.length === 0) return null;
  const working = message.text.trim().length === 0;
  return (
    <p
      role={working ? "status" : undefined}
      className="mb-2 font-mono text-xs text-muted-foreground"
    >
      {working ? "Checking " : "Checked: "}
      {labels.join(" · ")}
      {working ? "…" : ""}
    </p>
  );
}
