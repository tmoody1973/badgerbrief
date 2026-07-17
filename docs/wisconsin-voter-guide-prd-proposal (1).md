# BadgerBrief

## Wisconsin Voter Guide and Election Intelligence Platform

## Product Requirements Document and Project Proposal

## Overview

This document outlines a proposed Wisconsin-focused election intelligence and voter guide platform that combines ballot lookup, race coverage, candidate issue positions, sourced quotes, voting logistics, ad transparency, and optional personalized voter briefs. The goal is to create a trusted, non-partisan, source-linked public product that helps Wisconsin voters understand what is on their ballot, what candidates say and stand for, how they are advertising, and exactly how to vote. MyVote Wisconsin already provides official voter-service functions such as finding the next election, locating polling places, and supporting absentee-voting workflows, making it the right operational anchor for voting logistics while the new platform adds editorial, data, and personalization layers on top.[cite:53][cite:54][cite:45]

The most differentiated part of the product is the combination of service journalism and structured political intelligence. The platform would not just show candidate bios or election dates; it would connect race-level reporting, candidate statements, campaign ads, issue summaries, and voting instructions in one address-aware experience. This aligns well with Wisconsin public-service information needs and with a newsroom-quality approach to transparency and provenance.[cite:44][cite:53]

## Product Vision

The platform should answer five core voter questions:

- What elections and races are on the ballot for this voter?
- What do the candidates say, support, oppose, or avoid saying?
- What campaign ads are voters being shown on Meta and Google?
- What reporting and context explain why each race matters?
- What exactly does this voter need to do to cast a ballot successfully?

A longer-term goal is to create a personal voting brief that a Wisconsin voter can save to a phone, print, or take to the polls. That brief would contain only factual, source-linked, user-selected or user-relevant information: ballot items, candidate comparisons, issue notes, key quotes, polling-place instructions, deadlines, and optional reminders.[cite:53][cite:54][cite:45]

## Problem Statement

Wisconsin voters often have to jump across multiple systems to get a complete picture of an election. Official voting logistics are available through MyVote Wisconsin, while race context may live in news coverage, candidate sites, debate videos, ad libraries, polling releases, and campaign emails. This fragmentation creates confusion and increases the likelihood that voters either miss important races or rely on low-quality summaries disconnected from primary sources.[cite:53][cite:54][cite:44]

At the same time, campaign messaging increasingly reaches voters through paid digital ads and fast-moving issue narratives. Meta maintains a political and social-issue ad archive with additional transparency information and seven-year retention for such ads, which makes it possible to build a durable public record of digital persuasion in Wisconsin races.[cite:21]

## Users

### Primary users

- Wisconsin voters seeking ballot and race information.
- Civically engaged residents comparing candidates by issue.
- First-time and infrequent voters who need practical voting help.
- Journalists and public-media staff monitoring races and messaging.
- Advocacy and civic organizations building voter education materials.

### Secondary users

- Researchers analyzing digital campaign advertising.
- Local newsroom editors and producers creating election explainers.
- Campaign observers tracking narrative shifts over time.

## Product Principles

The product should follow these principles:

- Non-partisan presentation.
- Source-linked claims everywhere possible.
- Clear separation of official information, candidate claims, reported context, and ad activity.
- Address-aware guidance for relevance.
- Mobile-first design because many voters will use it close to Election Day.
- Editorial transparency about uncertainty, missing data, and interpretation.

Because this platform touches voting logistics, trust is the product. MyVote should remain the canonical source for polling-place and absentee workflows, while platform-generated summaries should clearly label whether a statement is an official rule, a candidate position, a newsroom summary, or an ad-library record.[cite:53][cite:54][cite:45]

## Goals and Success Metrics

### Product goals

- Deliver the most comprehensive Wisconsin voter guide for statewide and major local races.
- Provide a personalized ballot and voter brief for individual users.
- Build a reusable election-intelligence data model that can support future Wisconsin cycles.
- Surface campaign ad activity alongside candidate issue positions and reporting.

### Success metrics

- Ballot lookup completion rate.
- Percentage of race pages with sourced issue positions and quotes.
- Daily active users during the pre-election period.
- Save/share/export rate for personal voter briefs.
- Absentee and polling-place task completion clicks.
- Number of races with live ad tracking coverage.
- Editorial freshness, such as median age of candidate-position summaries.

## Scope

### In scope for MVP

- Wisconsin address-based ballot experience.
- Statewide and selected high-interest race guide pages.
- Candidate profiles with issue summaries, quotes, and source links.
- Voting information pages covering registration, absentee, polling places, and key dates.
- Meta ad tracking for political and social-issue ads.[cite:21]
- News article aggregation and editorial summaries for major races.[cite:44]
- Personal voter brief generation for logged-in users.

### Phase 2

- Google ad transparency ingestion via public pages or structured third-party access.[cite:18][cite:22]
- Polling data ingestion and race trend summaries.
- County and municipal race expansion.
- Audio mode and multilingual content.
- SMS/email reminders tied to election deadlines.

### Out of scope for MVP

- Endorsement recommendation engine.
- Persuasion targeting.
- User-generated partisan commentary.
- Nationwide expansion.

## Core Features

## 1. Address-based ballot and election guide

Users should be able to enter an address and get their next election, ballot context, polling-place information, and relevant voting instructions. MyVote Wisconsin provides official paths for finding the next election, locating a polling place, and learning absentee options, so the product should link or embed official flows where possible rather than attempting to replace the state’s authoritative system.[cite:53][cite:54][cite:45]

Functional requirements:

- Address search.
- Ballot assembly by voter geography.
- Election date and type display.
- Polling-place location and hours when available.
- Registration status and absentee call-to-action handoff to official sources.
- Deadline modules tuned to the relevant election.

## 2. Race pages

Each race page should provide a structured guide to the office, why the race matters, who is running, recent developments, polling, and ad activity. Wisconsin-focused reporting outlets such as Wisconsin Watch provide statewide race analysis that can be incorporated as summaries and links, while official voting mechanics should continue to come from MyVote and related official guidance.[cite:44][cite:53]

Race page modules:

