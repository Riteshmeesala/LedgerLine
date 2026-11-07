import { describe, it, expect } from 'vitest';
import { ApiError } from '../api/client';

describe('Problem+JSON Error Mapping (RFC 7807)', () => {
  it('instantiates ApiError with title, detail, and status', () => {
    const error = new ApiError(422, 'Insufficient Funds', 'Available balance is 0 paise, requested 1000 paise.');
    expect(error.status).toBe(422);
    expect(error.title).toBe('Insufficient Funds');
    expect(error.detail).toBe('Available balance is 0 paise, requested 1000 paise.');
    expect(error.message).toBe('Available balance is 0 paise, requested 1000 paise.');
  });

  it('captures Idempotent-Replayed flag on error or replay responses', () => {
    const error = new ApiError(200, 'Replayed', 'Success', {}, true);
    expect(error.isReplayed).toBe(true);
  });
});

