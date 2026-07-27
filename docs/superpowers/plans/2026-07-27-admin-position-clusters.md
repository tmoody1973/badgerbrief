# /admin position-cluster review — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** In `/admin → Editorial`, add a cluster view of pending position drafts grouped by candidate+issue, with the suggested KEEP highlighted and a one-click **"Reject the N duplicates"** per cluster — so the 300-pending queue (really ~107 distinct positions + 193 duplicate drafts) is triaged fast, without leaving the real approval UI.

**Architecture:** A new admin-gated query groups `candidate_positions_drafts` (reviewStatus="pending") by (raceId, candidateSlug, issueSlug), joins each draft's **open `review_task`** (needed to resolve on reject) and the candidate/race names, marks the highest-confidence draft KEEP and whether the position is NEW (no published row for that key). A new admin-gated bulk mutation rejects a set of drafts AND resolves their tasks in one transaction. A new client component renders clusters with keep-highlight + a per-cluster reject-dups button; publishing a KEEP reuses the existing per-draft `Approve & publish` flow (human accuracy gate preserved). Added as a "By cluster / Queue" toggle inside the existing `ReviewQueue`.

**Tech Stack:** Convex (read `convex/_generated/ai/guidelines.md` first; admin-gated via `requireAdmin`), Next.js App Router, React, Tailwind (neo-brutalist), Vitest + convex-test.

## Global Constraints

- **Admin-only.** Every new query/mutation calls `requireAdmin(ctx)` (mirror `adminQueue.ts`/`publish.ts`). No public exposure.
- **Reject must resolve the task.** A pending draft has an open `review_task` (kind "position", refId=draftId). Rejecting a draft = set `reviewStatus:"rejected"` on the draft AND resolve (`status:"resolved"`) its open task — else it lingers in the Editorial queue (`adminQueue.list` reads open tasks). Mirror how `DraftRow`'s reject path already does both (`setDraftReviewStatus` + `resolveTask`).
- **Nothing auto-publishes.** This feature only rejects duplicates and surfaces keeps; publishing a keep stays the existing per-draft `Approve & publish` (which enforces the publish gates in `publish.publishPosition`). No bulk publish.
- **Reversible.** Reject sets a status flag (not delete); a rejected draft can be re-approved. Audit-log each reject (reuse `logAudit`).
- **KEEP heuristic** (server, must match the artifacts): within a cluster, KEEP = highest `confidence`, tie-broken by longer `summary`. No new dependency. Conventional commits, no attribution.

## File Structure

- `convex/adminQueue.ts` — add `positionClusters` query.
- `convex/publish.ts` — add `bulkRejectPositions` mutation.
- `convex/adminQueue.test.ts` / `convex/publish.test.ts` — tests (extend existing).
- `src/components/admin/position-clusters.tsx` (new) — the cluster view.
- `src/components/admin/review-queue.tsx` — add a Queue/Cluster toggle mounting the new view.

---

### Task 1: Backend — `positionClusters` query + `bulkRejectPositions` mutation

**Files:** Modify `convex/adminQueue.ts`, `convex/publish.ts`; test in `convex/adminQueue.test.ts` (+ `convex/publish.test.ts` if present).

**Interfaces:**
- `api.adminQueue.positionClusters` (query, no args) → returns
  ```ts
  {
    clusters: Array<{
      raceId: string; candidateSlug: string; candidateName: string; office: string;
      issueSlug: string; isNew: boolean;               // no published row for this key
      keepDraftId: Id<"candidate_positions_drafts">;
      drafts: Array<{
        draftId: Id<"candidate_positions_drafts">;
        taskId: Id<"review_tasks"> | null;             // the OPEN position task, if any
        stance: string; confidence: number; summary: string;
        sourceName: string; sourceUrl: string;
        isKeep: boolean;
      }>;                                              // sorted: keep first, then confidence desc
    }>;
  }
  ```
- `api.publish.bulkRejectPositions` (mutation) — args `{ items: Array<{ draftId: Id<"candidate_positions_drafts">, taskId: Id<"review_tasks"> | null }> }` → for each: `patch(draftId, {reviewStatus:"rejected"})`, and if `taskId`, `patch(taskId,{status:"resolved"})`; `logAudit` per draft. Returns `{ rejected: number }`.

- [ ] **Step 1: Write the query** in `adminQueue.ts` (after `list`). `requireAdmin`. Collect pending drafts (`candidate_positions_drafts` where `reviewStatus==="pending"`), the published set (for isNew), open position tasks (map refId→taskId), and candidates (for name/office). Group by `raceId|candidateSlug|issueSlug`; sort each group by `confidence` desc then `summary.length` desc; mark `isKeep` on index 0; set `keepDraftId`. `isNew = !publishedKeys.has(key)`. Return `{clusters}` sorted new-first then candidate then issue.

