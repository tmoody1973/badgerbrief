import type { Locale } from "./locale";

export type ChromeDict = {
  navLabels: Record<string, string>;
  ctaAug11: string;
  footer: {
    mission: string;
    missionLink: string;
    myVote: string;
    myVoteLink: string;
    myVoteSuffix: string;
    about: string;
    methodology: string;
    reportError: string;
    financeDisclaimer: string;
  };
};

/** "es" iff the path is /es or under /es/, mirroring lang-toggle.tsx's check. */
export function localeFromPath(pathname: string): Locale {
  return pathname === "/es" || pathname.startsWith("/es/") ? "es" : "en";
}
