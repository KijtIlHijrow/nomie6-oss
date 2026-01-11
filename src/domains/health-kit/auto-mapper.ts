import { HealthKitTypeMapper } from './healthkit-types';
import type { TrackerHealthKitMetadata } from './tracker-healthkit-metadata';

export class HealthKitAutoMapper {
  private typeMapper: HealthKitTypeMapper;

  constructor() {
    this.typeMapper = new HealthKitTypeMapper();
  }

  suggestMapping(tracker: any): TrackerHealthKitMetadata | null {
    if (!tracker || typeof tracker !== 'object') {
      return null;
    }

    // Try mapping by tracker label/tag
    let healthKitType = this.typeMapper.mapTrackerNameToHealthKitType(tracker.label || tracker.tag);

    // If no match, try by unit
    if (!healthKitType && tracker.uom) {
      healthKitType = this.typeMapper.mapByUnit(tracker.uom);
    }

    if (!healthKitType) {
      return null;
    }

    return {
      enabled: true,
      type: healthKitType,
      direction: 'bidirectional',
      autoDetected: true
    };
  }

  autoMapTrackers(trackers: any[]): any[] {
    if (!Array.isArray(trackers)) {
      return [];
    }

    return trackers.map(tracker => {
      const mapping = this.suggestMapping(tracker);
      if (mapping) {
        return {
          ...tracker,
          healthKit: mapping
        };
      }
      return tracker;
    });
  }

  getUnmappedTrackers(trackers: any[]): any[] {
    if (!Array.isArray(trackers)) {
      return [];
    }

    return trackers.filter(tracker => {
      const mapping = this.suggestMapping(tracker);
      return mapping === null;
    });
  }
}
