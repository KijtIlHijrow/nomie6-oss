import { writable } from 'svelte/store'

interface AutoBackupSettings {
  dailyEnabled: boolean
  closeEnabled: boolean
}

const SETTINGS_KEY = 'auto-backup-settings'

/**
 * Type guard to validate settings structure
 */
function isValidSettings(obj: any): obj is AutoBackupSettings {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.dailyEnabled === 'boolean' &&
    typeof obj.closeEnabled === 'boolean'
  )
}

/**
 * Safely load settings from localStorage with error handling and validation
 */
function loadSettings(defaultSettings: AutoBackupSettings): AutoBackupSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY)
    if (!stored) {
      return defaultSettings
    }

    const parsed = JSON.parse(stored)

    if (isValidSettings(parsed)) {
      return parsed
    }

    console.warn('[AutoBackupSettings] Invalid settings structure, using defaults')
    return defaultSettings
  } catch (error) {
    console.warn('[AutoBackupSettings] Failed to parse settings:', error)
    return defaultSettings
  }
}

/**
 * Safely save settings to localStorage with error handling
 */
function saveSettings(settings: AutoBackupSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch (error) {
    console.error('[AutoBackupSettings] Failed to save settings:', error)
    // Settings are still updated in store, just not persisted to localStorage
  }
}

function createAutoBackupSettings() {
  const defaultSettings: AutoBackupSettings = {
    dailyEnabled: true,
    closeEnabled: true
  }

  const initial = loadSettings(defaultSettings)

  const { subscribe, update } = writable<AutoBackupSettings>(initial)

  /**
   * Generic setter factory to reduce code duplication
   */
  function createSetter(key: keyof AutoBackupSettings) {
    return (value: boolean) => {
      update(s => {
        const newSettings = { ...s, [key]: value }
        saveSettings(newSettings)
        return newSettings
      })
    }
  }

  return {
    subscribe,
    setDailyEnabled: createSetter('dailyEnabled'),
    setCloseEnabled: createSetter('closeEnabled')
  }
}

export const autoBackupSettings = createAutoBackupSettings()
