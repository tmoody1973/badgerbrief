import { NextRequest, NextResponse } from "next/server";
import { parseGeocoderResponse } from "@/lib/districts";

/**
 * Server proxy for the Census geocoder (it sends no CORS headers, so the
 * browser can't call it directly). Free, no key. MOO-307.
 */

const CENSUS_URL =
  "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress";

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address")?.trim() ?? "";
  if (address.length < 5 || address.length > 200) {
    return NextResponse.json({ ok: false, error: "no_match" }, { status: 400 });
  }
  const url = `${CENSUS_URL}?${new URLSearchParams({
    address,
    benchmark: "Public_AR_Current",
    vintage: "Current_Current",
    layers: "all",
    format: "json",
  })}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: "upstream" }, { status: 502 });
    }
    return NextResponse.json(parseGeocoderResponse(await res.json()));
  } catch {
    return NextResponse.json({ ok: false, error: "upstream" }, { status: 502 });
  }
}
