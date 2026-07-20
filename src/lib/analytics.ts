"use client";

import { track as vercelTrack } from "@vercel/analytics";

/**
 * Product analytics for BadgerBrief (MOO-336).
 *
 * PRIVACY RULE — this is a civic site where people type their home address to
 * find their districts. No event may ever carry an address, a district number,
 * a question a voter typed, an email, or a user id. The event union below is
 * closed on purpose: adding a property means editing this file, which is where
 * that rule gets enforced. `beforeSend` in the layout strips query strings as a
 * second layer.
 *
 * The events are chosen to answer questions we actually have:
 *  - Does the sourcing get used? (`source_expand`, `source_click`) — this is the
 *    product's whole differentiator; if nobody opens a source, the thesis is wrong.
 *  - Do people take a real civic action? (`official_link_click`) — north star.
 *  - Does the ballot lookup succeed? (`ballot_lookup`) — a low ok-rate is a bug.
 *  - Which races get attention? (`race_view`) — editorial prioritisation.
 *  - Did the MOO-329/330 jump nav earn its keep? (`section_jump`)
 */
type Events = {
  // NOTE: no race_view / candidate_view events — Vercel already reports page
  // views per route, so those would be duplicate data with extra PII surface.

  // — the trust thesis
  source_expand: { context: "position" | "race" | "candidate" };
  source_click: { kind: "official" | "reported" | "campaign" | "reference" | "ad-library" };
  official_link_click: { topic: "register" | "absentee" | "polling" | "myvote" | "other" };

  // — navigation (validates the scroll-UX work)
  section_jump: { section: string };
  fold_expand: { kind: "not_on_ballot" | "finance_rows" | "quotes" | "funding_trace" };

  // — agent features
  voter_help_ask: Record<string, never>; // NEVER the question text
  voter_help_answered: { ok: boolean };
  brief_generate: { detail: "short" | "standard" | "deep" };

  // — account funnel
  auth_start: { intent: "sign_in" | "sign_up"; from: "nav" | "brief" };

  // — ballot lookup (status only — never the address)
  ballot_lookup: { status: "ok" | "no_match" | "error" };
};

/** Type-safe wrapper. Fails closed: analytics must never break a page render. */
export function track<K extends keyof Events>(
  name: K,
  ...args: Events[K] extends Record<string, never> ? [] : [Events[K]]
): void {
  try {
    vercelTrack(name, (args[0] ?? undefined) as Record<string, string | number | boolean> | undefined);
  } catch {
    // swallow — a voter guide must render even if analytics is blocked
  }
}
