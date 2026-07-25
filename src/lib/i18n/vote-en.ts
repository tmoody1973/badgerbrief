import { Fragment, createElement } from "react";
import type { VoteDict } from "./vote-dict";

// "by_mail" -> "by mail" — shared by dict.deadlineLabel and inline FAQ text
// so both stay in sync without a self-referential call into `voteEn`.
function humanizeKey(key: string): string {
  return key.replaceAll("_", " ");
}

export const voteEn: VoteDict = {
  lang: "en",
  meta: {
    title: "How to vote in the Wisconsin 2026 primary",
    description:
      "Registration deadlines, absentee ballot rules, early voting dates, photo ID requirements, and polling hours for the August 11, 2026 Wisconsin primary — every rule linked to its official source.",
  },
  h1: "How do I vote in the Wisconsin 2026 primary?",
  intro: (info, myVoteLabel) =>
    createElement(
      Fragment,
      null,
      "The primary is ",
      createElement("strong", null, info.primaryDate),
      ", polls open ",
      info.pollsOpen,
      "–",
      info.pollsClose,
      ". Everything below links to official sources; for your polling place and personal registration status, use ",
      createElement(
        "a",
        {
          href: info.officialVoterInfoUrl,
          className: "font-bold underline decoration-2 underline-offset-2",
          rel: "noopener noreferrer",
          target: "_blank",
        },
        myVoteLabel,
      ),
      " — the state's official system.",
    ),
  faqs: (info, d) => [
    {
      q: "When is the 2026 Wisconsin primary election?",
      a: `The Wisconsin partisan primary is ${info.primaryDate}. Polls are open ${info.pollsOpen} to ${info.pollsClose} ${info.timezone ?? ""}.`.trim(),
    },
    {
      q: "How do I register to vote in Wisconsin?",
      a:
        d.registration
          .map(([mode, deadline]) => `${humanizeKey(mode)}: ${deadline}`)
          .join("; ") +
        ". Wisconsin allows same-day registration at the polls with proof of residence. Register at myvote.wi.gov.",
    },
    {
      q: "How do I request an absentee ballot in Wisconsin?",
      a:
        d.absenteeRequest
          .map(([mode, deadline]) => `${humanizeKey(mode)}: ${deadline}`)
          .join("; ") + ". Request through myvote.wi.gov.",
    },
    {
      q: "When must my Wisconsin absentee ballot be returned?",
      a: d.absenteeReturn
        .map(([mode, deadline]) => `${humanizeKey(mode)}: ${deadline}`)
        .join("; "),
    },
    ...(d.early?.available
      ? [
          {
            q: "Does Wisconsin have early voting in 2026?",
            a: `Yes. In-person absentee (early) voting runs ${d.early.start_date} through ${d.early.end_date}. Locations and hours vary by municipality — check myvote.wi.gov.`,
          },
        ]
      : []),
    {
      q: "Do I need a photo ID to vote in Wisconsin?",
      a: info.photoIdRequired
        ? "Yes. Wisconsin requires an acceptable photo ID to vote (driver's license, state ID, passport, military ID, and certain student IDs)."
        : "Check current requirements at myvote.wi.gov.",
    },
  ],
  deadlineLabel: humanizeKey,
  checklist: {
    title: "Deadline checklist",
    register: "Register",
    requestAbsentee: "Request absentee",
    returnAbsentee: "Return absentee",
    vote: "Vote",
  },
  sourcesTitle: "Official sources",
  lastUpdatedPrefix: "Last updated:",
  situation: {
    title: "Your situation",
    blurb:
      "Answers to common eligibility questions. Every rule links to its official source. These are general rules, not legal advice — for a specific situation, use the official link.",
  },
  accessText: (row) => ({
    title: row.title,
    summary: row.summary,
    details: row.details,
  }),
  crumbs: { home: "Home", vote: "How to vote" },
  toggle: { label: "Español", href: "/es/vote" },
  myVoteLabel: "MyVote Wisconsin",
};
