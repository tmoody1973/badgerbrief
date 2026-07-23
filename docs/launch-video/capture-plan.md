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

Capture length rule: record **2–3× the final on-screen time**, plus head/tail padding, so post can trim, speed-ramp, and reframe without upscaling. "Final" = seconds in the cut; "Capture" = wall-clock to actually record including retakes.

| Shot | Beat | Source | Action | Final | **Capture** | Notes |
|------|------|--------|--------|-------|-------------|-------|
| A | 1 | `/` home | Hero settle, then **slow scroll to reveal the full race grid** | ~12s | **~30s** | 1 clean settle + 1 full slow scroll top→bottom; ~one screen / 2s |
| B | 2 | `/` ballot finder | Type decoy address → submit → races resolve | ~15s | **~45s** | Typing is slow + resolve latency; record the resolve 2×, pick cleanest |
| C | 2b | `/races/[slug]` → `/candidates/[slug]` | Click candidate → scroll the **positions** (SUPPORT/OPPOSE + sourced detail) | ~18s | **~60s** | Richest page — tabs Background · Money · Ads · Issues · Quotes · Sources. Navigate + scroll full issues, 2 takes. **Candidate WITH a photo**, not SUSPENDED/WITHDRAWN |
| D | 3 | `/ads?view=browse` | Sort table by spend, scroll | ~10s | **~30s** | Steady scroll, no jitter |
| E | 3 | `/ads?view=analytics` | Reveal spend bars, top spender | ~8s | **~25s** | cardinal/lake bars (verify no red/green) |
| F | 4 | `/sponsors/americans-for-prosperity` | Scroll profile: kind, totals, donors, source link | ~12s | **~30s** | **AFP** — verified hero |
| G | 5 | `/chat` (CDP, logged in) | Type question → answer streams → citations | ~18s | **~90s ×3 takes ≈ 4–5 min** | THE hero shot. First-token + full stream latency is unpredictable — record long, speed-ramp dead air. Path `/chat`. START already logged-in (Clerk landmine) |
| H | 6 | — | (motion-only end card) | ~20s | **0 (no capture)** | Built in HyperFrames |

**Total raw footage to record: ~12–14 min** (≈ 8–9 min of A–F + ~4–5 min of chat takes) → cut to a ~2:32 final.

**Beat-5 chat question (locked):** *"Who's spending the most in the Supreme Court race, and who are they for?"* — verify the chat answers this well against current data **before** the record session.

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
