# BadgerBrief Launch Video — Capture Plan (footage long-pole)

Footage is the critical path: HyperFrames composites it, it can't generate it. Capture all clips first, drop them into HyperFrames as `asset_candidates`. Record everything **long** (extra head/tail) and at **2× the final display size** so post can crop, speed-ramp, and reframe without upscaling.

## Rig

- **Recorder:** ScreenStudio or QuickTime screen recording. Native, high-fidelity. NOT Playwright's built-in video (too low-fi for a hero shot).
- **Chat shot:** attach to the **already-logged-in Chrome** via CDP (`--remote-debugging-port=9222`), so Clerk auth on `/brief` is already solved. Script only the *typing* for clean, even pacing; let the recorder capture the window natively. Record the full stream; speed-ramp dead air (first-token latency) in post.
- **Window:** 1440×900 content minimum (renders to 2560/1440 hero). Hide bookmarks bar, extensions, notifications. Clean profile or a fresh window.
- **Cursor:** enable click-highlight; move deliberately, pause on targets.

## Guardrails (non-negotiable)

1. **Decoy address only** — `2 E Main St, Madison, WI 53703` (State Capitol). **Verified on prod:** resolves clean to `CD 2 · SENATE 26 · ASSEMBLY 76` with full race cards. `ballot-finder.tsx` persists `matchedAddress` to prefs when signed in; never a real home address.
2. **Verified sponsor profile only** — beat 4 uses AFP (fully approved narrative) or Justice Project *post-correction* (facts-only, narrative now un-published). Never a flagged/contradictory profile.
3. **Domain** — don't burn `*.vercel.app` into footage. Keep any visible URL to the re-renderable end card (MOO-314 domain still gated).
4. **Env** — capture against **prod at `badgerbrief.org`** (verified live, real domain in the address bar, no vercel URL problem).
5. **Clerk dev-instance landmine (`/chat`).** `/chat` is auth-gated and the sign-in runs on a Clerk **development** instance: `amazed-hyena-57.accounts.dev`, labeled **"Development mode"** in orange, generic (non-brand) UI. If ANY part of the sign-in flow is on screen it wrecks the "real production site" pitch. Mitigation: **start recording already logged in** so sign-in never appears (the CDP-into-your-real-Chrome plan already does this). Separately, this is a real launch-readiness gap — a public site shouldn't run production auth on a Clerk dev instance (dev limits, accounts.dev domain, dev banner). Flag for MOO-314.

## Shot list (mapped to script beats)

| Shot | Beat | Source | Action | Notes |
|------|------|--------|--------|-------|
| A | 1 | `/` home | Slow load, hero settle | 5s hold for title-card overlay |
| B | 2 | `/` ballot finder | Type decoy address → submit → races resolve | Record the resolve twice; pick the cleanest |
| C | 3 | `/ads?view=browse` | Sort table by spend, scroll | Steady scroll, no jitter |
| D | 3 | `/ads?view=analytics` | Reveal spend bars, top spender | cardinal/lake bars (verify no red/green) |
| E | 4 | `/sponsors/[slug]` | Scroll profile: kind, totals, donors, source link | Use AFP or corrected JP |
| F | 5 | `/chat` (CDP, logged in) | Type question → answer streams → citations | THE hero shot. Record 3+ takes. Path is `/chat` (nav "Voter Help"). START recording already logged-in — see Clerk landmine |
| G | 6 | — | (motion-only end card, no footage) | Built in HyperFrames |

**Beat-5 question (locked):** *"Who's spending the most in the Supreme Court race, and who are they for?"* — verify the chat actually answers this well against current data **before** the record session.

## Sequence of work

1. Pick env (prod vs seeded-local) + confirm decoy data present.
2. Dry-run beat-5 chat question; confirm a clean, citation-backed answer.
3. Record shots A–F (long, 2×, multiple takes on B and F).
4. Trim/label clips → `docs/launch-video/footage/`.
5. THEN scaffold HyperFrames project, composite footage + motion layer.
6. AI VO scratch → time the edit → picture-lock → (optional) swap VO.

## Status

- [ ] Env chosen
- [ ] Beat-5 chat dry-run passes
- [ ] Shots A–F captured
- [ ] Footage trimmed + labeled
- [ ] HyperFrames project scaffolded
- [ ] VO + picture lock
