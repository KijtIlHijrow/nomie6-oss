# iOS Native App with HealthKit Integration

**Date:** 2026-01-10
**Status:** Design Complete
**Goal:** Convert Nomie6 PWA to native iOS app with two-way HealthKit sync

## Overview

Transform Nomie6 from a PWA into a native iOS app distributed through the App Store, with comprehensive two-way synchronization with Apple HealthKit. This enables users to read health data from HealthKit into Nomie trackers and write Nomie tracking data back to HealthKit, creating a unified health tracking ecosystem.

## Architecture

### Tech Stack

- **Capacitor 6**: Wraps existing Svelte app as native iOS container
- **Native Swift Plugin**: HealthKit bridge (Capacitor plugin architecture)
- **Existing CouchDB Sync**: Unchanged for cross-device data synchronization

### Three-Layer Architecture

1. **Svelte UI Layer** (existing, minimal changes)
   - Add HealthKit badges/icons to distinguish synced data
   - Settings panel for Health Sync configuration

2. **HealthKit Bridge Layer** (new Swift plugin)
   - Exposes read/write methods to JavaScript
   - Background observer for HealthKit updates
   - Native iOS HealthKit API wrapper

3. **Sync Engine Layer** (new Svelte service)
   - Orchestrates real-time sync
   - Handles tracker-to-HealthKit mapping
   - Manages conflict resolution
   - Deduplication logic

### Data Flow

```
User tracks in Nomie → Sync Engine → HealthKit Bridge → iOS HealthKit Store
HealthKit receives data → Background Observer → Bridge Event → Sync Engine → Nomie Log Store
```

## HealthKit Mapping & Auto-Detection

### Nomie Type Mapping

| Nomie Tracker Type | HealthKit Type | Example |
|-------------------|----------------|---------|
| `tick` | `HKCategoryType` | Meditation session (binary) |
| `range` | `HKQuantityType` | Steps, weight, heart rate |
| `timer` | `HKWorkout` | Running, cycling (duration) |
| `note` | No sync | Text doesn't map to HealthKit |

### Auto-Detection Logic

**Priority 1: Name Matching** (case-insensitive keywords)
- "steps", "step count" → `HKQuantityTypeIdentifierStepCount`
- "heart", "hr", "bpm" → `HKQuantityTypeIdentifierHeartRate`
- "weight", "body weight" → `HKQuantityTypeIdentifierBodyMass`
- "sleep" → `HKCategoryTypeIdentifierSleepAnalysis`
- "run", "running" → `HKWorkoutActivityTypeRunning`
- 50+ common health metrics mapped

**Priority 2: Unit Matching**
- Tracker with "steps" unit → step count
- Tracker with "bpm" unit → heart rate
- Tracker with "lbs" or "kg" unit → body mass

**Priority 3: Manual Configuration**
- Unmapped trackers show "Link to HealthKit" button in tracker settings
- User manually selects HealthKit type from dropdown

### Storage

Mapping preferences stored in tracker metadata:
```typescript
tracker.healthKit = {
  type: 'HKQuantityTypeIdentifierStepCount',
  enabled: true,
  direction: 'bidirectional' // 'read', 'write', 'bidirectional'
}
```

## Real-Time Sync Implementation

### Sync Engine Service

**Location:** `src/domains/health-kit/HealthKitSync.ts`

**Write Path (Nomie → HealthKit):**
```typescript
onTrackerLog(log) {
  if (!tracker.healthKit?.enabled) return

  const sample = {
    type: tracker.healthKit.type,
    value: log.value,
    startDate: log.end,
    endDate: log.end,
    metadata: {
      source: 'Nomie',
      logId: log._id
    }
  }

  await HealthKitBridge.saveSample(sample)
}
```

**Read Path (HealthKit → Nomie):**
1. Background Observer registers for HealthKit updates on app launch
2. When HealthKit receives new data, iOS calls Swift callback
3. Bridge emits event to JavaScript with sample data
4. Sync Engine creates Nomie log with `source: 'healthkit'` flag
5. Log saved to LedgerStore with HealthKit UUID for deduplication

### Conflict Resolution (Last-Write-Wins)

**Implementation:**
- Each log stores `end` timestamp (existing field)
- Before writing to HealthKit:
  - Query HealthKit for samples in same time window (±5 minutes)
  - Compare timestamps: if HealthKit sample is newer, skip write
- When reading from HealthKit:
  - Check if Nomie log exists for that timestamp (±5 min tolerance)
  - Keep whichever entry has the most recent timestamp
  - Delete/skip the older entry

