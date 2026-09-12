<script lang="ts">
  import type { Card, Deck, Tag } from '../lib/models';
  import { cardsWithoutDeck } from '../lib/decks';
  import Icon from '../components/Icon.svelte';
  import BlobImage from '../components/BlobImage.svelte';
  import TextImport from '../components/TextImport.svelte';
  import SelectionActions from '../components/SelectionActions.svelte';
  import DeleteConfirmation from '../components/DeleteConfirmation.svelte';
  import { repository } from '../lib/db/repository';
  export let cards: Card[];
  export let decks: Deck[];
  export let unassignedOnly = false;
  export let onfilterchange: (unassignedOnly: boolean) => void;
  export let tags: Tag[];
  export let onadd: () => void;
  export let onedit: (card: Card) => void;
  export let onview: (cards: Card[], title: string, initialIndex: number) => void;
  let search = '';
  let importing = false;
  let importStatus = '';
  let selected: string[] = [];
  let sort: 'updated' | 'front' | 'mastery' = 'updated';
  let selecting = false;
  let chosenIds: string[] = [];
  let pendingDelete: { id: string; label: string }[] | null = null;
  let deleteStatus = '';
  $: chosen = new Set(chosenIds);
  $: picked = cards.filter(card => chosen.has(card.id));
  $: visiblePicked = visible.filter(card => chosen.has(card.id)).length;
  function toggleSelection(id: string) { chosenIds = chosen.has(id) ? chosenIds.filter(value => value !== id) : [...chosenIds, id]; }
  function toggleVisible() {
    const visibleIds = new Set(visible.map(card => card.id));
    chosenIds = visiblePicked === visible.length ? chosenIds.filter(id => !visibleIds.has(id)) : [...new Set([...chosenIds, ...visibleIds])];
  }
  function finishSelection() { selecting = false; chosenIds = []; }
  $: needle = search.toLocaleLowerCase().trim();
  $: candidates = unassignedOnly ? cardsWithoutDeck(cards, decks) : cards;
  $: visible = candidates.filter(card => [card.frontText, card.backText, card.notes, ...card.tags.map(id => tags.find(t => t.id === id)?.name ?? '')].join(' ').toLocaleLowerCase().includes(needle) && selected.every(id => card.tags.includes(id)))
    .sort((a, b) => sort === 'front' ? a.frontText.localeCompare(b.frontText, 'ja') : sort === 'mastery' ? a.masteryLevel - b.masteryLevel : b.updatedAt - a.updatedAt);
