import { describe, expect, it } from 'vitest';
import {
  DRIVER_TRIP_SOURCE_RANK,
  isTerminalAssignmentStatus,
  shouldApplyAssignmentRow,
  tripAssignmentActiveRank,
} from './driverTripLifecycleMerge.js';

describe('tripAssignmentActiveRank', () => {
  it('orders active pipeline forward', () => {
    expect(tripAssignmentActiveRank('pending')).toBeLessThan(tripAssignmentActiveRank('assigned'));
    expect(tripAssignmentActiveRank('assigned')).toBeLessThan(tripAssignmentActiveRank('accepted'));
    expect(tripAssignmentActiveRank('accepted')).toBeLessThan(tripAssignmentActiveRank('in_progress'));
    expect(tripAssignmentActiveRank('in_progress')).toBeLessThan(tripAssignmentActiveRank('arrived'));
    expect(tripAssignmentActiveRank('arrived')).toBeLessThan(tripAssignmentActiveRank('picked_up'));
  });
});

describe('isTerminalAssignmentStatus', () => {
  it('detects terminals', () => {
    expect(isTerminalAssignmentStatus('completed')).toBe(true);
    expect(isTerminalAssignmentStatus('rejected')).toBe(true);
    expect(isTerminalAssignmentStatus('accepted')).toBe(false);
  });
});

describe('shouldApplyAssignmentRow', () => {
  it('drops strictly older revisions', () => {
    const r = shouldApplyAssignmentRow({
      incomingRevision: 3,
      lastAppliedRevision: 5,
      source: 'db',
      lastSource: 'polling',
    });
    expect(r.apply).toBe(false);
    expect(r.reason).toBe('stale_lifecycle_revision');
  });

  it('accepts newer revisions regardless of source', () => {
    expect(
      shouldApplyAssignmentRow({
        incomingRevision: 6,
        lastAppliedRevision: 5,
        source: 'polling',
        lastSource: 'db',
      }).apply
    ).toBe(true);
  });

  it('on same revision prefers higher source rank', () => {
    expect(
      shouldApplyAssignmentRow({
        incomingRevision: 4,
        lastAppliedRevision: 4,
        source: 'polling',
        lastSource: 'db',
      }).apply
    ).toBe(false);
    expect(
      shouldApplyAssignmentRow({
        incomingRevision: 4,
        lastAppliedRevision: 4,
        source: 'db',
        lastSource: 'polling',
      }).apply
    ).toBe(true);
  });

  it('exposes monotonic source ordering', () => {
    expect(DRIVER_TRIP_SOURCE_RANK.db).toBeGreaterThan(DRIVER_TRIP_SOURCE_RANK.realtime);
    expect(DRIVER_TRIP_SOURCE_RANK.realtime).toBeGreaterThan(DRIVER_TRIP_SOURCE_RANK.polling);
    expect(DRIVER_TRIP_SOURCE_RANK.polling).toBeGreaterThan(DRIVER_TRIP_SOURCE_RANK.local);
  });
});
