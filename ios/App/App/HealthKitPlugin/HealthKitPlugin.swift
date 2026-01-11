import Foundation
import Capacitor
import HealthKit

@objc(HealthKitPlugin)
public class HealthKitPlugin: CAPPlugin {
    private let healthStore = HKHealthStore()

    @objc func isAvailable(_ call: CAPPluginCall) {
        let available = HKHealthStore.isHealthDataAvailable()
        call.resolve(["available": available])
    }

    @objc func echo(_ call: CAPPluginCall) {
        let value = call.getString("value") ?? ""
        call.resolve(["value": value])
    }

    @objc func requestPermissions(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("HealthKit not available")
            return
        }

        guard let stepCountType = HKObjectType.quantityType(forIdentifier: .stepCount),
              let heartRateType = HKObjectType.quantityType(forIdentifier: .heartRate),
              let bodyMassType = HKObjectType.quantityType(forIdentifier: .bodyMass) else {
            call.reject("Failed to create HealthKit types")
            return
        }

        // Define types to read
        let typesToRead: Set<HKObjectType> = [
            stepCountType,
            heartRateType,
            bodyMassType,
            HKObjectType.workoutType()
        ]

        // Define types to write
        let typesToWrite: Set<HKSampleType> = [
            stepCountType,
            heartRateType,
            bodyMassType,
            HKObjectType.workoutType()
        ]

        healthStore.requestAuthorization(toShare: typesToWrite, read: typesToRead) { [weak self] success, error in
            guard let self = self else { return }
            if let error = error {
                call.reject("Permission request failed", error.localizedDescription)
                return
            }
            call.resolve(["granted": success])
        }
    }
}