- Race overview.
- Candidate cards.
- Issue comparison table.
- Latest quotes.
- Related reporting.
- Polling trend summary.
- Ad-spend and creative timeline.

## 3. Candidate profiles

Candidate pages should include factual background, campaign website links, issue stances, quotes, and ad activity. Stance summaries should be generated from primary or high-quality secondary sources and stored with confidence scores, source counts, and human-review status.

Profile modules:

- Biography and office sought.
- Top issues.
- Policy positions by topic.
- Quote library with context.
- Ad archive.
- Reporting timeline.
- Polling snapshots where available.

## 4. Issue and policy stance engine

This feature should turn speeches, policy pages, interviews, debate transcripts, press releases, and ads into neutral issue summaries. Because candidate positions can be vague or shift over time, the system should support labels such as support, oppose, mixed, evolving, and unclear rather than forcing a false binary.

Data structure:

- Issue slug.
- Stance label.
- Summary text.
- Confidence score.
- Last reviewed timestamp.
- Source links.
- Reviewer note.

## 5. Quote library

Every candidate should have a quote stream sourced from interviews, debates, campaign statements, and ad creatives. Quotes should always retain surrounding context such as source outlet, date, location, and full-source URL when available. This is important because attribution and framing affect meaning, especially in high-conflict races.

## 6. Voting logistics and how-to-vote hub

This section should explain how to register, vote absentee, vote early where applicable, find a polling place, understand ID requirements, and know key deadlines. MyVote provides official absentee workflows and next-election lookup, while Wisconsin voter-information resources note that voters can register online if eligible and can also register at the polls on Election Day with proof of residence.[cite:45][cite:48][cite:47]

Key topics:

- How to register.
- How to request an absentee ballot.
- When to request early.
- Polling-place lookup.
- What to bring.
- Deadline explainer.
- Common mistakes and FAQs.

## 7. Campaign ad tracker

Meta’s Ad Library tools explicitly support deeper analysis of political and social-issue ads, and Meta says these ads include additional transparency data and remain archived for seven years. This makes Meta the best first platform for a Wisconsin ad tracker, with Google added later through a separate adapter model.[cite:21]

Ad tracker modules:

- Creative gallery.
- Search by candidate, committee, issue, or keyword.
- Timeline of launches and pauses.
- Spend and impression ranges.
- Funding entity mapping.
- Destination URL tracking.
- Ad-message clustering.

## 8. Polling data in the guide

Polling should be included, but carefully. The product should show pollster, field dates, sample, mode, sponsor, topline, and trend context, and it should avoid presenting polling as deterministic. Polling belongs in race pages and in the personal voting brief only as a contextual module, not as the headline element. Because polling data can be inconsistent or sparse, the system should track source quality and allow editors to exclude low-quality polls.

Functional requirements:

- Poll ingestion table.
- Pollster-quality metadata.
- Poll average logic.
- Trend line and recency weighting.
- Labels such as "limited polling" or "insufficient recent data."

## 9. Personal voter brief

A logged-in user should be able to generate a personal brief tailored to address, saved races, selected issues, and preferred reading depth. The brief should be readable on mobile, printable, and exportable as a shareable document for taking to the polls. It should include ballot items, race summaries, candidate comparisons, saved quotes, polling-place instructions, deadlines, and a checklist for Election Day.[cite:53][cite:54]

Possible personalization inputs:

- Address and ballot geography.
- Saved races.
- Selected issues of interest.
- Preferred detail level, such as short, standard, or deep.
- Language preference.
- Accessibility settings.

Output formats:

- Mobile brief.
- Printable PDF or markdown export.
- SMS-ready short checklist.
- Audio summary.

## Personalization Strategy

Personalization should help relevance and usability, not create ideological filtering or opaque ranking. The system should personalize based on ballot geography, user-saved issues, accessibility needs, and preferred content density. It should not suppress candidates or race information because of inferred ideology.

Recommended personalization layers:

- Location-based relevance.
- Saved issue priorities.
- Saved candidate and race tracking.
- Reminder settings.
- Brief composition preferences.

A useful pattern is "Explain more about housing, education, and abortion on my ballot" rather than "Show me only candidates I agree with." That distinction keeps the platform service-oriented and defensible as a public-interest product.

## Should the product use Clerk and Convex?

Yes, Clerk plus Convex is a strong fit for this product if the team wants fast iteration, reliable auth, and app-level authorization without building core account systems from scratch. Convex’s documentation says it works with third-party auth providers through OpenID Connect JWTs and specifically notes Clerk as a strong option for Next.js and React Native support, while Clerk Organizations provides multi-tenant roles and permissions for team-based products.[cite:60][cite:59]

For the public-facing voter product, basic citizens likely need only personal accounts, saved briefs, and preferences. For newsroom, civic-organization, or partner workflows, Clerk Organizations becomes valuable because it supports grouped users, roles, permissions, and active organization context for multi-tenant use cases.[cite:59][cite:56]

Recommended architecture:

- Clerk for auth, sessions, magic links, social sign-in, account recovery, and optional organization support.[cite:55][cite:59]
- Convex for app backend, real-time data access, personalization state, brief generation jobs, and authorization logic in functions.[cite:60]
- Next.js frontend for the public product and editor/admin tools.

Important implementation note: Clerk’s documentation warns that apps should not rely on the singleton session cookie alone for organization-aware multi-tab context and should instead pass a token using `getToken()` for the correct organization context in requests. This matters if the team builds newsroom dashboards or partner workspaces using organizations.[cite:59]

Recommendation:

- Use Clerk for public user accounts and saved guides.
- Use Clerk Organizations only for editorial teams, civic partners, or newsroom clients.
- Use Convex as the primary backend if real-time updates and fast developer iteration are priorities.

## Should the product use Firecrawl or Oxylabs?

The product likely needs both browser-capable extraction and selective enterprise-grade crawling, but not in the same role. Firecrawl is better suited for structured content extraction, page rendering, and developer-friendly scraping workflows, while Oxylabs is better suited for enterprise proxy infrastructure and harder anti-bot environments. Firecrawl’s pricing page presents a usage-based, low-entry model with a free tier and small paid plans, while Firecrawl’s own comparison content characterizes Oxylabs as a more expensive enterprise proxy option.[cite:67][cite:66]

