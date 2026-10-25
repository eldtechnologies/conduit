/**
 * Request Logging Integration Tests
 *
 * Verifies through the full app (src/index.ts) that the request logger runs first,
 * so requests rejected by HTTPS enforcement or CORS still get request/response lines.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import app from '@/index.js';
import { config } from '@/config.js';

interface LogLine {
  type: 'request' | 'response';
  requestId: string;
  method: string;
  path: string;
  status?: number;
  app?: string;
}

describe('Request logging', () => {
  const originalLogging = process.env.ENABLE_LOGGING;
  const originalEnforceHttps = config.enforceHttps;

  afterEach(() => {
    process.env.ENABLE_LOGGING = originalLogging;
    config.enforceHttps = originalEnforceHttps;
    vi.restoreAllMocks();
  });

  function captureLogs(): LogLine[] {
    process.env.ENABLE_LOGGING = 'true';
    const lines: LogLine[] = [];
    vi.spyOn(console, 'info').mockImplementation((line: unknown) => {
      lines.push(JSON.parse(String(line)) as LogLine);
    });
    return lines;
  }

  function expectRequestAndResponse(lines: LogLine[], status: number) {
    const request = lines.find((l) => l.type === 'request');
    const response = lines.find((l) => l.type === 'response');
    expect(request).toMatchObject({ method: 'POST', path: '/api/send' });
    expect(response).toMatchObject({ method: 'POST', path: '/api/send', status });
    expect(response?.requestId).toBe(request?.requestId);
    expect(response?.app).toBeUndefined();
  }

  it('logs requests rejected by CORS (403 ORIGIN_NOT_ALLOWED)', async () => {
    const lines = captureLogs();

    const res = await app.fetch(
      new Request('http://localhost/api/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'KEY_TEST_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1',
          Origin: 'https://evil.example',
        },
        body: '{}',
      })
    );

    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe('ORIGIN_NOT_ALLOWED');
    expectRequestAndResponse(lines, 403);
  });

  it('logs requests rejected by HTTPS enforcement (403)', async () => {
    config.enforceHttps = true;
    const lines = captureLogs();

    const res = await app.fetch(
      new Request('http://localhost/api/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'KEY_TEST_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1',
          Origin: 'http://localhost:8080',
          'X-Forwarded-Proto': 'http',
        },
        body: '{}',
      })
    );

    expect(res.status).toBe(403);
    expect(await res.text()).toBe('HTTPS Required');
    expectRequestAndResponse(lines, 403);
  });

  it('logs the app name once authentication has run', async () => {
    const lines = captureLogs();

    const res = await app.fetch(
      new Request('http://localhost/api/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'KEY_TEST_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1',
          Origin: 'http://localhost:8080',
        },
        body: '{}',
      })
    );

    expect(res.status).toBe(400);
    expect(lines.find((l) => l.type === 'response')).toMatchObject({ status: 400, app: 'TEST' });
  });
});
