---
task: Deepgram debate analysis into BadgerBrief debate page
slug: 20260729-083500_wi-gov-debate-deepgram-analysis-page
effort: advanced
phase: complete
progress: 28/30
mode: interactive
started: 2026-07-29T08:35:00-05:00
updated: 2026-07-29T09:50:00-05:00
---

## Context

Tarik has a 57:39 audio recording of the **Wisconsin Democratic Primary Debate for
Governor** (`~/Downloads/Wisconsin Democratic Primary Debate for Governor.mp3`,
33 MB, mp3 44.1 kHz stereo, 76 kbps). He wants Deepgram to transcribe it, extract
key political topics/issues, measure sentiment, and use **speaker diarization** to
identify which candidate said what — plus pair each answer with the moderator
question that prompted it — so a dedicated debate page can ship on BadgerBrief.

**What was requested:** transcription, topic/issue extraction, sentiment,
diarization → candidate identity, question↔answer pairing, a special page.

**What was NOT requested:** commentary on who "won", an endorsement, a rewrite of
existing race pages, or a video/social cut.

The 2026 Democratic gubernatorial field in Convex (`WI-GOV-2026`, party
`Democratic`): Mandela Barnes, Joel Brennan, David Crowley, Francesca Hong,
Missy Hughes, Brett Hulsey, Tim Jacobson, Sara Rodriguez, Zachary Roper,
Kelda Roys, Ryan Strnad. Which subset appeared on stage is a finding, not an
assumption.

### Prior art in this repo (read before building)

- `scripts/transcribe-deepgram.mjs` — the WisconsinEye two-person interview pass.
  Establishes the house rules this work inherits: nova-3 + `diarize` +
  `utterances`, keyterm prompting for proper nouns, and — critically — that
  speaker→person mapping must be **derived from a checkable signal and recorded
  with the rule that produced it**, never guessed.
- Memory `deepgram-async-localhost-blocker` — Deepgram's async callback path
  cannot reach localhost, so batch work stays on the synchronous REST call.
- Memory `badgerbrief-wec-ballot-truth` — never attach a name to a person without
  an independent check.
- BadgerBrief holds a **no-endorsement** editorial stance; this page describes
  what was said, it does not score it.

### Risks

