import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildApp } from './app';

describe('GET /health', () => {
  it('reports the service is up', async () => {
    const response = await request(buildApp()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
