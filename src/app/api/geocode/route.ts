import { NextRequest, NextResponse } from "next/server";
import { parseGeocoderResponse } from "@/lib/districts";
import { createLimiter } from "@/lib/rate-limit";

/**
 * Server proxy for the Census geocoder (it sends no CORS headers, so the
 * browser can't call it directly). Free, no key. MOO-307.
 *
 * POST only: the address travels in the request body, where it stays out of
 * the web address and so out of server logs and browser history.
 */

const CENSUS_URL =
  "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress";

// The lookup calls a free federal service on every visitor's behalf.
const limit = createLimiter({ limit: 12, windowMs: 10 * 60_000 });

// An answer derived from someone's address is never stored by a cache.
const reply = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

/** Vercel sets this header itself, so a visitor cannot choose their own. */
const visitor = (req: NextRequest) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

async function lookup(rawAddress: string, who: string) {
  const address = rawAddress.trim();
  if (address.length < 5 || address.length > 200) return reply({ ok: false, error: "no_match" }, 400);

  // Counted after the address checks out: a malformed request costs the
  // federal service nothing and should not use up a visitor's lookups.
  const allowed = limit(who);
  if (!allowed.ok) return reply({ ok: false, error: "rate_limited" }, 429, { "Retry-After": String(allowed.retryAfterSeconds) });

  const url = `${CENSUS_URL}?${new URLSearchParams({
    address,
    benchmark: "Public_AR_Current",
    vintage: "Current_Current",
    layers: "all",
    format: "json",
  })}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return reply({ ok: false, error: "upstream" }, 502);
    return reply(parseGeocoderResponse(await res.json()));
  } catch {
    return reply({ ok: false, error: "upstream" }, 502);
  }
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return reply({ ok: false, error: "no_match" }, 400);
  }
  const address = typeof body === "object" && body !== null ? (body as { address?: unknown }).address : undefined;
  return lookup(typeof address === "string" ? address : "", visitor(req));
}
