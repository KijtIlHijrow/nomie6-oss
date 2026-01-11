import { describe, it, expect } from 'vitest';
import { HealthKitAutoMapper } from './auto-mapper';

describe('HealthKitAutoMapper', () => {
  it('should auto-map tracker by name', () => {
    const mapper = new HealthKitAutoMapper();
    const tracker = {
      tag: 'steps',
      label: 'Daily Steps',
      type: 'range'
    };

    const result = mapper.suggestMapping(tracker);

    expect(result).toEqual({
      enabled: true,
      type: 'HKQuantityTypeIdentifierStepCount',
      direction: 'bidirectional',
      autoDetected: true
    });
  });

  it('should return null for unmapped trackers', () => {
    const mapper = new HealthKitAutoMapper();
    const tracker = {
      tag: 'custom',
      label: 'My Custom Tracker',
      type: 'tick'
    };

    const result = mapper.suggestMapping(tracker);

    expect(result).toBeNull();
  });

  it('should map all trackers in list', () => {
    const mapper = new HealthKitAutoMapper();
    const trackers = [
      { tag: 'steps', label: 'Steps', type: 'range' },
      { tag: 'weight', label: 'Weight', type: 'range' },
      { tag: 'custom', label: 'Custom', type: 'tick' }
    ];

    const result = mapper.autoMapTrackers(trackers);

    expect(result).toHaveLength(3);
    expect(result[0].healthKit).toBeDefined();
    expect(result[1].healthKit).toBeDefined();
    expect(result[2].healthKit).toBeUndefined();
  });

  describe('Edge Cases', () => {
    it('should handle null tracker gracefully', () => {
      const mapper = new HealthKitAutoMapper();
      expect(mapper.suggestMapping(null as any)).toBeNull();
    });

    it('should handle undefined tracker gracefully', () => {
      const mapper = new HealthKitAutoMapper();
      expect(mapper.suggestMapping(undefined as any)).toBeNull();
    });

    it('should handle empty tracker object', () => {
      const mapper = new HealthKitAutoMapper();
      expect(mapper.suggestMapping({} as any)).toBeNull();
    });

    it('should handle empty array', () => {
      const mapper = new HealthKitAutoMapper();
      expect(mapper.autoMapTrackers([])).toEqual([]);
    });

    it('should handle null trackers array in autoMapTrackers', () => {
      const mapper = new HealthKitAutoMapper();
      expect(mapper.autoMapTrackers(null as any)).toEqual([]);
    });

    it('should handle null trackers array in getUnmappedTrackers', () => {
      const mapper = new HealthKitAutoMapper();
      expect(mapper.getUnmappedTrackers(null as any)).toEqual([]);
    });

    it('should map by unit when name does not match', () => {
      const mapper = new HealthKitAutoMapper();
      const tracker = {
        tag: 'daily_count',
        label: 'Daily Count',
        type: 'range',
        uom: 'steps'
      };
      const result = mapper.suggestMapping(tracker);

      expect(result).toBeDefined();
      expect(result?.type).toBe('HKQuantityTypeIdentifierStepCount');
      expect(result?.autoDetected).toBe(true);
    });

    it('should prefer label over tag for mapping', () => {
      const mapper = new HealthKitAutoMapper();
      const tracker = {
        tag: 'custom',
        label: 'steps',
        type: 'range'
      };
      const result = mapper.suggestMapping(tracker);

      expect(result?.type).toBe('HKQuantityTypeIdentifierStepCount');
    });

    it('should use tag when label is missing', () => {
      const mapper = new HealthKitAutoMapper();
      const tracker = {
        tag: 'weight',
        type: 'range'
      };
      const result = mapper.suggestMapping(tracker);

      expect(result?.type).toBe('HKQuantityTypeIdentifierBodyMass');
    });
  });
});
