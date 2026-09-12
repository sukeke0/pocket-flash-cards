<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  export let title: string;
  export let onclose: () => void;
  export let busy = false;
  export let expanded = false;
  let dialog: HTMLDialogElement;
  onMount(() => {
    const previous = document.activeElement;
    dialog.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
      if (previous instanceof HTMLElement) previous.focus();
    };
  });
</script>
<dialog bind:this={dialog} class:expanded oncancel={(event) => { event.preventDefault(); if (!busy) onclose(); }} aria-label={title}>
  <div class="modal-head"><h2>{title}</h2><button class="icon-button" aria-label="閉じる" disabled={busy} onclick={onclose}><Icon name="close" /></button></div>
  <slot />
</dialog>
