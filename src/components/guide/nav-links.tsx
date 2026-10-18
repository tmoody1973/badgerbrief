/** Single source of truth for site navigation (desktop row + mobile menu). */
export const NAV_LINKS = [
  { href: "/ballot", label: "My Ballot" },
  { href: "/races", label: "Races" },
  { href: "/match", label: "What Matters" },
  { href: "/ads", label: "Ad Tracker" },
  { href: "/news", label: "News" },
  { href: "/vote", label: "How to vote" },
  { href: "/chat", label: "Voter Help" },
  { href: "/brief", label: "My Brief" },
  { href: "/about", label: "About" },
  { href: "/methodology", label: "Methodology" },
] as const;
