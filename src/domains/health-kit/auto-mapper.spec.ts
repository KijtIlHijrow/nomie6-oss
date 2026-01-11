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
});
