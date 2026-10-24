/**
 * Test Fetch Helpers
 *
 * Vitest 4 types `vi.fn()` strictly, so an untyped mock is no longer
 * assignable to `global.fetch`, and `vi.fn<typeof fetch>()` forces every
 * mocked response to be a full `Response`. Tests only stub the fields the
 * code under test reads (`ok`, `status`, `json`, `text`), so this mock keeps
 * fetch's parameters but resolves to `unknown`.
 */

import { vi, type Mock } from 'vitest';

export type FetchMock = Mock<(...args: Parameters<typeof fetch>) => Promise<unknown>>;

/**
 * Create a fetch mock and install it as `global.fetch`.
 *
 * The cast is intentional: partial response stubs are enough for the code
 * paths under test.
 *
 * @returns The installed mock, for configuring responses and asserting calls.
 */
export function installFetchMock(): FetchMock {
  const fetchMock: FetchMock = vi.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

/**
 * Build a successful Resend `POST /emails` response.
 *
 * Returns a real `Response` because the Resend SDK (v5+) reads
 * `response.headers.entries()` on success; a partial stub without headers
 * makes the SDK report "Unable to fetch data" and the send fails with 502.
 * A fresh `Response` is needed per call since its body can be read only once.
 *
 * @param id - The email ID Resend would return.
 * @returns A 200 JSON response shaped like Resend's API.
 */
export function resendSuccessResponse(id: string): Response {
  return new Response(JSON.stringify({ id }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