**Deduplication:**
- Logs include `healthKitUUID` field
- Prevents import loops (Nomie→HealthKit→Nomie)
- UUID stored in both HealthKit metadata and Nomie log

## UI Changes & Visual Distinction

### HealthKit Badge System

**Timeline/Log List:**
- Logs with `source: 'healthkit'` show HealthKit icon (􀣺 symbol)
- Icon appears next to timestamp
- Tooltip on hover/tap: "Synced from Apple Health"

**Tracker Cards:**
- Active sync shows status: "⟳ Syncing with Health"
- Tap opens HealthKit mapping details
- Toggle to enable/disable sync per tracker

### Settings Panel

**New "Health Sync" Section** in `src/routes/Settings.svelte`:

```
┌─────────────────────────────────┐
│ Health Sync                     │
├─────────────────────────────────┤
│ ✓ Enable Apple Health           │
│   Integration                   │
│                                 │
│ Status: ● Connected             │
│                                 │
│ [Sync Now]                      │
│                                 │
│ Synced Trackers:                │
│ • Steps → Step Count            │
│ • Weight → Body Mass            │
│ • Running → Workout (Running)   │
│                                 │
│ [View All Mappings]             │
└─────────────────────────────────┘
```

### First-Time Setup Flow

After Capacitor installation, new onboarding step:
1. "Connect to Apple Health?" screen
2. Explains benefits (unified health data)
3. Requests HealthKit permissions (read + write for all types)
4. Auto-scans existing trackers
5. Shows suggested mappings for user review
6. Option to skip or customize

### Stats Integration

- HealthKit-sourced data counts toward streak calculations
- Charts show combined data (no visual separation in graphs)
- Individual log list distinguishes source with icon
- Export/backup includes HealthKit source flag

## Capacitor Setup & Build Process

### Installation Steps

1. **Add Capacitor to project:**
   ```bash
   npm install @capacitor/core @capacitor/cli
   npm install @capacitor/ios
   npx cap init
   ```

2. **Configure `capacitor.config.ts`:**
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

3. **Build and sync:**
   ```bash
   npm run vbuild
   npx cap add ios
   npx cap sync
   ```

4. **Create HealthKit Plugin** (`ios/App/App/HealthKitPlugin/`):
   - `HealthKitPlugin.swift`: Main plugin class
   - Implements `CAPPlugin` protocol
   - Methods: `saveSample()`, `querySamples()`, `enableBackgroundObserver()`
   - Uses `@objc` annotations for JavaScript bridge

5. **Update `Info.plist`:**
   ```xml
   <key>NSHealthShareUsageDescription</key>
   <string>Nomie reads health data to display your tracking history</string>

   <key>NSHealthUpdateUsageDescription</key>
   <string>Nomie writes tracking data to Apple Health</string>

   <key>UIBackgroundModes</key>
   <array>
     <string>processing</string>
   </array>
   ```

6. **Enable HealthKit in Xcode:**
   - Open `ios/App/App.xcworkspace`
   - Select App target → Signing & Capabilities
   - Add "HealthKit" capability

### Build Workflow

**Development:**
- Browser testing: `npm run dev` (HealthKit features hidden)
- iOS Simulator: `npx cap run ios`
- Live reload: Vite dev server + Capacitor live reload

**Production:**
```bash
npm run vbuild
npx cap sync
npx cap open ios
# In Xcode: Product → Archive → Distribute to App Store
```

**Package.json additions:**
```json
{
  "scripts": {
    "ios:dev": "npx cap run ios",
    "ios:build": "npm run vbuild && npx cap sync",
    "ios:open": "npx cap open ios"
  }
}
```

## Error Handling & Edge Cases

### Permission Handling

**Denied Permissions:**
- Show banner: "Health sync disabled. Enable in Settings → Privacy → Health → Nomie"
- Disable HealthKit features in UI
- Periodic re-check (on app resume)

**Partial Permissions:**
- User grants read-only → disable write features, show explanation
- User grants specific types only → sync only permitted types
- Clear UI indication of which trackers can sync

**Lost Permissions:**
- Detect on app resume via `HKHealthStore.authorizationStatus()`
- Prompt re-authorization with explanation
- Gracefully degrade (show last-synced timestamp)

### Network & Sync Failures

**HealthKit Write Failures:**
- Log error to console with sample details
- Queue failed writes for retry
- Retry on next app launch or manual "Sync Now"
- Show warning badge in Settings if writes are failing

**CouchDB Independence:**
- HealthKit sync failures don't block CouchDB sync
- Systems operate independently
- Both can be enabled simultaneously

**Offline Behavior:**
- HealthKit writes are local-first (always succeed offline)
- Background observer continues to collect HealthKit updates
- Sync to CouchDB when connection restored

