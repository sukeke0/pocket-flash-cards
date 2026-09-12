<script lang="ts">
  import { onDestroy } from 'svelte';
  export let blob: Blob | null;
  export let alt = '';
  export let compact = false;
  let source = '';
  let failed = false;
  let reader: FileReader | null = null;
  function update(value: Blob | null) {
    reader?.abort();
    reader = null; source = ''; failed = false;
    if (!value) return;
    // Keep the displayed bytes independent of IndexedDB-backed Blob URLs. Safari
    // can invalidate those URLs when the same card is written after a review.
    const pending = new FileReader();
    reader = pending;
    pending.onload = () => {
      if (reader !== pending) return;
      if (typeof pending.result === 'string') source = pending.result;
      else failed = true;
    };
    pending.onerror = () => { if (reader === pending) failed = true; };
    pending.readAsDataURL(value);
  }
  $: update(blob);
  onDestroy(() => { const pending = reader; reader = null; pending?.abort(); });
</script>
{#if failed}<span class="muted small" role="status">画像を読み込めませんでした。</span>
{:else if source}<img src={source} {alt} class:compact onerror={() => failed = true} />{/if}
<style>
  img { display: block; max-width: 100%; max-height: 280px; object-fit: contain; border-radius: 14px; margin: 12px auto; }
  img.compact { width: 52px; height: 52px; margin: 0; object-fit: cover; border-radius: 10px; flex-shrink: 0; }
</style>
