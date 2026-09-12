<script lang="ts">
  import type { Card, Tag } from '../lib/models';
  import Modal from './Modal.svelte';
  import BlobImage from './BlobImage.svelte';
  import SpeechButton from './SpeechButton.svelte';
  export let cards: Card[];
  export let tags: Tag[];
  export let title: string;
  export let initialIndex = 0;
  export let onclose: () => void;
  export let onedit: (card: Card) => void;
  export let onhistory: (card: Card) => void;
  let index = initialIndex;
  let flipped = false;
  $: card = cards[index];
</script>
<Modal {title} {onclose}>
  {#if card}
    <div class="row between small muted"><span>カードを確認</span><span>{index + 1} / {cards.length}</span></div>
    <progress value={index + 1} max={cards.length} aria-label="カードの進捗"></progress>
    <div class="flashcard">
      <span class="eyebrow">{flipped ? '裏面' : '表面'}</span>
      {#if flipped}<p class="muted original">{card.frontText}</p>{/if}
      <BlobImage blob={flipped ? card.backImage : card.frontImage} alt={flipped ? '裏面の画像' : '表面の画像'} />
      <p class="card-text">{flipped ? card.backText : card.frontText}</p>
      {#if flipped && card.notes}<p class="muted pre-wrap">{card.notes}</p>{/if}
      {#key card.id + flipped}<SpeechButton text={flipped ? card.backText : card.frontText} language={(flipped ? card.backLanguage : card.frontLanguage) ?? ''} side={flipped ? '裏面' : '表面'} />{/key}
    </div>
    <div class="chips centered">{#each card.tags as id}<span class="chip static">{tags.find(t => t.id === id)?.name ?? ''}</span>{/each}</div>
    <div class="stack viewer-actions">
      <button class="primary full" onclick={() => flipped = !flipped}>{flipped ? '表面を見る' : '裏面を見る'}</button>
      <div class="row"><button class="secondary grow" disabled={index === 0} onclick={() => { index--; flipped = false; }}>前へ</button><button class="secondary grow" disabled={index + 1 >= cards.length} onclick={() => { index++; flipped = false; }}>次へ</button></div>
      <button class="text-button" onclick={() => onedit(card)}>このカードを編集</button>
      <button class="text-button" onclick={() => onhistory(card)}>学習履歴を見る</button>
      <p class="muted small centered">確認モードでは学習履歴は記録されません。</p>
    </div>
  {:else}<p class="empty">カードがありません。</p>{/if}
</Modal>
