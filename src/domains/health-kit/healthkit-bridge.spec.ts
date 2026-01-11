import { describe, it, expect, vi } from 'vitest';
import { HealthKitBridge } from './healthkit-bridge';

describe('HealthKitBridge', () => {
  it('should check if HealthKit is available', async () => {
    const bridge = new HealthKitBridge();
    const result = await bridge.isAvailable();

    expect(result).toBeDefined();
    expect(typeof result.available).toBe('boolean');
  });

  it('should return false on web platform', async () => {
    const bridge = new HealthKitBridge();
    const result = await bridge.isAvailable();

    // On web/test environment, should return false
    expect(result.available).toBe(false);
  });

  it('should request permissions and return granted status', async () => {
    const bridge = new HealthKitBridge();
    const result = await bridge.requestPermissions();

    expect(result).toBeDefined();
    expect(typeof result.granted).toBe('boolean');
  });

  it('should return granted: false on web platform for permissions', async () => {
    const bridge = new HealthKitBridge();
    const result = await bridge.requestPermissions();

    // On web/test environment, should return false
    expect(result.granted).toBe(false);
  });
});
