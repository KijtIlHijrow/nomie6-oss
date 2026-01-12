<script lang="ts">
  import { nutritionService } from '../nutrition-service'

  export let onSubmit: (barcode: string) => void
  export let onCancel: () => void

  let barcode = ''
  let error = ''
  let isValid = false

  function handleInput() {
    error = ''

    // Remove any non-numeric characters
    barcode = barcode.replace(/\D/g, '')

    // Validate as user types
    if (barcode.length > 0) {
      const validation = nutritionService.validateBarcode(barcode)
      isValid = validation.valid

      if (!isValid && barcode.length >= 8) {
        error = validation.error || 'Invalid barcode format'
      }
    } else {
      isValid = false
    }
  }

  function handleSubmit() {
    const validation = nutritionService.validateBarcode(barcode)

    if (validation.valid) {
      onSubmit(barcode)
    } else {
      error = validation.error || 'Invalid barcode format'
      isValid = false
    }
  }

  function handleKeyPress(event: KeyboardEvent) {
    if (event.key === 'Enter' && isValid) {
      handleSubmit()
    } else if (event.key === 'Escape') {
      onCancel()
    }
  }
</script>

<div class="manual-barcode-modal">
  <div class="modal-overlay" on:click={onCancel}></div>
  <div class="modal-container">
    <div class="modal-header">
      <h2>Enter Barcode</h2>
      <button class="close-btn" on:click={onCancel} aria-label="Close">
        ✕
      </button>
    </div>

    <div class="modal-body">
      <p class="description">
        Enter the barcode number manually if scanning doesn't work
      </p>

      <div class="input-wrapper">
        <input
          type="text"
          inputmode="numeric"
          placeholder="012345678901"
          bind:value={barcode}
          on:input={handleInput}
          on:keypress={handleKeyPress}
          class:valid={isValid}
          class:invalid={error}
          autocomplete="off"
          autofocus
        />
        {#if isValid}
          <span class="validation-icon valid-icon">✓</span>
        {/if}
      </div>

      {#if error}
        <div class="error-message">
          {error}
        </div>
      {/if}

      <div class="format-hint">
        <p class="hint-title">Supported formats:</p>
        <ul class="format-list">
          <li>UPC-A (12 digits) - Common in US/Canada</li>
          <li>EAN-13 (13 digits) - International standard</li>
          <li>EAN-8 (8 digits) - For small packages</li>
        </ul>
      </div>
    </div>

    <div class="modal-footer">
      <button class="btn-cancel" on:click={onCancel}>
        Cancel
      </button>
      <button
        class="btn-submit"
        on:click={handleSubmit}
        disabled={!isValid}
      >
        Lookup Nutrition
      </button>
    </div>
  </div>
</div>

<style>
  .manual-barcode-modal {
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
    max-width: 500px;
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
    padding: 24px;
    overflow-y: auto;
  }

  .description {
    margin: 0 0 20px 0;
    color: var(--color-text-secondary, #999);
    font-size: 14px;
    line-height: 1.5;
  }

  .input-wrapper {
    position: relative;
    margin-bottom: 12px;
  }

  input {
    width: 100%;
    padding: 14px 16px;
    font-size: 18px;
    letter-spacing: 0.5px;
    border: 2px solid var(--color-border, #444);
    border-radius: 8px;
    background: var(--color-bg-secondary, #2a2a2a);
    color: var(--color-text-primary, #fff);
    transition: border-color 0.2s;
  }

  input:focus {
    outline: none;
    border-color: var(--primary_color, #07B2F5);
  }

  input.valid {
    border-color: var(--green_color, #48bb78);
    padding-right: 48px;
  }

  input.invalid {
    border-color: var(--red_color, #f56565);
  }

  input::placeholder {
    color: var(--color-text-tertiary, #666);
  }

  .validation-icon {
    position: absolute;
    right: 16px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 20px;
  }

  .valid-icon {
    color: var(--green_color, #48bb78);
  }

  .error-message {
    background: rgba(245, 101, 101, 0.1);
    border: 1px solid var(--red_color, #f56565);
    color: var(--red_color, #f56565);
    padding: 10px 12px;
    border-radius: 6px;
    font-size: 13px;
    margin-bottom: 16px;
  }

  .format-hint {
    margin-top: 24px;
    padding: 16px;
    background: var(--color-bg-secondary, #2a2a2a);
    border-radius: 8px;
  }

  .hint-title {
    margin: 0 0 8px 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-primary, #fff);
  }

  .format-list {
    margin: 0;
    padding-left: 20px;
    font-size: 12px;
    color: var(--color-text-secondary, #999);
    line-height: 1.8;
  }

  .format-list li {
    margin: 4px 0;
  }

  .modal-footer {
    padding: 20px 24px;
    border-top: 1px solid var(--color-border, #333);
    display: flex;
    gap: 12px;
    justify-content: flex-end;
  }

  .btn-cancel,
  .btn-submit {
    padding: 12px 24px;
    font-size: 15px;
    font-weight: 500;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
  }

  .btn-cancel {
    background: var(--color-bg-secondary, #2a2a2a);
    color: var(--color-text-primary, #fff);
  }

  .btn-cancel:hover {
    background: var(--color-bg-tertiary, #333);
  }

  .btn-submit {
    background: var(--primary_color, #07B2F5);
    color: white;
  }

  .btn-submit:hover:not(:disabled) {
    opacity: 0.9;
    transform: translateY(-1px);
  }

  .btn-submit:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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

    .btn-cancel,
    .btn-submit {
      width: 100%;
    }
  }
</style>
