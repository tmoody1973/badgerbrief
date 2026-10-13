"use client";

import { Analytics as VercelAnalytics } from "@vercel/analytics/next";
import { pathOnlyUrl } from "@/lib/analytics-url";

/**
 * Web Analytics with a privacy guard (MOO-336).
 *
 * `beforeSend` strips everything after the path from every reported URL: the
 * "?query" and the "#fragment". People type home addresses into this site, and
 * a shared ballot carries districts after the "#"; page views and events must
 * carry neither. Cheaper to enforce here once than to audit every future link.
 */
export function Analytics() {
  return (
    <VercelAnalytics
      beforeSend={(event) => ({ ...event, url: pathOnlyUrl(event.url) })}
    />
  );
}
