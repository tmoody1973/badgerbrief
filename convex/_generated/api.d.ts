/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as adMoney from "../adMoney.js";
import type * as adminQueue from "../adminQueue.js";
import type * as ads from "../ads.js";
import type * as adsTv from "../adsTv.js";
import type * as audit from "../audit.js";
import type * as billClassify from "../billClassify.js";
import type * as billClassifyRun from "../billClassifyRun.js";
import type * as bills from "../bills.js";
import type * as billsFederal from "../billsFederal.js";
import type * as billsQueries from "../billsQueries.js";
import type * as briefAgent from "../briefAgent.js";
import type * as briefWorkflow from "../briefWorkflow.js";
import type * as briefs from "../briefs.js";
import type * as citedPages from "../citedPages.js";
import type * as coverage from "../coverage.js";
import type * as coverageBackfill from "../coverageBackfill.js";
import type * as crons from "../crons.js";
import type * as demoWorkflow from "../demoWorkflow.js";
import type * as donors from "../donors.js";
import type * as feedback from "../feedback.js";
import type * as finance from "../finance.js";
import type * as financeChatTools from "../financeChatTools.js";
import type * as generalBallot from "../generalBallot.js";
import type * as helloAgent from "../helloAgent.js";
import type * as houseVotes from "../houseVotes.js";
import type * as indexNow from "../indexNow.js";
import type * as interviewClips from "../interviewClips.js";
import type * as lib_adMoney from "../lib/adMoney.js";
import type * as lib_adsMatch from "../lib/adsMatch.js";
import type * as lib_agentTelemetry from "../lib/agentTelemetry.js";
import type * as lib_articleUrl from "../lib/articleUrl.js";
import type * as lib_ballot from "../lib/ballot.js";
import type * as lib_ballotExtras from "../lib/ballotExtras.js";
import type * as lib_billAnalysis from "../lib/billAnalysis.js";
import type * as lib_briefContext from "../lib/briefContext.js";
import type * as lib_briefEntities from "../lib/briefEntities.js";
import type * as lib_briefValidate from "../lib/briefValidate.js";
import type * as lib_campaignMap from "../lib/campaignMap.js";
import type * as lib_chatPayloads from "../lib/chatPayloads.js";
import type * as lib_chatUsage from "../lib/chatUsage.js";
import type * as lib_citedPage from "../lib/citedPage.js";
import type * as lib_countyKey from "../lib/countyKey.js";
import type * as lib_coverageEra from "../lib/coverageEra.js";
import type * as lib_extraction from "../lib/extraction.js";
import type * as lib_federalBillSummary from "../lib/federalBillSummary.js";
import type * as lib_firecrawlOutlet from "../lib/firecrawlOutlet.js";
import type * as lib_firecrawlSponsor from "../lib/firecrawlSponsor.js";
import type * as lib_googleAds from "../lib/googleAds.js";
import type * as lib_googleAdsFixture from "../lib/googleAdsFixture.js";
import type * as lib_houseVote from "../lib/houseVote.js";
import type * as lib_jobScope from "../lib/jobScope.js";
import type * as lib_metaAds from "../lib/metaAds.js";
import type * as lib_metaAdsFixture from "../lib/metaAdsFixture.js";
import type * as lib_notify from "../lib/notify.js";
import type * as lib_openfecEnrich from "../lib/openfecEnrich.js";
import type * as lib_outlets from "../lib/outlets.js";
import type * as lib_polls from "../lib/polls.js";
import type * as lib_publishedDate from "../lib/publishedDate.js";
import type * as lib_qa from "../lib/qa.js";
import type * as lib_questionnaire from "../lib/questionnaire.js";
import type * as lib_rollCall from "../lib/rollCall.js";
import type * as lib_scoutHealth from "../lib/scoutHealth.js";
import type * as lib_scoutParse from "../lib/scoutParse.js";
import type * as lib_sponsors from "../lib/sponsors.js";
import type * as lib_sunshineStale from "../lib/sunshineStale.js";
import type * as lib_tvExtract from "../lib/tvExtract.js";
import type * as lib_votehub from "../lib/votehub.js";
import type * as lib_voterHelpInstructions from "../lib/voterHelpInstructions.js";
import type * as lib_votingRecord from "../lib/votingRecord.js";
import type * as lib_wards from "../lib/wards.js";
import type * as lib_wisconsinWatch from "../lib/wisconsinWatch.js";
import type * as maintenance from "../maintenance.js";
import type * as mkeWards from "../mkeWards.js";
import type * as monitor from "../monitor.js";
import type * as monitorQueries from "../monitorQueries.js";
import type * as newsCleanup from "../newsCleanup.js";
import type * as newsTone from "../newsTone.js";
import type * as newsToneClassify from "../newsToneClassify.js";
import type * as outletEnrich from "../outletEnrich.js";
import type * as outlets from "../outlets.js";
import type * as pollsQueries from "../pollsQueries.js";
import type * as preferences from "../preferences.js";
import type * as public_ from "../public.js";
import type * as publish from "../publish.js";
import type * as publishedDateSync from "../publishedDateSync.js";
import type * as qa from "../qa.js";
import type * as qaQueries from "../qaQueries.js";
import type * as quoteIngest from "../quoteIngest.js";
import type * as research from "../research.js";
import type * as researchQueries from "../researchQueries.js";
import type * as scout from "../scout.js";
import type * as scoutQueries from "../scoutQueries.js";
import type * as seed from "../seed.js";
import type * as siteMap from "../siteMap.js";
import type * as social from "../social.js";
import type * as sponsorEnrich from "../sponsorEnrich.js";
import type * as sponsors from "../sponsors.js";
import type * as sunshineMonitor from "../sunshineMonitor.js";
import type * as tvExtractAgent from "../tvExtractAgent.js";
import type * as users from "../users.js";
import type * as votehub from "../votehub.js";
import type * as voterHelp from "../voterHelp.js";
import type * as voterHelpQueries from "../voterHelpQueries.js";
import type * as votes from "../votes.js";
import type * as votesQueries from "../votesQueries.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  adMoney: typeof adMoney;
  adminQueue: typeof adminQueue;
  ads: typeof ads;
  adsTv: typeof adsTv;
  audit: typeof audit;
  billClassify: typeof billClassify;
  billClassifyRun: typeof billClassifyRun;
  bills: typeof bills;
  billsFederal: typeof billsFederal;
  billsQueries: typeof billsQueries;
  briefAgent: typeof briefAgent;
  briefWorkflow: typeof briefWorkflow;
  briefs: typeof briefs;
  citedPages: typeof citedPages;
  coverage: typeof coverage;
  coverageBackfill: typeof coverageBackfill;
  crons: typeof crons;
  demoWorkflow: typeof demoWorkflow;
  donors: typeof donors;
  feedback: typeof feedback;
  finance: typeof finance;
  financeChatTools: typeof financeChatTools;
  generalBallot: typeof generalBallot;
  helloAgent: typeof helloAgent;
  houseVotes: typeof houseVotes;
  indexNow: typeof indexNow;
  interviewClips: typeof interviewClips;
  "lib/adMoney": typeof lib_adMoney;
  "lib/adsMatch": typeof lib_adsMatch;
  "lib/agentTelemetry": typeof lib_agentTelemetry;
  "lib/articleUrl": typeof lib_articleUrl;
  "lib/ballot": typeof lib_ballot;
  "lib/ballotExtras": typeof lib_ballotExtras;
  "lib/billAnalysis": typeof lib_billAnalysis;
  "lib/briefContext": typeof lib_briefContext;
  "lib/briefEntities": typeof lib_briefEntities;
  "lib/briefValidate": typeof lib_briefValidate;
  "lib/campaignMap": typeof lib_campaignMap;
  "lib/chatPayloads": typeof lib_chatPayloads;
  "lib/chatUsage": typeof lib_chatUsage;
  "lib/citedPage": typeof lib_citedPage;
  "lib/countyKey": typeof lib_countyKey;
  "lib/coverageEra": typeof lib_coverageEra;
  "lib/extraction": typeof lib_extraction;
  "lib/federalBillSummary": typeof lib_federalBillSummary;
  "lib/firecrawlOutlet": typeof lib_firecrawlOutlet;
  "lib/firecrawlSponsor": typeof lib_firecrawlSponsor;
  "lib/googleAds": typeof lib_googleAds;
  "lib/googleAdsFixture": typeof lib_googleAdsFixture;
  "lib/houseVote": typeof lib_houseVote;
  "lib/jobScope": typeof lib_jobScope;
  "lib/metaAds": typeof lib_metaAds;
  "lib/metaAdsFixture": typeof lib_metaAdsFixture;
  "lib/notify": typeof lib_notify;
  "lib/openfecEnrich": typeof lib_openfecEnrich;
  "lib/outlets": typeof lib_outlets;
  "lib/polls": typeof lib_polls;
  "lib/publishedDate": typeof lib_publishedDate;
  "lib/qa": typeof lib_qa;
  "lib/questionnaire": typeof lib_questionnaire;
  "lib/rollCall": typeof lib_rollCall;
  "lib/scoutHealth": typeof lib_scoutHealth;
  "lib/scoutParse": typeof lib_scoutParse;
  "lib/sponsors": typeof lib_sponsors;
  "lib/sunshineStale": typeof lib_sunshineStale;
  "lib/tvExtract": typeof lib_tvExtract;
  "lib/votehub": typeof lib_votehub;
  "lib/voterHelpInstructions": typeof lib_voterHelpInstructions;
  "lib/votingRecord": typeof lib_votingRecord;
  "lib/wards": typeof lib_wards;
  "lib/wisconsinWatch": typeof lib_wisconsinWatch;
  maintenance: typeof maintenance;
  mkeWards: typeof mkeWards;
  monitor: typeof monitor;
  monitorQueries: typeof monitorQueries;
  newsCleanup: typeof newsCleanup;
  newsTone: typeof newsTone;
  newsToneClassify: typeof newsToneClassify;
  outletEnrich: typeof outletEnrich;
  outlets: typeof outlets;
  pollsQueries: typeof pollsQueries;
  preferences: typeof preferences;
  public: typeof public_;
  publish: typeof publish;
  publishedDateSync: typeof publishedDateSync;
  qa: typeof qa;
  qaQueries: typeof qaQueries;
  quoteIngest: typeof quoteIngest;
  research: typeof research;
  researchQueries: typeof researchQueries;
  scout: typeof scout;
  scoutQueries: typeof scoutQueries;
  seed: typeof seed;
  siteMap: typeof siteMap;
  social: typeof social;
  sponsorEnrich: typeof sponsorEnrich;
  sponsors: typeof sponsors;
  sunshineMonitor: typeof sunshineMonitor;
  tvExtractAgent: typeof tvExtractAgent;
  users: typeof users;
  votehub: typeof votehub;
  voterHelp: typeof voterHelp;
  voterHelpQueries: typeof voterHelpQueries;
  votes: typeof votes;
  votesQueries: typeof votesQueries;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
};
