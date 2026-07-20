# BadgerBrief — 1:30 demo walkthrough (YouTube, 1920×1080)

**Format:** 16:9 landscape, 1080p, 30fps. Text-overlay driven so it works muted (85% of social video is watched without sound). Voiceover script included below if you want to narrate.

**Demo routes chosen deliberately:** the richest pages only. Avoid `/candidates/*` for the 20 congressional candidates added 2026-07-19 — they have name/party/source but no background or positions yet, so they read empty on camera.

## Shot list

| # | Time | Segment | Route | On-screen text | Login? |
|---|------|---------|-------|----------------|:--:|
| 1 | 0:00–0:06 | Cold open | title card | "Wisconsin votes August 11." / "Do you know your ballot?" | — |
| 2 | 0:06–0:16 | Home | `/` | "Every race. Every candidate. Every claim sourced." | no |
| 3 | 0:16–0:32 | Race page | `/races/wi-gov-2026` | "Jump straight to what you care about" → "18 running. See who's actually on the ballot." | no |
| 4 | 0:32–0:50 | Candidate | `/candidates/francesca-hong` | "Where they stand — with the receipts" → "And who's funding them" | no |
| 5 | 0:50–1:04 | Voter Help | `/chat` | "Ask anything about voting" | **YES** |
| 6 | 1:04–1:16 | My Brief | `/brief` | "Your address → your ballot" | **YES** |
| 7 | 1:16–1:24 | Methodology | `/methodology` | "Non-partisan. Sourced. No endorsements." | no |
| 8 | 1:24–1:30 | End card | title card | "badgerbrief.vercel.app" | — |

## Beats that must land on camera

- **Shot 3:** click a jump-nav chip so the page *moves* — the sticky nav is the newest UX win and it reads instantly on video. Then open the "Not on the Aug 11 ballot" fold; that fold is the honesty feature.
- **Shot 4:** open one "Position sources" fold. The whole product claim is *sourced*, so show a source appearing. Then scroll to the finance rail.
- **Shot 5:** ask something with a crisp, checkable answer — "What's the deadline to register to vote in Wisconsin?" Avoid open-ended prompts; the agent refuses endorsement questions by design and that's not the demo.
- **Shot 7:** land on the "we never make endorsements" line.

## Voiceover script (optional — ~135 words, comfortable at 90s)

> Wisconsin's primary is August eleventh. Most voters won't recognize half the names on their ballot.
>
> BadgerBrief is a non-partisan guide to every race in the state. Jump to any part of a race — who's running, who's actually on the ballot, and who's paying for it.
>
> On any candidate, you get where they stand on the issues — and every claim links back to its source. Campaign sites, public records, local reporting. Nothing unsourced.
>
> Stuck on the logistics? Ask. Registration deadlines, early voting, what's on your ballot.
>
> Give it your address and it builds a brief for your ballot — just the races you can actually vote in.
>
> We link every claim, label every source, and never endorse.
>
> BadgerBrief. Know your ballot before you fill it in.

## Production notes

- Segments 1–4, 7–8 are fully automated (`record-public.mjs`).
- Segments 5–6 need an authenticated session: run `login.mjs` once, sign in yourself in the window that opens, then `record-auth.mjs` reuses that profile. **Your credentials never pass through the agent.**
- Assemble with `build.sh` (ffmpeg concat, 1080p30, H.264 + AAC silent track for platform compatibility).

## Known caveats to shoot around

- **Clerk is on test keys** — the hosted sign-in shows `amazed-hyena-57.accounts.dev`. Log in *before* recording so that domain never appears on camera. (Fix tracked on MOO-314.)
- Five candidates still have no photo; none are on the demo route.
