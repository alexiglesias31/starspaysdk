import { describe, it, expect } from 'vitest';
import { VALID_TRANSITIONS, ENTITLED_STATUSES } from '../../src/types/subscription';
import type { SubscriptionStatus } from '../../src/types/subscription';

describe('Subscription types', () => {
  describe('ENTITLED_STATUSES', () => {
    it('should include active, canceled, and past_due', () => {
      expect(ENTITLED_STATUSES).toContain('active');
      expect(ENTITLED_STATUSES).toContain('canceled');
      expect(ENTITLED_STATUSES).toContain('past_due');
    });

    it('should not include expired, revoked, or pending', () => {
      expect(ENTITLED_STATUSES).not.toContain('expired');
      expect(ENTITLED_STATUSES).not.toContain('revoked');
      expect(ENTITLED_STATUSES).not.toContain('pending');
    });
  });

  describe('VALID_TRANSITIONS', () => {
    it('should define transitions for all states', () => {
      const states: SubscriptionStatus[] = ['pending', 'active', 'canceled', 'past_due', 'expired', 'revoked'];
      states.forEach((state) => {
        expect(VALID_TRANSITIONS[state]).toBeDefined();
        expect(Array.isArray(VALID_TRANSITIONS[state])).toBe(true);
      });
    });

    it('should allow pending → active', () => {
      expect(VALID_TRANSITIONS.pending).toContain('active');
    });

    it('should allow pending → expired', () => {
      expect(VALID_TRANSITIONS.pending).toContain('expired');
    });

    it('should allow active → canceled', () => {
      expect(VALID_TRANSITIONS.active).toContain('canceled');
    });

    it('should allow active → past_due', () => {
      expect(VALID_TRANSITIONS.active).toContain('past_due');
    });

    it('should allow active → revoked', () => {
      expect(VALID_TRANSITIONS.active).toContain('revoked');
    });

    it('should allow active → active (renewal)', () => {
      expect(VALID_TRANSITIONS.active).toContain('active');
    });

    it('should allow canceled → active (reactivation)', () => {
      expect(VALID_TRANSITIONS.canceled).toContain('active');
    });

    it('should allow canceled → expired', () => {
      expect(VALID_TRANSITIONS.canceled).toContain('expired');
    });

    it('should allow past_due → active (payment received)', () => {
      expect(VALID_TRANSITIONS.past_due).toContain('active');
    });

    it('should allow past_due → expired', () => {
      expect(VALID_TRANSITIONS.past_due).toContain('expired');
    });

    it('should allow expired → active (new subscription)', () => {
      expect(VALID_TRANSITIONS.expired).toContain('active');
    });

    it('should NOT allow revoked → canceled (revoked is terminal)', () => {
      expect(VALID_TRANSITIONS.revoked).not.toContain('canceled');
    });

    it('should NOT allow expired → canceled', () => {
      expect(VALID_TRANSITIONS.expired).not.toContain('canceled');
    });

    it('should allow pending → revoked', () => {
      expect(VALID_TRANSITIONS.pending).toContain('revoked');
    });

    it('should NOT allow pending → canceled', () => {
      expect(VALID_TRANSITIONS.pending).not.toContain('canceled');
    });
  });
});
