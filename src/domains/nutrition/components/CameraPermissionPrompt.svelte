<script lang="ts">
  import { Capacitor } from '@capacitor/core'
  import { barcodeScanner } from '../barcode-scanner'

  export let onManualEntry: () => void
  export let onCancel: () => void

  async function handleOpenSettings() {
    await barcodeScanner.openSettings()
  }

  const isNative = Capacitor.isNativePlatform()
</script>

<div class="permission-prompt-modal">
  <div class="modal-overlay" on:click={onCancel}></div>
  <div class="modal-container">
    <div class="modal-header">
      <h2>Camera Access Required</h2>
      <button class="close-btn" on:click={onCancel} aria-label="Close">
        ✕
      </button>
    </div>

    <div class="modal-body">
      <div class="icon-container">
        <svg
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
          <circle cx="12" cy="13" r="4"></circle>
          <line x1="1" y1="1" x2="23" y2="23"></line>
        </svg>
      </div>

      <p class="message">
        Camera access is required to scan barcodes. Please enable camera permissions in your {isNative ? 'device' : 'browser'} settings.
      </p>

      {#if isNative}
        <div class="steps">
          <p class="steps-title">To enable camera access:</p>
          <ol>
            <li>Open Settings</li>
            <li>Find Nomie in the app list</li>
            <li>Enable Camera permission</li>
            <li>Return to Nomie and try again</li>
          </ol>
        </div>
      {:else}
        <div class="steps">
          <p class="steps-title">To enable camera access:</p>
          <ol>
            <li>Look for the camera icon in your browser's address bar</li>
            <li>Click it and select "Allow"</li>
            <li>Refresh the page if needed</li>
          </ol>
        </div>
      {/if}
    </div>

    <div class="modal-footer">
      <button class="btn-secondary" on:click={onManualEntry}>
        Enter Barcode Manually
      </button>
      {#if isNative}
        <button class="btn-primary" on:click={handleOpenSettings}>
          Open Settings
        </button>
      {/if}
    </div>
  </div>
</div>

<style>
  .permission-prompt-modal {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .modal-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(4px);
  }

  .modal-container {
    position: relative;
    background: var(--color-bg-card, #1a1a1a);
    border-radius: 16px;
    max-width: 460px;
    width: 90%;
    max-height: 90vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 24px;
    border-bottom: 1px solid var(--color-border, #333);
  }

  .modal-header h2 {
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
    transition: color 0.2s;
  }

  .close-btn:hover {
    color: var(--color-text-primary, #fff);
  }

  .modal-body {
    flex: 1;
    padding: 32px 24px;
    overflow-y: auto;
    text-align: center;
  }

  .icon-container {
    margin-bottom: 24px;
  }

  .icon-container svg {
    color: var(--red_color, #f56565);
  }

  .message {
    margin: 0 0 24px 0;
    color: var(--color-text-primary, #fff);
    font-size: 15px;
    line-height: 1.6;
  }

  .steps {
    background: var(--color-bg-secondary, #2a2a2a);
    border-radius: 12px;
    padding: 20px;
    text-align: left;
  }

  .steps-title {
    margin: 0 0 12px 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text-primary, #fff);
  }

  .steps ol {
    margin: 0;
    padding-left: 20px;
    color: var(--color-text-secondary, #999);
    font-size: 14px;
    line-height: 1.8;
  }

  .steps li {
    margin: 6px 0;
  }

  .modal-footer {
    padding: 20px 24px;
    border-top: 1px solid var(--color-border, #333);
    display: flex;
    gap: 12px;
    justify-content: flex-end;
  }

  .btn-secondary,
  .btn-primary {
    padding: 12px 20px;
    font-size: 15px;
    font-weight: 500;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
  }

  .btn-secondary {
    background: var(--color-bg-secondary, #2a2a2a);
    color: var(--color-text-primary, #fff);
    flex: 1;
  }

  .btn-secondary:hover {
    background: var(--color-bg-tertiary, #333);
  }

  .btn-primary {
    background: var(--primary_color, #07B2F5);
    color: white;
    flex: 1;
  }

  .btn-primary:hover {
    opacity: 0.9;
  }

  @media (max-width: 600px) {
    .modal-container {
      width: 100%;
      max-width: 100%;
      border-radius: 16px 16px 0 0;
      align-self: flex-end;
    }

    .modal-footer {
      flex-direction: column-reverse;
    }

    .btn-secondary,
    .btn-primary {
      width: 100%;
    }
  }
</style>