For this product, the better recommendation is:

- Use Firecrawl first for candidate websites, issue pages, press-release pages, FAQ pages, and article extraction where structured markdown or rendered content is useful.[cite:67]
- Use Playwright or Browserbase-style browser automation for targeted workflows when needed.
- Add Oxylabs only if anti-bot restrictions, scale, or reliability needs exceed what the simpler stack can support.[cite:66]

This is especially true because much of the highest-value source material for the guide will come from normal public webpages, campaign websites, news stories, and official pages rather than adversarial targets. Oxylabs may become useful later for resilience at scale, but it is not the best first default for an MVP.[cite:66][cite:67]

## Recommended Technical Architecture

### Frontend

- Next.js with TypeScript.
- Mobile-first web app.
- Public guide pages, race pages, and candidate pages.
- Authenticated user dashboard for saved briefs.
- Admin/editor workspace.

### Backend

- Convex for queries, mutations, actions, scheduled jobs, and real-time subscriptions.[cite:60]
- Clerk for authentication and session handling.[cite:55][cite:59]
- Optional Postgres warehouse later for analytics-heavy reporting if needed.

### Data ingestion

- Official election and voting data connectors.
- Meta Ad Library ingestion.[cite:21]
- Google transparency adapter.[cite:18][cite:22]
- Article and candidate-site extraction via Firecrawl for structured content retrieval.[cite:67]
- Manual editorial CMS tools for review and override.

### AI and classification layer

- Issue extraction and stance summarization.
- Quote extraction.
- Ad-message clustering.
- Article summarization.
- Polling note generation.
- Confidence scoring and human review queue.

## High-Level Data Model

Core entities:

- `users`
- `user_preferences`
- `voter_briefs`
- `elections`
- `races`
- `ballot_items`
- `candidates`
- `committees`
- `issues`
- `candidate_positions`
- `quotes`
- `sources`
- `articles`
- `ads`
- `ad_metrics_daily`
- `polls`
- `poll_averages`
- `polling_places`
- `deadlines`
- `editor_reviews`

A key design rule is that every public-facing summary should be traceable back to `sources`. This is necessary for both trust and operational maintenance.

## Editorial Workflow

1. Ingest official and public source material.
2. Extract structure from candidate pages, articles, and ads.
3. Run AI classification and summarize into draft issue cards, quotes, and article abstracts.
4. Route ambiguous items to human review.
5. Publish only reviewed or confidence-qualified outputs.
6. Recheck stale records on a schedule.

Because issue stances can be nuanced or strategically vague, human review should remain part of the editorial path for statewide and high-impact races. The tool should therefore include reviewer dashboards, diff views, and source-side previews.

## Polling Methodology Module

Polling data can improve the guide when used carefully, but it introduces risk if poorly sourced or over-weighted. The platform should therefore include a methodology note visible wherever polls appear. Each poll should show:

- Pollster.
- Sponsor.
- Field dates.
- Sample size.
- Population type.
- Method, such as live phone, IVR, online panel.
- Margin of error if available.
- Link to original release.

Product rule: polling must be contextual, never definitive. The interface should say what the polling suggests and also when polling is sparse, old, or conflicting.

## Trust, Compliance, and Risk

### Trust risks

- Misstating a candidate’s position.
- Using a quote out of context.
- Displaying stale voting instructions.
- Overstating polling certainty.
- Misattributing ad sponsors.

### Mitigations

- Force source linkage and freshness windows.
- Label official vs campaign vs reported vs ad-library data.
- Keep official voting actions tied to MyVote or verified official sources.[cite:53][cite:45]
- Add human review for high-impact summaries.
- Show update timestamps throughout the product.

### Legal and compliance considerations

- Respect website terms and scraping boundaries.
- Respect ad-library terms and rate limits on Meta.[cite:21]
- Avoid storing unnecessary sensitive personal data.
- Keep personalization focused on utility rather than persuasion.

## Competitive Positioning

The product would sit between several categories:

- Official voter-service tools like MyVote, which are authoritative but narrower in editorial and comparative scope.[cite:53]
- Newsroom election explainers like Wisconsin Watch, which provide context but not full personalized ballot utility.[cite:44]
- Transparency tools like Meta Ad Library, which provide raw ad records but not Wisconsin-specific voter-guide synthesis.[cite:21]

The strongest differentiation is combining all three into one source-linked, Wisconsin-specific experience.

## Recommended Rollout Plan

### Phase 1: Foundation

- Address-based election and ballot experience.
- Voting logistics hub.
- Statewide race pages.
- Candidate profile scaffolding.
- User accounts and saved briefs.

### Phase 2: Intelligence layer

- Meta ad tracker.[cite:21]
- Article aggregation and summary workflow.[cite:44]
- Quote library.
- Issue-position engine.
- Polling tables and methodology.

### Phase 3: Personalization and scale

- Personal voter brief builder.
- Polling trend summaries.
- Google adapter.[cite:18][cite:22]
- Organization workspaces for newsroom/civic partners.[cite:59]
- Audio and multilingual support.

## Build Recommendation

The recommended build is a Next.js application with Clerk for authentication and user management, Convex for the application backend and personalization logic, Firecrawl for most structured public-web extraction, and Meta-first ad ingestion, with Google added as a secondary platform adapter later. This stack keeps the MVP lean, allows fast iteration, supports both public and authenticated experiences, and leaves room for editorial review and multi-tenant partner workflows.[cite:55][cite:60][cite:67][cite:21]

Oxylabs should be treated as an escalation tool rather than a default dependency. Clerk Organizations should be used for internal/editorial or partner-facing workspaces, not required for the average citizen user. Polling should be included, but with strong methodology labeling and without letting it dominate the guide. The personal voter brief should become the signature feature because it translates a large amount of civic information into something actionable that a Wisconsin voter can actually carry into the voting process.[cite:59][cite:66][cite:67]

## Proposed Project Framing

Working title: **BadgerBrief**

