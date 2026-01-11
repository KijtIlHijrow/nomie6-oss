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

    // Convert log to HealthKit sample format
    const startDate = new Date(log.end);
    const endDate = new Date(log.end);

    const sample = {
      type: healthKitType,
      value: log.value,
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
