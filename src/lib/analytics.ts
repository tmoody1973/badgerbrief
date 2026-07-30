"use client";

import { track as vercelTrack } from "@vercel/analytics";
import { sendGAEvent } from "@next/third-parties/google";
import { posthog, posthogReady } from "@/lib/posthog";

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

  // — decision-support surfaces (MOO-409). The site informs; these are the
  // features meant to help an undecided voter actually DECIDE. Measuring their
  // use is the whole point. Public slugs/counts only — never a typed answer.
  match_start: Record<string, never>;
  match_complete: { answered: number };
  share: {
    surface: "race" | "candidate" | "compare" | "brief" | "match";
    method: "web_share" | "copy" | "x" | "facebook" | "email" | "bluesky";
  };
  guided_path: { step: string };

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
  const props = (args[0] ?? undefined) as
    | Record<string, string | number | boolean>
    | undefined;
  try {
    vercelTrack(name, props);
  } catch {
    // swallow — a voter guide must render even if analytics is blocked
  }
  // Second sink. Same vetted, PII-free event and props — this wrapper stays the
  // ONE place the privacy rule is enforced, so both sinks are safe by
  // construction. Guarded on posthogReady so a call before init (or with no
  // key) is a silent no-op, never a thrown error into a render.
  try {
    if (posthogReady()) posthog.capture(name, props);
  } catch {
    // swallow — analytics must never break a page
  }
  // Third sink: GA4. Guarded on the Measurement ID so nothing is pushed to the
  // dataLayer on builds where GA is off (dev, or before a property exists) —
  // same vetted, PII-free event and props as the other two sinks.
  try {
    if (process.env.NEXT_PUBLIC_GA_ID) sendGAEvent("event", name, props ?? {});
  } catch {
    // swallow — analytics must never break a page
  }
}
