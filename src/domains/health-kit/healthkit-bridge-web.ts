import { WebPlugin } from '@capacitor/core';
import type { HealthKitPlugin } from './healthkit-bridge';

export class HealthKitWeb extends WebPlugin implements HealthKitPlugin {
  async isAvailable(): Promise<{ available: boolean }> {
    // HealthKit not available on web
    return { available: false };
  }

  async echo(options: { value: string }): Promise<{ value: string }> {
    return { value: options.value };
  }

  async requestPermissions(): Promise<{ granted: boolean }> {
    console.warn('HealthKit not available on web platform');
    return { granted: false };
  }

  async saveSample(options: any): Promise<{ success: boolean }> {
    console.warn('HealthKit saveSample not available on web');
    return { success: false };
  }
}
