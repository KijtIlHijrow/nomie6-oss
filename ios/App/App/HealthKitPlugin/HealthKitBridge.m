#import <Capacitor/Capacitor.h>

CAP_PLUGIN(HealthKitPlugin, "HealthKit",
  CAP_PLUGIN_METHOD(isAvailable, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(requestPermissions, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(echo, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(saveSample, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(querySamples, CAPPluginReturnPromise);
)
