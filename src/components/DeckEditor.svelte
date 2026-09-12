<script lang="ts">
  import type { Card, Deck, Tag } from '../lib/models';
  import { cardsInDeck, filterDeckCards, selectedDeckCardIds, toggleDeckCardSelection, type DeckCardSelection } from '../lib/decks';
  import { repository } from '../lib/db/repository';
  import Modal from './Modal.svelte';
  import DeckTagFilter from './DeckTagFilter.svelte';
  import BlobImage from './BlobImage.svelte';
  import Icon from './Icon.svelte';
  export let deck: Deck | undefined = undefined;
  export let cards: Card[];
  export let tags: Tag[];
  export let onclose: () => void;
  export let onsaved: () => void;
  let name = deck?.name ?? '';
  let selection: DeckCardSelection = { manualIds: deck ? cardsInDeck(cards, deck).map(card => card.id) : [], omittedIds: [] };
  let mode: 'tags' | 'cards' = tags.length ? 'tags' : 'cards';
  let filterTags: string[] = [];
  let excludedTags: string[] = [];
  let match: 'all' | 'any' = 'all';
  let listTags: string[] = [];
  let listExcludedTags: string[] = [];
  let listMatch: 'all' | 'any' = 'all';
  let query = '';
  let selectedOnly = false;
  let limit = 50;
  let busy = false;
  let error = '';
  let deleting = false;
  $: tagNames = new Map(tags.map(tag => [tag.id, tag.name]));
  $: tagFilterCount = filterTags.length + excludedTags.length;
  $: bulkCards = tagFilterCount ? filterDeckCards(cards, tags, '', filterTags, match, excludedTags) : [];
  $: matchingIds = bulkCards.map(card => card.id);
  $: cardIds = selectedDeckCardIds(selection, matchingIds);
  $: selectedIds = new Set(cardIds);
  $: bulkSelectedCount = bulkCards.filter(card => selectedIds.has(card.id)).length;
  $: listTagCount = listTags.length + listExcludedTags.length;
  $: found = filterDeckCards(cards, tags, query, listTags, listMatch, listExcludedTags);
  $: filtered = selectedOnly ? found.filter(card => selectedIds.has(card.id)) : found;
  // Retain selection across result pages and reset pagination when filters change.
  $: { query; listTags; listExcludedTags; listMatch; selectedOnly; limit = 50; }
  function clearTags() { filterTags = []; excludedTags = []; match = 'all'; }
  function clearListFilters() { query = ''; listTags = []; listExcludedTags = []; listMatch = 'all'; }
  function toggle(id: string) {
    selection = toggleDeckCardSelection(selection, matchingIds, id);
  }
  function chooseIndividually() {
    mode = 'cards'; selectedOnly = false;
    listTags = [...filterTags]; listExcludedTags = [...excludedTags]; listMatch = match;
  }
  function showSelected() { mode = 'cards'; selectedOnly = true; clearListFilters(); }
  async function save(event: SubmitEvent) {
    event.preventDefault(); if (busy) return;
    busy = true; error = '';
    const now = Date.now();
    const value: Deck = { id: deck?.id ?? crypto.randomUUID(), name, createdAt: deck?.createdAt ?? now,
      updatedAt: now, lastUsedAt: deck?.lastUsedAt ?? null, type: 'fixed', cardIds };
    try { await repository.saveDeck(value); onsaved(); }
    catch (e) { error = e instanceof Error ? e.message : '保存できませんでした。'; }
    finally { busy = false; }
  }
  async function remove() {
    if (!deck || busy) return;
    busy = true;
    try { await repository.deleteDeck(deck.id); onsaved(); }
    catch { error = '削除できませんでした。'; }
    finally { busy = false; }
  }
</script>

