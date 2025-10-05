/**
 * Health Check Endpoint Tests
 *
 * Tests the basic health check endpoint functionality.
 */

import { describe, it, expect } from 'vitest';
import app from '../../src/index.js';

describe('Health Check', () => {
  it('should return 200 status', async () => {
    const req = new Request('http://localhost:3000/health');
    const res = await app.fetch(req);

    expect(res.status).toBe(200);
  });

  it('should return healthy status', async () => {
    const req = new Request('http://localhost:3000/health');
    const res = await app.fetch(req);
    const data = await res.json();

    expect(data).toEqual({
      status: 'healthy',
    });
  });

  it('should return JSON content type', async () => {
    const req = new Request('http://localhost:3000/health');
    const res = await app.fetch(req);

    expect(res.headers.get('content-type')).toContain('application/json');
  });
});
