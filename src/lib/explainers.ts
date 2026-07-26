export type ExplainerTopic =
  | "stance-labels"
  | "campaign-finance"
  | "voting-record"
  | "sourced-position-vs-claim";

export const EXPLAINERS: Record<
  ExplainerTopic,
  { summary: string; body: string; learnMore?: string }
> = {
  "stance-labels": {
    summary: "What do these stance labels mean?",
    body:
      "Each label describes how a candidate has spoken about an issue, drawn from a sourced statement — not our opinion. Support and oppose mean they've clearly taken that side. Mixed means their statements point both ways. Evolving means their stated position has changed over time. Unclear means we couldn't find a clear public statement. Every label links to the source it came from.",
    learnMore: "/methodology",
  },
  "campaign-finance": {
    summary: "How do I read these campaign-finance numbers?",
    body:
      "Individual contributions come from people; PAC (political action committee) money comes from organized groups. Cash-on-hand is what a campaign has left to spend. Money shows who is backing a campaign — it is not an endorsement by us, and more money does not mean a candidate is better.",
    learnMore: "/methodology",
  },
  "voting-record": {
    summary: "What is a voting record showing me?",
    body:
      "A roll-call vote is a recorded yes/no vote in the legislature; 'aye' means yes and 'no' means no. A 'deciding vote' is one that changed the outcome. These are the candidate's actual recorded votes, linked to the official record.",
    learnMore: "/methodology",
  },
  "sourced-position-vs-claim": {
    summary: "Sourced position vs. campaign claim — what's the difference?",
    body:
      "A sourced position is something we tied to a specific public statement, with a link. A campaign claim is what a candidate's own site says about their priorities. We keep them separate so you can see the difference between a documented stance and a self-description.",
    learnMore: "/methodology",
  },
};
