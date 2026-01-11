<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { HealthKitBridge } from './healthkit-bridge';
  import { HealthKitAutoMapper } from './auto-mapper';
  import { Interact } from '../../store/interact';
  import { showToast } from '../../components/toast/ToastStore';

  export let trackers: any[] = [];

  const dispatch = createEventDispatcher();

  let bridge = new HealthKitBridge();
  let autoMapper = new HealthKitAutoMapper();
  let isAvailable = false;
  let permissionsGranted = false;
  let syncing = false;
  let autoMapping = false;

  onMount(async () => {
    const result = await bridge.isAvailable();
    isAvailable = result.available;
  });

  async function requestPermissions() {
    try {
      syncing = true;
      const result = await bridge.requestPermissions();
      permissionsGranted = result.granted;

      if (result.granted) {
        showToast({ message: 'HealthKit permissions granted' });
      } else {
        Interact.alert('HealthKit Permissions', 'Please enable permissions in Settings → Privacy → Health');
      }
    } catch (error) {
      const errorMsg = error?.message || String(error) || 'Unknown error';
      Interact.alert('Error', `Failed to request permissions: ${errorMsg}`);
    } finally {
      syncing = false;
    }
  }

  async function autoMapAllTrackers() {
    try {
      autoMapping = true;
      const mapped = autoMapper.autoMapTrackers(trackers);
      const mappedCount = mapped.filter(t => t.healthKit).length;

      const confirmed = await Interact.confirm(
        'Auto-Map Trackers',
        `Found ${mappedCount} trackers that can sync with HealthKit. Apply mappings?`
      );

      if (confirmed) {
        trackers = mapped; // Local update for immediate UI
        dispatch('trackersUpdated', mapped); // Notify parent
        showToast({ message: `Mapped ${mappedCount} trackers to HealthKit` });
      }
    } finally {
      autoMapping = false;
    }
  }

  $: syncedTrackers = trackers.filter(t => t.healthKit?.enabled);
</script>

{#if !isAvailable}
  <div class="p-4 bg-gray-100 rounded-lg">
    <p class="text-sm text-gray-600">HealthKit is not available on this platform</p>
  </div>
{:else}
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <h3 class="font-bold">Apple Health Integration</h3>
        <p class="text-sm text-gray-600">
          {#if permissionsGranted}
            <span class="text-green-600">● Connected</span>
          {:else}
            <span class="text-gray-400">○ Not connected</span>
          {/if}
        </p>
      </div>

      {#if !permissionsGranted}
        <button
          class="btn btn-primary"
          on:click={requestPermissions}
          disabled={syncing}
        >
          {syncing ? 'Requesting...' : 'Connect'}
        </button>
      {/if}
    </div>

    {#if permissionsGranted}
      <button
        class="btn btn-secondary w-full"
        on:click={autoMapAllTrackers}
        disabled={autoMapping}
      >
        {autoMapping ? 'Mapping...' : 'Auto-Map Trackers'}
      </button>

      <div>
        <h4 class="font-semibold mb-2">Synced Trackers</h4>
        {#if syncedTrackers.length === 0}
          <p class="text-sm text-gray-500">No trackers synced yet</p>
        {:else}
          <ul class="space-y-1">
            {#each syncedTrackers as tracker}
              <li class="text-sm">
                • {tracker.label} → {tracker.healthKit.type}
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
  </div>
{/if}