<Modal title={deck ? 'デッキを編集' : 'デッキを作成'} {onclose} {busy} expanded>
  <form onsubmit={save} class="deck-editor">
    <div class="deck-editor-body">
      <fieldset disabled={busy} class="form-fields stack">
        <label>デッキ名<input bind:value={name} required placeholder="例：英検準1級の苦手単語" /></label>
        <div class="deck-selection-summary">
          <div><strong>選択済み {cardIds.length}枚</strong><p>追加方法は自由に組み合わせられます。</p></div>
          <button class="text-button" type="button" onclick={showSelected}>内容を確認<Icon name="chevron" size={15} /></button>
        </div>
        <div class="segmented deck-methods" aria-label="カードの追加方法">
          <button type="button" class:chosen={mode === 'tags'} aria-pressed={mode === 'tags'} onclick={() => mode = 'tags'}>タグでまとめて選ぶ</button>
          <button type="button" class:chosen={mode === 'cards'} aria-pressed={mode === 'cards'} onclick={chooseIndividually}>1枚ずつ選ぶ</button>
        </div>
        {#if mode === 'tags'}
          <div class="stack deck-bulk">
            <p class="muted small">タグ条件に合うカードが自動で選択されます。</p>
            {#if tags.length}<DeckTagFilter {tags} bind:included={filterTags} bind:excluded={excludedTags} bind:match />{/if}
            {#if !tags.length}<p class="muted small">カードにタグを付けると、まとめて追加できます。「1枚ずつ選ぶ」からも追加できます。</p>{/if}
            {#if tagFilterCount}
              <div class="bulk-preview">
                <div class="row between"><strong>該当 {bulkCards.length}枚</strong><button class="text-button" type="button" onclick={clearTags}>タグ選択を解除</button></div>
                <p class="muted small">{bulkSelectedCount}枚を選択中{bulkSelectedCount < bulkCards.length ? `（${bulkCards.length - bulkSelectedCount}枚は個別に解除）` : ''}</p>
                {#if bulkCards.length}<ul>{#each bulkCards.slice(0, 3) as card}<li>{card.frontText || '画像カード'}<span>{card.backText || '画像の答え'}</span></li>{/each}</ul>{#if bulkCards.length > 3}<p class="muted small">ほか {bulkCards.length - 3}枚</p>{/if}{:else}<p class="muted small">タグの選び方を変えてみてください。</p>{/if}
              </div>
            {/if}
            <p class="muted small">条件を変えると自動選択も更新されます。個別に選んだカード{deck ? 'と保存済みのカード' : ''}は残ります。「デッキを保存」で確定します。</p>
          </div>
        {:else}
          <div class="stack deck-pick">
            <label class="search-box"><Icon name="search" size={18} /><input type="search" aria-label="デッキに追加するカードを検索" bind:value={query} placeholder="表面・裏面・メモ・タグを検索" /></label>
            {#if tags.length}<details class="deck-tag-filter" open={listTagCount > 0}><summary>タグで絞り込む{listTagCount ? `（${listTagCount}個）` : ''}</summary><DeckTagFilter {tags} bind:included={listTags} bind:excluded={listExcludedTags} bind:match={listMatch} /></details>{/if}
            <div class="row between"><label class="check-row"><input type="checkbox" bind:checked={selectedOnly} />選択済みだけ表示</label><span class="count-badge">{filtered.length}枚</span></div>
            {#if query || listTagCount}<button class="text-button" type="button" onclick={clearListFilters}>検索・タグ絞り込みを解除</button>{/if}
            <div class="deck-card-options" aria-label="デッキのカード選択">
              {#each filtered.slice(0, limit) as card (card.id)}
                <label class="deck-card-option" class:is-selected={selectedIds.has(card.id)}>
                  <input type="checkbox" checked={selectedIds.has(card.id)} onchange={() => toggle(card.id)} aria-label={`${card.frontText || '画像カード'}をデッキに含める`} />
                  {#if card.frontImage || card.backImage}<BlobImage blob={card.frontImage || card.backImage} compact />{/if}
                  <span class="grow card-summary"><strong>{card.frontText || '画像カード'}</strong><span class="answer-preview">{card.backText || '画像の答え'}</span><span class="chips">{#each card.tags as tag}<span class="chip static tiny">{tagNames.get(tag)}</span>{/each}</span></span>
                </label>
              {/each}
            </div>
            {#if !filtered.length}<p class="empty muted small">{!cards.length ? '先にカード管理からカードを追加してください。' : selectedOnly ? '選択済みのカードがありません。絞り込みを解除するか、カードを選んでください。' : '見つかりませんでした。キーワードやタグを変えてみてください。'}</p>{/if}
            {#if filtered.length > limit}<button class="secondary full" type="button" onclick={() => limit += 50}>次の50枚を表示（{limit} / {filtered.length}枚）</button>{/if}
            <p class="muted small">チェックを外すとデッキから外れます。カード自体は残ります。</p>
          </div>
        {/if}
        {#if deck}
          {#if deleting}<div class="notice"><p>デッキを削除します。カードは残ります。</p><div class="row"><button type="button" class="danger" onclick={remove}>削除する</button><button type="button" class="secondary" onclick={() => deleting = false}>キャンセル</button></div></div>
          {:else}<button class="text-button danger-text" type="button" onclick={() => deleting = true}>デッキを削除</button>{/if}
        {/if}
      </fieldset>
    </div>
    <div class="deck-editor-footer">
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <span class="small muted" aria-live="polite">選択済み {cardIds.length}枚</span>
      <button class="primary full" type="submit" disabled={busy}>{busy ? '保存中…' : 'デッキを保存'}</button>
    </div>
  </form>
</Modal>
