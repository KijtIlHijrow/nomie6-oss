<script lang="ts">
  import Layout from '../domains/layout/layout.svelte'
  import AIQueryView from '../domains/ai-query/ai-query-view.svelte'
</script>

<Layout showCapture={false} pageTitle="AI Query">
  <div class="h-full min-h-0 flex flex-col">
    <AIQueryView />
  </div>
</Layout>

