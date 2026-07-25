"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { initPostHog, posthog, posthogReady } from "@/lib/posthog";

/**
 * Boots PostHog once on mount and captures a PATH-ONLY pageview on each route
 * change (App Router client navigations don't fire a full page load, so
 * pageviews must be sent manually).
 *
 * The pageview carries the pathname WITHOUT the query string — never a search
 * term, never an address that a future link might put in a param. That, plus
 * the config in lib/posthog.ts, is why this is safe to run on every page
 * including the ballot lookup.
 *
 * Renders nothing. No-ops without a key.
 */
export function PostHogProvider() {
  const pathname = usePathname();

  useEffect(() => {
    initPostHog();
  }, []);

  useEffect(() => {
    if (!posthogReady() || !pathname) return;
    posthog.capture("$pageview", {
      // origin + pathname only — the search string is deliberately dropped.
      $current_url: window.location.origin + pathname,
    });
  }, [pathname]);

  return null;
}
