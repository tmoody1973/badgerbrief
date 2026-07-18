/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as audit from "../audit.js";
import type * as briefs from "../briefs.js";
import type * as crons from "../crons.js";
import type * as demoWorkflow from "../demoWorkflow.js";
import type * as finance from "../finance.js";
import type * as helloAgent from "../helloAgent.js";
import type * as lib_extraction from "../lib/extraction.js";
import type * as preferences from "../preferences.js";
import type * as public_ from "../public.js";
import type * as publish from "../publish.js";
import type * as research from "../research.js";
import type * as researchQueries from "../researchQueries.js";
import type * as seed from "../seed.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  audit: typeof audit;
  briefs: typeof briefs;
  crons: typeof crons;
  demoWorkflow: typeof demoWorkflow;
  finance: typeof finance;
  helloAgent: typeof helloAgent;
  "lib/extraction": typeof lib_extraction;
  preferences: typeof preferences;
  public: typeof public_;
  publish: typeof publish;
  research: typeof research;
  researchQueries: typeof researchQueries;
  seed: typeof seed;
  users: typeof users;
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