Brand descriptor: **BadgerBrief** is a Wisconsin-first, non-partisan voter guide and ballot brief platform.

One-sentence proposal: Build BadgerBrief, a Wisconsin-first, non-partisan, address-aware voter guide that combines official voting logistics, candidate issue stances, sourced quotes, race coverage, polling context, and campaign ad transparency into a personalized voter brief for citizens and a structured intelligence product for civic and media partners.

## Agent Architecture

## Why agents should be included

Agents should be included as assistive system components rather than as the core delivery mechanism for the public voter guide. The primary guide should remain a deterministic, source-linked, structured product because election and voting information requires consistency, auditability, and clear provenance. Agents add the most value where the work involves synthesis, tool use, repetitive monitoring, classification, drafting, and personalized assembly rather than canonical truth storage.[cite:53][cite:54][cite:21]

The platform should therefore use a hybrid architecture:

- Structured application and database as the source of truth.
- Human editorial review for sensitive or ambiguous civic information.
- Targeted agents for research, monitoring, personalization, and conversational assistance.

This design preserves trust while still using AI to reduce manual workload and improve the user experience.

## Agent strategy

The recommended strategy is to build a small system of focused agents instead of a single general-purpose election agent. Each agent should have a narrow mandate, explicit tool access, clear write permissions, and well-defined fallback behavior.

Design principles:

- Agents read from approved sources and internal structured data.
- Agents write only to draft tables, review queues, or generated brief artifacts unless explicitly allowed.
- Agents never directly publish high-impact civic claims without review.
- Official voting information is always resolved from official or verified sources before display.
- User-facing answers should cite or link to underlying sources whenever possible.

## Recommended framework: Vercel Eve

Vercel Eve is a strong fit for this platform because it is built for durable, multi-step, tool-using agents and supports scheduled execution, TypeScript tools, markdown-based instructions, subagents, and production deployment patterns. That matches the needs of an election guide that must monitor sources, synthesize updates, create personal briefs, and run recurring jobs during fast-moving campaign periods.[cite:85][cite:86]

Vercel’s AI SDK agent documentation also frames agents as systems that use tools in a loop to complete tasks, which matches the platform’s needs for research, source retrieval, brief composition, and freshness monitoring.[cite:76][cite:78]

Recommended use of Eve:

- Use Eve for background and editorial agents.
- Use Eve for the optional voter-facing question-answering and brief-generation assistant.
- Do not make the full public product depend on live agent reasoning for every page render.

## High-level architecture

```text
Citizen UI / Editor UI / Partner UI
        |
     Next.js App
        |
 Clerk Auth + Organizations ----- Convex Backend / DB / Jobs
        |                             |
        |                             |-- structured civic data tables
        |                             |-- user preferences and briefs
        |                             |-- source registry and freshness logs
        |                             |-- editorial review queues
        |
        +-----------------------------+
                                      |
                                  Agent Layer (Eve)
                                      |
          +---------------------------+----------------------------+
          |                           |                            |
     Brief Agent                Research Agent               Monitor Agent
          |                           |                            |
          +-------------+-------------+-------------+--------------+
                        |                           |
                 Source/API Tools             Crawl/Extraction Tools
                        |                           |
   Google Civic API, MyVote refs,         Firecrawl, browser tools,
   Meta Ad Library, polling feeds,        candidate sites, article pages,
   OpenStates, Legistar, internal DB      ad landing pages, public docs
```

## Agent roles

### 1. Personal Brief Agent

Purpose: generate a concise, source-linked personal voting brief for a user based on address, ballot, saved issues, saved races, and preferred detail level.

Inputs:

- Authenticated user ID.
- Address or ballot geography.
- Saved issue priorities.
- Saved races or candidates.
- Accessibility and language preferences.
- Election ID.

Tools:

- `getUserProfile(userId)`
- `getUserPreferences(userId)`
- `getBallot(address, electionId)`
- `getRaceSummary(raceId)`
- `getCandidateComparison(raceId, issueSet)`
- `getVotingInstructions(address, electionId)`
- `getPollingContext(raceId)`
- `renderBrief(format)`
- `saveBrief(userId, brief)`

Outputs:

- Mobile summary brief.
- Printable polling-place checklist.
- Detailed ballot brief.
- Short SMS-ready reminder summary.

Guardrails:

- Uses only reviewed or official data.
- Does not infer endorsements.
- Distinguishes facts, candidate claims, editorial summaries, and polling context.
- Includes update timestamps.

### 2. Research Agent

Purpose: collect and structure source material from candidate sites, issue pages, press releases, debate pages, public interviews, and news articles, then create draft summaries and quote candidates for human review.

Inputs:

- Candidate URL list.
- Race topics.
- Approved news domains.
- Article queue.
- Crawl schedules.

Tools:

- `crawlPage(url)`
- `extractStructuredContent(url)`
- `extractQuotes(documentId)`
- `classifyIssues(documentId)`
- `draftPositionSummary(candidateId, issue)`
- `createReviewTask(recordId)`
- `markSourceFreshness(url)`

Outputs:

- Draft issue summaries.
- Quote candidates with metadata.
- Article abstracts.
- Candidate-site snapshots.
- Review tasks for editors.

Guardrails:

- Writes only to draft tables.
- Never overwrites reviewed positions without versioning.
- Records source URL, fetch time, and extraction confidence.

### 3. Monitor Agent

Purpose: detect changes in race coverage, candidate pages, ads, polling, and source freshness.

Inputs:

- Source registry.
- Scheduled jobs.
- Watched candidates, races, advertisers, and issue pages.

Tools:

- `checkSourceChanges(sourceId)`
- `syncMetaAds(query)`
- `syncGoogleAds(query)`
- `syncPolling(raceId)`
- `flagStaleContent(entityId)`
- `notifyEditors(changeSet)`

Outputs:

- Freshness flags.
- New ad detections.
- New polling entries.
- Candidate website change alerts.
- Editorial action queue.

Guardrails:

- No public publishing.
- No destructive edits.
- All changes logged to review queues or refresh logs.

### 4. Voter Help Agent

