/**
 * Canonical official-source links for Wisconsin voting actions (MOO-310).
 * The Voter Help agent hands these off for procedural questions so the model
 * never invents URLs. React-free so convex code can import it relatively.
 */
export const OFFICIAL_LINKS = {
  register: {
    label: "Register to vote — MyVote Wisconsin",
    url: "https://myvote.wi.gov/en-us/Register-To-Vote",
  },
  absentee: {
    label: "Request an absentee ballot — MyVote Wisconsin",
    url: "https://myvote.wi.gov/en-us/Vote-Absentee-By-Mail",
  },
  pollingPlace: {
    label: "Find your polling place — MyVote Wisconsin",
    url: "https://myvote.wi.gov/en-us/Find-My-Polling-Place",
  },
  myBallot: {
    label: "Preview your official ballot — MyVote Wisconsin",
    url: "https://myvote.wi.gov/en-us/My-Voter-Info",
  },
  voterId: {
    label: "Acceptable photo ID for voting — Bring It Wisconsin",
    url: "https://bringit.wi.gov",
  },
  electionsCommission: {
    label: "Wisconsin Elections Commission",
    url: "https://elections.wi.gov",
  },
  general: {
    label: "MyVote Wisconsin — official voter portal",
    url: "https://myvote.wi.gov",
  },
} as const;

export type OfficialLinkTopic = keyof typeof OFFICIAL_LINKS;

export const OFFICIAL_LINK_TOPICS = Object.keys(OFFICIAL_LINKS) as OfficialLinkTopic[];
