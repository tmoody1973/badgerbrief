import { ImageResponse } from "next/og";

/**
 * The social share card — what a link to badgerbrief.org shows when it's texted,
 * Slacked, tweeted or posted. A voter guide spreads by being shared, and a link
 * with a blank preview gets a fraction of the clicks of one with a clean card,
 * so this is distribution infrastructure, not decoration.
 *
 * Generated at build from the brand palette — no manual image asset to keep in
 * sync, and Next wires it to og:image AND twitter:image on every page
 * automatically. Deliberately font-free: ImageResponse's built-in sans is
 * reliable at build time, and the neo-brutalist identity here comes from the
 * flat colour blocks, the thick charcoal frame and the offset shadow rather than
 * from a specific typeface, so nothing depends on a font fetch that could fail a
 * deploy.
 */
export const alt =
  "BadgerBrief — independent, non-partisan Wisconsin 2026 voter guide";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Site palette (globals.css :root).
const CREAM = "#fff7ed";
const INK = "#1c1b1a";
const CARDINAL = "#c5050c";
const BUTTER = "#f6e7b2";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: CREAM,
          padding: 56,
          fontFamily: "sans-serif",
        }}
      >
        {/* The offset-shadow card the site uses everywhere: a charcoal block
            sitting behind a bordered panel. */}
        <div style={{ display: "flex", flex: 1, position: "relative" }}>
          <div
            style={{
              position: "absolute",
              top: 16,
              left: 16,
              right: -16,
              bottom: -16,
              background: INK,
            }}
          />
          <div
            style={{
              position: "relative",
              display: "flex",
              flexDirection: "column",
              flex: 1,
              border: `6px solid ${INK}`,
              background: CREAM,
              padding: 56,
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontSize: 108, fontWeight: 900, letterSpacing: -2 }}>
                <span style={{ color: INK }}>Badger</span>
                <span style={{ color: CARDINAL }}>Brief</span>
              </div>
              <div style={{ display: "flex", marginTop: 8, fontSize: 44, fontWeight: 700, color: INK }}>
                Wisconsin Voter Guide · 2026
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontSize: 30, color: INK, maxWidth: 900 }}>
                Your ballot, the candidates, their voting records, and the money —
                every claim linked to its official source.
              </div>
              <div style={{ display: "flex", marginTop: 28 }}>
                <div
                  style={{
                    display: "flex",
                    background: CARDINAL,
                    color: CREAM,
                    border: `4px solid ${INK}`,
                    padding: "10px 20px",
                    fontSize: 28,
                    fontWeight: 800,
                    letterSpacing: 1,
                  }}
                >
                  PRIMARY · AUG 11, 2026
                </div>
                <div
                  style={{
                    display: "flex",
                    background: BUTTER,
                    color: INK,
                    border: `4px solid ${INK}`,
                    borderLeft: "none",
                    padding: "10px 20px",
                    fontSize: 28,
                    fontWeight: 800,
                    letterSpacing: 1,
                  }}
                >
                  NON-PARTISAN
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
