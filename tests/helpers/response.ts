/**
 * Test Response Helpers
 *
 * Typed wrappers around `Response.json()` to avoid `unknown` propagation
 * in test assertions. Vitest tests run under strict TypeScript, so
 * `await res.json()` returns `unknown` and accessing properties trips
 * TS18046. Use `readJson<SuccessResponse>(res)` (or `ErrorResponse`,
 * or your own shape) to keep tests readable while staying strict.
 */

/**
 * Read and parse a `Response`'s JSON body, asserting it to the provided shape.
 *
 * The cast is intentional: tests already know what shape the endpoint
 * returns under each scenario, and runtime validation here would only
 * obscure assertion failures.
 *
 * @typeParam T - Expected shape of the JSON body (defaults to `unknown`).
 * @param res - The `Response` object from `app.fetch(...)` or similar.
 * @returns The parsed body, typed as `T`.
 */
export async function readJson<T = unknown>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

/**
 * Standard shape for a successful Conduit API response.
 *
 * Real production responses include channel-specific fields (e.g. `channel`,
 * `timestamp`, `llmAnalysis`); the index signature accommodates those without
 * forcing every test to enumerate them.
 */
export interface SuccessResponse {
  success: true;
  messageId?: string;
  [key: string]: unknown;
}

/**
 * Standard shape for a Conduit API error response.
 *
 * See `docs/api-reference.md` and `src/utils/errors.ts` for the canonical
 * error code enumeration. `retryAfter` is set for rate-limit errors; other
 * error-specific fields are exposed through the index signature.
 */
export interface ErrorResponse {
  success: false;
  error: string;
  code: string;
  retryAfter?: number;
  [key: string]: unknown;
}

/**
 * Hono context `Variables` shape for Conduit's middleware stack.
 *
 * The auth middleware (`src/middleware/auth.ts`) attaches the validated API
 * key to the request context via `c.set('apiKey', apiKey)`. Downstream
 * middleware (rate limit, logger) and route handlers retrieve it with
 * `c.get('apiKey')`. Tests that construct a `new Hono(...)` and exercise this
 * contract must declare it so `c.set`/`c.get` type-check against the same
 * shape used in production.
 *
 * Usage:
 * ```typescript
 * import type { AppVariables } from '../helpers/response.js';
 * const app = new Hono<{ Variables: AppVariables }>();
 * ```
 */
export interface AppVariables {
  apiKey: string;
}
