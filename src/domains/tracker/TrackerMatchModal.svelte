<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import PanelModal from '../../components/modal/PanelModal.svelte'
  import Button from '../../components/button/button.svelte'
  import type TrackerClass from '../../modules/tracker/TrackerClass'
  import type { MatchResult } from './TrackerMatcher'

  export let visible: boolean = false
  export let inputName: string = ''
  export let matches: MatchResult[] = []

  const dispatch = createEventDispatcher()

  function handleUseExisting(tracker: TrackerClass) {
    dispatch('useExisting', { tracker })
    visible = false
  }

  function handleCreateNew() {
    dispatch('createNew')
    visible = false
  }

  function getConfidenceLabel(confidence: number): string {
    if (confidence >= 0.8) return 'Recommended'
    return 'Suggested'
  }

  function getConfidenceColor(confidence: number): string {
    if (confidence >= 0.8) return 'text-green-600 dark:text-green-400'
    return 'text-yellow-600 dark:text-yellow-400'
  }
</script>

<PanelModal
  id="tracker-match-modal"
  bind:visible
  title="Similar Tracker Found"
  on:close={handleCreateNew}
>
  <div class="p-4 space-y-4">
    <div class="text-sm text-gray-600 dark:text-gray-400">
      Creating: <span class="font-semibold">#{inputName}</span>
    </div>

    <div class="space-y-2">
      {#each matches as match}
        <button
          class="w-full p-4 border rounded-lg text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          on:click={() => handleUseExisting(match.tracker)}
        >
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <div class="font-semibold text-base">
                #{match.tracker.tag}
              </div>
              <div class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {match.reason.description}
              </div>
            </div>
            <div class={`text-xs font-medium ${getConfidenceColor(match.confidence)}`}>
              {getConfidenceLabel(match.confidence)}
            </div>
          </div>
        </button>
      {/each}
    </div>

    <div class="pt-4 border-t dark:border-gray-700">
      <Button
        className="w-full"
        color="secondary"
        on:click={handleCreateNew}
      >
        Create New Tracker
      </Button>
    </div>
  </div>
</PanelModal>
