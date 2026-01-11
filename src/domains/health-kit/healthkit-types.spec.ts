import { describe, it, expect } from 'vitest';
import { HealthKitTypeMapper } from './healthkit-types';

describe('HealthKitTypeMapper', () => {
  it('should map "steps" to step count type', () => {
    const mapper = new HealthKitTypeMapper();
    const result = mapper.mapTrackerNameToHealthKitType('steps');

    expect(result).toBe('HKQuantityTypeIdentifierStepCount');
  });

  it('should map "weight" to body mass type', () => {
    const mapper = new HealthKitTypeMapper();
    const result = mapper.mapTrackerNameToHealthKitType('weight');

    expect(result).toBe('HKQuantityTypeIdentifierBodyMass');
  });

  it('should be case insensitive', () => {
    const mapper = new HealthKitTypeMapper();
    const result = mapper.mapTrackerNameToHealthKitType('HEART RATE');

    expect(result).toBe('HKQuantityTypeIdentifierHeartRate');
  });

  it('should return null for unmapped trackers', () => {
    const mapper = new HealthKitTypeMapper();
    const result = mapper.mapTrackerNameToHealthKitType('custom_tracker_xyz');

    expect(result).toBeNull();
  });
});
