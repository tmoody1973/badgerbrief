import posthog from "posthog-js";

/**
 * PostHog, in the most privacy-defensive configuration the library allows.
 *
 * This is a civic site where people type their home address to find their
 * districts, and trust is the entire product. Every default that could capture
 * something personal is turned OFF here, not masked-and-hoped:
 *
 *  - autocapture OFF        — no automatic click/keystroke/input capture, so the
 *                             address field is never observed at all.
 *  - session recording OFF  — the replay script is not even loaded; there is no
 *                             pixel record of anyone's screen.
 *  - person profiles: identified_only — we never call identify(), so NO person
 *                             profile is ever created. Every event is anonymous.
 *  - respect_dnt ON         — a browser saying "do not track" is obeyed.
 *  - before_send sanitiser  — strips query strings from any URL property, the
 *                             same guard the Vercel layer applies, in case a
 *                             future link ever puts an address in a param.
 *
 * It is a SECOND sink behind the existing `track()` wrapper, which is the single
 * place the PII-free event union is enforced (see analytics.ts). PostHog only
 * ever receives events that wrapper already vetted, plus a path-only pageview.
 *
 * No-ops entirely when NEXT_PUBLIC_POSTHOG_KEY is unset, so the site runs
 * unchanged until a key is wired.
 */
let started = false;

export function initPostHog(): void {
  if (started || typeof window === "undefined") return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;
  started = true;

  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    autocapture: false,
    disable_session_recording: true,
    capture_pageview: false, // captured manually, path-only, in PostHogProvider
    capture_pageleave: false,
    person_profiles: "identified_only",
    respect_dnt: true,
    before_send: (event) => {
      if (!event?.properties) return event;
      for (const k of ["$current_url", "$referrer", "$referring_domain"]) {
        const val = event.properties[k];
        if (typeof val === "string" && val.includes("?")) {
          try {
            const u = new URL(val);
            u.search = "";
            event.properties[k] = u.toString();
          } catch {
            // not a URL — leave it, the wrapper already vets custom props
          }
        }
      }
      return event;
    },
  });
}

/** True once init has actually run with a key — guards the second sink so a
 *  capture before/without init is a silent no-op rather than an error. */
export const posthogReady = () => started;

export { posthog };
