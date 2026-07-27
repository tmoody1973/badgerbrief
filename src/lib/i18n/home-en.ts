export type HomeDict = {
  lang: "en" | "es";
  meta: { title: string; description: string };
  crumbs: { home: string };
  stamp: string;
  h1: string;
  introBeforeDate: string;
  introAfterDate: string;
  primaryDateFallback: string;
  howToVoteCta: string;
  governorsRaceCta: string;
  matchCta: string;
  startHereCta?: string;
  deadlines: {
    heading: string;
    pollsOpenPrefix: string;
    detailsPrefix: string;
    linkText: string;
    suffix: string;
  };
  races: {
    heading: string;
    countSuffix: string;
    districtRacesSummary: (count: number) => string;
  };
  support: {
    heading: string;
    body: string;
    wipPrefix: string;
    wipLinkText: string;
    wipSuffix: string;
    cta: string;
  };
};

/** Verbatim current English homepage strings — lifting these unchanged is
 * what keeps the English route rendering byte-identical after extraction. */
export const homeEn: HomeDict = {
  lang: "en",
  meta: {
    title: "BadgerBrief — Wisconsin Voter Guide 2026",
    description:
      "Non-partisan, source-linked Wisconsin voter guide: your ballot, the candidates, the money, and exactly how to vote.",
  },
  crumbs: { home: "Home" },
  stamp: "Wisconsin 2026",
  h1: "Know your ballot before you fill it in.",
  introBeforeDate: "The Wisconsin partisan primary is",
  introAfterDate:
    ". This is a non-partisan, source-linked guide to every statewide and congressional race on it — who's running, what they say, and exactly how to vote.",
  primaryDateFallback: "August 11, 2026",
  howToVoteCta: "How to vote →",
  governorsRaceCta: "Governor's race",
  matchCta: "What matters to you? →",
  startHereCta: "New here? Start here →",
  deadlines: {
    heading: "When are the 2026 Wisconsin primary deadlines?",
    pollsOpenPrefix: "Polls are open",
    detailsPrefix: "Absentee, registration, and early-voting details are on the",
    linkText: "how-to-vote page",
    suffix: ", with every deadline linked to its official source.",
  },
  races: {
    heading: "What races are on the Wisconsin 2026 primary ballot?",
    countSuffix: " races: statewide offices, all eight U.S. House districts, the state supreme court, and the legislature.",
    districtRacesSummary: (count) => `Find your district races (${count})`,
  },
  support: {
    heading: "One person builds this guide",
    body:
      "I build and host BadgerBrief myself — no ads, no paywall, no campaign or party money. Keeping it online and updated through the election comes out of my own pocket. If it helped you make sense of your ballot, tap the ☕ Support me button in the corner — any amount keeps it going.",
    wipPrefix: "This is a work in progress. Spot an error? ",
    wipLinkText: "Tell me on the feedback form",
    wipSuffix: ".",
    cta: "Support the work →",
  },
};
