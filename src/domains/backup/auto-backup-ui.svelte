<script lang="ts">
  import { onMount } from 'svelte';
  import { AutoBackupService } from './AutoBackupService';
  import type { AutoBackup } from './auto-backup-storage';
  import dayjs from 'dayjs';
  import relativeTime from 'dayjs/plugin/relativeTime';
  import { Interact } from '../../store/interact';
  import { autoBackupSettings } from './auto-backup-settings';
  import ToggleSwitch from '../../components/toggle-switch/toggle-switch.svelte';

  dayjs.extend(relativeTime);

  let backups: AutoBackup[] = [];
  let storageUsage = 0;
  let loading = true;
  let downloadingId: string | null = null;
  let deletingId: string | null = null;
  let previewingId: string | null = null;
  let restoringId: string | null = null;

  async function loadBackups() {
    loading = true;
    try {
      backups = await AutoBackupService.listBackups();
      storageUsage = await AutoBackupService.getStorageUsage();
    } catch (error) {
      console.error('Failed to load backups:', error);
      Interact.error('Failed to load backups');
    } finally {
      loading = false;
    }
  }

  async function downloadBackup(backup: AutoBackup) {
    downloadingId = backup.id;
    try {
      const blob = new Blob([JSON.stringify(backup.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nomie-backup-${backup.id}.json`;
      a.click();
      URL.revokeObjectURL(url);
      a.remove();
      Interact.toast('Backup downloaded');
    } catch (error) {
      console.error('Failed to download backup:', error);
      Interact.error('Failed to download backup');
    } finally {
      downloadingId = null;
    }
  }

  async function deleteBackup(backup: AutoBackup) {
    const confirmed = await Interact.confirm(
      'Delete this backup?',
      'This action cannot be undone.'
    );
    if (confirmed) {
      deletingId = backup.id;
      try {
        await AutoBackupService.deleteBackup(backup.id);
        await loadBackups();
        Interact.toast('Backup deleted');
      } catch (error) {
        console.error('Failed to delete backup:', error);
        Interact.error('Failed to delete backup');
      } finally {
        deletingId = null;
      }
    }
  }

  async function previewBackup(backup: AutoBackup) {
    previewingId = backup.id;
    try {
      const preview = await AutoBackupService.getBackupPreview(backup.id);
      const date = dayjs(backup.timestamp).format('MMM D, YYYY h:mm A');
      const message = `Backup from ${date}\n\nTrackers: ${preview.trackerCount}\nLogs: ${preview.logCount}\nBooks: ${preview.bookCount}\nPeople: ${preview.peopleCount}\nBoards: ${preview.boardCount}`;
      await Interact.alert('Backup Preview', message);
    } catch (error) {
      console.error('Failed to preview backup:', error);
      Interact.error('Failed to preview backup');
    } finally {
      previewingId = null;
    }
  }

  async function restoreBackup(backup: AutoBackup) {
    const confirmed = await Interact.confirm(
      'Restore this backup?',
      'This will replace all your current data. A safety backup will be created first. This action cannot be undone.'
    );
    if (confirmed) {
      restoringId = backup.id;
      const blocker = Interact.blocker('Creating safety backup...');
      try {
        await AutoBackupService.restoreBackup(backup.id);
        // Page will reload, so we don't need to stop the blocker
      } catch (error) {
        blocker.close();
        console.error('Failed to restore backup:', error);
        Interact.error('Failed to restore backup');
        restoringId = null;
      }
    }
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  onMount(() => {
    loadBackups();
  });
</script>

<div class="auto-backup-ui">
  {#if loading}
    <div class="loading">Loading backups...</div>
  {:else}
    <div class="settings-section">
      <h4>Backup Settings</h4>
      <div class="setting-row">
        <div class="setting-label">
          <strong>Daily Backups</strong>
          <p class="description">Automatic backup once per day</p>
        </div>
        <ToggleSwitch
          title="Daily Backups"
          value={$autoBackupSettings.dailyEnabled}
          on:change={(e) => autoBackupSettings.setDailyEnabled(e.detail)}
        />
      </div>
      <div class="setting-row">
        <div class="setting-label">
          <strong>Backups on Close</strong>
          <p class="description">Backup when closing the app</p>
        </div>
        <ToggleSwitch
          title="Backups on Close"
          value={$autoBackupSettings.closeEnabled}
          on:change={(e) => autoBackupSettings.setCloseEnabled(e.detail)}
        />
      </div>
    </div>

    <div class="status-card">
      <h3>Auto-Backup Status</h3>
      <div class="status-info">
        <div class="stat">
          <div class="label">Total Backups</div>
          <div class="value">{backups.length}</div>
        </div>
        <div class="stat">
          <div class="label">Storage Used</div>
          <div class="value">{formatSize(storageUsage)}</div>
        </div>
        <div class="stat">
          <div class="label">Last Backup</div>
          <div class="value">
            {#if backups.length > 0}
              {dayjs(backups[0].timestamp).fromNow()}
            {:else}
              Never
            {/if}
          </div>
        </div>
      </div>
    </div>

    <div class="backup-list">
      {#if backups.length === 0}
        <div class="empty-state">
          <p>No backups found</p>
          <p class="subtitle">Backups will appear here automatically</p>
        </div>
      {:else}
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Size</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each backups as backup}
              <tr>
                <td>
                  <div class="date-cell">
                    <div class="primary">{dayjs(backup.timestamp).format('MMM D, YYYY')}</div>
                    <div class="secondary">{dayjs(backup.timestamp).format('h:mm A')}</div>
                  </div>
                </td>
                <td>
                  <span class="badge badge-{backup.type}">
                    {backup.type}
                  </span>
                </td>
                <td>{formatSize(backup.size)}</td>
                <td>
                  <div class="actions">
                    <button
                      class="btn-small"
                      on:click={() => previewBackup(backup)}
                      disabled={previewingId === backup.id || restoringId === backup.id || downloadingId === backup.id || deletingId === backup.id}
                    >
                      {previewingId === backup.id ? 'Loading...' : 'Preview'}
                    </button>
                    <button
                      class="btn-small btn-restore"
                      on:click={() => restoreBackup(backup)}
                      disabled={previewingId === backup.id || restoringId === backup.id || downloadingId === backup.id || deletingId === backup.id}
                    >
                      {restoringId === backup.id ? 'Restoring...' : 'Restore'}
                    </button>
                    <button
                      class="btn-small"
                      on:click={() => downloadBackup(backup)}
                      disabled={previewingId === backup.id || restoringId === backup.id || downloadingId === backup.id || deletingId === backup.id}
                    >
                      {downloadingId === backup.id ? 'Downloading...' : 'Download'}
                    </button>
                    <button
                      class="btn-small btn-danger"
                      on:click={() => deleteBackup(backup)}
                      disabled={previewingId === backup.id || restoringId === backup.id || downloadingId === backup.id || deletingId === backup.id}
                    >
                      {deletingId === backup.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
  {/if}
</div>

<style>
  .auto-backup-ui {
    padding: 16px;
  }

  .loading {
    text-align: center;
    padding: 40px;
    color: var(--color-solid);
    opacity: 0.6;
  }

  .status-card {
    margin-bottom: 24px;
    padding: 20px;
    background: var(--color-solid);
    border-radius: 12px;
    opacity: 0.1;
  }

  .status-card h3 {
    margin: 0 0 16px 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--color-solid);
  }

  .status-info {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
  }

  .stat {
    text-align: center;
  }

  .stat .label {
    font-size: 12px;
    color: var(--color-solid);
    opacity: 0.6;
    margin-bottom: 8px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .stat .value {
    font-size: 24px;
    font-weight: 600;
    color: var(--color-solid);
  }

  .backup-list {
    background: var(--color-solid);
    border-radius: 12px;
    overflow: hidden;
    opacity: 0.1;
  }

  .empty-state {
    text-align: center;
    padding: 60px 20px;
  }

  .empty-state p {
    margin: 0;
    color: var(--color-solid);
  }

  .empty-state .subtitle {
    margin-top: 8px;
    font-size: 14px;
    opacity: 0.6;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  thead {
    background: var(--color-solid);
    opacity: 0.05;
  }

  th {
    padding: 12px 16px;
    text-align: left;
    font-size: 12px;
    font-weight: 600;
    color: var(--color-solid);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    opacity: 0.6;
  }

  td {
    padding: 16px;
    border-top: 1px solid var(--color-solid);
    opacity: 0.1;
  }

  .date-cell .primary {
    font-weight: 500;
    color: var(--color-solid);
    margin-bottom: 4px;
  }

  .date-cell .secondary {
    font-size: 12px;
    color: var(--color-solid);
    opacity: 0.6;
  }

  .badge {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 500;
    text-transform: capitalize;
  }

  .badge-automatic {
    background: var(--color-primary);
    opacity: 0.2;
    color: var(--color-primary);
  }

  .badge-manual {
    background: var(--color-solid);
    opacity: 0.1;
    color: var(--color-solid);
  }

  .actions {
    display: flex;
    gap: 8px;
  }

  button {
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-small {
    background: var(--color-primary);
    opacity: 0.2;
    color: var(--color-primary);
  }

  .btn-small:hover {
    opacity: 0.3;
  }

  .btn-restore {
    background: var(--color-solid);
    opacity: 0.15;
    color: var(--color-solid);
  }

  .btn-restore:hover {
    opacity: 0.25;
  }

  .btn-danger {
    background: transparent;
    color: var(--color-solid);
    opacity: 0.4;
  }

  .btn-danger:hover {
    opacity: 0.6;
    background: var(--color-solid);
    opacity: 0.1;
  }

  .settings-section {
    margin-bottom: 24px;
    padding: 20px;
    background: var(--color-solid);
    border-radius: 12px;
    opacity: 0.1;
  }

  .settings-section h4 {
    margin: 0 0 20px 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--color-solid);
  }

  .setting-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 0;
    border-top: 1px solid var(--color-solid);
    opacity: 0.1;
  }

  .setting-row:first-of-type {
    border-top: none;
    padding-top: 0;
  }

  .setting-label {
    flex: 1;
  }

  .setting-label strong {
    display: block;
    font-size: 14px;
    font-weight: 500;
    color: var(--color-solid);
    margin-bottom: 4px;
  }

  .setting-label .description {
    margin: 0;
    font-size: 12px;
    color: var(--color-solid);
    opacity: 0.6;
  }
</style>
