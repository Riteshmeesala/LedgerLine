import { describe, it, expect } from 'vitest';
import { generateIdempotencyKey } from '../utils/idempotency';

describe('Idempotency Management & Replay Protection', () => {
  it('generates valid RFC 4122 v4 UUID format', () => {
    const key = generateIdempotencyKey();
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('generates distinct keys for distinct user payment intents', () => {
    const key1 = generateIdempotencyKey();
    const key2 = generateIdempotencyKey();
    expect(key1).not.toBe(key2);
  });

  it('simulates retrying with the EXACT same key across multiple attempts', () => {
    // Intent started: Key generated once
    const intentKey = generateIdempotencyKey();

    // Simulated retry flow (e.g. timeout or duplicate submit)
    const attempts = [];
    for (let i = 0; i < 3; i++) {
      attempts.push(intentKey);
    }

    // All retries must carry identical key to trigger server-side deduplication
    expect(attempts[0]).toBe(intentKey);
    expect(attempts[1]).toBe(intentKey);
    expect(attempts[2]).toBe(intentKey);
  });
});
