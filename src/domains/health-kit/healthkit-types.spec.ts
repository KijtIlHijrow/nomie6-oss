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

describe('mapByUnit', () => {
  it('should map "steps" unit to step count type', () => {
    const mapper = new HealthKitTypeMapper();
    expect(mapper.mapByUnit('steps')).toBe('HKQuantityTypeIdentifierStepCount');
  });

  it('should map "bpm" unit to heart rate type', () => {
    const mapper = new HealthKitTypeMapper();
    expect(mapper.mapByUnit('bpm')).toBe('HKQuantityTypeIdentifierHeartRate');
  });

  it('should be case insensitive for units', () => {
    const mapper = new HealthKitTypeMapper();
    expect(mapper.mapByUnit('BPM')).toBe('HKQuantityTypeIdentifierHeartRate');
  });

  it('should return null for unknown units', () => {
    const mapper = new HealthKitTypeMapper();
    expect(mapper.mapByUnit('unknown')).toBeNull();
  });
});

describe('getMapping', () => {
  it('should return mapping for valid HealthKit type', () => {
    const mapper = new HealthKitTypeMapper();
    const result = mapper.getMapping('HKQuantityTypeIdentifierStepCount');
    expect(result).toMatchObject({
      healthKitType: 'HKQuantityTypeIdentifierStepCount',
      nomieType: 'range'
    });
  });

  it('should return null for invalid HealthKit type', () => {
    const mapper = new HealthKitTypeMapper();
    expect(mapper.getMapping('InvalidType')).toBeNull();
  });
});

describe('keyword matching edge cases', () => {
  it('should not match partial words (word boundary)', () => {
    const mapper = new HealthKitTypeMapper();
    expect(mapper.mapTrackerNameToHealthKitType('stepson')).toBeNull();
    expect(mapper.mapTrackerNameToHealthKitType('therapy')).toBeNull();
  });

  it('should match keyword variations', () => {
    const mapper = new HealthKitTypeMapper();
    expect(mapper.mapTrackerNameToHealthKitType('hr')).toBe('HKQuantityTypeIdentifierHeartRate');
    expect(mapper.mapTrackerNameToHealthKitType('bpm')).toBe('HKQuantityTypeIdentifierHeartRate');
  });

  it('should handle edge cases', () => {
    const mapper = new HealthKitTypeMapper();
    expect(mapper.mapTrackerNameToHealthKitType('')).toBeNull();
    expect(mapper.mapTrackerNameToHealthKitType('   ')).toBeNull();
  });
});
