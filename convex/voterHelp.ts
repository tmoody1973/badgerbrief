"use node";
/**
 * MOO-310 Voter Help Agent — user-facing chat over PUBLISHED data + official
 * sources. Governance (spec §3): read-only tools only; publish mutations are
 * human-only and must never appear here. Telemetry: @convex-dev/agent v0.6
 * doesn't forward experimental_telemetry, so AGENT/TOOL/LLM spans are manual
 * (helloAgent.ts precedent) with session.id = threadId.
 */
import { v } from "convex/values";
import { z } from "zod";
import { internalAction } from "./_generated/server";
import { api, components, internal } from "./_generated/api";
import { Agent, createTool, saveMessage, stepCountIs } from "@convex-dev/agent";
import { anthropic } from "@ai-sdk/anthropic";
import type { Id } from "./_generated/dataModel";
import { ensureTelemetry, tracer } from "./lib/agentTelemetry";
import { OFFICIAL_LINKS, OFFICIAL_LINK_TOPICS, type OfficialLinkTopic } from "../src/lib/official-links";
import { buildIssueMatch } from "../src/lib/issue-match";
import {
  candidatePayload,
  coveragePayload,
  matchPayload,
  myBallotPayload,
  racePayload,
  visibleAnswer,
  votingInfoPayload,
} from "./lib/chatPayloads";
import { fetchCandidateAnswers, questionnairePayload } from "./lib/questionnaire";
import { questionnaireStatus } from "./lib/wisconsinWatch";
import { isFlagOn } from "./lib/chatUsage";
import { OUT_OF_COVERAGE_NOTE, VOTER_HELP_INSTRUCTIONS } from "./lib/voterHelpInstructions";
import { ISSUE_SLUGS } from "./lib/extraction";
import {
  LABEL_GLOSSARY,
  LABEL_GLOSSARY_KEY_DISTINCTION,
  LABEL_GLOSSARY_STANCE,
  LABEL_GLOSSARY_PATH,
} from "../src/lib/label-glossary";

const AGENT_NAME = "voter-help-agent";
// MOO-313 golden-gate history (2026-07-19, dataset voter-help-golden):
// haiku-4-5 79% (invented "leads polls", under-answered) → reverted to opus
// (93%). Cost pass: sonnet-5 with UNTUNED instructions 79% (emitted a literal
// `handoffOfficialLink:pollingPlace` pseudo-link, skipped the municipal-race
// disclosure); with the tuned rules below (links-from-tools-only, explicit
// out-of-coverage disclosure) sonnet-5 ties opus at 93% → shipped. Experiment
// `sonnet-5-tuned` is the gate baseline. Any change here re-runs the gate.
// 2026-10: instructions moved to lib/voterHelpInstructions.ts and rewritten for
// the Nov 3 general election; the gate baseline is recorded in docs/eval-gate.md.
const MODEL = "claude-sonnet-5";

/** Manual TOOL span wrapper (no-op passthrough when telemetry is off). */
async function withToolSpan(
  toolName: string,
  threadId: string | undefined,
  input: unknown,
  fn: () => Promise<string>,
): Promise<string> {
  return await tracer().startActiveSpan(toolName, async (span) => {
    span.setAttribute("openinference.span.kind", "TOOL");
    span.setAttribute("tool.name", toolName);
    if (threadId) span.setAttribute("session.id", threadId);
    span.setAttribute("input.value", JSON.stringify(input).slice(0, 4000));
    try {
      const out = await fn();
      span.setAttribute("output.value", out.slice(0, 4000));
      return out;
    } finally {
      span.end();
    }
  });
}

const getVotingInfo = createTool({
  description:
    "Official Wisconsin 2026 voting logistics: registration deadlines, absentee request/return deadlines, early voting, poll hours, voter ID requirement, and the official source URL. Read-only.",
  inputSchema: z.object({}),
  execute: async (ctx): Promise<string> =>
    withToolSpan("getVotingInfo", ctx.threadId, {}, async () => {
      const info = await ctx.runQuery(api.public.getVotingInfo, {});
      if (!info) return "No voting_info published — hand off the official link instead.";
      return JSON.stringify(votingInfoPayload(info));
    }),
});

export function voterAccessPayload(rows: unknown[]): string {
  return JSON.stringify({
    directive:
      "State the general rule and link the official source. Do NOT give case-specific legal advice; if the voter's situation is specific, hand off to the official source.",
    rows,
  });
}