### Data Migration

**Existing Nomie Logs:**
- Remain unchanged (no retroactive HealthKit writes)
- Option in settings: "Backfill to HealthKit" (writes last 30 days)

**First HealthKit Sync:**
- User chooses historical import range:
  - Last 7 days
  - Last 30 days
  - Last 90 days
  - All time
- Deduplication prevents double-counting existing manual entries
- Progress indicator for large imports

**CouchDB Sync Compatibility:**
- HealthKit metadata syncs via CouchDB to other devices
- iOS devices use HealthKit; other platforms show "from HealthKit" badge but don't sync

### Platform Limitations

**iOS-Only Feature:**
- Android users see: "Health Sync unavailable on this platform"
- Feature detection via `Capacitor.getPlatform()`
- Graceful degradation on web/PWA

**Browser/PWA:**
- HealthKit features completely hidden
- Capacitor API checks prevent errors
- Existing PWA functionality unaffected

### Testing Strategy

**Unit Tests:**
- Mapping logic (tracker name → HealthKit type)
- Conflict resolution algorithm
- Deduplication logic
- Mock HealthKit responses

**Integration Tests:**
- Real HealthKit data in iOS Simulator
- Write → Read → Verify flow
- Background observer functionality
- Permission handling scenarios

**Manual QA:**
- TestFlight beta release
- Real device testing with Apple Watch
- Multi-day usage to verify background sync
- Edge cases: timezone changes, daylight saving, device restarts

**Beta Release:**
- TestFlight to 10-20 users for 2 weeks
- Collect feedback on mapping accuracy
- Monitor crash reports and sync failures
- Iterate before App Store submission

## Implementation Phases

### Phase 1: Capacitor Setup (1-2 days)
- Install Capacitor and iOS platform
- Configure build pipeline
- Test basic app launch in simulator
- Verify existing Svelte app works in native container

### Phase 2: HealthKit Bridge Plugin (2-3 days)
- Create Swift plugin structure
- Implement read/write methods
- Add background observer
- Test JavaScript bridge communication

### Phase 3: Sync Engine (3-4 days)
- Build auto-detection mapping logic
- Implement write path (Nomie → HealthKit)
- Implement read path (HealthKit → Nomie)
- Add conflict resolution and deduplication

### Phase 4: UI Integration (2-3 days)
- Add HealthKit badges to log entries
- Build Settings panel
- Create onboarding flow
- Implement permission handling

### Phase 5: Testing & Polish (3-5 days)
- Unit tests for core logic
- Manual testing with real HealthKit data
- Fix bugs and edge cases
- Performance optimization

### Phase 6: App Store Submission (1-2 days)
- Prepare app metadata and screenshots
- TestFlight beta testing
- Address beta feedback
- Submit to App Store review

**Total Estimated Time:** 12-19 days of focused development

## Success Criteria

- [ ] Native iOS app launches from Home screen
- [ ] All existing Nomie features work unchanged
- [ ] HealthKit permissions requested on first launch
- [ ] Trackers automatically map to HealthKit types
- [ ] Real-time write: Nomie log → HealthKit sample
- [ ] Real-time read: HealthKit sample → Nomie log
- [ ] Conflict resolution prevents duplicates
- [ ] HealthKit icon displays on synced logs
- [ ] Settings panel shows sync status
- [ ] App Store approved and published
- [ ] CouchDB sync continues to work for cross-device data
- [ ] No regressions in existing PWA functionality

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| App Store rejection | High | Follow HIG strictly, thorough testing, clear HealthKit usage descriptions |
| HealthKit API complexity | Medium | Start with basic types, expand incrementally, leverage Capacitor examples |
| Duplicate data pollution | High | Robust deduplication with UUID tracking, extensive testing |
| Performance degradation | Medium | Background sync, lazy loading, batch operations |
| User confusion with mappings | Medium | Clear UI, suggested mappings, helpful error messages |

## Open Questions

- **App Store Account:** Do we have an Apple Developer account ($99/year)?
- **Code Signing:** Who will manage certificates and provisioning profiles?
- **Branding:** Keep "Nomie" name or rebrand for App Store?
- **Pricing:** Free with optional IAP, or paid upfront?
- **Version Strategy:** Separate iOS app or unified codebase with Capacitor?

## References

- [Capacitor Documentation](https://capacitorjs.com/docs)
- [HealthKit Framework](https://developer.apple.com/documentation/healthkit)
- [Capacitor HealthKit Plugin Example](https://github.com/Ad-Scientiam/capacitor-healthkit)
- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
