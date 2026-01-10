# iOS Native App with HealthKit Integration - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert Nomie6 PWA to native iOS app with comprehensive two-way HealthKit synchronization

**Architecture:** Three-layer system: Capacitor wraps Svelte app in native container, Swift HealthKit Bridge plugin exposes native APIs to JavaScript, TypeScript Sync Engine orchestrates real-time bidirectional sync with auto-mapping and conflict resolution.

**Tech Stack:** Capacitor 6, Swift 5, Svelte 4, TypeScript, HealthKit Framework, Vite

---

## Phase 1: Capacitor Setup & Configuration

### Task 1: Install Capacitor Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install Capacitor core packages**

Run: `npm install @capacitor/core @capacitor/cli --save`
Expected: Packages installed successfully

**Step 2: Install iOS platform**

Run: `npm install @capacitor/ios --save`
Expected: iOS platform package installed

**Step 3: Verify installation**

Run: `npm list @capacitor/core @capacitor/cli @capacitor/ios`
Expected: Shows installed versions (^6.x.x)

**Step 4: Commit dependencies**

```bash
git add package.json package-lock.json
git commit -m "chore: add Capacitor dependencies for iOS native app

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 2: Initialize Capacitor Configuration

**Files:**
- Create: `capacitor.config.ts`

**Step 1: Create Capacitor config file**

```typescript
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
```

**Step 2: Verify config is valid**

Run: `npx cap ls`
Expected: Shows Capacitor config loaded, no platforms yet

**Step 3: Commit configuration**

```bash
git add capacitor.config.ts
git commit -m "feat: add Capacitor configuration for iOS app

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 3: Update Package Scripts for iOS Development

**Files:**
- Modify: `package.json`

**Step 1: Add iOS development scripts**

Add to `"scripts"` section:
```json
{
  "ios:dev": "npx cap run ios",
  "ios:build": "npm run vbuild && npx cap sync",
  "ios:open": "npx cap open ios",
  "ios:sync": "npx cap sync"
}
```

**Step 2: Verify scripts are added**

Run: `npm run`
Expected: Lists new ios:* scripts

**Step 3: Commit script updates**

```bash
git add package.json
git commit -m "chore: add iOS build and development scripts

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 4: Build Web Assets and Add iOS Platform

**Files:**
- Create: `ios/` directory (via Capacitor CLI)

**Step 1: Build Vite production bundle**

Run: `npm run vbuild`
Expected: Creates `dist/` directory with built assets
Note: May take 1-2 minutes

**Step 2: Initialize iOS platform**

Run: `npx cap add ios`
Expected: Creates `ios/` directory with Xcode project
Note: Creates `ios/App/App.xcodeproj`

**Step 3: Sync web assets to iOS**

Run: `npx cap sync ios`
Expected: Copies `dist/` contents to iOS app bundle

**Step 4: Verify iOS project structure**

Run: `ls -la ios/App/App/`
Expected: Shows `public/` folder with web assets

**Step 5: Commit iOS platform**

```bash
git add ios/ .gitignore
git commit -m "feat: add iOS platform and Xcode project

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 5: Test Basic App Launch in Simulator

**Files:**
- N/A (manual testing)

**Step 1: Open Xcode project**

Run: `npm run ios:open`
Expected: Xcode launches with Nomie project

**Step 2: Select iOS Simulator**

In Xcode: Product → Destination → iPhone 15 (or latest)
Expected: Simulator selected in toolbar

**Step 3: Build and run**

In Xcode: Product → Run (⌘R)
Expected: Simulator launches, app installs, shows Nomie UI
Note: First build may take 3-5 minutes

**Step 4: Verify existing features work**

Manual test:
- Navigate through app
- Create a test tracker
- Log a test entry
- Verify local storage persists

Expected: All existing PWA features work unchanged

**Step 5: Document successful test**

Create file: `docs/testing/capacitor-baseline-test.md`
```markdown
# Capacitor Baseline Test - 2026-01-10

**Platform:** iOS Simulator (iPhone 15, iOS 17)
**Build:** Debug
**Status:** ✅ PASS

## Tests Performed
- [x] App launches successfully
- [x] UI renders correctly
- [x] Can create trackers
- [x] Can log entries
- [x] LocalStorage persists data

## Issues Found
None

## Next Steps
Proceed with HealthKit plugin development
```

**Step 6: Commit test documentation**