const getVoterAccess = createTool({
  description:
    "Wisconsin voter eligibility & access situations (voter ID, absentee, election-day registration, disability, felony conviction, name change, ID/name mismatch, homelessness). Returns general rules with official sources. Read-only.",
  inputSchema: z.object({}),
  execute: async (ctx): Promise<string> =>
    withToolSpan("getVoterAccess", ctx.threadId, {}, async () => {
      const rows = await ctx.runQuery(api.public.getVoterAccess, {});
      return voterAccessPayload(rows);
    }),
});

const getMyBallot = createTool({
  description:
    "The signed-in user's district-relevant races and candidate names, based on their saved address. Returns districts: null when the user hasn't saved an address yet. For a question about ONE named office (\"is there a lieutenant governor race on my ballot?\"), call getRaceInfo for that office as well: the answer about the office must come from that tool, not from memory. Read-only.",
  inputSchema: z.object({}),
  execute: async (ctx): Promise<string> =>
    withToolSpan("getMyBallot", ctx.threadId, {}, async () => {
      if (!ctx.userId) return "No signed-in user — ask them to sign in.";
      const ballot = await ctx.runQuery(internal.voterHelpQueries.ballotForUser, {
        userId: ctx.userId as Id<"users">,
      });
      // Returning the bare `{"districts":null,"races":[]}` left the model to
      // recall a rule from the far end of the instructions, and it reliably did
      // not — it handed off to MyVote and never mentioned saving an address, so
      // the user had no way to learn why their ballot was empty.
      //
      // A directive alone was not enough either: the model reads this, THEN
      // calls handoffOfficialLink, then composes from that later result and
      // drops the instruction — the /brief line survived only 1 run in 3.
      // Returning the official link HERE removes the second hop, so the reason
      // and the handoff arrive together and neither can be lost without the
      // other.
      if (ballot.districts === null) {
        return JSON.stringify({
          districts: null,
          mustTellUser:
            "No saved address for this user, so no personalized ballot exists yet. " +
            "Say plainly that they need to save their address on the Brief page " +
            "(/brief) to see their own races, THEN offer the official link below. " +
            "Do not answer with the link alone — the reason is the useful part.",
          brief: { label: "Save your address on the Brief page", url: "/brief" },
          official: OFFICIAL_LINKS.myBallot,
        });
      }
      return JSON.stringify(myBallotPayload(ballot));
    }),
});

const matchBallotByIssues = createTool({
  description:
    `Given the issues a voter cares about, return which candidates ON THEIR BALLOT have a sourced published position on each — grouped by issue then race — plus who has "no position on record". Use for "I care about X and Y, who should I look at?", "which candidates align with my priorities?", "who has a position on healthcare?". ALIGNMENT ONLY — never a ranking, score, or recommendation. issueSlugs must come from this list (map the voter's own words to the closest ones, skip anything that doesn't fit): ${ISSUE_SLUGS.join(", ")}. Uses the signed-in user's saved ballot; falls back to the statewide races on every ballot when no address is saved. Read-only.`,
  inputSchema: z.object({
    issueSlugs: z
      .array(z.enum(ISSUE_SLUGS))
      .min(1)
      .describe('Issue slugs the voter cares about, e.g. ["healthcare","agriculture"]'),
  }),
  execute: async (ctx, { issueSlugs }): Promise<string> =>
    withToolSpan("matchBallotByIssues", ctx.threadId, { issueSlugs }, async () => {
      // The user's own ballot when they've saved an address; otherwise the
      // statewide races on every WI ballot (mirrors /match's statewide-first
      // fallback so the tool is useful before an address is saved).
      let raceIds: string[] = [];
      let scope: "ballot" | "statewide" = "statewide";
      if (ctx.userId) {
        const ballot = await ctx.runQuery(internal.voterHelpQueries.ballotForUser, {
          userId: ctx.userId as string,
        });
        if (ballot.races.length > 0) {
          raceIds = ballot.races.map((r: { raceId: string }) => r.raceId);
          scope = "ballot";
        }
      }
      if (raceIds.length === 0) {
        raceIds = await ctx.runQuery(internal.voterHelpQueries.statewideRaceIds, {});
      }
      const data = await ctx.runQuery(api.public.positionsForRaces, { raceIds });
      return JSON.stringify(matchPayload(buildIssueMatch(data, issueSlugs), issueSlugs, scope));
    }),
});

