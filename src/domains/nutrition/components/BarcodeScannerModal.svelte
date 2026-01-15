<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { Html5Qrcode } from 'html5-qrcode'
  import { nutritionService } from '../nutrition-service'

  export let onScan: (barcode: string) => void
  export let onCancel: () => void
  export let onError: (error: string) => void

  let scanner: Html5Qrcode | null = null
  let scanning = false
  let errorMessage = ''
  let scannerElement: HTMLElement

  const SCANNER_ID = 'barcode-scanner-reader'

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      handleCancel()
    }
  }

  onMount(async () => {
    await startScanning()
    window.addEventListener('keydown', handleKeyDown)
  })

  onDestroy(async () => {
    await stopScanning()
    window.removeEventListener('keydown', handleKeyDown)
  })

  async function startScanning() {
    try {
      scanning = true
      errorMessage = ''

      // Create scanner instance
      scanner = new Html5Qrcode(SCANNER_ID)

      // Start scanning with rear camera
      await scanner.start(
        { facingMode: 'environment' }, // Use back camera
        {
          fps: 10, // Scans per second
          qrbox: { width: 250, height: 250 }, // Scanning area
          aspectRatio: 1.0
        },
        onScanSuccess,
        onScanFailure
      )
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      errorMessage = `Failed to start camera: ${msg}`
      onError(errorMessage)
    }
  }

  async function stopScanning() {
    if (scanner && scanning) {
      try {
        await scanner.stop()
        scanner.clear()
      } catch (error) {
        console.error('Error stopping scanner:', error)
      }
    }
    scanner = null
    scanning = false
  }

  function onScanSuccess(decodedText: string, decodedResult: any) {
    // Validate barcode
    const validation = nutritionService.validateBarcode(decodedText)

    if (validation.valid) {
      // Stop scanner and return result
      stopScanning()
      onScan(decodedText)
    } else {
      // Invalid barcode format, keep scanning
      errorMessage = validation.error || 'Invalid barcode format'
      setTimeout(() => {
        errorMessage = ''
      }, 2000)
    }
  }

  function onScanFailure(error: string) {
    // This is called continuously while scanning, ignore
    // Only log actual errors, not "No barcode found" messages
    if (!error.includes('NotFoundException')) {
      console.warn('Scan error:', error)
    }
  }

  function handleCancel() {
    stopScanning()
    onCancel()
  }
</script>

<div class="barcode-scanner-modal">
  <div class="scanner-overlay">
    <div class="scanner-container">
      <div class="scanner-header">
        <h2>Scan Barcode</h2>
        <button class="close-btn" on:click={handleCancel} aria-label="Close scanner">
          ✕
        </button>
      </div>

      <div class="scanner-body">
        {#if errorMessage}
          <div class="error-message">
            {errorMessage}
          </div>
        {/if}

        <div id={SCANNER_ID} class="scanner-video"></div>

        <div class="scanner-instructions">
          <p>Point your camera at the barcode</p>
          <p class="scanner-tip">Position the barcode within the frame</p>
        </div>
      </div>

      <div class="scanner-footer">
        <button class="btn-cancel" on:click={handleCancel}>
          Cancel
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  .barcode-scanner-modal {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 9999;
    background: rgba(0, 0, 0, 0.95);
  }

  .scanner-overlay {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }

  .scanner-container {
    background: var(--color-bg-card, #1a1a1a);
    border-radius: 16px;
    max-width: 500px;
    width: 100%;
    max-height: 90vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .scanner-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px;
    border-bottom: 1px solid var(--color-border, #333);
  }

  .scanner-header h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    color: var(--color-text-primary, #fff);
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 24px;
    color: var(--color-text-secondary, #999);
    cursor: pointer;
    padding: 4px 8px;
    line-height: 1;
  }

  .close-btn:hover {
    color: var(--color-text-primary, #fff);
  }

  .scanner-body {
    flex: 1;
    padding: 20px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .error-message {
    background: var(--red_color, #f56565);
    color: white;
    padding: 12px 16px;
    border-radius: 8px;
    margin-bottom: 16px;
    text-align: center;
    width: 100%;
    font-size: 14px;
  }

  .scanner-video {
    width: 100%;
    max-width: 400px;
    aspect-ratio: 1;
    border-radius: 12px;
    overflow: hidden;
    background: #000;
  }

  :global(#barcode-scanner-reader video) {
    width: 100% !important;
    height: 100% !important;
    object-fit: cover;
  }

  :global(#barcode-scanner-reader__scan_region) {
    border: 2px solid var(--primary_color, #07B2F5) !important;
  }

  .scanner-instructions {
    margin-top: 20px;
    text-align: center;
  }

  .scanner-instructions p {
    margin: 8px 0;
    color: var(--color-text-primary, #fff);
    font-size: 16px;
  }

  .scanner-tip {
    font-size: 14px !important;
    color: var(--color-text-secondary, #999) !important;
  }

  .scanner-footer {
    padding: 20px;
    border-top: 1px solid var(--color-border, #333);
    display: flex;
    justify-content: center;
  }

  .btn-cancel {
    padding: 12px 32px;
    background: var(--color-bg-secondary, #2a2a2a);
    border: 1px solid var(--color-border, #444);
    border-radius: 8px;
    color: var(--color-text-primary, #fff);
    font-size: 16px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-cancel:hover {
    background: var(--color-bg-tertiary, #333);
  }

  @media (max-width: 600px) {
    .scanner-overlay {
      padding: 0;
    }

    .scanner-container {
      max-width: 100%;
      max-height: 100vh;
      border-radius: 0;
      height: 100%;
    }
  }
</style>