</script>
<header class="page-header"><h1>カード管理</h1>{#if cards.length || selecting}<button class="text-button" aria-label={selecting ? 'カードの選択を終了' : 'カードを選択'} onclick={() => { if (selecting) finishSelection(); else { selecting = true; deleteStatus = ''; importStatus = ''; } }}>{selecting ? '完了' : '選択'}</button>{/if}</header>
{#if !selecting}<button class="secondary full import-entry" onclick={() => { importing = true; importStatus = ''; }}><Icon name="upload" size={18} />CSV／TSVを貼り付けて追加</button>{/if}
{#if importStatus}<p class="success" role="status">{importStatus}</p>{/if}
{#if deleteStatus}<p class="success" role="status">{deleteStatus}</p>{/if}
<div class="segmented card-scope-filter" aria-label="デッキの登録状況"><button class:chosen={!unassignedOnly} aria-pressed={!unassignedOnly} onclick={() => onfilterchange(false)}>すべてのカード</button><button class:chosen={unassignedOnly} aria-pressed={unassignedOnly} onclick={() => onfilterchange(true)}>デッキ未登録</button></div>
<label class="search-box"><Icon name="search" size={19} /><input type="search" aria-label="カードを検索" bind:value={search} placeholder="カードを検索（表面・裏面・タグ）" /></label>
<div class="filter-chips" aria-label="タグで絞り込み（すべて一致）"><button class="chip" class:selected={!selected.length} aria-pressed={!selected.length} onclick={() => selected = []}>すべて</button>{#each tags as tag}<button class="chip" class:selected={selected.includes(tag.id)} aria-pressed={selected.includes(tag.id)} onclick={() => selected = selected.includes(tag.id) ? selected.filter(id => id !== tag.id) : [...selected, tag.id]}>{tag.name}</button>{/each}</div>
<div class="collection-toolbar"><p>全 {visible.length} 枚</p><label class="sort-control"><Icon name="sort" size={14} /><select aria-label="カードの並び順" bind:value={sort}><option value="updated">更新が新しい順</option><option value="front">表面の名前順</option><option value="mastery">習熟度が低い順</option></select></label></div>
{#if selecting}<SelectionActions count={picked.length} visibleCount={visible.length} hiddenCount={picked.length - visiblePicked} allVisibleSelected={visible.length > 0 && visiblePicked === visible.length} ontoggleVisible={toggleVisible} onclear={() => chosenIds = []} ondelete={() => pendingDelete = picked.map(card => ({ id: card.id, label: `${card.frontText || '画像カード'} / ${card.backText || '裏面画像'}` }))} />{/if}
{#if visible.length}
  <div class="card-list" class:selection-list-active={selecting}>
    {#each visible as card, index (card.id)}
      <div class="panel card-list-row" class:batch-selected={selecting && chosen.has(card.id)}>
        <button class="card-open" role={selecting ? 'checkbox' : undefined} aria-checked={selecting ? chosen.has(card.id) : undefined} aria-label={selecting ? (card.frontText || '画像カード') + 'を選択' : undefined} onclick={() => selecting ? toggleSelection(card.id) : onview(visible, 'カードを確認', index)}>
          {#if selecting}<span class="selection-circle" class:checked={chosen.has(card.id)} aria-hidden="true">{#if chosen.has(card.id)}<Icon name="check" size={16} />{/if}</span>{/if}
          {#if card.frontImage}<BlobImage blob={card.frontImage} compact alt="表面画像" />{:else}<span class="card-initial" aria-hidden="true">{card.frontText.slice(0, 1).toUpperCase()}</span>{/if}
          <span class="grow card-summary"><strong>{card.frontText || '画像カード'}</strong><span class="answer-preview">{card.backText || '裏面画像'}</span><span class="chips">{#each card.tags as id}{@const tag = tags.find(tag => tag.id === id)}<span class="chip static tiny" class:rose={tag?.name === '苦手'} class:sky={tag?.name.includes('英検')}>{tag?.name ?? ''}</span>{/each}</span><small>学習 {card.reviewCount}回 <span class="separator">·</span> 習熟度 {card.masteryLevel} / 5</small></span>
        </button>
        {#if !selecting}<button class="icon-button small-icon card-edit" aria-label={(card.frontText || '画像カード') + 'を編集'} onclick={() => onedit(card)}><Icon name="more" size={18} /></button>{/if}
      </div>
    {/each}
  </div>
{:else}
  <div class="panel empty"><div class="empty-icon"><Icon name="cards" size={32} /></div><h3>{!cards.length ? 'まだカードがありません' : unassignedOnly && !candidates.length ? 'デッキ未登録のカードはありません' : '見つかりませんでした'}</h3><p>{!cards.length ? 'テキストや画像で、覚えたいことを追加しましょう。' : unassignedOnly && !candidates.length ? 'すべてのカードがデッキに入っています。' : '検索語やタグの条件を変えてみてください。'}</p>{#if !cards.length}<button class="primary" onclick={onadd}>カードを追加</button>{/if}</div>
{/if}
{#if !selecting}<button class="floating-add" aria-label="カードを追加" onclick={onadd}><Icon name="plus" size={29} /></button>{/if}
{#if importing}<TextImport {cards} onclose={() => importing = false} onimported={result => { importing = false; search = ''; selected = []; sort = 'updated'; importStatus = result.added + '枚を追加しました。' + (result.skipped ? '重複 ' + result.skipped + '枚をスキップ。' : '') + (result.tagsCreated ? '新しいタグ ' + result.tagsCreated + '個を作成。' : ''); }} />{/if}
{#if pendingDelete}<DeleteConfirmation kind="カード" items={pendingDelete} deleteItems={repository.deleteCards} onclose={() => pendingDelete = null} ondeleted={count => { pendingDelete = null; finishSelection(); deleteStatus = `${count}枚のカードを削除しました。`; }} />{/if}
