import { describe, expect, it } from 'vitest';
import { describeDriverTripCommit, resolveNextDriverTrip } from './driverTripCommit.js';

describe('resolveNextDriverTrip', () => {
  it('returns literal next', () => {
    expect(resolveNextDriverTrip({ tripId: 'a' }, { tripId: 'b' })).toEqual({ tripId: 'b' });
  });

  it('applies functional update', () => {
    expect(
      resolveNextDriverTrip({ tripId: 'a', n: 1 }, prev => ({ ...prev, n: (prev?.n || 0) + 1 }))
    ).toEqual({ tripId: 'a', n: 2 });
  });

  it('allows clear', () => {
    expect(resolveNextDriverTrip({ tripId: 'a' }, null)).toBe(null);
  });
});

describe('describeDriverTripCommit', () => {
  it('summarizes transition', () => {
    const d = describeDriverTripCommit({ tripId: '1' }, { tripId: '2' }, { source: 'poll', reason: 'offer' });
    expect(d.source).toBe('poll');
    expect(d.reason).toBe('offer');
    expect(d.prev_trip_id).toBe('1');
    expect(d.next_trip_id).toBe('2');
    expect(d.cleared).toBe(false);
  });

  it('flags cleared trip', () => {
    const d = describeDriverTripCommit({ tripId: 'x' }, null, { source: 'complete_trip', reason: 'done' });
    expect(d.cleared).toBe(true);
    expect(d.next_trip_id).toBe(null);
  });
});
