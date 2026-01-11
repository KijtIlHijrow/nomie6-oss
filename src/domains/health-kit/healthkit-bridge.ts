import { Capacitor, registerPlugin } from '@capacitor/core';

export interface HealthKitPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  echo(options: { value: string }): Promise<{ value: string }>;
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

  isPlatformSupported(): boolean {
    return Capacitor.getPlatform() === 'ios';
  }
}
