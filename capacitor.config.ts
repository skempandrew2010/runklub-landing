import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'fit.runklub.app',
  appName: 'RunKlub',
  webDir: 'out',
  server: {
    url: 'https://www.runklub.fit',
    cleartext: false,
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#1a2110',
    // Required by OneSignal so its SDK receives the APNs delegate callbacks
    // instead of Capacitor's own (unused) push runtime intercepting them.
    handleApplicationNotifications: false,
  },
};

export default config;
