import type { ChromeDict } from "./chrome-dict";

/** Verbatim current English chrome strings — lifting these unchanged is what
 * keeps English-route rendering byte-identical after chrome.tsx goes locale-aware. */
export const chromeEn: ChromeDict = {
  navLabels: {
    "/races/wi-gov-2026": "Races",
    "/match": "What Matters",
    "/ads": "Ad Tracker",
    "/news": "News",
    "/forecast": "Forecast",
    "/vote": "How to vote",
    "/chat": "Voter Help",
    "/brief": "My Brief",
    "/about": "About",
    "/methodology": "Methodology",
  },
  ctaAug11: "Aug 11",
  footer: {
    mission:
      "BadgerBrief is a non-partisan, source-linked Wisconsin voter guide. " +
      "We link every claim to its source, label official information apart " +
      "from campaign claims and reporting, and never make endorsements.",
    missionLink: "How we source and verify",
    myVote:
      "Voting logistics are always confirmed against official sources — for " +
      "registration, absentee ballots, and polling places, the Wisconsin " +
      "Elections Commission's",
    myVoteLink: "MyVote Wisconsin",
    myVoteSuffix: "is the authoritative system.",
    about: "About BadgerBrief",
    methodology: "Methodology",
    reportError: "Report an error",
    support: "Support this project",
    contribute: "Help improve this guide",
    financeDisclaimer:
      "Campaign finance data for Wisconsin state offices comes from the " +
      "Wisconsin Ethics Commission's Sunshine database and is used for " +
      "non-commercial voter education only, per Wis. Stat. § 11.1304(12). " +
      "Federal campaign finance data comes from the FEC.",
  },
};
