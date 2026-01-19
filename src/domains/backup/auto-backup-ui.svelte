<script lang="ts">
  import { onMount } from 'svelte';
  import AutoBackupService from './auto-backup-service';
  import type { AutoBackup } from './auto-backup-service';
  import dayjs from 'dayjs';
  import relativeTime from 'dayjs/plugin/relativeTime';
  import { Interact } from '../../store/interact';

  dayjs.extend(relativeTime);

  let backups: AutoBackup[] = [];
  let storageUsage = 0;
  let loading = true;

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
    try {
      const blob = new Blob([backup.data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nomie-backup-${backup.id}.json`;
      a.click();
      URL.revokeObjectURL(url);
      Interact.toast('Backup downloaded');
    } catch (error) {
      console.error('Failed to download backup:', error);
      Interact.error('Failed to download backup');
    }
  }

  async function deleteBackup(backup: AutoBackup) {
    const confirmed = await Interact.confirm(
      'Delete this backup?',
      'This action cannot be undone.'
    );
    if (confirmed) {
      try {
        await AutoBackupService.deleteBackup(backup.id);
        await loadBackups();
        Interact.toast('Backup deleted');
      } catch (error) {
        console.error('Failed to delete backup:', error);
        Interact.error('Failed to delete backup');
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
    <div class="status-card">
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
                    <button class="btn-download" on:click={() => downloadBackup(backup)}>
                      Download
                    </button>
                    <button class="btn-delete" on:click={() => deleteBackup(backup)}>
                      Delete
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
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin-bottom: 24px;
    padding: 20px;
    background: var(--color-solid);
    border-radius: 12px;
    opacity: 0.1;
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

  .btn-download {
    background: var(--color-primary);
    opacity: 0.2;
    color: var(--color-primary);
  }

  .btn-download:hover {
    opacity: 0.3;
  }

  .btn-delete {
    background: transparent;
    color: var(--color-solid);
    opacity: 0.4;
  }

  .btn-delete:hover {
    opacity: 0.6;
    background: var(--color-solid);
    opacity: 0.1;
  }
</style>