- [ ] **Step 2: Write the bulk mutation** in `publish.ts` (after `setDraftReviewStatus`). `requireAdmin`. Loop `items`: `ctx.db.patch(draftId,{reviewStatus:"rejected"})`; if `taskId` non-null, `ctx.db.patch(taskId,{status:"resolved"})`; `await logAudit(ctx,{action:"reject",refTable:"candidate_positions_drafts",refId:draftId})`. Count and return `{rejected}`. (Convex mutation = one transaction; a bad id throws and rolls the whole batch back — acceptable, the client passes ids straight from the query.)

- [ ] **Step 3: Tests** (convex-test, follow `voterHelpQueries.test.ts` pattern; seed drafts + published + tasks):
  - `positionClusters`: two drafts same candidate+issue → one cluster, higher-confidence is `isKeep`, `drafts[0].isKeep===true`; a key with a published row → `isNew:false`; a key without → `isNew:true`; each draft carries its open task's id.
  - `bulkRejectPositions`: rejecting 2 drafts sets both to `rejected` and resolves their tasks; returns `{rejected:2}`; a KEEP left untouched stays `pending` with its task open.

- [ ] **Step 4:** `npx vitest run convex/adminQueue.test.ts convex/publish.test.ts && npx convex codegen && npx tsc --noEmit`; full `npx vitest run`.

- [ ] **Step 5: Commit** `git add convex/adminQueue.ts convex/publish.ts convex/*.test.ts convex/_generated && git commit -m "feat(admin): positionClusters query + bulkRejectPositions mutation (admin cluster review)"`

---

### Task 2: UI — cluster view + Editorial toggle

**Files:** Create `src/components/admin/position-clusters.tsx`; modify `src/components/admin/review-queue.tsx`.

**Interfaces:** Consumes `api.adminQueue.positionClusters`, `api.publish.bulkRejectPositions`, and (for publishing a keep) the existing `api.publish.setDraftReviewStatus` + `api.publish.publishPosition`.

- [ ] **Step 1: `PositionClusters` component** (client, `"use client"`). Read the query (skip until `useConvexAuth().isAuthenticated`, mirror `useQueue`). Render each cluster as a neo-brutalist card:
  - Header: candidate name · office · issue · badges (`NEW` if isNew, `LOW` if keep.confidence<0.5) · draft count.
  - The KEEP draft highlighted (border/tint), showing stance · confidence · source link · summary, with an **Approve & publish** button that calls `setDraftReviewStatus({kind:"position",draftId,status:"approved"})` then `publishPosition({draftId})` (reuse the exact sequence from `draft-row.tsx` `handleApproveAndPublish`; on success the row disappears via reactive refetch).
  - The duplicate drafts dimmed (source + confidence + summary), with one **Reject {n} duplicate(s)** button per cluster that calls `bulkRejectPositions({items: dups.map(d=>({draftId:d.draftId, taskId:d.taskId}))})`.
  - Per-card busy state + inline error (reuse `asMessage`/`ErrorLine` from `draft-row.tsx`).
  - Filter chips: All / New coverage / Low confidence (client-side over the clusters). Empty state: "No pending position clusters."
- [ ] **Step 2: Toggle in `ReviewQueue`** — add a small `[Queue | By cluster]` view toggle (local `useState`) in the Editorial section; default keep the existing `Queue` (task list). When "By cluster", render `<PositionClusters/>` instead of the position rows. Leave the quotes/all filters + AlertsSection untouched.
- [ ] **Step 3:** `npx tsc --noEmit && npm run build`; full `npx vitest run`.
- [ ] **Step 4: Commit** `git add src/components/admin/position-clusters.tsx src/components/admin/review-queue.tsx && git commit -m "feat(admin): cluster view with keep-highlight + reject-duplicates (admin cluster review)"`

---

### Task 3: Review + release
- [ ] Final whole-branch review (opus). Fix Critical/Important.
- [ ] Deploy: **BOTH** `npx convex deploy --yes` (new query/mutation) + `npx vercel --prod`.
- [ ] Live-verify (admin, signed in): Editorial → By cluster shows clusters; "Reject N duplicates" clears the dups from the queue (and their tasks resolve — count drops); "Approve & publish" on a keep publishes it and it leaves the cluster list; a rejected draft is reversible (still in DB as rejected). Confirm the old Queue view still works.

## Self-Review notes
- **Consistency invariant:** reject always pairs `reviewStatus:"rejected"` + task `status:"resolved"` (Global Constraints) — the one way the two-table model corrupts is rejecting a draft without resolving its task; Task 1 Step 2 + its test lock that.
- **No bulk publish** (accuracy gate stays per-draft/human). Reject is the only bulk op.
- **Heuristic parity** with the artifacts (confidence desc, tie longer summary).
- **Types:** `positionClusters` shape, `bulkRejectPositions` args used identically across T1/T2.
