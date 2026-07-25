import type { ReactNode } from "react";
import type { Doc } from "../../../convex/_generated/dataModel";

export type VotingInfo = Doc<"voting_info">;
export type VoterAccessRow = Doc<"voter_access">;

export type Faq = { q: string; a: string };

export type VoteDict = {
  lang: "en" | "es";
  meta: { title: string; description: string };
  h1: string;
  intro: (info: VotingInfo, myVoteLabel: string) => ReactNode;
  faqs: (info: VotingInfo, d: {
    registration: [string, string][];
    absenteeRequest: [string, string][];
    absenteeReturn: [string, string][];
    early?: { available?: boolean; start_date?: string; end_date?: string };
  }) => Faq[];
  deadlineLabel: (key: string) => string;      // "by_mail" → "por correo"
  checklist: { title: string; register: string; requestAbsentee: string; returnAbsentee: string; vote: string };
  sourcesTitle: string;
  lastUpdatedPrefix: string;
  situation: { title: string; blurb: string };
  accessText: (row: VoterAccessRow) => { title: string; summary: string; details: string };
  crumbs: { home: string; vote: string };
  toggle: { label: string; href: string };
  myVoteLabel: string;
};
