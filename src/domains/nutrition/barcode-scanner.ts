/**
 * Barcode Scanner Service
 *
 * Handles barcode scanning on native platforms (iOS/Android) and web
 * with fallback to manual entry
 */

import { Capacitor } from '@capacitor/core'
import { BarcodeScanner as CapacitorBarcodeScanner } from '@capacitor-community/barcode-scanner'
import type { BarcodeValidation } from './nutrition-types'
import { nutritionService } from './nutrition-service'

export type ScanResult = {
  success: boolean
  barcode?: string
  cancelled?: boolean
  error?: string
}

export type ScanMethod = 'camera' | 'manual'

/**
 * Barcode scanner service
 * Supports native camera scanning and manual entry
 */
export class BarcodeScanner {
  /**
   * Scan a barcode using the best available method
   * On native platforms: uses device camera
   * On web: will use web camera (requires BarcodeScannerModal component)
   * Falls back to manual entry if camera fails
   */
  async scan(): Promise<ScanResult> {
    // Check camera permission first
    const hasPermission = await this.checkAndRequestPermission()

    if (!hasPermission) {
      console.warn('Camera permission denied, falling back to manual entry')
      return { success: false, error: 'Camera permission denied' }
    }

    // Use native scanner on iOS/Android
    if (Capacitor.isNativePlatform()) {
      return await this.scanNative()
    }

    // Web scanning requires a modal component (handled by UI layer)
    // This method returns error so UI can show scanner modal
    return {
      success: false,
      error: 'Web scanning requires modal component'
    }
  }

  /**
   * Scan using native Capacitor barcode scanner
   * (iOS/Android only)
   */
  private async scanNative(): Promise<ScanResult> {
    try {
      // Prepare scanner (make background transparent)
      await CapacitorBarcodeScanner.hideBackground()

      // Add scanner-active class to body for styling
      document.body.classList.add('scanner-active')

      // Start scanning
      const result = await CapacitorBarcodeScanner.startScan()

      // Cleanup
      await CapacitorBarcodeScanner.showBackground()
      document.body.classList.remove('scanner-active')

      if (result.hasContent) {
        const barcode = result.content

        // Validate barcode format
        const validation = nutritionService.validateBarcode(barcode)
        if (!validation.valid) {
          return {
            success: false,
            error: validation.error || 'Invalid barcode format'
          }
        }

        return {
          success: true,
          barcode
        }
      }

      // User cancelled
      return {
        success: false,
        cancelled: true
      }
    } catch (error) {
      // Cleanup on error
      await CapacitorBarcodeScanner.showBackground()
      document.body.classList.remove('scanner-active')

      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error('Native barcode scan failed:', errorMsg)

      return {
        success: false,
        error: errorMsg
      }
    }
  }

  /**
   * Stop any active scanning
   */
  async stopScan(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      try {
        await CapacitorBarcodeScanner.stopScan()
        await CapacitorBarcodeScanner.showBackground()
        document.body.classList.remove('scanner-active')
      } catch (error) {
        console.error('Failed to stop scanner:', error)
      }
    }
  }

  /**
   * Check and request camera permission
   */
  async checkAndRequestPermission(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) {
      // Web camera permissions handled by browser
      return true
    }

    try {
      // Check current permission status
      const status = await CapacitorBarcodeScanner.checkPermission({ force: false })

      if (status.granted) {
        return true
      }

      if (status.denied) {
        // Permission permanently denied, user must enable in settings
        return false
      }

      // Request permission
      const requestResult = await CapacitorBarcodeScanner.checkPermission({ force: true })
      return requestResult.granted || false
    } catch (error) {
      console.error('Permission check failed:', error)
      return false
    }
  }

  /**
   * Open device settings (for users to enable camera permission)
   */
  async openSettings(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      try {
        await CapacitorBarcodeScanner.openAppSettings()
      } catch (error) {
        console.error('Failed to open settings:', error)
      }
    }
  }

  /**
   * Validate a manually entered barcode
   */
  validateManualBarcode(barcode: string): BarcodeValidation {
    return nutritionService.validateBarcode(barcode)
  }

  /**
   * Check if barcode scanning is supported on this platform
   */
  isSupported(): boolean {
    return Capacitor.isNativePlatform() || this.isWebCameraSupported()
  }

  /**
   * Check if web camera is supported (for web fallback)
   */
  private isWebCameraSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      typeof navigator.mediaDevices !== 'undefined' &&
      typeof navigator.mediaDevices.getUserMedia === 'function'
    )
  }

  /**
   * Prepare scanner (call before showing scanner UI)
   */
  async prepare(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      try {
        await CapacitorBarcodeScanner.prepare()
      } catch (error) {
        console.error('Failed to prepare scanner:', error)
      }
    }
  }
}

// Export singleton instance
export const barcodeScanner = new BarcodeScanner()