const getRaceInfo = createTool({
  description:
    'Look up a Wisconsin 2026 race by id: who is on the November 3, 2026 ballot (from the state\'s certified list), their published positions and campaign finance totals. Race ids: WI-GOV-2026 (Governor), WI-LTGOV-2026 (Lieutenant Governor), WI-AG-2026 (Attorney General), WI-SOS-2026 (Secretary of State), WI-TREAS-2026 (State Treasurer), WI-US-HOUSE-D<n>-2026 (U.S. House district n), WI-STATE-SENATE-D<n>-2026, WI-STATE-ASSEMBLY-D<n>-2026. Use it for any question about a specific office, including whether that office is on the ballot. Read-only.',
  inputSchema: z.object({
    raceId: z.string().describe('Race id such as "WI-GOV-2026"'),
  }),
  execute: async (ctx, { raceId }): Promise<string> =>
    withToolSpan("getRaceInfo", ctx.threadId, { raceId }, async () => {
      const data = await ctx.runQuery(api.public.getRace, { raceId });
      if (!data) return `No race found with id "${raceId}" — disclose this and hand off the official link.`;
      // Who is on the ballot, and what the model may say about everyone else,
      // is decided in lib/chatPayloads.ts from the certified list.
      return JSON.stringify(racePayload(data));
    }),
});

const getCandidateInfo = createTool({
  description:
    'Look up a candidate by slug (e.g. "david-crowley"): whether they are on the November 3, 2026 ballot, published positions with sources, published quotes, campaign finance. Read-only.',
  inputSchema: z.object({
    slug: z.string().describe('Candidate slug such as "david-crowley"'),
  }),
  execute: async (ctx, { slug }): Promise<string> =>
    withToolSpan("getCandidateInfo", ctx.threadId, { slug }, async () => {
      const data = await ctx.runQuery(api.public.getCandidateBySlug, { slug });
      if (!data) return `No candidate found with slug "${slug}" — disclose this and hand off the official link.`;
      return JSON.stringify(candidatePayload(data));
    }),
});

const getQuestionnaireAnswers = createTool({
  description:
    "The candidates' own words for one race: their answers to Wisconsin Watch's 2026 questionnaire, for every candidate on the November 3, 2026 ballot for that office. Use it when the voter asks what the candidates for an office say, think, would do, or why voters should elect them, or asks for a candidate's own words. Takes the same race ids as getRaceInfo. Quote the answers exactly and attribute them as told to Wisconsin Watch, link each candidate's own url, cover every candidate with similar space, and follow the rule in the result. Read-only.",
  inputSchema: z.object({
    raceId: z.string().describe('Race id such as "WI-STATE-ASSEMBLY-D19-2026"'),
  }),
  execute: async (ctx, { raceId }): Promise<string> =>
    withToolSpan("getQuestionnaireAnswers", ctx.threadId, { raceId }, async () => {
      const data = await ctx.runQuery(api.public.getRace, { raceId });
      if (!data) return `No race found with id "${raceId}" — disclose this and hand off the official link.`;
      // Who is on the ballot comes from our certified list, exactly as getRaceInfo decides it.
      const base = racePayload(data);
      const statusFor = (slug: string) => questionnaireStatus(raceId, slug);
      if (!base.onBallot.some((c) => statusFor(c.slug) !== null)) {
        return `Wisconsin Watch's questionnaire does not cover "${raceId}" — say BadgerBrief has no questionnaire answers for this office and use getRaceInfo for what it does hold.`;
      }
      const answering = base.onBallot.flatMap((c) => {
        const status = statusFor(c.slug);
        return status?.status === "answered" ? [{ slug: c.slug, candidateId: status.candidateId }] : [];
      });
      const fetched = Object.fromEntries(
        await Promise.all(answering.map(async ({ slug, candidateId }) => [slug, await fetchCandidateAnswers(candidateId)] as const)),
      );
      return JSON.stringify(
        questionnairePayload({
          race: { raceId: base.race.raceId, office: base.race.office },
          november: base.november,
          field: base.onBallot,
          statusFor,
          fetched,
          positions: base.positions,
        }),
      );
    }),
});