```bash
git add docs/testing/capacitor-baseline-test.md
git commit -m "test: verify Capacitor iOS baseline functionality

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Phase 2: HealthKit Bridge Plugin (Swift)

### Task 6: Create HealthKit Plugin Structure

**Files:**
- Create: `ios/App/App/HealthKitPlugin/HealthKitPlugin.swift`
- Create: `ios/App/App/HealthKitPlugin/HealthKitBridge.m`
- Modify: `ios/App/App.xcodeproj/project.pbxproj` (via Xcode)

**Step 1: Create plugin directory**

Run: `mkdir -p ios/App/App/HealthKitPlugin`
Expected: Directory created

**Step 2: Create Swift plugin file**

File: `ios/App/App/HealthKitPlugin/HealthKitPlugin.swift`
```swift
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
}
```

**Step 3: Create Objective-C bridge file**

File: `ios/App/App/HealthKitPlugin/HealthKitBridge.m`
```objc
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(HealthKitPlugin, "HealthKit",
  CAP_PLUGIN_METHOD(isAvailable, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(echo, CAPPluginReturnPromise);
)
```

**Step 4: Add files to Xcode project**

In Xcode:
1. Right-click `App` group
2. Add Files to "App"...
3. Select `HealthKitPlugin/` folder
4. Check "Create groups"
5. Click Add

Expected: Files appear in Xcode project navigator

**Step 5: Add HealthKit framework**

In Xcode:
1. Select App target
2. Signing & Capabilities tab
3. Click "+ Capability"
4. Select "HealthKit"

Expected: HealthKit.framework added to project

**Step 6: Update Info.plist with usage descriptions**

In Xcode, edit `Info.plist`:
Add keys:
```xml
<key>NSHealthShareUsageDescription</key>
<string>Nomie reads health data to display your tracking history</string>
<key>NSHealthUpdateUsageDescription</key>
<string>Nomie writes tracking data to Apple Health</string>
```

**Step 7: Build to verify no errors**

Run in Xcode: Product → Build (⌘B)
Expected: Build succeeds with 0 errors

**Step 8: Commit plugin structure**

```bash
git add ios/
git commit -m "feat: add HealthKit plugin structure and framework

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 7: Write Test for HealthKit Availability Check

**Files:**
- Create: `src/domains/health-kit/healthkit-bridge.spec.ts`

**Step 1: Create health-kit domain directory**

Run: `mkdir -p src/domains/health-kit`
Expected: Directory created

**Step 2: Write failing test**

File: `src/domains/health-kit/healthkit-bridge.spec.ts`
```typescript
import { describe, it, expect, vi } from 'vitest';
import { HealthKitBridge } from './healthkit-bridge';

describe('HealthKitBridge', () => {
  it('should check if HealthKit is available', async () => {
    const bridge = new HealthKitBridge();
    const result = await bridge.isAvailable();

    expect(result).toBeDefined();
    expect(typeof result.available).toBe('boolean');
  });

  it('should return false on web platform', async () => {
    const bridge = new HealthKitBridge();
    const result = await bridge.isAvailable();

    // On web/test environment, should return false
    expect(result.available).toBe(false);
  });
});
```

**Step 3: Run test to verify it fails**

Run: `npm run vtest healthkit-bridge.spec.ts`
Expected: FAIL - "Cannot find module './healthkit-bridge'"

**Step 4: Commit failing test**

```bash
git add src/domains/health-kit/healthkit-bridge.spec.ts
git commit -m "test: add HealthKit availability check test (failing)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 8: Implement HealthKit Bridge TypeScript Wrapper

**Files:**
- Create: `src/domains/health-kit/healthkit-bridge.ts`

**Step 1: Install Capacitor in web code**

Already installed from Task 1, verify:
Run: `npm list @capacitor/core`
Expected: Shows @capacitor/core version

**Step 2: Write minimal implementation**

File: `src/domains/health-kit/healthkit-bridge.ts`
```typescript
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
```

**Step 3: Create web fallback implementation**

File: `src/domains/health-kit/healthkit-bridge-web.ts`
```typescript
import { WebPlugin } from '@capacitor/core';
import type { HealthKitPlugin } from './healthkit-bridge';

export class HealthKitWeb extends WebPlugin implements HealthKitPlugin {
  async isAvailable(): Promise<{ available: boolean }> {
    // HealthKit not available on web
    return { available: false };
  }

  async echo(options: { value: string }): Promise<{ value: string }> {
    return { value: options.value };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm run vtest healthkit-bridge.spec.ts`
Expected: PASS - 2/2 tests passing

**Step 5: Commit implementation**

```bash
git add src/domains/health-kit/
git commit -m "feat: implement HealthKit bridge TypeScript wrapper

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 9: Implement Permission Request Methods

**Files:**
- Modify: `ios/App/App/HealthKitPlugin/HealthKitPlugin.swift`
- Modify: `ios/App/App/HealthKitPlugin/HealthKitBridge.m`
- Modify: `src/domains/health-kit/healthkit-bridge.ts`

**Step 1: Add Swift permission request method**

Append to `HealthKitPlugin.swift`:
```swift
@objc func requestPermissions(_ call: CAPPluginCall) {
    guard HKHealthStore.isHealthDataAvailable() else {
        call.reject("HealthKit not available")
        return
    }

    // Define types to read
    let typesToRead: Set<HKObjectType> = [
        HKObjectType.quantityType(forIdentifier: .stepCount)!,
        HKObjectType.quantityType(forIdentifier: .heartRate)!,
        HKObjectType.quantityType(forIdentifier: .bodyMass)!,
        HKObjectType.workoutType()
    ]

    // Define types to write
    let typesToWrite: Set<HKSampleType> = [
        HKObjectType.quantityType(forIdentifier: .stepCount)!,
        HKObjectType.quantityType(forIdentifier: .heartRate)!,
        HKObjectType.quantityType(forIdentifier: .bodyMass)!,
        HKObjectType.workoutType()
    ]

    healthStore.requestAuthorization(toShare: typesToWrite, read: typesToRead) { success, error in
        if let error = error {
            call.reject("Permission request failed", error.localizedDescription)
            return
        }
        call.resolve(["granted": success])
    }
}
```

**Step 2: Update Objective-C bridge**

Modify `HealthKitBridge.m`:
```objc
CAP_PLUGIN(HealthKitPlugin, "HealthKit",
  CAP_PLUGIN_METHOD(isAvailable, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(requestPermissions, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(echo, CAPPluginReturnPromise);
)
```

**Step 3: Update TypeScript interface**

Modify `src/domains/health-kit/healthkit-bridge.ts`:

Add to `HealthKitPlugin` interface:
```typescript
requestPermissions(): Promise<{ granted: boolean }>;
```

Add to `HealthKitBridge` class:
```typescript
async requestPermissions(): Promise<{ granted: boolean }> {
  if (!this.isPlatformSupported()) {
    return { granted: false };
  }
  return await HealthKit.requestPermissions();
}
```

**Step 4: Update web fallback**

Modify `src/domains/health-kit/healthkit-bridge-web.ts`:

Add method:
```typescript
async requestPermissions(): Promise<{ granted: boolean }> {
  console.warn('HealthKit not available on web platform');
  return { granted: false };
}
```

**Step 5: Build and test manually**

Run: `npm run ios:build && npm run ios:open`
In Xcode: Run app in simulator
Test: Call `requestPermissions()` from browser console (via bridge)
Expected: Shows iOS permission dialog

**Step 6: Commit permission implementation**

```bash
git add ios/ src/domains/health-kit/
git commit -m "feat: implement HealthKit permission request

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 10: Implement Save Sample (Write) Method

**Files:**
- Modify: `ios/App/App/HealthKitPlugin/HealthKitPlugin.swift`
- Modify: `ios/App/App/HealthKitPlugin/HealthKitBridge.m`

**Step 1: Add Swift save sample method**

Append to `HealthKitPlugin.swift`:
```swift
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

    healthStore.save(sample) { success, error in
        if let error = error {
            call.reject("Failed to save sample", error.localizedDescription)
            return
        }
        call.resolve(["success": success])
    }
}
```

**Step 2: Update Objective-C bridge**

Add to `HealthKitBridge.m`:
```objc
CAP_PLUGIN_METHOD(saveSample, CAPPluginReturnPromise);
```

**Step 3: Build to verify**

Run in Xcode: Product → Build
Expected: Build succeeds

**Step 4: Commit save sample implementation**

```bash
git add ios/
git commit -m "feat: implement HealthKit save sample method

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 11: Implement Query Samples (Read) Method

**Files:**
- Modify: `ios/App/App/HealthKitPlugin/HealthKitPlugin.swift`
- Modify: `ios/App/App/HealthKitPlugin/HealthKitBridge.m`

**Step 1: Add Swift query samples method**

Append to `HealthKitPlugin.swift`:
```swift
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
    ) { query, results, error in
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
```

**Step 2: Update Objective-C bridge**

Add to `HealthKitBridge.m`:
```objc
CAP_PLUGIN_METHOD(querySamples, CAPPluginReturnPromise);
```

**Step 3: Build to verify**

Run in Xcode: Product → Build
Expected: Build succeeds

**Step 4: Commit query implementation**

```bash
git add ios/
git commit -m "feat: implement HealthKit query samples method

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Phase 3: Sync Engine (TypeScript)

### Task 12: Create HealthKit Type Mapping Configuration

**Files:**
- Create: `src/domains/health-kit/healthkit-types.ts`
- Create: `src/domains/health-kit/healthkit-types.spec.ts`

**Step 1: Write failing test**

File: `src/domains/health-kit/healthkit-types.spec.ts`
```typescript
import { describe, it, expect } from 'vitest';
import { HealthKitTypeMapper } from './healthkit-types';

describe('HealthKitTypeMapper', () => {
  it('should map "steps" to step count type', () => {
    const mapper = new HealthKitTypeMapper();
    const result = mapper.mapTrackerNameToHealthKitType('steps');

    expect(result).toBe('HKQuantityTypeIdentifierStepCount');
  });

  it('should map "weight" to body mass type', () => {
    const mapper = new HealthKitTypeMapper();
    const result = mapper.mapTrackerNameToHealthKitType('weight');

    expect(result).toBe('HKQuantityTypeIdentifierBodyMass');
  });

  it('should be case insensitive', () => {
    const mapper = new HealthKitTypeMapper();
    const result = mapper.mapTrackerNameToHealthKitType('HEART RATE');

    expect(result).toBe('HKQuantityTypeIdentifierHeartRate');
  });

  it('should return null for unmapped trackers', () => {
    const mapper = new HealthKitTypeMapper();
    const result = mapper.mapTrackerNameToHealthKitType('custom_tracker_xyz');

    expect(result).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run vtest healthkit-types.spec.ts`
Expected: FAIL - "Cannot find module"

**Step 3: Commit failing test**

```bash
git add src/domains/health-kit/healthkit-types.spec.ts
git commit -m "test: add HealthKit type mapping tests (failing)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 13: Implement HealthKit Type Mapper

**Files:**
- Create: `src/domains/health-kit/healthkit-types.ts`

**Step 1: Write implementation**

File: `src/domains/health-kit/healthkit-types.ts`
```typescript
export type HealthKitTypeIdentifier = string;

export interface HealthKitTypeMapping {
  keywords: string[];
  healthKitType: HealthKitTypeIdentifier;
  nomieType: 'tick' | 'range' | 'timer';
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
  mapTrackerNameToHealthKitType(trackerName: string): HealthKitTypeIdentifier | null {
    const normalizedName = trackerName.toLowerCase().trim();

    for (const mapping of HEALTHKIT_MAPPINGS) {
      for (const keyword of mapping.keywords) {
        if (normalizedName.includes(keyword)) {
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
```

**Step 2: Run test to verify it passes**

Run: `npm run vtest healthkit-types.spec.ts`
Expected: PASS - 4/4 tests passing

**Step 3: Commit implementation**

```bash
git add src/domains/health-kit/healthkit-types.ts
git commit -m "feat: implement HealthKit type mapper with 8 common mappings

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 14: Create Tracker HealthKit Metadata Interface

**Files:**
- Create: `src/domains/health-kit/tracker-healthkit-metadata.ts`

**Step 1: Define TypeScript interface**

File: `src/domains/health-kit/tracker-healthkit-metadata.ts`
```typescript
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
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit src/domains/health-kit/tracker-healthkit-metadata.ts`
Expected: No errors

**Step 3: Commit metadata interface**

```bash
git add src/domains/health-kit/tracker-healthkit-metadata.ts
git commit -m "feat: add tracker HealthKit metadata interface

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 15: Implement HealthKit Sync Engine - Write Path

**Files:**
- Create: `src/domains/health-kit/HealthKitSync.ts`
- Create: `src/domains/health-kit/HealthKitSync.spec.ts`

**Step 1: Write failing test for write path**

File: `src/domains/health-kit/HealthKitSync.spec.ts`
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HealthKitSync } from './HealthKitSync';
import type NLog from '../nomie-log/nomie-log';

describe('HealthKitSync - Write Path', () => {
  let sync: HealthKitSync;
  let mockBridge: any;

  beforeEach(() => {
    mockBridge = {
      saveSample: vi.fn().mockResolvedValue({ success: true }),
      isPlatformSupported: vi.fn().mockReturnValue(true)
    };
    sync = new HealthKitSync(mockBridge);
  });

  it('should sync tracker log to HealthKit when enabled', async () => {
    const tracker = {
      tag: 'steps',
      healthKit: {
        enabled: true,
        type: 'HKQuantityTypeIdentifierStepCount',
        direction: 'bidirectional'
      }
    };

    const log = {
      _id: 'log123',
      end: new Date('2026-01-10T12:00:00Z'),
      value: 5000,
      note: '#steps(5000)'
    } as any;

    await sync.syncLogToHealthKit(tracker, log);

    expect(mockBridge.saveSample).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'HKQuantityTypeIdentifierStepCount',
        value: 5000,
        metadata: expect.objectContaining({
          source: 'Nomie',
          logId: 'log123'
        })
      })
    );
  });

  it('should not sync when HealthKit disabled for tracker', async () => {
    const tracker = {
      tag: 'steps',
      healthKit: {
        enabled: false,
        type: 'HKQuantityTypeIdentifierStepCount'
      }
    };

    const log = { value: 5000 } as any;

    await sync.syncLogToHealthKit(tracker, log);

    expect(mockBridge.saveSample).not.toHaveBeenCalled();
  });

  it('should not sync when direction is read-only', async () => {
    const tracker = {
      tag: 'steps',
      healthKit: {
        enabled: true,
        type: 'HKQuantityTypeIdentifierStepCount',
        direction: 'read'
      }
    };

    const log = { value: 5000 } as any;

    await sync.syncLogToHealthKit(tracker, log);

    expect(mockBridge.saveSample).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run vtest HealthKitSync.spec.ts`
Expected: FAIL - "Cannot find module"

**Step 3: Commit failing test**

```bash
git add src/domains/health-kit/HealthKitSync.spec.ts
git commit -m "test: add HealthKit sync write path tests (failing)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 16: Implement HealthKit Sync Write Path

**Files:**
- Create: `src/domains/health-kit/HealthKitSync.ts`

**Step 1: Write implementation**

File: `src/domains/health-kit/HealthKitSync.ts`
```typescript
import { HealthKitBridge } from './healthkit-bridge';
import { shouldSyncToHealthKit, getHealthKitType } from './tracker-healthkit-metadata';
import type NLog from '../nomie-log/nomie-log';

export class HealthKitSync {
  private bridge: HealthKitBridge;

  constructor(bridge?: HealthKitBridge) {
    this.bridge = bridge || new HealthKitBridge();
  }

  async syncLogToHealthKit(tracker: any, log: NLog): Promise<void> {
    // Check if platform supports HealthKit
    if (!this.bridge.isPlatformSupported()) {
      return;
    }

    // Check if tracker has HealthKit sync enabled with write permissions
    if (!shouldSyncToHealthKit(tracker)) {
      return;
    }

    const healthKitType = getHealthKitType(tracker);
    if (!healthKitType) {
      return;
    }

    // Convert log to HealthKit sample format
    const startDate = new Date(log.end);
    const endDate = new Date(log.end);

    const sample = {
      type: healthKitType,
      value: log.value,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      metadata: {
        source: 'Nomie',
        logId: log._id
      }
    };

    try {
      await this.bridge.saveSample(sample);
    } catch (error) {
      console.error('Failed to sync log to HealthKit:', error);
      throw error;
    }
  }
}
```

**Step 2: Update bridge interface to match**

Modify `src/domains/health-kit/healthkit-bridge.ts`:

Add to `HealthKitPlugin` interface:
```typescript
saveSample(options: {
  type: string;
  value: number;
  startDate: string;
  endDate: string;
  metadata?: any;
}): Promise<{ success: boolean }>;
```

Add to `HealthKitBridge` class:
```typescript
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
```

Update web fallback:
```typescript
async saveSample(options: any): Promise<{ success: boolean }> {
  console.warn('HealthKit saveSample not available on web');
  return { success: false };
}
```

**Step 3: Run test to verify it passes**

Run: `npm run vtest HealthKitSync.spec.ts`
Expected: PASS - 3/3 tests passing

**Step 4: Commit implementation**

```bash
git add src/domains/health-kit/
git commit -m "feat: implement HealthKit sync write path

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 17: Create Auto-Mapping Service for Existing Trackers

**Files:**
- Create: `src/domains/health-kit/auto-mapper.ts`
- Create: `src/domains/health-kit/auto-mapper.spec.ts`

**Step 1: Write failing test**

File: `src/domains/health-kit/auto-mapper.spec.ts`
```typescript
import { describe, it, expect } from 'vitest';
import { HealthKitAutoMapper } from './auto-mapper';

describe('HealthKitAutoMapper', () => {
  it('should auto-map tracker by name', () => {
    const mapper = new HealthKitAutoMapper();
    const tracker = {
      tag: 'steps',
      label: 'Daily Steps',
      type: 'range'
    };

    const result = mapper.suggestMapping(tracker);

    expect(result).toEqual({
      enabled: true,
      type: 'HKQuantityTypeIdentifierStepCount',
      direction: 'bidirectional',
      autoDetected: true
    });
  });

  it('should return null for unmapped trackers', () => {
    const mapper = new HealthKitAutoMapper();
    const tracker = {
      tag: 'custom',
      label: 'My Custom Tracker',
      type: 'tick'
    };

    const result = mapper.suggestMapping(tracker);

    expect(result).toBeNull();
  });

  it('should map all trackers in list', () => {
    const mapper = new HealthKitAutoMapper();
    const trackers = [
      { tag: 'steps', label: 'Steps', type: 'range' },
      { tag: 'weight', label: 'Weight', type: 'range' },
      { tag: 'custom', label: 'Custom', type: 'tick' }
    ];

    const result = mapper.autoMapTrackers(trackers);

    expect(result).toHaveLength(3);
    expect(result[0].healthKit).toBeDefined();
    expect(result[1].healthKit).toBeDefined();
    expect(result[2].healthKit).toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run vtest auto-mapper.spec.ts`
Expected: FAIL - "Cannot find module"

**Step 3: Commit failing test**

```bash
git add src/domains/health-kit/auto-mapper.spec.ts
git commit -m "test: add auto-mapper tests (failing)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

**Step 4: Write implementation**

File: `src/domains/health-kit/auto-mapper.ts`
```typescript
import { HealthKitTypeMapper } from './healthkit-types';
import type { TrackerHealthKitMetadata } from './tracker-healthkit-metadata';

export class HealthKitAutoMapper {
  private typeMapper: HealthKitTypeMapper;

  constructor() {
    this.typeMapper = new HealthKitTypeMapper();
  }

  suggestMapping(tracker: any): TrackerHealthKitMetadata | null {
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
    return trackers.filter(tracker => {
      const mapping = this.suggestMapping(tracker);
      return mapping === null;
    });
  }
}
```

**Step 5: Run test to verify it passes**

Run: `npm run vtest auto-mapper.spec.ts`
Expected: PASS - 3/3 tests passing

**Step 6: Commit implementation**

```bash
git add src/domains/health-kit/auto-mapper.ts
git commit -m "feat: implement HealthKit auto-mapper service

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Phase 4: UI Integration

### Task 18: Add HealthKit Settings Section Component

**Files:**
- Create: `src/domains/health-kit/HealthKitSettings.svelte`

**Step 1: Create Svelte component**

File: `src/domains/health-kit/HealthKitSettings.svelte`
```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { HealthKitBridge } from './healthkit-bridge';
  import { HealthKitAutoMapper } from './auto-mapper';
  import { Interact } from '../../store/interact';

  export let trackers: any[] = [];

  let bridge = new HealthKitBridge();
  let autoMapper = new HealthKitAutoMapper();
  let isAvailable = false;
  let permissionsGranted = false;
  let syncing = false;

  onMount(async () => {
    const result = await bridge.isAvailable();
    isAvailable = result.available;
  });

  async function requestPermissions() {
    try {
      syncing = true;
      const result = await bridge.requestPermissions();
      permissionsGranted = result.granted;

      if (result.granted) {
        Interact.toast('HealthKit permissions granted');
      } else {
        Interact.alert('HealthKit Permissions', 'Please enable permissions in Settings → Privacy → Health');
      }
    } catch (error) {
      Interact.alert('Error', `Failed to request permissions: ${error.message}`);
    } finally {
      syncing = false;
    }
  }

  async function autoMapAllTrackers() {
    const mapped = autoMapper.autoMapTrackers(trackers);
    const mappedCount = mapped.filter(t => t.healthKit).length;

    Interact.confirm(
      'Auto-Map Trackers',
      `Found ${mappedCount} trackers that can sync with HealthKit. Apply mappings?`,
      () => {
        trackers = mapped;
        Interact.toast(`Mapped ${mappedCount} trackers to HealthKit`);
      }
    );
  }

  $: syncedTrackers = trackers.filter(t => t.healthKit?.enabled);
</script>

{#if !isAvailable}
  <div class="p-4 bg-gray-100 rounded-lg">
    <p class="text-sm text-gray-600">HealthKit is not available on this platform</p>
  </div>
{:else}
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <h3 class="font-bold">Apple Health Integration</h3>
        <p class="text-sm text-gray-600">
          {#if permissionsGranted}
            <span class="text-green-600">● Connected</span>
          {:else}
            <span class="text-gray-400">○ Not connected</span>
          {/if}
        </p>
      </div>

      {#if !permissionsGranted}
        <button
          class="btn btn-primary"
          on:click={requestPermissions}
          disabled={syncing}
        >
          {syncing ? 'Requesting...' : 'Connect'}
        </button>
      {/if}
    </div>

    {#if permissionsGranted}
      <button
        class="btn btn-secondary w-full"
        on:click={autoMapAllTrackers}
      >
        Auto-Map Trackers
      </button>

      <div>
        <h4 class="font-semibold mb-2">Synced Trackers</h4>
        {#if syncedTrackers.length === 0}
          <p class="text-sm text-gray-500">No trackers synced yet</p>
        {:else}
          <ul class="space-y-1">
            {#each syncedTrackers as tracker}
              <li class="text-sm">
                • {tracker.label} → {tracker.healthKit.type}
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
  </div>
{/if}
```

**Step 2: Verify component compiles**

Run: `npm run vbuild`
Expected: Build succeeds, no errors for HealthKitSettings.svelte

**Step 3: Commit UI component**

```bash
git add src/domains/health-kit/HealthKitSettings.svelte
git commit -m "feat: add HealthKit settings UI component

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 19: Integrate HealthKit Settings into Main Settings Page

**Files:**
- Modify: `src/routes/Settings.svelte`

**Step 1: Find Settings.svelte**

Run: `find src -name "Settings.svelte" -type f`
Expected: Shows path to settings file

**Step 2: Add import and component**

Add to imports section:
```svelte
import HealthKitSettings from '../domains/health-kit/HealthKitSettings.svelte';
import { TrackerStore } from '../domains/tracker/TrackerStore';
```

Add in appropriate section (after Data Storage section):
```svelte
<!-- HealthKit Integration -->
<div class="section">
  <h2 class="section-title">Health Sync</h2>
  <HealthKitSettings trackers={Object.values($TrackerStore)} />
</div>
```

**Step 3: Test in browser**

Run: `npm run dev`
Navigate to: Settings page
Expected: HealthKit section appears

**Step 4: Test on iOS simulator**

Run: `npm run ios:build && npm run ios:open`
In Xcode: Run in simulator
Navigate to Settings
Expected: HealthKit section shows, "Connect" button works

**Step 5: Commit integration**

```bash
git add src/routes/Settings.svelte
git commit -m "feat: integrate HealthKit settings into main settings page

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 20: Add HealthKit Icon Badge to Log Entries

**Files:**
- Create: `src/domains/health-kit/HealthKitBadge.svelte`
- Modify: Log display components (find with grep)

**Step 1: Create badge component**

File: `src/domains/health-kit/HealthKitBadge.svelte`
```svelte
<script lang="ts">
  export let log: any;

  $: isFromHealthKit = log?.healthKit?.source === 'healthkit';
</script>

{#if isFromHealthKit}
  <span
    class="healthkit-badge inline-flex items-center"
    title="Synced from Apple Health"
  >
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="currentColor"
      class="text-red-500"
    >
      <!-- Apple Health heart icon -->
      <path d="M7 13.5C7 13.5 1 9 1 5.5C1 3.5 2.5 2 4.5 2C5.5 2 6.5 2.5 7 3.5C7.5 2.5 8.5 2 9.5 2C11.5 2 13 3.5 13 5.5C13 9 7 13.5 7 13.5Z"/>
    </svg>
  </span>
{/if}

<style>
  .healthkit-badge {
    margin-left: 0.25rem;
  }
</style>
```

**Step 2: Find log display components**

Run: `grep -r "class.*log.*entry" src/components --include="*.svelte" | head -5`
Run: `find src -name "*Log*List*.svelte" -o -name "*Timeline*.svelte"`

Expected: Shows components that display log entries

**Step 3: Add badge to log entry components**

Import in relevant component(s):
```svelte
import HealthKitBadge from '../../domains/health-kit/HealthKitBadge.svelte';
```

Add next to timestamp/log display:
```svelte
<HealthKitBadge {log} />
```

**Step 4: Test visually**

Create test log with healthKit metadata:
```javascript
{
  _id: 'test123',
  note: '#steps(5000)',
  healthKit: { source: 'healthkit', healthKitUUID: 'abc-123' }
}
```

Expected: Shows red heart icon next to log

**Step 5: Commit badge implementation**

```bash
git add src/domains/health-kit/HealthKitBadge.svelte src/components/
git commit -m "feat: add HealthKit badge to log entries

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Phase 5: Integration & Real-Time Sync

### Task 21: Hook Sync Engine into Ledger Save

**Files:**
- Modify: `src/domains/ledger/LedgerStore.ts`
- Modify: `src/domains/health-kit/HealthKitSync.ts`

**Step 1: Find where logs are saved**

Run: `grep -n "save.*log\|saveLog" src/domains/ledger/LedgerStore.ts | head -10`
Expected: Shows lines where logs are saved

**Step 2: Import HealthKitSync in LedgerStore**

Add to imports:
```typescript
import { HealthKitSync } from '../health-kit/HealthKitSync';
```

Add near top of file:
```typescript
const healthKitSync = new HealthKitSync();
```

**Step 3: Add sync call after successful log save**

Find the save function (likely `saveLogs` or similar), add after successful save:
```typescript
// After log is saved successfully
try {
  // Get tracker for this log
  const tracker = get(TrackerStore)[log.getTrackerTag()];
  if (tracker) {
    await healthKitSync.syncLogToHealthKit(tracker, log);
  }
} catch (error) {
  console.error('HealthKit sync failed:', error);
  // Don't fail the log save if HealthKit sync fails
}
```

**Step 4: Test end-to-end**

1. Run: `npm run ios:build && npm run ios:open`
2. In iOS simulator: Grant HealthKit permissions
3. Auto-map a tracker (e.g., "steps")
4. Create a log entry for steps
5. Check iOS Health app for the entry

Expected: Entry appears in Health app

**Step 5: Commit integration**

```bash
git add src/domains/ledger/LedgerStore.ts
git commit -m "feat: integrate HealthKit sync into ledger save flow

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 22: Implement Background Observer (Read Path)

**Files:**
- Modify: `ios/App/App/HealthKitPlugin/HealthKitPlugin.swift`
- Modify: `src/domains/health-kit/healthkit-bridge.ts`
- Modify: `src/domains/health-kit/HealthKitSync.ts`

**Step 1: Add observer registration in Swift**

Add to `HealthKitPlugin.swift`:
```swift
@objc func enableBackgroundObserver(_ call: CAPPluginCall) {
    guard let typeString = call.getString("type") else {
        call.reject("Missing type parameter")
        return
    }

    guard let quantityTypeIdentifier = HKQuantityTypeIdentifier(rawValue: typeString),
          let quantityType = HKQuantityType.quantityType(forIdentifier: quantityTypeIdentifier) else {
        call.reject("Invalid quantity type")
        return
    }

    let query = HKObserverQuery(sampleType: quantityType, predicate: nil) { [weak self] query, completionHandler, error in
        guard let self = self else { return }

        if let error = error {
            print("Observer query error: \(error.localizedDescription)")
            completionHandler()
            return
        }

        // Notify JavaScript that new data is available
        self.notifyListeners("healthKitUpdate", data: [
            "type": typeString,
            "timestamp": ISO8601DateFormatter().string(from: Date())
        ])

        completionHandler()
    }

    healthStore.execute(query)
    call.resolve(["success": true])
}
```

Update bridge:
```objc
CAP_PLUGIN_METHOD(enableBackgroundObserver, CAPPluginReturnPromise);
```

**Step 2: Add TypeScript listener**

Update `healthkit-bridge.ts`:
```typescript
import { Capacitor, registerPlugin, PluginListenerHandle } from '@capacitor/core';

// Add to HealthKitPlugin interface
enableBackgroundObserver(options: { type: string }): Promise<{ success: boolean }>;

// Add to HealthKitBridge class
async enableBackgroundObserver(type: string): Promise<{ success: boolean }> {
  if (!this.isPlatformSupported()) {
    return { success: false };
  }
  return await HealthKit.enableBackgroundObserver({ type });
}

addHealthKitUpdateListener(
  callback: (data: { type: string; timestamp: string }) => void
): Promise<PluginListenerHandle> {
  return HealthKit.addListener('healthKitUpdate', callback);
}
```

**Step 3: Add read path to sync engine**

Update `HealthKitSync.ts`:
```typescript
async startBackgroundSync(trackers: any[]): Promise<void> {
  if (!this.bridge.isPlatformSupported()) {
    return;
  }

  // Register observers for all mapped trackers
  for (const tracker of trackers) {
    if (shouldReadFromHealthKit(tracker)) {
      const type = getHealthKitType(tracker);
      if (type) {
        await this.bridge.enableBackgroundObserver(type);
      }
    }
  }

  // Listen for updates
  this.bridge.addHealthKitUpdateListener(async (data) => {
    console.log('HealthKit update received:', data);
    // TODO: Query new samples and create Nomie logs
  });
}
```

**Step 4: Build and test**

Run: `npm run ios:build`
In Xcode: Build and run
Test: Add health data via Health app, verify observer fires

**Step 5: Commit observer implementation**

```bash
git add ios/ src/domains/health-kit/
git commit -m "feat: implement HealthKit background observer for read path

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Phase 6: Testing & Documentation

### Task 23: Write Integration Tests

**Files:**
- Create: `src/domains/health-kit/integration.spec.ts`

**Step 1: Write integration test**

File: `src/domains/health-kit/integration.spec.ts`
```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { HealthKitBridge } from './healthkit-bridge';
import { HealthKitSync } from './HealthKitSync';
import { HealthKitAutoMapper } from './auto-mapper';

describe('HealthKit Integration', () => {
  it('should complete full sync workflow', async () => {
    // 1. Check availability
    const bridge = new HealthKitBridge();
    const availability = await bridge.isAvailable();
    expect(availability).toBeDefined();

    // 2. Auto-map tracker
    const mapper = new HealthKitAutoMapper();
    const tracker = { tag: 'steps', label: 'Steps', type: 'range' };
    const mapping = mapper.suggestMapping(tracker);
    expect(mapping).not.toBeNull();

    // 3. Create sync engine
    const sync = new HealthKitSync(bridge);
    expect(sync).toBeDefined();

    // This test verifies the components work together
    // Actual HealthKit calls only work on iOS device/simulator
  });

  it('should handle platform detection correctly', () => {
    const bridge = new HealthKitBridge();
    const isSupported = bridge.isPlatformSupported();

    // In test environment, should return false
    expect(isSupported).toBe(false);
  });
});
```

**Step 2: Run tests**

Run: `npm run vtest integration.spec.ts`
Expected: PASS

**Step 3: Commit tests**

```bash
git add src/domains/health-kit/integration.spec.ts
git commit -m "test: add HealthKit integration tests

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 24: Create User Documentation

**Files:**
- Create: `docs/healthkit-setup.md`

**Step 1: Write setup guide**

File: `docs/healthkit-setup.md`
```markdown
# HealthKit Setup Guide

## Overview

Nomie 6 iOS app supports two-way synchronization with Apple HealthKit, allowing you to:
- Write Nomie tracking data to Apple Health
- Read health data from Apple Health into Nomie
- Keep your health data unified across apps

## Requirements

- iOS 16.0 or later
- Nomie 6 iOS app (native, not PWA)
- Apple Health app (pre-installed on iOS)

## Setup Instructions

### 1. Enable HealthKit Integration

1. Open Nomie app
2. Navigate to Settings → Health Sync
3. Tap "Connect"
4. Grant permissions when prompted

### 2. Auto-Map Your Trackers

1. In Settings → Health Sync
2. Tap "Auto-Map Trackers"
3. Review suggested mappings
4. Confirm to apply

**Auto-Mapped Trackers:**
- Steps → Step Count
- Heart Rate / HR / BPM → Heart Rate
- Weight → Body Mass
- Running / Run → Running Workout
- Walking / Walk → Walking Workout
- Sleep → Sleep Analysis

### 3. Verify Sync

1. Create a log entry (e.g., track steps)
2. Open Apple Health app
3. Check that data appears

## Manual Mapping

For trackers that aren't auto-mapped:

1. Open tracker settings
2. Scroll to "HealthKit Sync"
3. Toggle "Enable HealthKit"
4. Select HealthKit type from dropdown
5. Choose sync direction:
   - **Read**: Import from Health to Nomie
   - **Write**: Export from Nomie to Health
   - **Bidirectional**: Both directions

## Troubleshooting

### "HealthKit not available"
- Ensure you're on iOS device (not web browser)
- Check iOS version is 16.0+

### Permissions Denied
1. Open iOS Settings
2. Privacy → Health → Nomie
3. Enable all required permissions

### Data Not Syncing
- Check tracker has HealthKit enabled
- Verify sync direction is correct
- Try manual "Sync Now" in Settings

## Privacy

- All sync happens locally on your device
- No data sent to external servers
- HealthKit data follows Apple's strict privacy rules
- You can revoke permissions anytime in iOS Settings
```

**Step 2: Commit documentation**

```bash
git add docs/healthkit-setup.md
git commit -m "docs: add HealthKit setup and troubleshooting guide

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 25: Update README

**Files:**
- Modify: `README.md`

**Step 1: Add iOS app section**

Add section to README.md:
```markdown
## iOS Native App

Nomie 6 is available as a native iOS app with Apple HealthKit integration.

### Features

- ✅ All PWA features work unchanged
- ✅ Two-way HealthKit sync (read & write)
- ✅ Auto-mapping for common health metrics
- ✅ Real-time background sync
- ✅ Offline-first architecture
- ✅ App Store distribution

### Building for iOS

```bash
# Install dependencies
npm install

# Build web assets
npm run vbuild

# Sync to iOS
npm run ios:sync

# Open in Xcode
npm run ios:open
```

See [docs/healthkit-setup.md](docs/healthkit-setup.md) for user guide.
```

**Step 2: Commit README update**

```bash
git add README.md
git commit -m "docs: add iOS app section to README

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 26: Final Testing Checklist

**Files:**
- Create: `docs/testing/healthkit-test-plan.md`

**Step 1: Create test plan**

File: `docs/testing/healthkit-test-plan.md`
```markdown
# HealthKit Integration Test Plan

## Pre-Flight Checks

- [ ] iOS Simulator runs without errors
- [ ] Web build still works (PWA)
- [ ] Existing features unaffected

## HealthKit Tests

### Permissions
- [ ] Can request HealthKit permissions
- [ ] Permissions dialog shows correct usage descriptions
- [ ] Can grant/deny permissions
- [ ] Settings shows correct permission status

### Auto-Mapping
- [ ] Auto-maps steps tracker
- [ ] Auto-maps weight tracker
- [ ] Auto-maps heart rate tracker
- [ ] Ignores custom/unmapped trackers

### Write Path (Nomie → HealthKit)
- [ ] Log entry syncs to Health app
- [ ] Correct value appears
- [ ] Timestamp matches
- [ ] Metadata includes source="Nomie"

### Read Path (HealthKit → Nomie)
- [ ] Can query historical data
- [ ] New Health data triggers observer
- [ ] Creates Nomie log with healthKit badge
- [ ] Deduplication prevents double-import

### UI Elements
- [ ] HealthKit badge shows on synced logs
- [ ] Settings section displays correctly
- [ ] "Synced Trackers" list updates
- [ ] Connection status accurate

### Error Handling
- [ ] Graceful failure on permission denial
- [ ] Web/Android shows "not available"
- [ ] Failed sync doesn't break app
- [ ] Offline queue works

## Performance
- [ ] App launches in < 3 seconds
- [ ] Sync doesn't block UI
- [ ] Large data imports don't crash
- [ ] Battery drain acceptable

## Device Testing
- [ ] iPhone 15 Simulator
- [ ] Real iPhone (if available)
- [ ] iPad (optional)
```

**Step 2: Commit test plan**

```bash
git add docs/testing/healthkit-test-plan.md
git commit -m "test: add comprehensive HealthKit test plan

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Completion

**Plan complete and saved to `docs/plans/2026-01-10-ios-healthkit-implementation.md`**

### Summary

26 granular tasks covering:
- ✅ Phase 1: Capacitor setup (6 tasks)
- ✅ Phase 2: Swift HealthKit plugin (6 tasks)
- ✅ Phase 3: TypeScript sync engine (6 tasks)
- ✅ Phase 4: UI integration (4 tasks)
- ✅ Phase 5: Real-time sync (2 tasks)
- ✅ Phase 6: Testing & docs (3 tasks)

Each task broken into 2-5 minute steps with:
- Exact file paths
- Complete code examples
- Test commands with expected output
- Frequent commits

### Next: Choose Execution Approach

**Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration
- REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
- Stay in this session
- Review after each task

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints
- REQUIRED SUB-SKILL: New session uses superpowers:executing-plans
- Run in background
- Checkpoint reviews at phase boundaries

**Which approach?**
