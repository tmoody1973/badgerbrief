---
task: Fix three code review findings in rollCall parser
slug: 20260723_rollcall_review_findings
effort: standard
phase: complete
progress: 10/10
mode: interactive
started: 2026-07-23T00:00:00Z
updated: 2026-07-23T00:00:00Z
---

## Context

Wisconsin Legislature roll-call parser (convex/lib/rollCall.ts and test) has three code-review findings:
1. Type-check regression: parameter `p` in test helper (line 107) missing type annotation
2. NAME_RE regex rejects typographic apostrophes (U+2019), should accept both U+0027 and U+2019
3. POSITION_BY_MARK lacks documentation for why "x" mark exists and "NV" status

### Risks
- Regex special characters may not render correctly in source
- Type narrowing depends on correct Position import
- Fixture data must remain stable at 99 rows / 62 aye / 35 nay / 2 not_voting

## Criteria

- [x] ISC-1: Parameter `p` has Position type annotation
- [x] ISC-2: NAME_RE character class includes straight apostrophe U+0027
- [x] ISC-3: NAME_RE character class includes curly apostrophe U+2019
- [x] ISC-4: Test verifies curly apostrophe accepted in member name
- [x] ISC-5: POSITION_BY_MARK comment documents "x" mark discovery
- [x] ISC-6: POSITION_BY_MARK comment explains "NV" currently unused
- [x] ISC-7: npx tsc --noEmit passes with zero errors
- [x] ISC-8: npx vitest run passes all 14 tests
- [x] ISC-9: Fixture parses to exactly 99 rows
- [x] ISC-10: Fixture tallies 62 aye / 35 nay / 2 not_voting

## Verification

- ISC-1: Type annotation added to rollCall.test.ts line 107, Position type imported at line 4
- ISC-2,3: NAME_RE updated to `/^[A-Z][A-Z'’.\- ]*(?:,\s?[A-Z])?$/` with both apostrophes visible
- ISC-4: New test "accepts member names with curly apostrophes" added to parseAssemblyVotes suite
- ISC-5,6: Comment block added above POSITION_BY_MARK explaining discovery and "NV" unused status
- ISC-7: npx tsc --noEmit completed with no output (zero errors)
- ISC-8: npx vitest run convex/lib/rollCall.test.ts passed 14 tests (1 new)
- ISC-9,10: Fixture verification showed 99 rows / 62 aye / 35 nay / 2 not_voting