- **Diarization boundary bleed.** Deepgram's turn boundaries are offset in
  places: moderator questions land inside a candidate's block and vice versa
  (e.g. Barnes' answer opening sits inside a Jaren Jordan turn at 04:58). Any
  page that renders raw turns will put words in the wrong mouth.
- **Crowley is the weak link.** Mean word-level `speaker_confidence` 0.555 with
  39.6% of his words below the 0.50 coin-flip line — 5× worse than Barnes or
  Roys. Crowley quotes are the least safe to publish unheard.
- **Deepgram's topic/intent labels are not publication-grade.** The model
  returned "Racist race", "racial disparities in malaysia", "impact of russian
  federal government on local governments", "Taxing high-paying childcare".
  Useful as a rough index; unusable as public issue tags.
- **The auto-summary misattributes.** "The governor plans to establish a
  negotiating team" — that is Roys' proposal, not the sitting governor's.
- **No-endorsement stance.** Sentiment scores invite a "who was most negative"
  scoreboard. That reads as scoring the candidates and breaches the stance.

## Criteria

**Transcription & attribution**
- [x] ISC-1: Full 57:39 audio transcribed via Deepgram nova-3
- [x] ISC-2: Diarization returns per-word speaker ids
- [x] ISC-3: Word-level `speaker_confidence` retained, not discarded
- [x] ISC-4: All five candidates identified by self-identifying verbatim proof
- [x] ISC-5: Each proof asserted to match exactly one speaker
- [x] ISC-6: Identification script exits non-zero when a proof is ambiguous
- [x] ISC-7: Moderator Matt Smith identified by in-transcript direct address
- [x] ISC-8: Second moderator resolved by elimination, rule recorded
- [x] ISC-9: Announcer separated from the two moderators
- [x] ISC-10: Every speaker label stores the evidence that produced it
- [x] ISC-11: Turns below confidence floor flagged `needsReview`
- [x] ISC-12: Per-person diarization confidence reported for editorial triage
- [x] ISC-13: Boundary bleed repaired so no turn mixes two speakers
- [x] ISC-14: Repaired transcript spot-checked against audio at 5 timestamps

**Issue & question analysis**
- [x] ISC-15: Deepgram topics/intents/sentiment/entities retrieved
- [x] ISC-16: Deepgram topic quality assessed against publication bar
- [x] ISC-17: Debate segmented into moderator-defined topic blocks
- [x] ISC-18: Each candidate answer paired to the question that prompted it
- [x] ISC-19: Issue tags drawn from a controlled BadgerBrief vocabulary
- [x] ISC-20: Three raise-your-hand votes captured as structured yes/no rows
- [ ] ISC-21: Direct candidate-vs-candidate exchanges identified
- [x] ISC-22: Sentiment presented as tone-per-topic, never as a candidate score

**Page**
- [x] ISC-23: Page scope agreed with Tarik before any component is written
- [x] ISC-24: Route decided and consistent with existing BadgerBrief IA
- [x] ISC-25: Transcript is readable with per-speaker attribution on mobile
- [~] ISC-26: Every quote deep-links to its timestamp
- [x] ISC-27: Page carries no verdict on who won
- [x] ISC-28: Method and its limits disclosed on the page itself
- [x] ISC-A1: No quote published from a `needsReview` turn without a listen
- [x] ISC-A2: No Deepgram raw topic label rendered as a public issue tag

## Decisions

- **Sync REST, not the async callback.** Memory `deepgram-async-localhost-blocker`
  records that Deepgram's callback cannot reach localhost. 33 MB returned in 42s
  synchronously, so the async path buys nothing here.
- **Speaker naming is an assertion, not an inference.** `label-debate-speakers.mjs`
  fails the run rather than emitting a label it cannot prove — the same posture
  `transcribe-deepgram.mjs` takes for the WisconsinEye interviews.
- **Deepgram measures, an editorial pass interprets.** ASR, diarization,
  timings and acoustic sentiment are measurements and are trusted. Topic and
  intent labels are treated as a rough index only.

## Verification

- ISC-1..3: `transcripts-dg/wi-gov-dem-primary-debate.raw.json` — 3459s duration,
  342 utterances, 11,698 words each carrying `speaker` + `speaker_confidence`.
- ISC-4..10: `node scripts/label-debate-speakers.mjs --check` prints 8 speakers,
  each with the signal that named it, and exited 1 on the first run when the
  Barnes proof straddled an utterance boundary — the gate is live, not decorative.
- ISC-11..12: 69/342 turns flagged. Per-person diarization confidence: Roys 0.804,
  Barnes 0.793, Jordan 0.773, Brennan 0.703, Smith 0.693, Hong 0.649, Crowley 0.555.
- ISC-15..16: 103 topic, 75 intent, 189 sentiment segments and 636 entities
  returned; topic labels reviewed and found below the publication bar (examples
  in Risks).

- ISC-13: `scripts/check-turn-purity.mjs` measures 0/230 impure paragraphs vs
  14/342 impure utterances; turns are built from paragraphs and the check fails
  the build if that ever regresses.
- ISC-14: stronger than a 5-point spot check — `scripts/verify-debate-clips.mjs`
  re-transcribed and re-diarized all 40 clips in isolation. 40/40 contain exactly
  one voice with 94–100% quote-word match, which clears the Crowley low-confidence
  concern at the level that matters (the published excerpt).
- ISC-17..20: 10 topic blocks anchored to verbatim moderator transition phrases,
  42 exchanges, 131 answers, 3 hand votes. The structure script exits non-zero on
  an ambiguous anchor and did so on the body-camera vote, where the two moderators
  talk over each other ("All of you" / "all candidates.").
- ISC-25: measured at 320/375/1440px in Chrome — no horizontal overflow at any width.
- ISC-A2: no Deepgram topic or intent label reaches the page; `structure-debate.mjs`
  carries the controlled list and the raw labels stay in the gitignored working file.

- ISC-25 (final): measured in Chrome at 320 / 375 / 1440px — no horizontal
  overflow at any width; page height cut from 9.79 → 6.52 screens (320px),
  8.49 → 5.95 (375px) and 4.45 → 3.22 (1440px) by folding the vote rationale
  and method disclosure and clamping quotes. Desktop now beats the 3.77-screen
  race-page baseline from MOO-329.
- Suite: 549/549 vitest pass. (One houseVote timeout appeared only when the run
  competed with the dev server and Playwright; it passes alone in 913ms and
  convex/ was not touched.)

## Open

- ISC-21 (candidate-vs-candidate exchanges) not built — the data supports it
  (Barnes attacks Crowley at 52:53, Brennan breaks with the field on vouchers)
  but it needs an editorial pass, not a rule.
- ISC-26 partial: quotes carry timestamps and playable clips, but the YouTube
  deep-link is dark until Tarik supplies the URL. `youtubeId`/`sourceUrl` are
  null in the payload and the page hides the embed rather than shipping a dead
  frame.
- Candidate-page and /compare wiring deferred by Tarik's own call (standalone
  first); the payload is already shaped for both.