Purpose: answer practical user questions such as when to vote, where to vote, how to request absentee ballots, and what is on the ballot, using official data and internal guide context.

Inputs:

- User question.
- Address or location context.
- Election ID when known.

Tools:

- `lookupElection(address)`
- `lookupPollingPlace(address)`
- `lookupAbsenteeRules(electionId)`
- `lookupRegistrationRules()`
- `searchGuideContent(query)`
- `handoffOfficialLink(topic)`

Outputs:

- Conversational answers.
- Linked official instructions.
- Step-by-step checklists.
- Escalation messages when data is uncertain.

Guardrails:

- Must privilege official sources for procedural voting guidance.
- Must disclose uncertainty or local variation.
- Must not provide legal advice.

### 5. Editorial QA Agent

Purpose: help editors review summaries, identify unsupported claims, compare old and new drafts, and flag places where the summary may overstate certainty.

Inputs:

- Draft position summaries.
- Draft quote records.
- Polling entries.
- Article abstracts.

Tools:

- `compareDraftToSources(recordId)`
- `scoreClaimSupport(recordId)`
- `detectMissingCitation(recordId)`
- `suggestNeutralRewrite(recordId)`
- `generateDiff(oldVersion, newVersion)`

Outputs:

- QA reports.
- Support scores.
- Diff views.
- Neutrality suggestions.

Guardrails:

- Advisory only.
- Editors retain final publish authority.

## Eve implementation structure

A suggested Eve repo layout:

```text
agents/
  brief-agent/
    instructions.md
    skills/
      writing-guidelines.md
      citation-rules.md
      nonpartisan-guidelines.md
    tools/
      get-user-profile.ts
      get-user-preferences.ts
      get-ballot.ts
      get-race-summary.ts
      get-candidate-comparison.ts
      get-voting-instructions.ts
      get-polling-context.ts
      save-brief.ts
      render-brief.ts

  research-agent/
    instructions.md
    skills/
      extraction-rules.md
      quote-extraction.md
      issue-taxonomy.md
      source-quality.md
    tools/
      crawl-page.ts
      extract-structured-content.ts
      extract-quotes.ts
      classify-issues.ts
      draft-position-summary.ts
      create-review-task.ts
      mark-source-freshness.ts

  monitor-agent/
    instructions.md
    skills/
      freshness-policy.md
      alerting-policy.md
    tools/
      check-source-changes.ts
      sync-meta-ads.ts
      sync-google-ads.ts
      sync-polling.ts
      flag-stale-content.ts
      notify-editors.ts

  voter-help-agent/
    instructions.md
    skills/
      official-guidance-policy.md
      escalation-policy.md
    tools/
      lookup-election.ts
      lookup-polling-place.ts
      lookup-absentee-rules.ts
      lookup-registration-rules.ts
      search-guide-content.ts
      handoff-official-link.ts

  editorial-qa-agent/
    instructions.md
    skills/
      neutrality-policy.md
      review-rubric.md
    tools/
      compare-draft-to-sources.ts
      score-claim-support.ts
      detect-missing-citation.ts
      suggest-neutral-rewrite.ts
      generate-diff.ts
```

## Tool design

Every agent tool should be deterministic, narrowly scoped, and backed by typed internal APIs or controlled third-party integrations. The agent should not scrape the open web directly unless the tool itself handles domain restrictions, source logging, and parsing constraints.

Recommended tool categories:

### Internal data tools

- User profile and preferences.
- Ballot assembly.
- Race and candidate retrieval.
- Source registry.
- Review queue operations.
- Brief persistence.

### Civic and election tools

- Google Civic Information API lookup for election and voter info.[cite:77][cite:79]
- MyVote-linked official reference tools for absentee, polling-place, and next-election flows.[cite:53][cite:54][cite:45]
- Election calendar and deadlines resolver.

### Transparency and campaign tools

- Meta Ad Library search and sync.[cite:21]
- Google transparency search adapter.[cite:18][cite:22]
- Advertiser and committee matcher.

### Research and extraction tools

- Firecrawl-backed page extraction for candidate websites, issue pages, press releases, and articles.[cite:67]
- Browser automation for difficult but approved targets.
- Article summarization and quote extraction.

### Policy and local-governance tools

- OpenStates legislator and bill lookup when connecting state policy context to candidates.[cite:74]
- Legistar lookup for local issue context and municipal race adjacencies.[cite:72][cite:73]

## Data flow between product and agents

The product should treat agents as workers connected to structured pipelines.

### Personal brief flow

1. User signs in via Clerk.
2. User saves address, election, and issue preferences.
3. Convex assembles ballot and structured race data.
4. Brief Agent receives a request with user context and election context.
5. Agent fetches reviewed summaries, quotes, voting rules, and polling context.
6. Agent renders a brief and stores it in `voter_briefs`.
7. Frontend displays and exports the brief.

### Research drafting flow

1. Candidate pages, news pages, and issue pages are added to the source registry.
2. Research Agent crawls approved sources on a schedule.
3. Agent extracts quotes and draft issue summaries.
4. Drafts are written to `candidate_positions_drafts`, `quote_drafts`, and `article_abstracts_drafts`.
5. Editorial QA Agent scores support and flags weak claims.
6. Editors review, edit, approve, and publish.

### Monitoring flow

1. Monitor Agent runs on schedules.
2. It checks Meta, Google, polling feeds, and registered sources.
3. It writes change logs and alerts to review queues.
4. Editors or automated jobs refresh affected race pages and summaries.

## Convex integration

Convex should serve as the central application backend for both user features and agent coordination. Its auth integration model supports JWT-based identity from third-party providers, which fits well with Clerk.[cite:60]

Suggested Convex responsibilities:

- Store user preferences and voter briefs.
- Store race, candidate, source, quote, ad, and poll tables.
- Expose internal query and mutation functions to Eve tools.
- Schedule lightweight refreshes and queue handoffs.
- Manage review status and publication state.

Suggested collections/tables for agent workflows:

- `sources`
- `source_fetch_logs`
- `candidate_positions_drafts`
- `candidate_positions_published`
- `quote_drafts`
- `quote_published`
- `article_abstracts_drafts`
- `review_tasks`
- `alerts`
- `voter_briefs`
- `brief_generation_jobs`

