import { Capacitor, registerPlugin } from '@capacitor/core';

export interface HealthKitPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  requestPermissions(): Promise<{ granted: boolean }>;
  echo(options: { value: string }): Promise<{ value: string }>;
  saveSample(options: {
    type: string;
    value: number;
    startDate: string;
    endDate: string;
    metadata?: any;
  }): Promise<{ success: boolean }>;
}

const HealthKit = registerPlugin<HealthKitPlugin>('HealthKit', {
  web: () => import('./healthkit-bridge-web').then(m => new m.HealthKitWeb()),
});

export class HealthKitBridge {
  async isAvailable(): Promise<{ available: boolean }> {
    // On iOS native, calls Swift plugin
    // On web, calls web implementation
    return await HealthKit.isAvailable();
  }

  async echo(value: string): Promise<{ value: string }> {
    return await HealthKit.echo({ value });
  }

  async requestPermissions(): Promise<{ granted: boolean }> {
    if (!this.isPlatformSupported()) {
      return { granted: false };
    }
    return await HealthKit.requestPermissions();
  }

  async saveSample(options: {
    type: string;
    value: number;
    startDate: string;
    endDate: string;
    metadata?: any;
  }): Promise<{ success: boolean }> {
    if (!this.isPlatformSupported()) {
      return { success: false };
    }
    return await HealthKit.saveSample(options);
  }

  isPlatformSupported(): boolean {
    return Capacitor.getPlatform() === 'ios';
  }
}