const getCoverage = createTool({
  description:
    'News coverage BadgerBrief tracks about a candidate (by slug, e.g. "david-crowley"): headline, outlet, publication date and link. Use for "what has been written/reported about X" and for recent developments. Read-only, reporting only — never a substitute for the candidate\'s own published positions.',
  inputSchema: z.object({
    candidateSlug: z.string().describe('Candidate slug such as "david-crowley"'),
  }),
  execute: async (ctx, { candidateSlug }): Promise<string> =>
    withToolSpan("getCoverage", ctx.threadId, { candidateSlug }, async () => {
      const rows = await ctx.runQuery(api.coverage.inTheNewsForCandidate, { candidateSlug });
      if (rows.length === 0) {
        return `No tracked coverage for "${candidateSlug}" — say BadgerBrief hasn't tracked reporting on this and hand off.`;
      }
      return JSON.stringify(coveragePayload(rows));
    }),
});

const getVotingRecord = createTool({
  description:
    'How a candidate who serves or served in the Wisconsin Legislature OR the U.S. House voted. Pass candidateSlug (e.g. "francesca-hong", "tom-tiffany") and an optional query matching a bill number ("AB 388", "HR 276") or words from its official title ("child care"). Returns the deciding vote first, the candidate\'s position, the tally, and the official roll-call link; the chamber field says which body. Works the same either way — you do not need to know whether they served in Madison or Washington. Read-only.',
  inputSchema: z.object({
    candidateSlug: z.string().describe('Candidate slug such as "francesca-hong"'),
    query: z.string().optional().describe('Bill number or words from its official title'),
  }),
  execute: async (ctx, { candidateSlug, query }): Promise<string> =>
    withToolSpan("getVotingRecord", ctx.threadId, { candidateSlug, query }, async () => {
      const rows = await ctx.runQuery(api.votesQueries.votingRecord, {
        candidateSlug,
        ...(query ? { query } : {}),
      });
      if (rows.length === 0) {
        return `No voting record for "${candidateSlug}" matching that. BadgerBrief covers Wisconsin Legislature floor votes (2011-2019, 2023, 2025 sessions) and U.S. House roll calls for the 119th Congress; federal coverage includes only votes tied to a bill or resolution. Say so plainly rather than guessing.`;
      }
      return JSON.stringify(rows.slice(0, 8));
    }),
});

/**
 * Political-label definitions, served from our own sourced copy.
 *
 * Without this the model answered "what is democratic socialism" from general
 * knowledge — plausible, unsourced, and against the rule that every claim on
 * this site links somewhere a reader can check. The tool's own description
 * steers its use; it has no rule in the standing instructions, so the rule
 * count stays down (docs/eval-gate.md).
 */
const getLabelGlossary = createTool({
  description:
    'BadgerBrief\'s own sourced definitions of the political labels used in this election: socialism, communism, democratic socialism, social democracy. Use whenever a voter asks what one of these words means, how they differ, or whether a candidate "is a socialist". Returns the definitions, the distinction people most often get wrong, and the /ballot-basics page. Always answer from this tool rather than general knowledge, and never apply a label to a candidate yourself.',
  inputSchema: z.object({
    term: z
      .string()
      .optional()
      .describe('One label to define, e.g. "democratic socialism". Omit for all four.'),
  }),
  execute: async (ctx, { term }): Promise<string> =>
    withToolSpan("getLabelGlossary", ctx.threadId, { term }, async () => {
      const q = term?.toLowerCase().trim();
      const hits = q
        ? LABEL_GLOSSARY.filter(
            (t) => t.term.toLowerCase().includes(q) || q.includes(t.term.toLowerCase()),
          )
        : LABEL_GLOSSARY;
      return JSON.stringify({
        terms: (hits.length > 0 ? hits : LABEL_GLOSSARY).map((t) => ({
          term: t.term,
          definition: t.definition,
          source: t.source ?? null,
        })),
        keyDistinction: LABEL_GLOSSARY_KEY_DISTINCTION,
        howToUseLabels: LABEL_GLOSSARY_STANCE,
        readMore: LABEL_GLOSSARY_PATH,
      });
    }),
});

