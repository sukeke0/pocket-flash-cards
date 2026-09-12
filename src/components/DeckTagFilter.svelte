<script lang="ts">
  import type { Tag } from '../lib/models';
  import TagPicker from './TagPicker.svelte';
  export let tags: Tag[];
  export let included: string[] = [];
  export let excluded: string[] = [];
  export let match: 'all' | 'any' = 'all';
  let query = '';
  $: visibleTags = tags.filter(tag => included.includes(tag.id) || excluded.includes(tag.id)
    || tag.name.normalize('NFKC').toLocaleLowerCase().includes(query.normalize('NFKC').trim().toLocaleLowerCase()));
</script>

<div class="stack">
  {#if tags.length > 10}<input type="search" aria-label="絞り込み用のタグを検索" placeholder="タグを検索" bind:value={query} />{/if}
  <TagPicker tags={visibleTags} bind:selected={included} label="含めるタグ" />
  <label>含めるタグの条件
    <select bind:value={match}>
      <option value="all">すべてを含む（AND）</option>
      <option value="any">いずれかを含む（OR）</option>
    </select>
  </label>
  <TagPicker tags={visibleTags} bind:selected={excluded} label="除外するタグ" />
  <p class="muted small">除外タグを1つでも含むカードは候補から外します。</p>
  {#if included.some(id => excluded.includes(id))}<p class="muted small" role="status">同じタグが両方で選択されています。除外が優先されます。</p>{/if}
</div>
