# Getting BadgerBrief into Google & Bing — a step-by-step guide

**For:** someone who has never used Search Console or Bing Webmaster Tools.
**Time:** ~30 minutes total. **Cost:** free.
**Written:** 2026-07-24

---

## Why this is the first thing to do

Right now Google and Bing can *technically* find BadgerBrief, but you are flying
blind. You cannot see what they have indexed, you cannot tell them about new
pages, and you cannot see what people search to reach you. Last week 370 new
pages went live (all 116 Assembly and Senate district races, plus candidates)
and there is no way to confirm the search engines have even noticed.

These two free tools fix that. Google Search Console is the more important of
the two, but **Bing matters more than its market share suggests: ChatGPT's web
search runs on Bing's index.** Getting into Bing is the fastest way to start
showing up in AI answers.

Two things are already done, so you are starting from a good place:

- ✅ A sitemap listing all 589 pages, live at
  `https://badgerbrief.org/sitemap.xml`
- ✅ `robots.txt` points both engines at that sitemap

You are only *connecting the accounts and pressing submit*.

---

## A few words you'll see

| Word | What it means |
|---|---|
| **Verify / verification** | Proving to Google/Bing that you own the site, so they'll show you its private data. A one-time step. |
| **Index** | The search engine's copy of your pages. "Indexed" = it's in there and can appear in results. Not indexed = invisible. |
| **Sitemap** | A file listing every page on your site, so the engine doesn't have to stumble onto them. Yours already exists. |
| **Crawl** | When the engine's robot visits your pages to read them. |
| **Property** | What Search Console calls your site once it's added. |
| **Impression** | Your site showed up in someone's search results (whether or not they clicked). |

---

# Part 1 — Google Search Console

## Step 1: Open Search Console and add the site

1. Go to **https://search.google.com/search-console**
2. Sign in with a Google account. Use one you'll keep — this becomes the
   permanent owner of the data. A dedicated account (not a personal Gmail you
   might lose access to) is worth considering.
3. You'll be asked to add a **property**. You'll see two boxes: **Domain** and
   **URL prefix**.

   Choose **URL prefix**. Type exactly:

   ```
   https://badgerbrief.org
   ```

   > **Why URL prefix, not Domain?** The Domain option needs you to log into
   > your DNS provider and add a record — more steps, more that can go wrong.
   > URL prefix lets us verify with a single tag in the site's code, which is
   > the method the next step uses.

4. Click **Continue**.

## Step 2: Get your verification code

Google now shows several verification methods. Click the one called
**HTML tag** (NOT "HTML file", NOT "Google Analytics").

You'll see a line that looks like this:

```html
<meta name="google-site-verification" content="AbC123_long_random_string_xyz" />
```

**Copy just the code** — the part inside `content="..."`. In the example above
that's `AbC123_long_random_string_xyz`. You do not need the whole tag.

**Leave this browser tab open.** You'll come back and press "Verify" after the
next step.

## Step 3: Put the code in the site

The code goes into one file. This is the only code change in the whole guide,
and it's a two-line addition.

Open `src/app/layout.tsx`. Find the block that starts with
`export const metadata`:

```typescript
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — Wisconsin Voter Guide 2026`,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    siteName: SITE_NAME,
    type: "website",
  },
};
```

Add a `verification` line so it becomes:

```typescript
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — Wisconsin Voter Guide 2026`,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  verification: {
    google: "AbC123_long_random_string_xyz", // ← paste YOUR code here
    other: {
      "msvalidate.01": "PASTE_BING_CODE_IN_PART_2", // filled in later
    },
  },
  openGraph: {
    siteName: SITE_NAME,
    type: "website",
  },
};
```

> Next.js turns that `verification` block into the exact `<meta>` tags Google
> and Bing look for, on every page, automatically. You don't hand-write the tag.
>
> Leave the `msvalidate.01` line as-is for now — Part 2 fills it in. Or delete
> that inner `other: {...}` block for now and add it back in Part 2. Either way
> is fine.

## Step 4: Ship it

The tag only works once it's live on badgerbrief.org. Deploy:

```bash
npx vercel --prod --yes
```

Wait for it to finish (~1 minute), then confirm the tag is actually live:

```bash
curl -s https://badgerbrief.org | grep google-site-verification
```

You should see your tag printed back. **If nothing prints, stop** — the deploy
didn't pick up the change, and pressing Verify will fail. Re-check the edit and
redeploy.

## Step 5: Verify

Go back to the Search Console tab from Step 2 and click **Verify**.

You should get "Ownership verified." If it fails, wait two minutes (the deploy
may still be propagating) and try again. The `curl` check above is the real
test — if that prints your tag, verification will succeed.

## Step 6: Submit the sitemap

This is the step that tells Google about all 589 pages at once.

1. In the left sidebar, click **Sitemaps**.
2. Under "Add a new sitemap" there's a box already prefilled with
   `https://badgerbrief.org/`. Type into it:

   ```
   sitemap.xml
   ```

3. Click **Submit**.

Status will say "Couldn't fetch" for a few minutes, then change to **Success**
with "589 discovered." That's Google confirming it read the whole list.

## Step 7: Ask Google to index your most important pages now

Submitting the sitemap gets everything crawled *eventually* — but on a new site
that can take days to weeks. You can jump the queue for a handful of pages.