const handoffOfficialLink = createTool({
  description:
    'The canonical official link for a voting action (register, absentee, pollingPlace, myBallot, voterId, electionsCommission, general). Use for every procedural handoff and whenever you lack data — never invent a URL. Pass reason: "no_data" when handing off BECAUSE BadgerBrief does not cover something, so the answer says so.',
  inputSchema: z.object({
    topic: z.enum(OFFICIAL_LINK_TOPICS as [OfficialLinkTopic, ...OfficialLinkTopic[]]),
    // A handoff means one of two different things and the answer must read
    // differently for each. Handing off a link ALONE reads as "here is where to
    // do this" — which is right for a procedural step and wrong for an
    // out-of-scope question, where the user is left thinking BadgerBrief simply
    // did not bother. Observed on "who's running for mayor of Green Bay?": the
    // model returned the WEC link and never said the guide does not cover
    // municipal races.
    reason: z
      .enum(["procedural", "no_data"])
      .optional()
      .describe('"no_data" when BadgerBrief does not cover what was asked'),
  }),
  execute: async (ctx, { topic, reason }): Promise<string> =>
    withToolSpan("handoffOfficialLink", ctx.threadId, { topic, reason }, async () => {
      // The reminder is UNCONDITIONAL, and conditionally worded, because gating
      // it on `reason` made the fix depend on the model choosing to set an
      // optional parameter — which it did roughly a third of the time, so the
      // disclosure came and went exactly as before. Returning it every time and
      // letting the wording decide when it applies removes that coin flip.
      // Harmless on a procedural handoff, where the "if" simply is not met.
      return JSON.stringify({
        ...OFFICIAL_LINKS[topic],
        ifYouLackTheData: OUT_OF_COVERAGE_NOTE,
      });
    }),
});

function makeVoterHelpAgent(
  model: string,
  instructions: string = VOTER_HELP_INSTRUCTIONS,
  // The questionnaire tool calls a third-party server. It is registered only
  // when switched on (QUESTIONNAIRE_TOOL=1), so "off" means the model never
  // sees it, and the gate can test it before voters do.
  options: { questionnaire?: boolean } = {},
) {
  return new Agent(components.agent, {
    name: AGENT_NAME,
    languageModel: anthropic(model),
    instructions,
    tools: {
      getVotingInfo, getVoterAccess, getMyBallot, matchBallotByIssues, getRaceInfo, getCandidateInfo, getCoverage, getVotingRecord, getLabelGlossary, handoffOfficialLink,
      ...(options.questionnaire ? { getQuestionnaireAnswers } : {}),
    },
    stopWhen: stepCountIs(8),
    // MOO-410 Task 3: bounds set here (rather than per-callsite) so BOTH the
    // prod streamText path and the evalAnswer generateText path inherit them
    // — the gate stays representative of prod.
    // `callSettings` is `CallSettings` from "ai" (confirmed via
    // node_modules/@convex-dev/agent/dist/client/types.d.ts Config type +
    // node_modules/ai/dist/index.d.ts CallSettings — flows into every
    // generateText/streamText call via start.js's `aiArgs = {
    // ...opts.callSettings, ... }`).
    callSettings: { maxOutputTokens: 1024 },
    // Anthropic "automatic caching" (confirmed against installed
    // @ai-sdk/anthropic 3.0.98 source + platform.claude.com/docs docs, since
    // Context7 wasn't available in this session): a single top-level
    // `cache_control` lets Anthropic cache the system prompt + tool schemas
    // (identical every call) and slide the breakpoint forward as the
    // conversation grows — no per-message/per-tool breakpoints needed, no
    // beta header, all active models. `Config.providerOptions` is marked
    // deprecated in the client types ("reach out if you use this") but is
    // still live in 0.6.4: start.js passes it straight through as the
    // top-level `providerOptions` arg to the real ai-sdk generateText/
    // streamText call for both paths.
    providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
  });
}

/** Read at each answer, so flipping the switch needs no deploy. */
const questionnaireOn = () => isFlagOn(process.env.QUESTIONNAIRE_TOOL);

/**
 * MOO-313 golden-dataset harness: one-shot answer with the production agent
 * (same instructions + tools), no thread persisted, NO telemetry spans — eval
 * runs must not pollute the continuous production-trace evaluators.
 * `model` / `instructions` overrides exist ONLY so the pre-deploy gate can run
 * candidate configs (e.g. haiku-vs-opus, deliberately degraded prompts).
 */
