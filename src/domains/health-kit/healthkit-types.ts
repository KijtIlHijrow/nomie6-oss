import type { ITrackerType } from '../../modules/tracker/TrackerClass';

export type HealthKitTypeIdentifier = string;

export interface HealthKitTypeMapping {
  keywords: string[];
  healthKitType: HealthKitTypeIdentifier;
  nomieType: ITrackerType;
  defaultUnit?: string;
}

export const HEALTHKIT_MAPPINGS: HealthKitTypeMapping[] = [
  {
    keywords: ['step', 'steps', 'step count'],
    healthKitType: 'HKQuantityTypeIdentifierStepCount',
    nomieType: 'range',
    defaultUnit: 'steps'
  },
  {
    keywords: ['heart', 'hr', 'bpm', 'heart rate', 'heartrate'],
    healthKitType: 'HKQuantityTypeIdentifierHeartRate',
    nomieType: 'range',
    defaultUnit: 'bpm'
  },
  {
    keywords: ['weight', 'body weight', 'bodyweight'],
    healthKitType: 'HKQuantityTypeIdentifierBodyMass',
    nomieType: 'range',
    defaultUnit: 'lbs'
  },
  {
    keywords: ['run', 'running', 'jog', 'jogging'],
    healthKitType: 'HKWorkoutActivityTypeRunning',
    nomieType: 'timer'
  },
  {
    keywords: ['walk', 'walking'],
    healthKitType: 'HKWorkoutActivityTypeWalking',
    nomieType: 'timer'
  },
  {
    keywords: ['sleep', 'sleeping'],
    healthKitType: 'HKCategoryTypeIdentifierSleepAnalysis',
    nomieType: 'timer'
  },
  {
    keywords: ['distance'],
    healthKitType: 'HKQuantityTypeIdentifierDistanceWalkingRunning',
    nomieType: 'range',
    defaultUnit: 'miles'
  },
  {
    keywords: ['calories', 'active calories', 'active energy'],
    healthKitType: 'HKQuantityTypeIdentifierActiveEnergyBurned',
    nomieType: 'range',
    defaultUnit: 'kcal'
  }
];

export class HealthKitTypeMapper {
  /**
   * Maps a Nomie tracker name to a HealthKit type identifier.
   * Uses case-insensitive word boundary matching on keywords.
   * Returns the FIRST matching mapping found in HEALTHKIT_MAPPINGS array.
   * Order of mappings matters - more specific mappings should come first.
   */
  mapTrackerNameToHealthKitType(trackerName: string): HealthKitTypeIdentifier | null {
    if (!trackerName || typeof trackerName !== 'string') {
      return null;
    }

    const normalizedName = trackerName.toLowerCase().trim();
    if (!normalizedName) {
      return null;
    }

    for (const mapping of HEALTHKIT_MAPPINGS) {
      for (const keyword of mapping.keywords) {
        // Use word boundary matching to avoid false positives
        const regex = new RegExp(`\\b${keyword}\\b`);
        if (regex.test(normalizedName)) {
          return mapping.healthKitType;
        }
      }
    }

    return null;
  }

  mapByUnit(unit: string): HealthKitTypeIdentifier | null {
    const normalizedUnit = unit.toLowerCase().trim();

    for (const mapping of HEALTHKIT_MAPPINGS) {
      if (mapping.defaultUnit && mapping.defaultUnit.toLowerCase() === normalizedUnit) {
        return mapping.healthKitType;
      }
    }

    return null;
  }

  getMapping(healthKitType: HealthKitTypeIdentifier): HealthKitTypeMapping | null {
    return HEALTHKIT_MAPPINGS.find(m => m.healthKitType === healthKitType) || null;
  }
}
