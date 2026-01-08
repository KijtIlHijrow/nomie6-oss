<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount } from 'svelte'

  import nid from '../../modules/nid/nid'
  import Button from '../button/button.svelte'
  import CameraSolid from '../../n-icons/CameraSolid.svelte'
  import IonIcon from '../icon/ion-icon.svelte'

  const id = `image-${nid()}`

  const dispatch = createEventDispatcher()

  let canvas: HTMLCanvasElement
  let input: HTMLInputElement

  export let className = ''
  export let label: string = 'Select'
  export let maxW = 64*4
  export let maxH = 64*4

  let output: string

  const select = () => {
    input.click()
  }

  function handleFiles(e) {
    const file = e.target.files[0]
    if (!file) return
    
    const reader = new FileReader()
    reader.onload = function(e) {
      const img = new Image()
      img.onload = function() {
        const iw = img.width
        const ih = img.height
        
        // Check if resize is needed
        const needsResize = iw > maxW || ih > maxH
        const scale = needsResize ? Math.min(maxW / iw, maxH / ih) : 1
        const iwScaled = Math.floor(iw * scale)
        const ihScaled = Math.floor(ih * scale)
        
        // If no resize needed and it's already PNG, use original to preserve transparency
        if (!needsResize && file.type === 'image/png') {
          output = e.target.result
          console.log('Using original PNG directly, preserving transparency')
          dispatch('image', output)
          return
        }
        
        // Process through canvas - MUST set dimensions FIRST to get transparent canvas
        canvas.width = iwScaled
        canvas.height = ihScaled
        
        // Get context AFTER setting dimensions - this ensures transparent background
        const ctx = canvas.getContext('2d', { alpha: true })
        
        // Verify canvas is transparent by checking a pixel
        const testData = ctx.getImageData(0, 0, 1, 1)
        console.log('Canvas transparency check - alpha:', testData.data[3], '(255=opaque, 0=transparent)')
        
        // Clear entire canvas to ensure transparency
        ctx.clearRect(0, 0, iwScaled, ihScaled)
        
        // Set composite operation to preserve source alpha
        ctx.globalCompositeOperation = 'source-over'
        ctx.globalAlpha = 1.0
        
        // Draw image - this should preserve all transparency
        ctx.drawImage(img, 0, 0, iwScaled, ihScaled)
        
        // Verify transparency was preserved after drawing
        const cornerData = ctx.getImageData(0, 0, 1, 1)
        const centerData = ctx.getImageData(Math.floor(iwScaled/2), Math.floor(ihScaled/2), 1, 1)
        console.log('After draw - corner alpha:', cornerData.data[3], 'center alpha:', centerData.data[3])
        
        // Export as PNG - ONLY format that reliably preserves transparency
        output = canvas.toDataURL('image/png')
        console.log('Image processed through canvas, transparency preserved. Length:', output.length)
        dispatch('image', output)
      }
      img.onerror = function(err) {
        console.error('Error loading image:', err)
      }
      img.src = e.target.result
    }
    reader.onerror = function(err) {
      console.error('Error reading file:', err)
    }
    reader.readAsDataURL(file)
  }
  let mounted = false
  onMount(() => {
    mounted = true
  })

  onDestroy(() => {
    mounted = false
  })
</script>

{#if mounted}
  <Button {className} clear primary on:click={select}>
    <IonIcon className="mr-2" icon={CameraSolid} />
    {label}
  </Button>

  <div class="w-0 h-0 stiff opacity-0 pointer-events-none">
    <input class="w-0 h-0 overflow-hidden" bind:this={input} type="file" id="input" on:input={handleFiles} />
    <canvas class="opacity-0 pointer-events-none" bind:this={canvas} {id} width="64" height="64" />
  </div>
{/if}