## Clerk integration

Clerk should manage authentication, saved-user state, and optional organization-based workspaces for internal or partner use cases. Clerk documentation emphasizes its organizations model for role-based, multi-tenant products, which fits editor, newsroom, and civic-partner collaboration use cases more than ordinary citizen accounts.[cite:59][cite:56]

Suggested use:

- Individual voter accounts for saved briefs, reminders, preferences, and return visits.
- Organization accounts for newsroom/editorial teams and partner organizations.
- Roles such as `reader`, `editor`, `reviewer`, `partner_admin`, and `admin`.

## Source and API map for agents

### Required APIs and sources

- Google Civic Information API for election and voter info lookup.[cite:77][cite:79]
- MyVote Wisconsin official pages and linked workflows for authoritative voting logistics.[cite:53][cite:54][cite:45]
- Meta Ad Library / Ad Library API for political-ad ingestion.[cite:21]
- Firecrawl for structured page retrieval from candidate and article sources.[cite:67]

### Strongly recommended

- OpenStates for legislative context.[cite:74]
- Legistar for municipal legislative context.[cite:72][cite:73]
- Polling source registry or a polling data provider.
- Geocoding/address normalization.
- Email and SMS delivery provider for reminders and brief distribution.

### Optional / escalation

- Oxylabs if crawling scale, proxy requirements, or anti-bot needs exceed the MVP stack.[cite:66]
- Browser automation infrastructure for sites that require rendering or interaction.

## Governance and guardrails

Because the product affects voting behavior, agents must operate under strict policies.

### Agent rules

- No endorsements or persuasion framing.
- No unsourced factual claims.
- No direct publication of unreviewed issue summaries for high-impact races.
- No procedural voting guidance without official-source confirmation.
- No hidden personalization based on inferred ideology.
- No deletion or overwrite of published records without versioning.

### Human review requirements

Human review should be mandatory for:

- New issue-position summaries for statewide races.
- Summaries derived from conflicting source material.
- Polling averages shown on marquee race pages.
- Newly matched ad sponsors with ambiguous committee relationships.
- Any answer that includes uncertain or unusual voting procedures.

## Product impact of the agent layer

Including agents improves the product in four ways:

- Better freshness, because monitoring can run continuously.
- Better scale, because extraction and summarization work can be automated.
- Better user utility, because personal briefs can be composed dynamically.
- Better editorial efficiency, because agents can prepare and QA draft material before human review.

The agent layer should therefore be treated as an enabling intelligence subsystem inside the broader product, not as the product itself.

## Updated recommendation

The final recommendation is to add a focused agent architecture to the PRD and project proposal. The platform should ship as a structured Wisconsin voter guide application with Clerk-authenticated personalization, Convex-backed data and workflow coordination, Firecrawl-backed source ingestion, official voting-source integration, and an Eve-based agent layer for personal brief generation, research drafting, monitoring, and editorial QA.[cite:85][cite:86][cite:60][cite:59][cite:67]

This approach balances trust, scalability, and user value. It keeps official voting logistics and reviewed civic data at the center, while using agents to create the differentiated experience: a living, personalized, Wisconsin-specific voter guide and election intelligence platform.

## Techniques Adapted from the Ground News Clone Guide

The attached Ground News clone guide offers several strong product-development and architecture techniques that can improve the Wisconsin voter guide, even though the end products are different. The most useful takeaways are not the news-specific UI patterns but the operating system behind the build: clear architectural boundaries, explicit AI instructions, structured verification, and tight control over how scraped or analyzed data becomes public-facing information.[cite:90]

This section translates those techniques into product recommendations for the Wisconsin voter guide and election intelligence platform.

## 1. Treat the platform as a pipeline, not a collection of pages

One of the strongest ideas in the Ground News clone guide is that the product is a pipeline: one layer scrapes, another processes, another analyzes, and the UI only reads from stored data. That mindset is directly applicable here because the voter guide will also depend on multiple upstream sources such as official election data, candidate websites, news coverage, polling, and ad archives.[cite:90]

Recommended adaptation:

- UI layer displays reviewed, stored data only.
- Ingestion layer fetches official and public source material.
- Analysis layer drafts summaries, classifications, and comparisons.
- Review layer approves or rejects draft content.
- Database remains the source of truth for what appears in the public product.

This structure improves reliability, prevents live hallucinated content, and makes it easier to audit what users saw at any given time.

## 2. Create a project-level `agents.md` file as the product brain

The Ground News guide uses an `agents.md` file as the single source of truth for what the project is, what it is not, how the architecture works, and which rules AI agents must follow. This is highly applicable to the voter guide because the project includes multiple complex workflows, several agents, and sensitive civic information that should not be handled inconsistently.[cite:90]

Recommended `agents.md` sections for this project:

- Product definition.
- Non-partisan and public-interest mission.
- Out-of-scope features.
- Architecture boundaries.
- Data validation rules.
- Tool ownership.
- Human review policies.
- Freshness rules.
- Fallback and escalation rules.
- Verification expectations.

This file should become the anchor document for all implementation prompts and agent behavior.

## 3. Use skill files for tools and editorial policy

The guide’s use of separate skill files for each important tool is a very strong operational pattern. It reduces confusion, keeps implementation decisions consistent, and makes it easier to update one tool’s rules without rewriting the entire project brief.[cite:90]

Recommended skill files for the voter guide:

- `skills/clerk-skill.md`
- `skills/convex-skill.md`
- `skills/eve-agent-skill.md`
- `skills/firecrawl-skill.md`
- `skills/google-civic-skill.md`
- `skills/meta-ad-library-skill.md`
- `skills/editorial-standards-skill.md`
- `skills/nonpartisan-policy-skill.md`
- `skills/polling-methodology-skill.md`
- `skills/review-workflow-skill.md`

This setup is especially useful because the project spans both engineering patterns and newsroom/editorial rules.

## 4. Require implementation prompts before code changes

