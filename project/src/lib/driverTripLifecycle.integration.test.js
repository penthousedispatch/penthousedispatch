import { describe, expect, it } from 'vitest';
import { shouldApplyAssignmentRow } from './driverTripLifecycleMerge.js';

describe('Phase 1 merge integration (repeated runs)', () => {
  it('handles 10 consecutive stale-guard decisions', () => {
    for (let i = 0; i < 10; i += 1) {
      const stale = shouldApplyAssignmentRow({
        incomingRevision: 3,
        lastAppliedRevision: 9,
        source: 'polling',
        lastSource: 'db',
      });
      expect(stale.apply).toBe(false);
      const fresh = shouldApplyAssignmentRow({
        incomingRevision: 10 + i,
        lastAppliedRevision: 9 + i,
        source: 'polling',
        lastSource: 'polling',
      });
      expect(fresh.apply).toBe(true);
    }
  });
});
