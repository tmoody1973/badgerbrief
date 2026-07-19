# Launch runbook & rollback plan (MOO-314)

Target go-live: **Aug 4, 2026** (primary Aug 11). Production:
https://badgerbrief.vercel.app (Vercel project `tmoody1973s-projects/badgerbrief`),
Convex prod `precious-axolotl-906`.

## Rollback plan

### Frontend (Vercel)
Every deploy is immutable and instantly promotable. To roll back:
```bash
npx vercel ls badgerbrief          # find the last-good deployment URL
npx vercel promote <deployment-url>   # points production alias back at it
```
(Or Vercel dashboard → Deployments → ⋯ → "Promote to Production". Instant,
no rebuild.)

### Backend code (Convex)
Convex deploys aren't versioned server-side — roll back by redeploying the
last-good commit:
```bash
git log --oneline                  # find last-good sha
git checkout <sha> -- convex/      # or git revert the bad commit
npx convex deploy -y
```
Deploy order is always convex BEFORE vercel when both change.

### Data (Convex snapshot)
Take a snapshot immediately before launch and before any risky data
operation:
```bash
npx convex export --prod --path backups/prod-$(date +%Y%m%d).zip
```
Restore (DESTRUCTIVE — replaces current data; take a fresh export of the
broken state first for forensics):
```bash
npx convex import --prod --replace-all backups/prod-YYYYMMDD.zip
```
`backups/` is gitignored; keep at least the launch-day snapshot somewhere
durable (external drive / cloud).

### Agent behavior
Any bad agent behavior post-launch: `MODEL`/`INSTRUCTIONS` changes roll back
by git revert + `npx convex deploy -y`, and MUST re-run the eval gate
(`docs/eval-gate.md`, baseline `sonnet-5-tuned`) even on the way back.

## Launch-day checklist (Aug 4)

1. **48h cron health**: Convex dashboard → prod deployment → Schedules/Crons →
   confirm all 5 daily crons (finance, scout, research, source-change,
   staleness) green for the previous 48h; screenshot for MOO-314.
   (CLI cross-check: `npx convex data finance_totals --prod --limit 1 --order desc`
   fetchedAt within 24h; `scout_attempts` / `source_fetch_logs` likewise.)
2. **Alerts**: /admin → resolve or triage everything; launch requires zero
   unresolved critical.
3. **Snapshot**: `npx convex export --prod --path backups/prod-launch.zip`.
4. **Domain** (if using a custom domain instead of badgerbrief.vercel.app):
   Vercel dashboard → Project → Domains → add domain, follow DNS instructions;
   HTTPS is automatic. Then update `NEXT_PUBLIC_SITE_URL` env in Vercel,
   redeploy, confirm sitemap.xml/robots.txt emit the new host.
5. **Search Console**: https://search.google.com/search-console → add property
   for the production domain (DNS or meta-tag verification) → Sitemaps →
   submit `https://<domain>/sitemap.xml` → screenshot "Success" status.
6. **Phone test**: production URL on a phone, wifi OFF — home page, a race
   page, /vote, /chat.
7. Post evidence bundle to MOO-314 and mark Done.

## Standing pre-launch state (verified 2026-07-19)
- No unresolved critical alerts (2 open *warning* eval_regression alerts are
  MOO-313 smoke-test artifacts — resolve them from /admin).
- All 5 crons ran green today (finance fetchedAt 11:00:02Z, scout 11:00:25Z,
  research + source sweeps 16:33Z).
- sitemap.xml + robots.txt live over HTTPS; /methodology live and linked from
  the footer; footer carries the non-partisan mission and the Sunshine
  non-commercial notice (Wis. Stat. § 11.1304(12)).