The Ground News guide recommends a workflow where the AI first writes a detailed implementation prompt, saves it, and asks for approval before writing any code. That technique is extremely useful for this project because many features, such as ballot lookup or issue-position generation, carry trust and policy implications beyond ordinary UI work.[cite:90]

Every implementation prompt for this project should include:

- Goal.
- What files and skills were consulted.
- Assumptions made.
- Files that will change.
- Security and privacy considerations.
- Source hierarchy.
- Human review requirements.
- Acceptance criteria.
- Verification steps.

This gives the team a clean review point before a risky feature becomes code.

## 5. Add hard data-model rules before publishing content

The Ground News guide defines hard requirements for what data must exist before an article or article analysis can be saved. That same approach should be adopted here because the voter guide will publish candidate positions, quotes, polling entries, ad records, and voting procedures.[cite:90]

Recommended publish rules:

- A quote cannot be published without speaker, source URL, date, excerpt, and context.
- A candidate-position summary cannot be published without issue tag, summary text, source links, and review status.
- A polling record cannot be published without pollster, field dates, sample description, and original source link.
- A voting-rule or deadline record cannot be published without official-source verification and last-checked timestamp.
- An ad-to-candidate match cannot be published without a confidence level and sponsor evidence.

These rules protect trust and make downstream personalization safer.

## 6. Prototype the UI with fake data first

The Ground News guide explicitly recommends building the design system and key pages with placeholder data before wiring in the real backend. That is a smart pattern for the voter guide because the information architecture is complex and should be validated visually before the ingestion and review pipelines are fully operational.[cite:90]

Recommended pages to design with fake data first:

- Homepage with address entry and statewide highlights.
- Ballot overview page.
- Race detail page.
- Candidate comparison page.
- Issue explainer page.
- Voting logistics page.
- Personal voter brief page.
- Editorial review queue.

This would help the team test flow, hierarchy, and usability early, especially on mobile.

## 7. Build reusable visual explanation components

The Ground News clone centers article cards, bias bars, detail panels, related-story blocks, and reusable navigation components. The Wisconsin guide can borrow the component philosophy even though the subject matter differs.[cite:90]

Equivalent reusable components for this product should include:

- RaceCard
- CandidateCompareCard
- IssueStanceCard
- QuoteCard
- PollingTrendCard
- AdCreativeCard
- VotingChecklist
- DeadlineBanner
- SourceTrustLabel
- WhatChangedPanel

A reusable component system will make the guide feel coherent and will speed future expansion across statewide and local races.

## 8. Add strong verification steps to every feature

A particularly valuable technique in the Ground News guide is the insistence on explicit verification steps after every implementation. For a civic product, this is even more important because the team should test not only whether the code runs, but whether the information is correct, fresh, and clearly sourced.[cite:90]

Examples of verification steps for this project:

- Enter a known Wisconsin address and verify the displayed election information against official sources.
- Confirm that a candidate quote links back to the original source and that the excerpt is accurate.
- Verify that polling entries show field dates, sample, and pollster correctly.
- Confirm that absentee-voting instructions match current official guidance.
- Confirm that a personal voter brief includes only reviewed and source-linked issue summaries.

This technique can materially reduce risk before public launch.

## 9. Use scheduled jobs as a first-class system feature

The Ground News guide treats cron jobs and refresh pipelines as a core part of the product, not an afterthought. That is the right mindset for the voter guide because freshness matters: candidate websites change, ads launch, polling appears, deadlines approach, and race coverage evolves.[cite:90]

Recommended scheduled jobs:

- Daily candidate website freshness scan.
- Daily or hourly Meta ad sync during high-intensity campaign periods.
- Polling source refresh jobs.
- Deadline and election-calendar verification checks.
- Re-summarization jobs when major source changes are detected.
- Brief invalidation or refresh triggers when a saved race materially changes.

This helps turn the guide into a living civic product instead of a static election microsite.

## 10. Adapt semantic related-content features

The Ground News guide uses semantic related stories to connect articles by meaning rather than simple keyword matches. A similar concept can strengthen the Wisconsin guide by connecting users to related race coverage, issue explainers, candidate statements, and ad narratives.[cite:90]

Recommended related-content modules:

- Related race coverage.
- Related issue explainers.
- Similar candidate statements.
- Related ad themes.
- What else to know on this ballot.

This would make the guide easier to explore and more useful for voters who start from one race or one issue and want broader context.

## 11. Use authentication for utility, not for basic civic access

The Ground News guide gates certain content behind authentication. For the Wisconsin voter guide, the same auth system should be used more selectively. Core civic information should remain public, while authentication should primarily unlock personalization and workflow features.[cite:90]

Recommended auth-gated features:

- Saved address and ballot.
- Saved races and issues.
- Personal voter brief generation.
- Deadline reminders.
- Editor and partner dashboards.

This protects public access while still creating a reason for users to sign in.

## 12. Clarify tool ownership and boundaries

One of the clearest parts of the Ground News guide is the explicit tool-ownership section. That pattern is highly useful for this project because multiple services will overlap in function unless responsibilities are defined clearly.[cite:90]

Recommended tool ownership:

- Clerk owns user identity, sessions, and organization roles.
- Convex owns application data, workflow state, and internal functions.
- Eve owns agent execution, orchestration, and scheduled intelligence workflows.
- Firecrawl owns structured page extraction from approved public sources.
- Google Civic Information API and official election sources own election-operations truth where applicable.
- Meta Ad Library owns campaign-ad transparency ingestion.
- Human editors own final publication authority for sensitive summaries.

Clear ownership reduces accidental duplication and keeps the system understandable as it grows.

## 13. Elevate editorial review to a product feature

The Ground News guide is mostly engineering-focused, but one of its core lessons is that AI analysis should be separated from the final public UI by storage, validation, and workflow. In the voter guide, this should be extended into a full editorial-review product feature rather than treated as a backstage process.[cite:90]

Recommended editorial features:

- Draft vs published states.
- Review queue dashboards.
- Source-side previews.
- Diff view for changing candidate summaries.
- Confidence scores and uncertainty labels.
- Neutral rewrite suggestions.
- Review audit log.

This turns quality control into a durable product capability, which is essential for civic trust.

