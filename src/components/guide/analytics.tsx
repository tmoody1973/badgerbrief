"use client";

import { Analytics as VercelAnalytics } from "@vercel/analytics/next";

/**
 * Web Analytics with a privacy guard (MOO-336).
 *
 * `beforeSend` strips query strings from every reported URL. People type home
 * addresses into this site; if a future search or lookup ever puts one in a
 * query param, page views must not carry it. Cheaper to enforce here once than
 * to audit every future link.
 */
export function Analytics() {
  return (
    <VercelAnalytics
      beforeSend={(event) => {
        try {
          const url = new URL(event.url);
          if (url.search) {
            url.search = "";
            return { ...event, url: url.toString() };
          }
        } catch {
          // unparseable URL — report unchanged rather than drop the event
        }
        return event;
      }}
    />
  );
}
