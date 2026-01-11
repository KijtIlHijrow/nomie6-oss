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

    @objc func saveSample(_ call: CAPPluginCall) {
        guard let typeString = call.getString("type"),
              let value = call.getDouble("value"),
              let startDateString = call.getString("startDate"),
              let endDateString = call.getString("endDate") else {
            call.reject("Missing required parameters")
            return
        }

        // Parse dates
        let dateFormatter = ISO8601DateFormatter()
        guard let startDate = dateFormatter.date(from: startDateString),
              let endDate = dateFormatter.date(from: endDateString) else {
            call.reject("Invalid date format")
            return
        }

        // Get quantity type
        guard let quantityTypeIdentifier = HKQuantityTypeIdentifier(rawValue: typeString),
              let quantityType = HKQuantityType.quantityType(forIdentifier: quantityTypeIdentifier) else {
            call.reject("Invalid quantity type: \(typeString)")
            return
        }

        // Determine unit based on type
        let unit: HKUnit
        switch quantityTypeIdentifier {
        case .stepCount:
            unit = .count()
        case .heartRate:
            unit = HKUnit.count().unitDivided(by: .minute())
        case .bodyMass:
            unit = .pound()
        default:
            unit = .count()
        }

        let quantity = HKQuantity(unit: unit, doubleValue: value)
        let metadata = call.getObject("metadata") as? [String: Any]

        let sample = HKQuantitySample(
            type: quantityType,
            quantity: quantity,
            start: startDate,
            end: endDate,
            metadata: metadata
        )

        healthStore.save(sample) { [weak self] success, error in
            guard let self = self else { return }
            if let error = error {
                call.reject("Failed to save sample", error.localizedDescription)
                return
            }
            call.resolve(["success": success])
        }
    }

    @objc func querySamples(_ call: CAPPluginCall) {
        guard let typeString = call.getString("type"),
              let startDateString = call.getString("startDate"),
              let endDateString = call.getString("endDate") else {
            call.reject("Missing required parameters")
            return
        }

        // Parse dates
        let dateFormatter = ISO8601DateFormatter()
        guard let startDate = dateFormatter.date(from: startDateString),
              let endDate = dateFormatter.date(from: endDateString) else {
            call.reject("Invalid date format")
            return
        }

        // Get quantity type
        guard let quantityTypeIdentifier = HKQuantityTypeIdentifier(rawValue: typeString),
              let quantityType = HKQuantityType.quantityType(forIdentifier: quantityTypeIdentifier) else {
            call.reject("Invalid quantity type")
            return
        }

        let predicate = HKQuery.predicateForSamples(
            withStart: startDate,
            end: endDate,
            options: .strictStartDate
        )

        let query = HKSampleQuery(
            sampleType: quantityType,
            predicate: predicate,
            limit: HKObjectQueryNoLimit,
            sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)]
        ) { [weak self] query, results, error in
            guard let self = self else { return }
            if let error = error {
                call.reject("Query failed", error.localizedDescription)
                return
            }

            guard let samples = results as? [HKQuantitySample] else {
                call.resolve(["samples": []])
                return
            }

            let samplesData = samples.map { sample -> [String: Any] in
                return [
                    "uuid": sample.uuid.uuidString,
                    "value": sample.quantity.doubleValue(for: self.getUnit(for: quantityTypeIdentifier)),
                    "startDate": dateFormatter.string(from: sample.startDate),
                    "endDate": dateFormatter.string(from: sample.endDate),
                    "metadata": sample.metadata ?? [:]
                ]
            }

            call.resolve(["samples": samplesData])
        }

        healthStore.execute(query)
    }

    private func getUnit(for identifier: HKQuantityTypeIdentifier) -> HKUnit {
        switch identifier {
        case .stepCount:
            return .count()
        case .heartRate:
            return HKUnit.count().unitDivided(by: .minute())
        case .bodyMass:
            return .pound()
        default:
            return .count()
        }
    }
}
