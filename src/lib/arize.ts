/** MOO-313: deep links from /admin into the Arize UI for trace provenance.
 * IDs are UI-path identifiers, not secrets — the pages require an Arize login. */

const BASE = "https://app.arize.com";
const ORG_ID = "QWNjb3VudE9yZ2FuaXphdGlvbjo0MzA4NjpHK1VD";
const SPACE_ID = "U3BhY2U6NDU0NjU6SWVhZA==";
const PROJECT_ID = "TW9kZWw6ODgzOTMxNjQxOTo3NzFI"; // badgerbrief project

const DAY_MS = 24 * 60 * 60 * 1000;

/** Trace deep-link. `aroundMs` (e.g. the draft's extractedAt) tightens the
 * required time window to ±1 day; omitted → last 90 days (slower to load). */
export function arizeTraceUrl(traceId: string, aroundMs?: number): string {
  const end = aroundMs !== undefined ? aroundMs + DAY_MS : Date.now();
  const start = aroundMs !== undefined ? aroundMs - DAY_MS : end - 90 * DAY_MS;
  const params = new URLSearchParams({
    selectedTraceId: traceId,
    queryFilterA: "",
    selectedTab: "llmTracing",
    timeZoneA: "America/Chicago",
    startA: String(start),
    endA: String(end),
    envA: "tracing",
    modelType: "generative_llm",
  });
  return `${BASE}/organizations/${ORG_ID}/spaces/${SPACE_ID}/projects/${PROJECT_ID}?${params}`;
}
