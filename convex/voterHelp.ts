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

const AGENT_NAME = "voter-help-agent";
// MOO-313 golden-gate history (2026-07-19, dataset voter-help-golden):
// haiku-4-5 79% (invented "leads polls", under-answered) → reverted to opus
// (93%). Cost pass: sonnet-5 with UNTUNED instructions 79% (emitted a literal
// `handoffOfficialLink:pollingPlace` pseudo-link, skipped the municipal-race
// disclosure); with the tuned rules below (links-from-tools-only, explicit
// out-of-coverage disclosure) sonnet-5 ties opus at 93% → shipped. Experiment
// `sonnet-5-tuned` is the gate baseline. Any change here re-runs the gate.
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
      return JSON.stringify(info);
    }),
});

const getMyBallot = createTool({
  description:
    "The signed-in user's district-relevant races and candidate names, based on their saved address. Returns districts: null when the user hasn't saved an address yet. Read-only.",
  inputSchema: z.object({}),
  execute: async (ctx): Promise<string> =>
    withToolSpan("getMyBallot", ctx.threadId, {}, async () => {
      if (!ctx.userId) return "No signed-in user — ask them to sign in.";
      const ballot = await ctx.runQuery(internal.voterHelpQueries.ballotForUser, {
        userId: ctx.userId as Id<"users">,
      });
      return JSON.stringify(ballot);
    }),
});

const getRaceInfo = createTool({
  description:
    'Look up a Wisconsin 2026 race by id (e.g. "WI-GOV-2026"): candidates, published positions, campaign finance totals. Read-only.',
  inputSchema: z.object({
    raceId: z.string().describe('Race id such as "WI-GOV-2026"'),
  }),
  execute: async (ctx, { raceId }): Promise<string> =>
    withToolSpan("getRaceInfo", ctx.threadId, { raceId }, async () => {
      const data = await ctx.runQuery(api.public.getRace, { raceId });
      if (!data) return `No race found with id "${raceId}" — disclose this and hand off the official link.`;
      return JSON.stringify({ race: data.race, candidates: data.candidates, positions: data.positions, finance: data.finance });
    }),
});

const getCandidateInfo = createTool({
  description:
    'Look up a candidate by slug (e.g. "kelda-roys"): published positions with sources, published quotes, campaign finance. Read-only.',
  inputSchema: z.object({
    slug: z.string().describe('Candidate slug such as "kelda-roys"'),
  }),
  execute: async (ctx, { slug }): Promise<string> =>
    withToolSpan("getCandidateInfo", ctx.threadId, { slug }, async () => {
      const data = await ctx.runQuery(api.public.getCandidateBySlug, { slug });
      if (!data) return `No candidate found with slug "${slug}" — disclose this and hand off the official link.`;
      return JSON.stringify({
        candidate: data.candidate,
        race: data.race,
        positions: data.positions,
        quotes: data.quotes,
        finance: data.finance,
      });
    }),
});

const handoffOfficialLink = createTool({
  description:
    "The canonical official link for a voting action (register, absentee, pollingPlace, myBallot, voterId, electionsCommission, general). Use for every procedural handoff and whenever you lack data — never invent a URL.",
  inputSchema: z.object({
    topic: z.enum(OFFICIAL_LINK_TOPICS as [OfficialLinkTopic, ...OfficialLinkTopic[]]),
  }),
  execute: async (ctx, { topic }): Promise<string> =>
    withToolSpan("handoffOfficialLink", ctx.threadId, { topic }, async () => {
      return JSON.stringify(OFFICIAL_LINKS[topic]);
    }),
});

const INSTRUCTIONS = `You are Voter Help, BadgerBrief's non-partisan assistant for Wisconsin voters ahead of the Tuesday, August 11, 2026 partisan primary (general election: November 3, 2026).

Rules, in priority order:
1. OFFICIAL SOURCES FIRST. For any procedural question (registering, absentee voting, polling place, voter ID, deadlines), call getVotingInfo AND ALWAYS include the matching official link from handoffOfficialLink. MyVote Wisconsin is the authoritative system for taking action.
2. ALWAYS CITE. Every factual claim gets a markdown link to its source — the official URLs from tools, or the source links inside tool results. Never state a fact you did not get from a tool.
3. LINKS COME FROM TOOLS ONLY. Every URL you write must be copied verbatim from a tool result. NEVER invent a URL, and NEVER write tool-call syntax (like handoffOfficialLink:topic) as a link — actually call the tool and use the URL it returns.
4. DISCLOSE UNCERTAINTY. If tools return no data for a race, candidate, or detail, say plainly that BadgerBrief doesn't have it and hand off the official link instead. BadgerBrief covers the 2026 statewide, congressional, and legislative primary — for county or municipal races (mayor, sheriff, county exec), say explicitly that BadgerBrief doesn't cover them, then hand off. NEVER guess or invent candidates, dates, or rules.
5. NO LEGAL ADVICE. You may explain published voting rules; you may not advise on disputes, lawsuits, or individual legal situations. Decline those and point to the Wisconsin Elections Commission or the user's municipal clerk.
6. NO ENDORSEMENTS. Never recommend a candidate or party, never rank candidates, never characterize one as better. Present published positions neutrally, with citations.

Keep answers short — a few sentences plus links. Use getMyBallot for "my ballot" / "who's on my ballot" questions; if it reports districts: null, tell the user to save their address on the Brief page first.`;

function makeVoterHelpAgent(model: string, instructions: string = INSTRUCTIONS) {
  return new Agent(components.agent, {
    name: AGENT_NAME,
    languageModel: anthropic(model),
    instructions,
    tools: { getVotingInfo, getMyBallot, getRaceInfo, getCandidateInfo, handoffOfficialLink },
    stopWhen: stepCountIs(8),
  });
}

const voterHelpAgent = makeVoterHelpAgent(MODEL);

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
  },
  returns: v.object({ text: v.string(), model: v.string(), toolTrace: v.string() }),
  handler: async (ctx, { prompt, model, instructions }) => {
    const useModel = model ?? MODEL;
    const agent = makeVoterHelpAgent(useModel, instructions);
    // Synthetic userId satisfies the agent's identity requirement; tools treat
    // it as signed-out (ballotForUser normalizes it away). No thread persisted.
    const result = await agent.generateText(ctx, { userId: "eval-gate" }, { prompt });
    // Tool calls + results, so the golden judge can verify grounding instead
    // of flagging correct tool-sourced facts as invented.
    const toolTrace = result.steps.flatMap((step) =>
      step.toolResults.map((tr) => ({
        tool: tr.toolName,
        // 30K/tool: getRaceInfo alone is ~62KB pretty-printed; harsher cuts made
        // the golden judge read real tool data as "fabricated by the agent".
        output: String(typeof tr.output === "string" ? tr.output : JSON.stringify(tr.output)).slice(0, 30000),
      })),
    );
    return { text: result.text, model: useModel, toolTrace: JSON.stringify(toolTrace) };
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
      const result = await voterHelpAgent.streamText(
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
