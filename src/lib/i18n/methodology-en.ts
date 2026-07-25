export type MethodologyDict = {
  lang: "en" | "es";
  meta: { title: string; description: string };
  h1: string;
  intro: string;
  sections: {
    nonpartisan: { heading: string; body: string };
    dataSources: {
      heading: string;
      votingLogistics: { label: string; before: string; linkText: string; after: string };
      racesCandidates: { label: string; body: string };
      campaignFinance: { label: string; body: string };
      politicalAds: { label: string; body: string };
    };
    publishing: { heading: string; before: string; emText: string; after: string };
    qualityChecks: { heading: string; body: string };
    corrections: {
      heading: string;
      p1Before: string;
      reportLinkText: string;
      p1After: string;
      whatHappensLabel: string;
      whatHappensBody: string;
      whyMattersLabel: string;
      whyMattersBody: string;
      p2Before: string;
      issueLinkText: string;
      p2After: string;
    };
  };
};

/** Verbatim current English Methodology-page strings — lifting these
 * unchanged is what keeps the English route rendering byte-identical after
 * extraction. */
export const methodologyEn: MethodologyDict = {
  lang: "en",
  meta: {
    title: "Methodology",
    description:
      "How BadgerBrief sources, verifies, and publishes Wisconsin election information: official sources first, every claim linked, human review before anything publishes, and continuous automated quality checks.",
  },
  h1: "Methodology",
  intro:
    "BadgerBrief is a non-partisan, source-linked Wisconsin voter guide. This page explains how information gets onto the site and how we keep it honest.",
  sections: {
    nonpartisan: {
      heading: "Non-partisan policy",
      body:
        "BadgerBrief never endorses, ranks, or recommends candidates or parties. Candidate positions are presented descriptively, in the candidate's own words or as attributed by the cited source. Our assistant is instructed to refuse endorsement requests and legal advice, and those refusals are among the behaviors we test continuously (see “Quality checks” below).",
    },
    dataSources: {
      heading: "Where the data comes from",
      votingLogistics: {
        label: "Voting logistics",
        before: " (registration, absentee, early voting, voter ID, polling hours): Wisconsin Elections Commission and",
        linkText: "MyVote Wisconsin",
        after: ", which is always the authoritative system for taking action.",
      },
      racesCandidates: {
        label: "Races and candidates",
        body: ": official filings and public reference sources (Ballotpedia, candidate campaign sites, Wisconsin news outlets), each linked from the page where it's used.",
      },
      campaignFinance: {
        label: "Campaign finance",
        body: ": the FEC API for federal offices and the Wisconsin Ethics Commission's Sunshine database for state offices, used for non-commercial voter education only, per Wis. Stat. § 11.1304(12).",
      },
      politicalAds: {
        label: "Political advertising",
        body: ": public ad archives and FCC public inspection files, with the source document linked on every record.",
      },
    },
    publishing: {
      heading: "How candidate positions and quotes get published",
      before:
        "Software assistants read approved sources (campaign sites and news articles a human editor approved first) and extract candidate positions and quotes as ",
      emText: "drafts",
      after:
        ", each carrying its source link and a verbatim evidence excerpt. Nothing a machine writes is published automatically: every draft goes through an editorial review queue where a human approves, edits, or rejects it. Only approved, source-linked records appear on the site, and every published record keeps a full audit trail of who approved it and when.",
    },
    qualityChecks: {
      heading: "Quality checks",
      body:
        "Every assistant run is traced, and a sampled share of production activity is scored continuously by automated evaluators for citation faithfulness, neutrality, official-source-first behavior, and refusal correctness. Before any change to an assistant ships, it must pass a fixed test set of voter questions with known-correct properties; regressions block the change. Score drops raise internal alerts reviewed by the editor.",
    },
    corrections: {
      heading: "Corrections",
      p1Before:
        "See something wrong? Every fact on the site links to its source so you can check it yourself — and if we got it wrong, ",
      reportLinkText: "report it here",
      p1After: ". The form asks which page and a link to the record, so it can be checked against the original.",
      whatHappensLabel: "What happens next.",
      whatHappensBody:
        " Every report is read by a person. Anything reporting a factual error — a vote, a name, a figure, a date — is checked against the source it came from and, if we got it wrong, corrected on the site. We aim to do that within two business days, and faster for anything affecting a candidate's voting record, where a mistake misstates what someone actually did. Corrections are made to the page itself rather than logged elsewhere, so the record you read is always the corrected one.",
      whyMattersLabel: "Why this matters here.",
      whyMattersBody:
        " Most of this site is assembled automatically. Each roll call is reconciled against the totals the document itself publishes, which catches a miscount — but arithmetic cannot catch a document that adds up and is still wrong. No person reviews every parsed record before it is published, so readers are the last check, and reports are treated accordingly.",
      p2Before: "If you'd rather file it publicly, the code is open source and you can ",
      issueLinkText: "open an issue",
      p2After: ".",
    },
  },
};
