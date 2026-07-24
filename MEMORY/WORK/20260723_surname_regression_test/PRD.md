---
task: Add regression test for exact-match legislator surname matching
slug: 20260723_surname_regression_test
effort: standard
phase: complete
progress: 8/8
mode: interactive
started: 2026-07-23T00:00:00Z
updated: 2026-07-23T00:00:00Z
---

## Context

The `storeRollCall` mutation in `convex/votesQueries.ts` matches tracked legislators to roll-call rows by exact hand-entered `legislatorName` (line 75: `x.name === mapping.name`). The matching is verified correct. However, there is NO regression test guarding the critical failure mode: two DIFFERENT candidates who share a surname must each receive only their OWN vote, never each other's. In Wisconsin roll calls these appear as "ANDERSON, C" and "ANDERSON, J" — distinct exact strings.

A future refactor could accidentally change the matching predicate from exact `===` to a prefix/substring match, which would attach both votes to both candidates. This is the worst possible failure for this feature and needs a regression test to detect such changes.

## Criteria

- [x] ISC-1: Two candidates seeded with different exact legislatorName strings sharing a surname
- [x] ISC-2: Roll call created with votes for both candidates with different positions
- [x] ISC-3: Exactly two legislator_votes rows exist after storeRollCall
- [x] ISC-4: First candidate has only its own position, not the other's
- [x] ISC-5: Second candidate has only its own position, not the first's
- [x] ISC-6: Test fails when matching predicate changed to prefix match (mutation proof)
- [x] ISC-7: Test passes when predicate reverted to exact match
- [x] ISC-8: npx tsc --noEmit produces no errors after test added

## Verification

**Test Execution (Exact Match — PASS):**
- Command: `npx vitest run convex/votesQueries.test.ts`
- Result: 6/6 tests passed (350ms)
- New test output: `✓ two candidates with same surname but different exact names each receive only their own vote`

**Mutation Test (Last-Name-Only Matching — FAIL as expected):**
- Mutation: Changed `x.name === mapping.name` to `x.name.split(",")[0] === mapping.name.split(",")[0]`
- Result: Test FAILED with "expected 'aye' to be 'nay'" — john candidate incorrectly received "aye" instead of "nay"
- This proves the test correctly detects when the matching predicate allows cross-candidate vote attribution

**TypeScript Check:**
- Command: `npx tsc --noEmit`
- Result: No errors

**Commit:**
- SHA: 60d7a5e
- Message: "test(votes): add regression test for exact-match legislator surname"

## Decisions

- Use existing test harness (convexTest, vitest, seedCandidate helper)
- Use existing ROLL_CALL fixture shape as baseline
- Create distinct slugs for the two candidates to avoid collision
- Use "aye" and "nay" positions to clearly distinguish votes
- Commit only the test change, not the temporary predicate mutation

## Risks

- The exact-match predicate is deeply embedded; a careless refactor might introduce fuzzy matching
- If the matching logic is changed before mutation-proving the test, the invariant loss won't be caught
- The test dataset must be minimal to avoid confusing it with production data
