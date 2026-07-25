export type AboutDict = {
  lang: "en" | "es";
  meta: { title: string; description: string };
  crumbs: { home: string; about: string };
  h1: string;
  intro: string;
  reportMistake: string;
  independent: {
    heading: string;
    fundingLabel: string;
    fundingBody: string;
    affiliationLabel: string;
    affiliationBody: string;
    endorsementsLabel: string;
    endorsementsBody: string;
    footer: string;
  };
  facts: {
    heading: string;
    p1: string;
    p2Before: string;
    p2LinkText: string;
    p2After: string;
  };
  who: {
    heading: string;
    p1Before: string;
    p1After: string;
    disclosureLabel: string;
    disclosureBody: string;
    p3: string;
  };
  wrong: {
    heading: string;
    p1: string;
    reportCta: string;
  };
};

/** Verbatim current English About-page strings — lifting these unchanged is
 * what keeps the English route rendering byte-identical after extraction.
 * This includes the Radio Milwaukee / Plan Commission disclosure, which is
 * sensitive, accuracy-critical content. */
export const aboutEn: AboutDict = {
  lang: "en",
  meta: {
    title: "About BadgerBrief",
    description:
      "BadgerBrief is an independent, non-partisan Wisconsin voter guide. No funding, no ads, no party or campaign affiliation — every claim links to its official source.",
  },
  crumbs: { home: "Home", about: "About" },
  h1: "About BadgerBrief",
  intro:
    "BadgerBrief is an independent, non-partisan guide to Wisconsin’s 2026 elections. It exists to answer one question as plainly as possible: who is on your ballot, and what have they actually done?",
  reportMistake: "See a mistake? Report an error →",
  independent: {
    heading: "Independent, and unfunded",
    fundingLabel: "Funding",
    fundingBody: "Self-funded — no advertising, sponsorships, donations, grants, or party/PAC money.",
    affiliationLabel: "Affiliation",
    affiliationBody: "No party, campaign, PAC or advocacy group. Nobody has editorial input.",
    endorsementsLabel: "Endorsements",
    endorsementsBody: "None, ever. Candidates are never rated, ranked or recommended.",
    footer:
      "Nothing on this site is paid for, and there is nobody to please. That is the whole reason it can be read the way it is written.",
  },
  facts: {
    heading: "How the facts get here",
    p1:
      "Almost nothing here is typed in by hand. Ballots come from the Wisconsin Elections Commission’s official candidate list — the names are printed exactly as a voter sees them in the booth. Voting records are parsed directly from the Legislature’s own roll-call documents and the U.S. House Clerk’s records, and every one is reconciled against the totals the document itself publishes before it is stored. Campaign finance comes from the Wisconsin Ethics Commission and the FEC.",
    p2Before:
      "When a document cannot be reconciled, it is discarded rather than published — an incomplete record is worse than a missing one.",
    p2LinkText: "The full methodology",
    p2After:
      "explains each source, how positions and quotes are reviewed before publication, and what the checks cannot catch.",
  },
  who: {
    heading: "Who makes it",
    p1Before: "BadgerBrief is built and maintained by",
    p1After: " in Milwaukee, independently and in his own time.",
    disclosureLabel: "In the interest of full disclosure:",
    disclosureBody:
      " Tarik is Director of Strategy and Innovation at Radio Milwaukee, and an appointed commissioner of the Milwaukee City Plan Commission. Both are stated here on purpose. The Plan Commission is a city land-use body — it has no role in the state legislative, congressional, or statewide races this guide covers — and he has no involvement in any race on BadgerBrief. Every candidate is treated identically, by the same sourced method, with no endorsements. Neither role funds or directs this site.",
    p3:
      "This is not a news organisation and does not claim to be one. It is one person’s attempt to make public records legible, held to a simple rule: if a claim is on this site, its source is one click away, and if it turns out to be wrong, it gets corrected in public.",
  },
  wrong: {
    heading: "If something is wrong",
    p1:
      "Assembling records automatically means mistakes are possible, and the checks are arithmetic — they can confirm that a roll call adds up, not that it says what the Legislature meant. Readers are the last check, and reports are read by a person.",
    reportCta: "Report an error →",
  },
};
