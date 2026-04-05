/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as agentRuns from "../agentRuns.js";
import type * as auth from "../auth.js";
import type * as coach from "../coach.js";
import type * as context from "../context.js";
import type * as familylinkActivity from "../familylinkActivity.js";
import type * as goals from "../goals.js";
import type * as googleCalendar from "../googleCalendar.js";
import type * as http from "../http.js";
import type * as quests from "../quests.js";
import type * as recurringTodos from "../recurringTodos.js";
import type * as todos from "../todos.js";
import type * as uploads from "../uploads.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  agentRuns: typeof agentRuns;
  auth: typeof auth;
  coach: typeof coach;
  context: typeof context;
  familylinkActivity: typeof familylinkActivity;
  goals: typeof goals;
  googleCalendar: typeof googleCalendar;
  http: typeof http;
  quests: typeof quests;
  recurringTodos: typeof recurringTodos;
  todos: typeof todos;
  uploads: typeof uploads;
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

export declare const components: {};
