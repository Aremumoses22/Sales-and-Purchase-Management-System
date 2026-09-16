import { AttemptLimiter } from './attempt-limiter.js';

describe('AttemptLimiter', () => {
  const minute = 60_000;

  it('blocks after the maximum number of failures within the window', () => {
    const limiter = new AttemptLimiter(3, 15 * minute);
    for (let i = 0; i < 2; i++) limiter.recordFailure('k', 0);
    expect(limiter.isBlocked('k', 1000)).toBe(false);
    limiter.recordFailure('k', 2000);
    expect(limiter.isBlocked('k', 3000)).toBe(true);
    expect(limiter.retryAfterSeconds('k', 3000)).toBe(15 * 60 - 3);
  });

  it('unblocks once the window has passed', () => {
    const limiter = new AttemptLimiter(1, minute);
    limiter.recordFailure('k', 0);
    expect(limiter.isBlocked('k', minute - 1)).toBe(true);
    expect(limiter.isBlocked('k', minute)).toBe(false);
  });

  it('keeps keys independent and can be reset', () => {
    const limiter = new AttemptLimiter(1, minute);
    limiter.recordFailure('a', 0);
    expect(limiter.isBlocked('b', 0)).toBe(false);
    limiter.reset('a');
    expect(limiter.isBlocked('a', 0)).toBe(false);
  });
});