export const evalAnswer = internalAction({
  args: {
    prompt: v.string(),
    model: v.optional(v.string()),
    instructions: v.optional(v.string()),
    // The gate turns the questionnaire tool on to test it before voters get it.
    questionnaire: v.optional(v.boolean()),
  },
  returns: v.object({ text: v.string(), model: v.string(), toolTrace: v.string() }),
  handler: async (ctx, { prompt, model, instructions, questionnaire }) => {
    const useModel = model ?? MODEL;
    const agent = makeVoterHelpAgent(useModel, instructions, { questionnaire: questionnaire ?? questionnaireOn() });
    // Synthetic userId satisfies the agent's identity requirement; tools treat
    // it as signed-out (ballotForUser normalizes it away). No thread persisted.
    const result = await agent.generateText(ctx, { userId: "eval-gate" }, { prompt });
    // Tool calls + results, so the golden judge can verify grounding instead
    // of flagging correct tool-sourced facts as invented.
    const toolTrace = result.steps.flatMap((step) =>
      // With an optional tool in the set, the SDK types a result as possibly absent.
      step.toolResults.flatMap((tr) =>
        tr
          ? [
              {
                tool: tr.toolName,
                // 30K/tool: getRaceInfo alone is ~62KB pretty-printed; harsher cuts made
                // the golden judge read real tool data as "fabricated by the agent".
                output: String(typeof tr.output === "string" ? tr.output : JSON.stringify(tr.output)).slice(0, 30000),
              },
            ]
          : [],
      ),
    );
    // Judge what a voter sees: all the text the model wrote, not only the part
    // after its last tool call. Until 2026-10 this returned `result.text` (the
    // last step alone), which cut the opening sentences off any answer that
    // called a tool midway, and failed questions whose required disclosure
    // came first.
    return { text: visibleAnswer(result.steps, result.text), model: useModel, toolTrace: JSON.stringify(toolTrace) };
  },
});

/** Streams the answer into the thread (saveStreamDeltas → syncStreams on the client). */
export const streamAnswer = internalAction({
  args: {
    threadId: v.string(),
    promptMessageId: v.string(),
    userId: v.string(),
    prompt: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { threadId, promptMessageId, userId, prompt }) => {
    const telemetry = ensureTelemetry();
    const run = async () => {
      const result = await makeVoterHelpAgent(MODEL, undefined, { questionnaire: questionnaireOn() }).streamText(
        ctx,
        { threadId, userId },
        { promptMessageId },
        { saveStreamDeltas: true },
      );
      await result.consumeStream();
      return { text: await result.text, usage: await result.usage };
    };

    try {
      if (!telemetry) {
        await run();
        return null;
      }
      await tracer().startActiveSpan(`${AGENT_NAME}.run`, async (span) => {
        span.setAttribute("openinference.span.kind", "AGENT");
        span.setAttribute("agent.name", AGENT_NAME);
        span.setAttribute("session.id", threadId);
        span.setAttribute("user.id", userId);
        span.setAttribute("input.value", prompt.slice(0, 4000));
        try {
          const { text, usage } = await run();
          // manual LLM span (agent substrate caveat — nothing forwards telemetry)
          const llmSpan = tracer().startSpan("claude.streamText");
          llmSpan.setAttribute("openinference.span.kind", "LLM");
          llmSpan.setAttribute("llm.model_name", MODEL);
          llmSpan.setAttribute("session.id", threadId);
          llmSpan.setAttribute("input.value", prompt.slice(0, 4000));
          llmSpan.setAttribute("output.value", text.slice(0, 4000));
          if (usage?.inputTokens !== undefined)
            llmSpan.setAttribute("llm.token_count.prompt", usage.inputTokens);
          if (usage?.outputTokens !== undefined)
            llmSpan.setAttribute("llm.token_count.completion", usage.outputTokens);
          llmSpan.end();
          span.setAttribute("output.value", text.slice(0, 4000));
        } finally {
          span.end();
        }
      });
      await telemetry.forceFlush();
    } catch (err) {
      // The user's message is saved but no answer will arrive — leave a
      // visible failure message with the official fallback instead of silence.
      console.error(`voter-help streamAnswer failed: ${String(err)}`);
      await saveMessage(ctx, components.agent, {
        threadId,
        agentName: AGENT_NAME,
        message: {
          role: "assistant",
          content:
            "Sorry — something went wrong answering that. Please try again, or go straight to the official source: [MyVote Wisconsin](https://myvote.wi.gov).",
        },
      });
    }
    return null;
  },
});
