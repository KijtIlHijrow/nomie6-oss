import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HealthKitSync } from './HealthKitSync';
import type NLog from '../nomie-log/nomie-log';

describe('HealthKitSync - Write Path', () => {
  let sync: HealthKitSync;
  let mockBridge: any;

  beforeEach(() => {
    mockBridge = {
      saveSample: vi.fn().mockResolvedValue({ success: true }),
      isPlatformSupported: vi.fn().mockReturnValue(true)
    };
    sync = new HealthKitSync(mockBridge);
  });

  it('should sync tracker log to HealthKit when enabled', async () => {
    const tracker = {
      tag: 'steps',
      healthKit: {
        enabled: true,
        type: 'HKQuantityTypeIdentifierStepCount',
        direction: 'bidirectional'
      }
    };

    const log = {
      _id: 'log123',
      end: new Date('2026-01-10T12:00:00Z'),
      note: '#steps(5000)',
      getTrackerValues: vi.fn().mockReturnValue([5000])
    } as any;

    await sync.syncLogToHealthKit(tracker, log);

    expect(mockBridge.saveSample).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'HKQuantityTypeIdentifierStepCount',
        value: 5000,
        metadata: expect.objectContaining({
          source: 'Nomie',
          logId: 'log123'
        })
      })
    );
  });

  it('should not sync when HealthKit disabled for tracker', async () => {
    const tracker = {
      tag: 'steps',
      healthKit: {
        enabled: false,
        type: 'HKQuantityTypeIdentifierStepCount'
      }
    };

    const log = {
      end: new Date(),
      note: '#steps(5000)',
      getTrackerValues: vi.fn().mockReturnValue([5000])
    } as any;

    await sync.syncLogToHealthKit(tracker, log);

    expect(mockBridge.saveSample).not.toHaveBeenCalled();
  });

  it('should not sync when direction is read-only', async () => {
    const tracker = {
      tag: 'steps',
      healthKit: {
        enabled: true,
        type: 'HKQuantityTypeIdentifierStepCount',
        direction: 'read'
      }
    };

    const log = {
      end: new Date(),
      note: '#steps(5000)',
      getTrackerValues: vi.fn().mockReturnValue([5000])
    } as any;

    await sync.syncLogToHealthKit(tracker, log);

    expect(mockBridge.saveSample).not.toHaveBeenCalled();
  });

  it('should not sync when log has no value for tracker', async () => {
    const tracker = {
      tag: 'steps',
      healthKit: {
        enabled: true,
        type: 'HKQuantityTypeIdentifierStepCount',
        direction: 'write'
      }
    };

    const log = {
      _id: 'log123',
      end: new Date(),
      note: '#steps', // No value
      getTrackerValues: vi.fn().mockReturnValue([])
    } as any;

    await sync.syncLogToHealthKit(tracker, log);

    expect(mockBridge.saveSample).not.toHaveBeenCalled();
  });

  it('should not sync when value is non-numeric', async () => {
    const tracker = {
      tag: 'mood',
      healthKit: {
        enabled: true,
        type: 'HKQuantityTypeIdentifierStepCount',
        direction: 'write'
      }
    };

    const log = {
      _id: 'log123',
      end: new Date(),
      note: '#mood(happy)',
      getTrackerValues: vi.fn().mockReturnValue(['happy'])
    } as any;

    await sync.syncLogToHealthKit(tracker, log);

    expect(mockBridge.saveSample).not.toHaveBeenCalled();
  });
});
