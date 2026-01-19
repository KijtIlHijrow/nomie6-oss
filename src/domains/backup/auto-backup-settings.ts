import { writable } from 'svelte/store'

interface AutoBackupSettings {
  dailyEnabled: boolean
  closeEnabled: boolean
}

const SETTINGS_KEY = 'auto-backup-settings'

function createAutoBackupSettings() {
  const defaultSettings: AutoBackupSettings = {
    dailyEnabled: true,
    closeEnabled: true
  }

  const stored = localStorage.getItem(SETTINGS_KEY)
  const initial = stored ? JSON.parse(stored) : defaultSettings

  const { subscribe, set, update } = writable<AutoBackupSettings>(initial)

  return {
    subscribe,
    setDailyEnabled: (enabled: boolean) => {
      update(s => {
        const newSettings = { ...s, dailyEnabled: enabled }
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings))
        return newSettings
      })
    },
    setCloseEnabled: (enabled: boolean) => {
      update(s => {
        const newSettings = { ...s, closeEnabled: enabled }
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings))
        return newSettings
      })
    }
  }
}

export const autoBackupSettings = createAutoBackupSettings()
