/**
 * Error Handler Middleware Unit Tests
 *
 * Verifies how the global error handler maps ConduitError and unknown errors
 * to JSON responses across environments.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Hono } from 'hono';
import { errorHandler } from '@/middleware/errorHandler.js';
import { ValidationError } from '@/utils/errors.js';
import { ErrorCode } from '@/types/api.js';
import { readJson, type ErrorResponse } from '../helpers/response.js';

function appThrowing(error: Error) {
  const app = new Hono();
  app.onError(errorHandler);
  app.get('/', () => {
    throw error;
  });
  return app;
}

async function request(error: Error) {
  const res = await appThrowing(error).fetch(new Request('http://localhost/'));
  return { status: res.status, data: await readJson<ErrorResponse>(res) };
}

describe('errorHandler', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    vi.restoreAllMocks();
  });

  it('should map ConduitError to its status code with details outside production', async () => {
    process.env.NODE_ENV = 'test';
    const { status, data } = await request(
      new ValidationError('bad input', ErrorCode.VALIDATION_ERROR, { field: 'to' })
    );

    expect(status).toBe(400);
    expect(data).toMatchObject({
      success: false,
      error: 'bad input',
      code: 'VALIDATION_ERROR',
      details: { field: 'to' },
    });
  });

  it('should hide ConduitError details in production', async () => {
    process.env.NODE_ENV = 'production';
    const { status, data } = await request(
      new ValidationError('bad input', ErrorCode.VALIDATION_ERROR, { field: 'to' })
    );

    expect(status).toBe(400);
    expect(data.details).toBeUndefined();
  });

  it('should treat a missing NODE_ENV as development', async () => {
    delete process.env.NODE_ENV;
    const { data } = await request(
      new ValidationError('bad input', ErrorCode.VALIDATION_ERROR, { field: 'to' })
    );

    expect(data.details).toEqual({ field: 'to' });
  });

  it('should return 500 with the message for unknown errors outside production', async () => {
    process.env.NODE_ENV = 'development';
    const { status, data } = await request(new Error('database exploded'));

    expect(status).toBe(500);
    expect(data).toEqual({ success: false, code: 'INTERNAL_ERROR', error: 'database exploded' });
    expect(console.error).toHaveBeenCalled();
  });

  it('should hide unknown error messages in production', async () => {
    process.env.NODE_ENV = 'production';
    const { status, data } = await request(new Error('database exploded'));

    expect(status).toBe(500);
    expect(data).toEqual({
      success: false,
      code: 'INTERNAL_ERROR',
      error: 'Internal server error',
    });
  });
});
