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
import type * as audit from "../audit.js";
import type * as briefAgent from "../briefAgent.js";
import type * as briefWorkflow from "../briefWorkflow.js";
import type * as briefs from "../briefs.js";
import type * as crons from "../crons.js";
import type * as demoWorkflow from "../demoWorkflow.js";
import type * as finance from "../finance.js";
import type * as helloAgent from "../helloAgent.js";
import type * as lib_adMoney from "../lib/adMoney.js";
import type * as lib_adsMatch from "../lib/adsMatch.js";
import type * as lib_agentTelemetry from "../lib/agentTelemetry.js";
import type * as lib_briefContext from "../lib/briefContext.js";
import type * as lib_briefEntities from "../lib/briefEntities.js";
import type * as lib_briefValidate from "../lib/briefValidate.js";
import type * as lib_campaignMap from "../lib/campaignMap.js";
import type * as lib_extraction from "../lib/extraction.js";
import type * as lib_googleAds from "../lib/googleAds.js";
import type * as lib_googleAdsFixture from "../lib/googleAdsFixture.js";
import type * as lib_metaAds from "../lib/metaAds.js";
import type * as lib_metaAdsFixture from "../lib/metaAdsFixture.js";
import type * as lib_qa from "../lib/qa.js";
import type * as lib_scoutParse from "../lib/scoutParse.js";
import type * as monitor from "../monitor.js";
import type * as monitorQueries from "../monitorQueries.js";
import type * as preferences from "../preferences.js";
import type * as public_ from "../public.js";
import type * as publish from "../publish.js";
import type * as qa from "../qa.js";
import type * as qaQueries from "../qaQueries.js";
import type * as research from "../research.js";
import type * as researchQueries from "../researchQueries.js";
import type * as scout from "../scout.js";
import type * as scoutQueries from "../scoutQueries.js";
import type * as seed from "../seed.js";
import type * as siteMap from "../siteMap.js";
import type * as users from "../users.js";
import type * as voterHelp from "../voterHelp.js";
import type * as voterHelpQueries from "../voterHelpQueries.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  adMoney: typeof adMoney;
  adminQueue: typeof adminQueue;
  ads: typeof ads;
  audit: typeof audit;
  briefAgent: typeof briefAgent;
  briefWorkflow: typeof briefWorkflow;
  briefs: typeof briefs;
  crons: typeof crons;
  demoWorkflow: typeof demoWorkflow;
  finance: typeof finance;
  helloAgent: typeof helloAgent;
  "lib/adMoney": typeof lib_adMoney;
  "lib/adsMatch": typeof lib_adsMatch;
  "lib/agentTelemetry": typeof lib_agentTelemetry;
  "lib/briefContext": typeof lib_briefContext;
  "lib/briefEntities": typeof lib_briefEntities;
  "lib/briefValidate": typeof lib_briefValidate;
  "lib/campaignMap": typeof lib_campaignMap;
  "lib/extraction": typeof lib_extraction;
  "lib/googleAds": typeof lib_googleAds;
  "lib/googleAdsFixture": typeof lib_googleAdsFixture;
  "lib/metaAds": typeof lib_metaAds;
  "lib/metaAdsFixture": typeof lib_metaAdsFixture;
  "lib/qa": typeof lib_qa;
  "lib/scoutParse": typeof lib_scoutParse;
  monitor: typeof monitor;
  monitorQueries: typeof monitorQueries;
  preferences: typeof preferences;
  public: typeof public_;
  publish: typeof publish;
  qa: typeof qa;
  qaQueries: typeof qaQueries;
  research: typeof research;
  researchQueries: typeof researchQueries;
  scout: typeof scout;
  scoutQueries: typeof scoutQueries;
  seed: typeof seed;
  siteMap: typeof siteMap;
  users: typeof users;
  voterHelp: typeof voterHelp;
  voterHelpQueries: typeof voterHelpQueries;
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
