<script lang="ts">
  import type { Tag } from '../lib/models';
  export let tags: Tag[];
  export let selected: string[] = [];
  export let label = 'タグ';
</script>
<fieldset class="tag-picker"><legend>{label}</legend><div class="chips">
  {#each tags as tag (tag.id)}
    <button type="button" class="chip" class:selected={selected.includes(tag.id)} aria-pressed={selected.includes(tag.id)} onclick={() => selected = selected.includes(tag.id) ? selected.filter(id => id !== tag.id) : [...selected, tag.id]}>{tag.name}</button>
  {/each}
  {#if !tags.length}<span class="muted small">タグを作ってカードを整理できます。</span>{/if}
</div></fieldset>
