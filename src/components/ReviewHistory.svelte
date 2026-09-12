<script lang="ts">
  import type { Card, Review } from '../lib/models';
  import Modal from './Modal.svelte';
  export let card: Card;
  export let reviews: Review[];
  export let onclose: () => void;
  $: history = reviews.filter(review => review.cardId === card.id).sort((a, b) => b.reviewedAt - a.reviewedAt);
  const labels = { again: 'ダメ', hard: 'あやしい', easy: '余裕' };
  const format = (time: number) => new Intl.DateTimeFormat('ja-JP', { dateStyle: 'short', timeStyle: 'short' }).format(time);
</script>
<Modal title="学習履歴" {onclose}>
  <div class="history-summary"><h3>{card.frontText || '画像カード'}</h3><p>学習 {card.reviewCount}回 · 習熟度 {card.masteryLevel} / 5</p>{#if card.reviewCount}<p>次の復習：{format(card.nextReviewAt)}</p>{/if}</div>
  {#if history.length}<ol class="history-list">{#each history as review (review.id)}<li><span class={'rating-label ' + review.rating}>{labels[review.rating]}</span><div><time datetime={new Date(review.reviewedAt).toISOString()}>{format(review.reviewedAt)}</time><small>次の復習 {format(review.nextReviewAt)}</small></div></li>{/each}</ol>{:else}<p class="empty muted">まだ学習履歴がありません。</p>{/if}
</Modal>
