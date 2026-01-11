import { describe, it, expect } from 'vitest';
import {
  isHealthKitEnabled,
  getHealthKitType,
  shouldSyncToHealthKit,
  shouldReadFromHealthKit,
  type TrackerWithHealthKit
} from './tracker-healthkit-metadata';

describe('TrackerHealthKitMetadata Helpers', () => {
  describe('isHealthKitEnabled', () => {
    it('should return true when HealthKit is enabled', () => {
      const tracker: TrackerWithHealthKit = {
        healthKit: { enabled: true, type: 'HKQuantityTypeIdentifierStepCount', direction: 'read' }
      };
      expect(isHealthKitEnabled(tracker)).toBe(true);
    });

    it('should return false when HealthKit is disabled', () => {
      const tracker: TrackerWithHealthKit = {
        healthKit: { enabled: false, type: 'HKQuantityTypeIdentifierStepCount', direction: 'read' }
      };
      expect(isHealthKitEnabled(tracker)).toBe(false);
    });

    it('should return false when healthKit property is missing', () => {
      const tracker: TrackerWithHealthKit = {};
      expect(isHealthKitEnabled(tracker)).toBe(false);
    });
  });

  describe('getHealthKitType', () => {
    it('should return HealthKit type when present', () => {
      const tracker: TrackerWithHealthKit = {
        healthKit: { enabled: true, type: 'HKQuantityTypeIdentifierHeartRate', direction: 'write' }
      };
      expect(getHealthKitType(tracker)).toBe('HKQuantityTypeIdentifierHeartRate');
    });

    it('should return null when healthKit is missing', () => {
      const tracker: TrackerWithHealthKit = {};
      expect(getHealthKitType(tracker)).toBeNull();
    });
  });

  describe('shouldSyncToHealthKit', () => {
    it('should return true for write direction', () => {
      const tracker: TrackerWithHealthKit = {
        healthKit: { enabled: true, type: 'HKQuantityTypeIdentifierStepCount', direction: 'write' }
      };
      expect(shouldSyncToHealthKit(tracker)).toBe(true);
    });

    it('should return true for bidirectional', () => {
      const tracker: TrackerWithHealthKit = {
        healthKit: { enabled: true, type: 'HKQuantityTypeIdentifierStepCount', direction: 'bidirectional' }
      };
      expect(shouldSyncToHealthKit(tracker)).toBe(true);
    });

    it('should return false for read-only direction', () => {
      const tracker: TrackerWithHealthKit = {
        healthKit: { enabled: true, type: 'HKQuantityTypeIdentifierStepCount', direction: 'read' }
      };
      expect(shouldSyncToHealthKit(tracker)).toBe(false);
    });

    it('should return false when HealthKit is disabled', () => {
      const tracker: TrackerWithHealthKit = {
        healthKit: { enabled: false, type: 'HKQuantityTypeIdentifierStepCount', direction: 'write' }
      };
      expect(shouldSyncToHealthKit(tracker)).toBe(false);
    });
  });

  describe('shouldReadFromHealthKit', () => {
    it('should return true for read direction', () => {
      const tracker: TrackerWithHealthKit = {
        healthKit: { enabled: true, type: 'HKQuantityTypeIdentifierBodyMass', direction: 'read' }
      };
      expect(shouldReadFromHealthKit(tracker)).toBe(true);
    });

    it('should return true for bidirectional', () => {
      const tracker: TrackerWithHealthKit = {
        healthKit: { enabled: true, type: 'HKQuantityTypeIdentifierBodyMass', direction: 'bidirectional' }
      };
      expect(shouldReadFromHealthKit(tracker)).toBe(true);
    });

    it('should return false for write-only direction', () => {
      const tracker: TrackerWithHealthKit = {
        healthKit: { enabled: true, type: 'HKQuantityTypeIdentifierBodyMass', direction: 'write' }
      };
      expect(shouldReadFromHealthKit(tracker)).toBe(false);
    });

    it('should return false when HealthKit is disabled', () => {
      const tracker: TrackerWithHealthKit = {
        healthKit: { enabled: false, type: 'HKQuantityTypeIdentifierBodyMass', direction: 'read' }
      };
      expect(shouldReadFromHealthKit(tracker)).toBe(false);
    });
  });
});
