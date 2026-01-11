import { HealthKitBridge } from './healthkit-bridge';
import { shouldSyncToHealthKit, getHealthKitType } from './tracker-healthkit-metadata';
import type NLog from '../nomie-log/nomie-log';

export class HealthKitSync {
  private bridge: HealthKitBridge;

  constructor(bridge?: HealthKitBridge) {
    this.bridge = bridge || new HealthKitBridge();
  }

  async syncLogToHealthKit(tracker: any, log: NLog): Promise<void> {
    // Check if platform supports HealthKit
    if (!this.bridge.isPlatformSupported()) {
      return;
    }

    // Check if tracker has HealthKit sync enabled with write permissions
    if (!shouldSyncToHealthKit(tracker)) {
      return;
    }

    const healthKitType = getHealthKitType(tracker);
    if (!healthKitType) {
      return;
    }

    // Extract tracker values from log
    const values = log.getTrackerValues(tracker.tag);
    if (!values || values.length === 0) {
      return; // No value to sync
    }

    // Use the first value (multiple values in one log should use separate logs)
    const value = values[0];
    if (typeof value !== 'number') {
      console.warn(`HealthKit sync skipped: non-numeric value for ${tracker.tag}`);
      return;
    }

    // Validate log end date
    if (!log.end) {
      console.warn('HealthKit sync skipped: log missing end date');
      return;
    }

    const startDate = new Date(log.end);
    const endDate = new Date(log.end);

    if (isNaN(endDate.getTime())) {
      console.warn('HealthKit sync skipped: invalid end date');
      return;
    }

    const sample = {
      type: healthKitType,
      value: value,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      metadata: {
        source: 'Nomie',
        logId: log._id
      }
    };

    try {
      await this.bridge.saveSample(sample);
    } catch (error) {
      console.error('Failed to sync log to HealthKit:', error);
      throw error;
    }
  }
}
