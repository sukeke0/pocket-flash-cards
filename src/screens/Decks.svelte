<script lang="ts">
  import type { Card, Deck, Tag } from '../lib/models';
  import { cardsInDeck, cardsWithoutDeck } from '../lib/decks';
  import Icon from '../components/Icon.svelte';
  import DeckEditor from '../components/DeckEditor.svelte';
  import Modal from '../components/Modal.svelte';
  import SelectionActions from '../components/SelectionActions.svelte';
  import DeleteConfirmation from '../components/DeleteConfirmation.svelte';
  import { repository } from '../lib/db/repository';
  export let cards: Card[];
  export let decks: Deck[];
  export let tags: Tag[];
  export let onaddcards: () => void;
  export let onview: (cards: Card[], title: string, deckId?: string) => void;
  export let onstudy: (cards: Card[], title: string, deckId?: string) => void;
  let editing = false;
  let current: Deck | undefined;
  let emptyDeck: Deck | null = null;
  $: unassigned = cardsWithoutDeck(cards, decks);
  function openStudy(deck: Deck, matches: Card[]) {
    if (!matches.length) { emptyDeck = deck; return; }
    onstudy(matches, deck.name, deck.id);
  }
  let search = '';
  let selecting = false;
  let chosenIds: string[] = [];
  let pendingDelete: { id: string; label: string }[] | null = null;
  let deleteStatus = '';
  $: chosen = new Set(chosenIds);
  $: picked = decks.filter(deck => chosen.has(deck.id));
  $: visiblePicked = filtered.filter(deck => chosen.has(deck.id)).length;
  function toggleSelection(id: string) { chosenIds = chosen.has(id) ? chosenIds.filter(value => value !== id) : [...chosenIds, id]; }
  function toggleVisible() {
    const visibleIds = new Set(filtered.map(deck => deck.id));
    chosenIds = visiblePicked === filtered.length ? chosenIds.filter(id => !visibleIds.has(id)) : [...new Set([...chosenIds, ...visibleIds])];
  }
  function finishSelection() { selecting = false; chosenIds = []; }
  $: filtered = decks.filter(deck => deck.name.normalize('NFKC').toLocaleLowerCase().includes(search.normalize('NFKC').trim().toLocaleLowerCase()));
  function create() { current = undefined; editing = true; }
</script>

<header class="page-header"><div><h1>デッキ</h1><p class="page-description">{selecting ? '削除するデッキを選択してください。' : 'デッキを選んで、学習を始めよう。'}</p></div><div class="row">{#if decks.length || selecting}<button class="text-button" aria-label={selecting ? 'デッキの選択を終了' : 'デッキを選択'} onclick={() => { if (selecting) finishSelection(); else { selecting = true; deleteStatus = ''; } }}>{selecting ? '完了' : '選択'}</button>{/if}{#if !selecting}<button class="text-button" aria-label="デッキを作成" onclick={create}><Icon name="plus" size={19} />作成</button>{/if}</div></header>
{#if deleteStatus}<p class="success" role="status">{deleteStatus}</p>{/if}
{#if unassigned.length}<a class="unassigned-notice settings-link" href="#cards?filter=unassigned"><Icon name="info" size={22} /><span class="grow"><strong>デッキに入っていないカードが{unassigned.length.toLocaleString()}枚あります</strong><small>カードを確認する</small></span><Icon name="chevron" size={18} /></a>{/if}
{#if decks.length}<label class="search-box"><Icon name="search" size={18} /><input type="search" aria-label="デッキ名で検索" bind:value={search} placeholder="デッキ名で検索" /></label>{/if}
{#if selecting}<SelectionActions count={picked.length} visibleCount={filtered.length} hiddenCount={picked.length - visiblePicked} allVisibleSelected={filtered.length > 0 && visiblePicked === filtered.length} ontoggleVisible={toggleVisible} onclear={() => chosenIds = []} ondelete={() => pendingDelete = picked.map(deck => ({ id: deck.id, label: deck.name }))} />{/if}
<div class="collection-toolbar"><span>{filtered.length}個のデッキ</span><span>編集からカードを追加・整理</span></div>
{#if filtered.length}
  <div class="deck-list" class:selection-list-active={selecting}>{#each filtered as deck, index (deck.id)}
    {@const matches = cardsInDeck(cards, deck)}
    <div class="panel deck-row unified-deck" class:batch-selected={selecting && chosen.has(deck.id)}>
      <button class="deck-open" role={selecting ? 'checkbox' : undefined} aria-checked={selecting ? chosen.has(deck.id) : undefined} aria-label={deck.name + (selecting ? 'を選択' : 'の学習設定')} onclick={() => selecting ? toggleSelection(deck.id) : openStudy(deck, matches)}>
        {#if selecting}<span class="selection-circle" class:checked={chosen.has(deck.id)} aria-hidden="true">{#if chosen.has(deck.id)}<Icon name="check" size={16} />{/if}</span>{/if}
        <span class="tile-icon" class:lavender={index % 3 === 1} class:mint={index % 3 === 2}><Icon name="book" /></span>
        <span class="grow deck-copy"><strong>{deck.name}</strong><span class="deck-footer">カード {matches.length}枚</span></span>
        {#if !selecting}<Icon name="chevron" size={18} />{/if}
      </button>
      {#if !selecting}<div class="deck-actions"><button class="text-button" aria-label={deck.name + 'のカードを見る'} disabled={!matches.length} onclick={() => onview(matches, deck.name, deck.id)}>カードを見る</button><button class="text-button" aria-label={deck.name + 'を編集'} onclick={() => { current = deck; editing = true; }}>編集</button></div>{/if}
    </div>
  {/each}</div>
{:else}
  <div class="panel empty"><div class="empty-icon"><Icon name="decks" size={28} /></div><h3>{search ? '見つかりませんでした' : cards.length ? '最初のデッキを作ろう' : 'まずはカードを追加しよう'}</h3><p>{search ? '別のデッキ名で検索してください。' : cards.length ? 'タグでまとめて、または1枚ずつ選んで。あとから自由に追加・編集できます。' : 'カード管理から入力・貼り付けで追加し、デッキにまとめて学習できます。'}</p>{#if !search}{#if cards.length}<button class="secondary" onclick={create}>デッキを作成</button>{:else}<button class="primary" onclick={onaddcards}>カードを追加する</button>{/if}{/if}</div>
{/if}
{#if editing}<DeckEditor deck={current} {cards} {tags} onclose={() => editing = false} onsaved={() => editing = false} />{/if}
{#if emptyDeck}<Modal title="カードがありません" onclose={() => emptyDeck = null}><div class="stack"><p role="alert">「{emptyDeck.name}」はカードが0枚のため、学習を開始できません。デッキにカードを追加してください。</p><button class="primary full" onclick={() => { if (emptyDeck) { current = emptyDeck; emptyDeck = null; editing = true; } }}>カードを追加・編集</button><button class="secondary full" onclick={() => emptyDeck = null}>デッキに戻る</button></div></Modal>{/if}
{#if pendingDelete}<DeleteConfirmation kind="デッキ" items={pendingDelete} deleteItems={repository.deleteDecks} onclose={() => pendingDelete = null} ondeleted={count => { pendingDelete = null; finishSelection(); deleteStatus = `${count}個のデッキを削除しました。カードは残っています。`; }} />{/if}
