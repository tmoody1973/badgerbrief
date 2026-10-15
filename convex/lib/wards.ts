/**
 * City of Milwaukee voting wards and their Election Day polling places, from
 * the city's "Voting Wards and Polling Places" map service (data.milwaukee.gov
 * dataset voting-wards, CC BY, refreshed nightly by the city).
 *
 * Pure: no network, no Convex ctx. The nightly copy lives in the `mke_wards`
 * table (convex/mkeWards.ts), so a voter's map point is matched here and never
 * sent to the city.
 *
 * Covers the City of Milwaukee only, and Election Day only: early in-person
 * voting happens at different sites.
 */

export type WardRow = {
  ward: string;
  pollingPlaceId: number;
  pollingPlace: string;
  address: string;
  mainEntrance?: string;
  accessibleEntrance?: string;
  mainParking?: string;
  accessibleParking?: string;
  /** [minLon, minLat, maxLon, maxLat], a cheap first test before the exact one. */
  bbox: number[];
  /** Polygon rings as [lon, lat] pairs; the first is the outline, any others are holes. */
  rings: number[][][];
};

type Feature = {
  properties: Record<string, unknown>;
  geometry: { type: string; coordinates: unknown };
};

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/** The city's GeoJSON -> rows. Throws when the download looks incomplete. */
export function parseWards(geojson: unknown, minimum: number): WardRow[] {
  const features = ((geojson as { features?: Feature[] })?.features ?? []).filter(
    (f) => f?.geometry?.type === "Polygon" && text(f.properties?.WARD) && text(f.properties?.POLLING_PL),
  );
  if (features.length < minimum) {
    throw new Error(`ward map returned ${features.length} wards, expected at least ${minimum}; keeping the previous copy`);
  }
  return features.map((f) => {
    const p = f.properties;
    const rings = f.geometry.coordinates as number[][][];
    const points = rings.flat();
    const lons = points.map((pt) => pt[0]);
    const lats = points.map((pt) => pt[1]);
    return {
      ward: text(p.WARD)!,
      pollingPlaceId: Number(p.PollingPlaceID),
      pollingPlace: text(p.POLLING_PL)!,
      address: text(p.ADDRESS) ?? "",
      mainEntrance: text(p.MAIN_ENTR),
      accessibleEntrance: text(p.ACSBL_ENTR),
      mainParking: text(p.MAIN_PKNG),
      accessibleParking: text(p.ACSBL_PKNG),
      bbox: [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)],
      rings,
    };
  });
}

/** Even-odd ray casting across every ring, so holes are excluded. */
function inside(lon: number, lat: number, rings: number[][][]): boolean {
  let hit = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
    }
  }
  return hit;
}

/** The ward containing this map point, or null outside the City of Milwaukee. */
export function wardAt<W extends Pick<WardRow, "bbox" | "rings">>(wards: readonly W[], lon: number, lat: number): W | null {
  return (
    wards.find(
      (w) => lon >= w.bbox[0] && lat >= w.bbox[1] && lon <= w.bbox[2] && lat <= w.bbox[3] && inside(lon, lat, w.rings),
    ) ?? null
  );
}
