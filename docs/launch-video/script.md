# BadgerBrief — Launch / Demo Video Script (v1)

**Format:** Product tour, Vox-documentary polish · **Runtime target:** ~2:00
**VO:** AI voiceover (scratch → picture-lock) · **Aspect:** 16:9 hero (YouTube/FB), vertical cutdowns later
**Framing threads (woven, not tacked on):** *in public beta* · *built by one person* · *every number links to its source*

**Motion layer:** HyperFrames (title cards, kinetic type, lower thirds, burned subtitles, beta badge, source-citation chips)
**Footage layer:** native screen capture; chat shot via CDP into logged-in Chrome (see `capture-plan.md`)

**Palette (from DESIGN.md):** cardinal `#c8102e` · lake `#0057b8` · cream · Archivo Black (display) / Public Sans (body) / Geist Mono (data)
**Anti-slop rules:** no stock music swells over claims · no fake UI · never show the typed home address (decoy address only) · beta badge persistent lower-corner throughout

---

## Beat sheet

| # | Time | Beat | On screen |
|---|------|------|-----------|
| 1 | 0:00–0:15 | What it is | Title card → hero of the guide |
| 2 | 0:15–0:45 | Find your ballot | Ballot finder (decoy address) → races appear |
| 3 | 0:45–1:15 | See the ads | /ads table + analytics, the money |
| 4 | 1:15–1:40 | Who paid for it | Sponsor profile (Justice Project — corrected) |
| 5 | 1:40–2:00 | Just ask it | Chat feature, streaming answer (CDP shot) |
| 6 | 2:00–2:20 | Beta · one person · CTA | Beta badge, source chips, URL end card |

---

## Full script (two-column)

### 1 · What it is — 0:00–0:15

**VO:**
> This fall, Wisconsin voters will decide races most of them have never heard of. Judges. County boards. Ballot measures. BadgerBrief is a nonpartisan guide that tells you what's actually on *your* ballot — and who's paying to influence it.

**ON SCREEN:**
- Cold title card: **BADGERBRIEF** (Archivo Black, cardinal on cream, 4px hard shadow), subtitle *Wisconsin's ballot, explained.*
- Cut to homepage hero, slow push-in.
- Beta badge animates into lower-right corner and **stays for the whole video.**

---

### 2 · Find your ballot — 0:15–0:45

**VO:**
> Start with your address. BadgerBrief matches it to your congressional, legislative, and county districts — and shows you every race you'll actually vote on. No account. No email. Your address never leaves your device as anything but a lookup.

**ON SCREEN:**
- Type a **decoy address** into the ballot finder (WI State Capitol, `2 E Main St, Madison`). **NEVER a real home address.**
- Districts resolve → race cards stamp in one by one (kinetic).
- Lower-third chip: *"address → districts, not stored"* (reinforces the privacy claim honestly).

---

### 3 · See the ads — 0:45–1:15

**VO:**
> Then follow the money. BadgerBrief tracks the political ads running in these races — who's buying them, how much they're spending, and which candidates they're for or against. Millions of dollars, most of it from outside Wisconsin.

**ON SCREEN:**
- /ads page: sortable Browse table scrolls; sort by spend.
- StatTile row counts up (Geist Mono numbers ticking).
- Analytics: cardinal/lake bars (NOT red/green — a11y). Highlight a top out-of-state spender.
- Source chip: *"source: Meta Ad Library · Google · BigQuery"*

---

### 4 · Who paid for it — 1:15–1:40

**VO:**
> Click any advertiser and you get a profile: what kind of group it is, what it's raised, who its donors are — pulled straight from federal filings. And when the public name doesn't match the money, BadgerBrief flags it instead of guessing.

**ON SCREEN:**
- Sponsor profile page — **use Americans for Prosperity** (verified beat-4 hero: approved "Who's behind it" Koch narrative, coherent money $87.3M raised with donors *under* that total, recognizable names). JP works post-correction but shows "PROFILE IN REVIEW" and donor rows that dwarf its raised headline — confusing on camera.
- Beat on the *"who's behind it"* narrative + the fec.gov source link.
- Micro-moment: the decoy-flag concept as a one-frame kinetic aside (*"name ≠ money → we hold the facts"*) — keeps the journalism honesty visible without a full detour.

---

### 5 · Just ask it — 1:40–2:00

**VO:**
> And if you'd rather just ask — there's a chat. Ask what a race is about, who's running, where the money's coming from. It answers from BadgerBrief's own sourced data, in plain language, and links back so you can check it.

**ON SCREEN:**
- Chat panel (CDP-captured, logged-in). Type a real question:
  *"Who's spending the most in the Supreme Court race, and who are they for?"*
- Answer **streams in** (record long, speed-ramp dead air in post).
- Citations render → hover highlights a source chip.

---

### 6 · Beta · one person · CTA — 2:00–2:20

**VO:**
> BadgerBrief is in public beta — built by one person, in the open. Some of it is still rough. But every number you see links back to where it came from, so you never have to take my word for it. Check your ballot at badgerbrief-dot-org.

**ON SCREEN:**
- Beta badge scales up center: **PUBLIC BETA** · *built by one person.*
- Three source logos/chips settle: FEC · Meta Ad Library · Wisconsin Elections Commission.
- End card: **BADGERBRIEF.ORG** (live + verified). Small: *nonpartisan · open-source data · your ballot, explained.*

---

## Open decisions before record

1. **Domain on end card** — `badgerbrief.com` vs `badgerbrief.vercel.app`. MOO-314 domain still Tarik-gated. End card is a re-renderable HyperFrames asset, so this can be the *last* thing locked.
2. **Which sponsor profile in beat 4** — Justice Project (now corrected, draft narrative un-published so it shows facts-only) vs AFP (fully approved narrative, richer story). AFP is the safer hero.
3. **Music** — none over claims; light bed under intro/outro only. Source TBD (license-clean).
4. **Add a beta ribbon to the live site?** Out of scope for the video, but the video drives traffic and viewers expect "beta" on arrival. Flag for a separate small task.