## Summary recommendation

The main lesson from the Ground News clone guide is that complex AI-assisted products work better when they are tightly governed. The Wisconsin voter guide should borrow that discipline: define the architecture clearly, constrain tool use, separate ingestion from presentation, require review points, and make verification part of the build process from the start.[cite:90]

The result would be a voter guide that feels more trustworthy, more maintainable, and more scalable. Instead of acting like a generic AI site that summarizes politics on the fly, it would behave like a governed civic intelligence system with strong editorial and technical controls.


## Brand Identity and UI Direction

The product name for this project is **BadgerBrief**. The name works because it is Wisconsin-specific, memorable, and tightly aligned with the product’s signature feature: a concise, personalized ballot and voting brief that a resident can actually use before and on Election Day.[cite:1]

The UI direction should use RetroUI, which describes itself as a neobrutalist React component library with bold borders, hard shadows, and playful type. That style is a strong fit for BadgerBrief because it can make election information feel clear, tactile, and scannable rather than soft, generic, or overly institutional.[cite:179][cite:184]

### RetroUI recommendation

Use RetroUI as the visual component base for:

- Hero sections and homepage blocks.
- Candidate comparison cards.
- Quote and issue cards.
- Polling and ad-tracker panels.
- Voting checklists and deadline banners.
- Personalized brief views.

The design goal should be civic clarity with bold hierarchy, not novelty for novelty’s sake. The neobrutalist treatment should be used to create strong contrast, clear information grouping, and memorable identity while keeping dense election content highly readable.[cite:179][cite:184]

## Wisconsin-inspired color palette

Wisconsin does not appear to have a single official statewide civic color system in the way a brand would, but several Wisconsin identity references are useful. The state flag is blue and white, while UW–Madison and Wisconsin athletics widely use cardinal or “Badger red” with white as a core identity pairing.[cite:172][cite:183][cite:177]

For BadgerBrief, the best palette is not a literal sports palette. Instead, it should be a Wisconsin-inspired civic palette that combines Badger red for emphasis, warm dairy-cream neutrals for readability, and a lake or flag-inspired blue for informational accents. This gives the product a Wisconsin feel without looking like a college athletics site.[cite:172][cite:183]

### Core palette

| Token | Hex | Role | Rationale |
|---|---|---|---|
| `bb-cardinal` | `#C5050C` | Primary action color | Widely recognized as Badger/cardinal red in Wisconsin identity systems.[cite:173][cite:183] |
| `bb-deep-red` | `#8F0B13` | Hover/active primary | Darker companion for buttons, hovers, and urgent emphasis derived from the red family.[cite:173][cite:177] |
| `bb-cream` | `#FFF7ED` | Main background | Warm, paper-like base that softens dense civic content and works well with neobrutalist UI. |
| `bb-butter` | `#F6E7B2` | Secondary surface/highlight | Dairy-inspired accent for info cards, explainers, and subtle highlight areas. |
| `bb-lake` | `#1F5D8B` | Informational accent | Inspired by Wisconsin water/flag blue cues for neutral informational states.[cite:172][cite:174] |
| `bb-pine` | `#2F5D3A` | Success/positive context | Evokes Northwoods and supports confirmations or completed steps. |
| `bb-charcoal` | `#1C1B1A` | Primary text and border | Strong legibility and ideal for RetroUI’s heavy borders and shadows. |
| `bb-paper` | `#FFFFFF` | Cards and elevated surfaces | Keeps key content modules crisp and printable. [cite:173][cite:183] |
| `bb-stone` | `#D8CEC1` | Border alt / muted UI | Soft neutral for dividers and low-emphasis chrome. |
| `bb-alert` | `#F4BD15` | Deadline/warning accent | Uses a Wisconsin system yellow/orange family for warnings and deadlines.[cite:171] |

### Suggested usage rules

- Use `bb-cream` as the page background and `bb-paper` for cards.
- Use `bb-cardinal` only for the primary CTA, active tabs, selected filters, and key data callouts.
- Use `bb-lake` for procedural information, help modules, and neutral informational UI.
- Use `bb-alert` for deadlines, registration reminders, and absentee-voting alerts.
- Use `bb-charcoal` for text, outlines, and RetroUI shadow treatment.
- Keep `bb-butter` and `bb-stone` as support tones rather than primary branding colors.

### RetroUI token mapping

```css
:root {
  --background: #FFF7ED;
  --foreground: #1C1B1A;
  --card: #FFFFFF;
  --card-foreground: #1C1B1A;
  --popover: #FFFFFF;
  --popover-foreground: #1C1B1A;
  --primary: #C5050C;
  --primary-foreground: #FFFFFF;
  --secondary: #F6E7B2;
  --secondary-foreground: #1C1B1A;
  --muted: #D8CEC1;
  --muted-foreground: #4A4742;
  --accent: #1F5D8B;
  --accent-foreground: #FFFFFF;
  --destructive: #8F0B13;
  --destructive-foreground: #FFFFFF;
  --success: #2F5D3A;
  --warning: #F4BD15;
  --border: #1C1B1A;
  --input: #FFFFFF;
  --ring: #C5050C;
  --shadow: 4px 4px 0px #1C1B1A;
}
```

### UI mood and component notes

The visual mood should feel like a cross between a civic handbook, an indie magazine, and a trustworthy neighborhood bulletin board. RetroUI’s heavy outlines and shadows should be used to reinforce scanability and confidence, especially for race cards, compare tables, checklists, and “what changed” panels.[cite:179][cite:184]

To avoid a sports-site look:

- Limit red to high-value moments instead of flooding the page.
- Use cream and paper as the dominant field colors.
- Use lake blue for process and explanation modules.
- Use typography and layout restraint to balance RetroUI’s expressive component style.

### Suggested typography pairing

For a RetroUI-based BadgerBrief experience, use a pairing with one sturdy grotesk or UI sans for body text and a slightly expressive but readable display face for headlines. The typography should support election-density reading first and brand expression second. RetroUI emphasizes bold visual treatment, so the type should remain clear and practical rather than overly decorative.[cite:179][cite:184]
