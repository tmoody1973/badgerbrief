import type { UIMessage } from "@convex-dev/agent/react";

/**
 * What Voter Help can look up, in the voter’s words: the label shown on each answer's
 * "Checked" line, and what that source holds. Keys are the
 * chat's tool names (convex/voterHelp.ts). A tool missing here is simply not
 * listed, so a new tool never shows up by its code name.
 */
export const SOURCES: Record<string, { label: string; about: string }> = {
  getVotingInfo: { label: "Voting dates and rules", about: "registration and absentee deadlines, early voting, poll hours and voter ID, from official sources" },
  getVoterAccess: { label: "Voter access info", about: "the rules for situations such as a name change, a disability, homelessness or a past felony conviction" },
  getMyBallot: { label: "Your ballot", about: "the races for the address you saved, when you are signed in" },
  matchBallotByIssues: { label: "Positions by issue", about: "which candidates on your ballot have a published position on the issues you name" },
  getRaceInfo: { label: "Race records", about: "who is on the November 3 ballot for an office, from the state’s certified list, with positions and campaign money" },
  getCandidateInfo: { label: "Candidate records", about: "a candidate’s published positions and quotes, each with its source, and campaign money" },
  getQuestionnaireAnswers: { label: "Wisconsin Watch questionnaire", about: "the candidates’ own answers to the same questions from Wisconsin Watch, a nonprofit newsroom, quoted word for word" },
  getCoverage: { label: "News coverage", about: "news stories BadgerBrief tracks about a candidate" },
  getVotingRecord: { label: "Voting record", about: "how a current or former legislator or member of Congress voted on bills" },
  getLabelGlossary: { label: "Label definitions", about: "what political labels such as socialism mean, with sources" },
  handoffOfficialLink: { label: "Official links", about: "the official page for taking action, such as MyVote Wisconsin" },
};

/** Each source checked, once, in the order used. Only the tool's name is read, never its input. */
export function toolLabels(message: UIMessage): string[] {
  const labels = message.parts.flatMap((p) => {
    const label = p.type.startsWith("tool-") ? SOURCES[p.type.slice("tool-".length)]?.label : undefined;
    return label ? [label] : [];
  });
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
