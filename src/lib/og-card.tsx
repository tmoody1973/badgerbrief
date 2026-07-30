import { ImageResponse } from "next/og";

/**
 * Shared builder for per-page social share cards (candidate + race), so a link
 * to a specific candidate or race previews with THAT candidate/race — not the
 * generic site card. Same neo-brutalist language as the root opengraph-image:
 * cream field, charcoal frame, offset shadow, flat colour blocks, and the
 * built-in sans (no font fetch that could fail a deploy).
 *
 * Callers only assemble copy + an optional photo; the frame lives here once.
 */
export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

// Site palette (globals.css :root), mirrored from the root card.
const CREAM = "#fff7ed";
const INK = "#1c1b1a";
const CARDINAL = "#c5050c";
const BUTTER = "#f6e7b2";

/**
 * Fetch an image and inline it as a data URI, with a hard timeout. Returns null
 * on any failure (missing url, non-image, slow/dead host, network error) so the
 * card falls back cleanly instead of the whole ImageResponse throwing. Runs at
 * build/request time in the Node runtime, where Buffer is available.
 */
export async function fetchImageDataUri(url?: string): Promise<string | null> {
  if (!url) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "image/jpeg";
    if (!type.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/** First letters of the first two words — the no-photo fallback. */
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

const badge = (bg: string, color: string, borderLeft: boolean) =>
  ({
    display: "flex",
    background: bg,
    color,
    border: `4px solid ${INK}`,
    ...(borderLeft ? {} : { borderLeft: "none" }),
    padding: "10px 20px",
    fontSize: 26,
    fontWeight: 800,
    letterSpacing: 1,
  }) as const;

type CardProps = {
  /** Small kicker above the title, e.g. "U.S. HOUSE · WI-03" or "DEM PRIMARY". */
  eyebrow: string;
  /** The headline — candidate name, or the office. */
  title: string;
  /** One-line subtitle under the title. */
  subtitle?: string;
  /** A right-hand portrait. `photo` (data URI) wins; else `initials` block. */
  photo?: string | null;
  initialsText?: string;
};

/** Build the ImageResponse for a card. */
export function ogCard({ eyebrow, title, subtitle, photo, initialsText }: CardProps) {
  const showPortrait = Boolean(photo || initialsText);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: CREAM,
          padding: 56,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flex: 1, position: "relative" }}>
          {/* offset charcoal shadow */}
          <div
            style={{ position: "absolute", top: 16, left: 16, right: -16, bottom: -16, background: INK }}
          />
          <div
            style={{
              position: "relative",
              display: "flex",
              flex: 1,
              border: `6px solid ${INK}`,
              background: CREAM,
              padding: 48,
              gap: 40,
              justifyContent: "space-between",
            }}
          >
            {/* Left: copy column */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                flex: 1,
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", fontSize: 40, fontWeight: 900, letterSpacing: -1 }}>
                  <span style={{ color: INK }}>Badger</span>
                  <span style={{ color: CARDINAL }}>Brief</span>
                </div>
                <div
                  style={{
                    display: "flex",
                    marginTop: 28,
                    fontSize: 26,
                    fontWeight: 800,
                    letterSpacing: 1,
                    color: CARDINAL,
                  }}
                >
                  {eyebrow.toUpperCase()}
                </div>
                <div
                  style={{
                    display: "flex",
                    marginTop: 8,
                    fontSize: 72,
                    fontWeight: 900,
                    letterSpacing: -2,
                    lineHeight: 1.02,
                    color: INK,
                    maxWidth: showPortrait ? 620 : 1000,
                  }}
                >
                  {title}
                </div>
                {subtitle ? (
                  <div style={{ display: "flex", marginTop: 14, fontSize: 30, color: INK, maxWidth: showPortrait ? 620 : 1000 }}>
                    {subtitle}
                  </div>
                ) : null}
              </div>

              <div style={{ display: "flex", marginTop: 24 }}>
                <div style={badge(CARDINAL, CREAM, true)}>PRIMARY · AUG 11, 2026</div>
                <div style={badge(BUTTER, INK, false)}>NON-PARTISAN</div>
              </div>
            </div>

            {/* Right: portrait (photo or initials) */}
            {showPortrait ? (
              <div style={{ display: "flex", position: "relative", width: 300, height: 300, alignSelf: "center" }}>
                <div
                  style={{ position: "absolute", top: 12, left: 12, right: -12, bottom: -12, background: INK }}
                />
                {photo ? (
                  // next/og renders via Satori — next/image doesn't work here,
                  // a raw <img> with a data URI is the only option.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photo}
                    alt=""
                    width={300}
                    height={300}
                    style={{ position: "relative", width: 300, height: 300, objectFit: "cover", border: `6px solid ${INK}` }}
                  />
                ) : (
                  <div
                    style={{
                      position: "relative",
                      display: "flex",
                      width: 300,
                      height: 300,
                      border: `6px solid ${INK}`,
                      background: BUTTER,
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 120,
                      fontWeight: 900,
                      color: INK,
                    }}
                  >
                    {initialsText}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
