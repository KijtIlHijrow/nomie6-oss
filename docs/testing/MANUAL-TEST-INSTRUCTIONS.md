# Manual Testing Instructions - iOS Simulator

## Quick Start

1. **Open Xcode Project**
   ```bash
   npm run ios:open
   ```

2. **Select Simulator**
   - In Xcode: Product → Destination → iPhone 15 (or any available simulator)

3. **Build and Run**
   - Press ⌘R or Product → Run
   - Wait for build (3-5 minutes first time)
   - Simulator will launch automatically

4. **Perform Tests**
   Follow the detailed steps in `capacitor-baseline-test.md`

5. **Document Results**
   - Fill in the "Actual" sections in `capacitor-baseline-test.md`
   - Update status from "PENDING" to "PASS" or "FAIL"
   - Document any issues found

6. **Commit Updated Results**
   ```bash
   git add docs/testing/capacitor-baseline-test.md
   git commit -m "test: complete Capacitor iOS baseline verification"
   ```

## What to Look For

### Success Indicators
- App launches without crashes
- UI looks identical to web version
- All existing features work
- Data persists after app restart
- No console errors in Xcode debug output

### Failure Indicators
- App crashes on launch
- White screen or blank UI
- Features don't work (can't create trackers, log entries, etc.)
- Data disappears after restart
- Build errors or warnings

## Troubleshooting

### Build Fails
- Check Xcode version (need 14+ for iOS 17)
- Run `npm run ios:sync` to sync capacitor changes
- Clean build folder: Product → Clean Build Folder

### App Crashes
- Check Xcode console for error messages
- Document the error in test results
- May need to investigate specific plugin issues

### Simulator Issues
- Restart simulator: Device → Restart
- Reset simulator: Device → Erase All Content and Settings
- Try different simulator model

## After Testing

If tests PASS:
- Update test documentation with results
- Commit the completed test
- Proceed to Task 6 (HealthKit plugin development)

If tests FAIL:
- Document all issues in detail
- Report issues before proceeding
- May need to debug Capacitor setup
