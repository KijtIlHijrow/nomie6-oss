<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import { initials } from '../../utils/text/text'
  import { strToColor } from '../dymoji/dymoji'
  import emojiCount from '../../modules/emoji-count/emoji-count'

  // export let size: "xs" | "sm" | "md" | "lg" | "xl" = "md";
  export let size: number = 32
  export let label: string = undefined
  export let src: string = undefined
  export let emoji: string = undefined
  export let transparent: boolean = false
  export let style: string = ''
  export let color: string | undefined = undefined
  export let circle: boolean = false
  export let className: string = ''

  const dispatch = createEventDispatcher()

  let styles: Array<string> = []
  let classList: Array<string> = []
  $: {
    classList = [className]
    styles.push(`--avatar-size:${size}px`)
    styles.push(`height:${size}px; min-width:${size}px; width:${size}px`)
    // if (!emoji) {
    //   styles.push(``)
    // }
    // If it's a source
    if (src && src.length) {
      classList.push('src')
      styles.push(`background-image:url(${src})`)
      // Set background color based on parent context - will be overridden by CSS if needed
      // Default to transparent, CSS will set it to match button background

      /// If it's an emoji
    } else if (emoji && emoji.length) {
      classList.push('emoji')

      // styles.push(`background-color:${color}`);
      if (color) {
        styles.push(`color:${color}`)
      }

      // If a Label is provided
    } else if (label && label.length) {
      classList.push('label')
      const thisColor = color || strToColor(label)
      styles.push(`background-color:${thisColor}; text-shadow:0px 2px 2px rgba(0,0,0,0.2); color:#FFF !important`)
      styles.push(`font-size: ${size * 0.5}px`)
    }

    // If Transparent
    if (transparent) {
      classList.push('transparent')
    }

    // If is Circle
    if (circle) {
      classList.push('circle')
    } else {
      classList.push('rounded')
    }
    // Merge with props styl
  }

  function click() {
    dispatch('click')
  }
</script>

{#if src && src.length}
  <img
    src={src}
    alt={label || ''}
    class="n-avatar-img"
    style={`--avatar-size:${size}px; width: calc(var(--avatar-size) * 1.3); height: calc(var(--avatar-size) * 1.3); max-width: calc(var(--avatar-size) * 1.3); max-height: calc(var(--avatar-size) * 1.3); object-fit: contain; object-position: center; background: transparent !important; background-color: transparent !important; border-radius: 0 !important; display: block; ${style}`}
    on:click|preventDefault={click}
    loading="lazy"
  />
{:else}
  <div
    class="n-avatar {emoji ? `emolen-${emojiCount(emoji)}` : 'no-emoji'}
    {size}
    {classList.join(' ')}"
    style={`${styles.join('; ')}; ${style}`}
    on:click|preventDefault={click}
  >
    {#if emoji}{emoji}{:else if label && !src}{initials(label)}{/if}
  </div>
{/if}

<style lang="postcss" global>
  .n-avatar {
    /* box-shadow: var(--box-shadow-tight); */
    display: inline-flex;
    flex-grow: 0;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    background-size: cover;
    background-position: center;
    background-color: transparent;
    overflow: hidden;
    letter-spacing: normal;
    border-radius: 0.75rem;
    @apply text-gray-900 dark:text-gray-100;
  }
  
  /* Remove default border-radius for images */
  .n-avatar-img {
    border-radius: 0 !important;
  }

  .n-avatar.rounded {
    width: var(--avatar-size);
    height: var(--avatar-size);
    border-radius: calc(var(--avatar-size) * 0.33 + 1px);
  }
  
  /* Remove rounded corners and any background for images */
  .n-avatar.rounded.src,
  .n-avatar-img.rounded,
  .n-avatar-img {
    border-radius: 0 !important;
    background: transparent !important;
    background-color: transparent !important;
  }
  
  .n-avatar.rounded.src {
    border-radius: 0 !important;
  }

  .n-avatar.circle {
    border-radius: 50% !important;
    width: var(--avatar-size);
    height: var(--avatar-size);
  }
  .n-avatar.label {
    color: #fff;
    text-shadow: 0px 2px 3px rgba(0, 0, 0, 0.1);
    font-size: calc(var(--avatar-size) * 0.55);
    font-weight: bold;
  }
  .n-avatar.emoji {
    font-size: calc(var(--avatar-size) * 1);
    box-shadow: none;
    white-space: nowrap;
    overflow: visible;
  }
  .n-avatar.src {
    color: transparent !important;
    background-size: 130% !important;
    background-color: transparent !important;
    background-image: none !important;
    box-shadow: none !important;
    overflow: visible !important;
    border: none !important;
    outline: none !important;
  }
  
  .n-avatar-img {
    display: block;
    background: transparent !important;
    background-color: transparent !important;
    border: none !important;
    outline: none !important;
    box-shadow: none !important;
    border-radius: 0 !important;
    mix-blend-mode: normal;
    padding: 0 !important;
    margin: 0 !important;
    /* Force browser to respect transparency */
    image-rendering: auto;
    -webkit-background-clip: padding-box;
    background-clip: padding-box;
  }
  
  /* Ensure no white background shows through on any browser */
  .n-avatar-img::before,
  .n-avatar-img::after {
    display: none !important;
    background: transparent !important;
  }
  
  /* For shortcut buttons, ensure no background and proper blending */
  .shortcut-button .n-avatar-img,
  .shortcut-button .emoji-holder .n-avatar-img,
  .shortcut-button .emoji-holder img {
    background: transparent !important;
    background-color: transparent !important;
    mix-blend-mode: normal;
  }
  
  /* Remove any potential white from rounded container */
  .shortcut-button .emoji-holder {
    background: transparent !important;
    background-color: transparent !important;
    padding: 0 !important;
  }
  
  /* Ensure no white background on any wrapper */
  .shortcut-button .emoji-holder * {
    background-color: transparent !important;
  }
  .n-avatar.emolen-0 {
    letter-spacing: -0.05em;
    font-size: calc(var(--avatar-size) * 0.75);
    font-weight: 500;
  }
  .n-avatar.emolen-2 {
    letter-spacing: -0.5em;
    text-indent: -0.5em;
    font-size: calc(var(--avatar-size) * 0.86);
  }
  .n-avatar.emolen-3 {
    letter-spacing: -0.51em;
    text-indent: -0.42em;
    font-size: calc(var(--avatar-size) * 0.6);
  }
</style>
