import type { HealthKitTypeIdentifier } from './healthkit-types';

export type HealthKitSyncDirection = 'read' | 'write' | 'bidirectional';

export interface TrackerHealthKitMetadata {
  enabled: boolean;
  type: HealthKitTypeIdentifier;
  direction: HealthKitSyncDirection;
  lastSyncedAt?: string; // ISO 8601 date
  autoDetected?: boolean; // true if auto-mapped, false if manual
}

export interface NomieLogHealthKitMetadata {
  source?: 'nomie' | 'healthkit';
  healthKitUUID?: string;
  syncedAt?: string; // ISO 8601 date
}

export function isHealthKitEnabled(tracker: any): boolean {
  return tracker?.healthKit?.enabled === true;
}

export function getHealthKitType(tracker: any): HealthKitTypeIdentifier | null {
  return tracker?.healthKit?.type || null;
}

export function shouldSyncToHealthKit(tracker: any): boolean {
  if (!isHealthKitEnabled(tracker)) return false;
  const direction = tracker.healthKit.direction;
  return direction === 'write' || direction === 'bidirectional';
}

export function shouldReadFromHealthKit(tracker: any): boolean {
  if (!isHealthKitEnabled(tracker)) return false;
  const direction = tracker.healthKit.direction;
  return direction === 'read' || direction === 'bidirectional';
}
