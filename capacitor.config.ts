import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dailynomie.nomie',
  appName: 'Nomie',
  webDir: 'dist',
  server: {
    hostname: 'app.nomie.local',
    iosScheme: 'nomie'
  },
  plugins: {
    HealthKit: {
      backgroundDelivery: true
    }
  }
};

export default config;