At the very top of Search Console there's a search box that says **"Inspect any
URL in badgerbrief.org"**. For each important URL:

1. Paste the full URL, press Enter.
2. Wait for it to check (10–20 seconds).
3. Click **Request Indexing**.
4. Wait for "Indexing requested," then do the next one.

**Do these ~15 first** (the highest-value pages; you can't do all 589 this way,
and there's a daily limit of about 10–12, so spread it over two days):

```
https://badgerbrief.org/
https://badgerbrief.org/vote
https://badgerbrief.org/news
https://badgerbrief.org/about
https://badgerbrief.org/races/wi-gov-2026
https://badgerbrief.org/candidates/tom-tiffany
https://badgerbrief.org/candidates/mandela-barnes
https://badgerbrief.org/candidates/francesca-hong
https://badgerbrief.org/candidates/kelda-roys
https://badgerbrief.org/races/wi-ag-2026
```

> There is **no 2026 U.S. Senate race in Wisconsin** — some other sites get this
> wrong. Don't submit one; the URL 404s. The real statewide races are
> `wi-gov-2026`, `wi-ag-2026`, `wi-sos-2026`, `wi-treas-2026`, `wi-scotus-2026`,
> plus the eight `wi-us-house-dN-2026` congressional districts.

Day two, continue with a few district races and other statewide offices.

**That's Google done.** The data (what people searched, how many impressions,
which pages ranked) starts appearing in 2–3 days — it is not instant.

---

# Part 2 — Bing Webmaster Tools

Bing is quicker because it can **import everything from Google** in one click.

## Step 1: Open Bing Webmaster Tools

1. Go to **https://www.bing.com/webmasters**
2. Sign in. You can use a Microsoft account **or** sign in with the same Google
   account — either works.

## Step 2: Import from Google (the shortcut)

On the "Add your site" screen you'll see two options: **Import from Google
Search Console** and **Add site manually**.

Choose **Import from Google Search Console**. It will ask permission to connect
to the Google account you just used. Approve it. Bing pulls in badgerbrief.org
*and* its verification *and* the sitemap in one step — you're basically done.

**If import works, skip to Part 3.** If it doesn't (occasionally the connection
fails), use the manual path below.

## Step 2 (manual fallback): Add the site by hand

1. Choose **Add site manually** and enter `https://badgerbrief.org`.
2. Bing offers verification methods. Choose the **Meta tag** option.
3. You'll see a tag like:

   ```html
   <meta name="msvalidate.01" content="A1B2C3long_bing_string" />
   ```

   Copy the code from inside `content="..."`.
4. Open `src/app/layout.tsx` again and put it in the `msvalidate.01` line from
   Part 1:

   ```typescript
   verification: {
     google: "your_google_code_from_part_1",
     other: {
       "msvalidate.01": "A1B2C3long_bing_string", // ← Bing code here
     },
   },
   ```

5. Deploy and confirm, same as before:

   ```bash
   npx vercel --prod --yes
   curl -s https://badgerbrief.org | grep msvalidate
   ```

6. Back in Bing, click **Verify**.
7. Then find **Sitemaps** in the Bing sidebar, click **Submit sitemap**, and
   enter the full URL:

   ```
   https://badgerbrief.org/sitemap.xml
   ```

---

# Part 3 — What to do afterward (and what NOT to expect)

## Don't panic in the first week

- Data takes **2–3 days** to appear in Google, faster in Bing.
- New pages get indexed over **days to weeks**, not hours. This is normal for a
  new domain and is not a sign anything is broken.
- You will **not** rank #1 for "wisconsin governor 2026" before the August 11
  primary. Wikipedia and Ballotpedia have a 20-year head start. That is expected
  — the winnable searches are the specific ones (a named candidate, a district
  number) where those sites are weak or absent.

## Check back weekly

In Search Console, the two reports worth watching:

- **Performance** — what people searched to find you, and which pages showed up.
  This tells you what's actually working.
- **Pages** (under Indexing) — how many of the 589 are indexed. The number
  should climb week over week. If a page you care about says "Crawled - not
  indexed," that usually means Google saw it but judged it thin — the sort of
  thing the district pages' new candidate content is meant to fix.

## The two things this guide can't do for you

Search Console and Bing are necessary but not sufficient. Two levers matter more
for actually ranking, and neither lives in these tools:

1. **Backlinks** — other sites linking to you. A new domain has none. The plan
   in `docs/distribution-submissions.md` (libraries, League of Women Voters,
   university civic offices, Wikidata) is how you earn the first ones, and a
   link from a `.edu` or library page is worth more than anything in this guide.
2. **Time** — indexing history and authority build over weeks. Everything set up
   here compounds toward the **November 3 general election** (102 days out),
   which is the realistic target, far more than the August primary.

---

## Quick checklist

Google:
- [ ] Property added (URL prefix, `https://badgerbrief.org`)
- [ ] `verification.google` code added to `layout.tsx` and deployed
- [ ] `curl` confirms the tag is live
- [ ] Verified in Search Console
- [ ] Sitemap `sitemap.xml` submitted, shows "Success / 589 discovered"
- [ ] Requested indexing on the ~10 priority URLs (rest on day two)

Bing:
- [ ] Site added (imported from Google, or manual)
- [ ] Verified
- [ ] Sitemap submitted

Both: check back in a week.
