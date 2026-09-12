<script lang="ts">
  import { calculateStatistics, selectStatisticsCards, type Statistics, type StatisticsScope } from '../lib/statistics';
  import type { Card, Deck, Review, Tag } from '../lib/models';
  import Icon from '../components/Icon.svelte';
  import TagPicker from '../components/TagPicker.svelte';
  import MasteryDistribution from '../components/MasteryDistribution.svelte';
  export let allStatistics: Statistics;
  export let cards: Card[];
  export let reviews: Review[];
  export let decks: Deck[];
  export let tags: Tag[];
  export let now: Date;
  let mode: 'all' | 'deck' | 'tags' = 'all';
  let deckId = '';
  let tagIds: string[] = [];
  let match: 'all' | 'any' = 'all';
  let scope: StatisticsScope;
  $: scope = mode === 'deck' ? { kind: 'deck', deckId } : mode === 'tags' ? { kind: 'tags', tagIds, match } : { kind: 'all' };
  $: statistics = mode === 'all' ? allStatistics : calculateStatistics(selectStatisticsCards(cards, decks, scope), reviews, now);
  $: maxDaily = Math.max(1, ...statistics.trend.map(day => day.cards));
</script>
<header class="page-header"><h1>統計</h1><a class="text-button settings-link" href="#more" aria-label="その他に戻る"><Icon name="back" size={18} />その他</a></header>
<div class="stack statistics-screen">
  <section class="panel settings-panel stack" aria-label="統計の対象">
    <h2>表示する範囲</h2>
    <div class="segmented" aria-label="集計範囲"><button class:chosen={mode === 'all'} aria-pressed={mode === 'all'} onclick={() => mode = 'all'}>すべて</button><button class:chosen={mode === 'deck'} aria-pressed={mode === 'deck'} onclick={() => mode = 'deck'}>デッキ別</button><button class:chosen={mode === 'tags'} aria-pressed={mode === 'tags'} onclick={() => mode = 'tags'}>タグ別</button></div>
    {#if mode === 'deck'}<label>デッキ<select aria-label="統計のデッキ" bind:value={deckId}><option value="">デッキを選択</option>{#each decks as deck (deck.id)}<option value={deck.id}>{deck.name}</option>{/each}</select></label>{#if !decks.length}<p class="muted small">デッキがありません。</p>{/if}
    {:else if mode === 'tags'}<TagPicker {tags} bind:selected={tagIds} label="集計するタグ（複数選択可）" />
      {#if tagIds.length > 1}<label>タグの条件<select aria-label="統計のタグ条件" bind:value={match}><option value="all">選んだタグをすべて含む</option><option value="any">選んだタグのいずれかを含む</option></select></label>{/if}
      {#if !tagIds.length}<p class="muted small">タグを選択してください。</p>{/if}
    {/if}
    {#if mode !== 'all'}<p class="muted small">現在の所属・タグで絞り込みます。同じカードを他のデッキで学習した履歴も含みます。</p>{/if}
  </section>
  <section class="panel settings-panel" aria-live="polite"><h2>{mode === 'all' ? '総カード数' : '対象カード数'}</h2><p class="stat-number">{statistics.total.toLocaleString()}<small>枚</small></p>{#if mode !== 'all' && !statistics.total}<p class="muted small">この条件に一致するカードはありません。</p>{/if}</section>
  <section class="panel settings-panel"><h2>今日の学習</h2><dl class="today-statistics"><div><dt>学習カード</dt><dd>{statistics.today.cards.toLocaleString()}<small>枚</small></dd></div><div><dt>レビュー</dt><dd>{statistics.today.reviews.toLocaleString()}<small>回</small></dd></div></dl><p class="muted small">学習カードは重複を除いた枚数。スキップは含みません。</p></section>
  <section class="panel settings-panel stack"><h2>学習状況</h2>
    <MasteryDistribution groups={statistics.mastery} total={statistics.total} />
    <details><summary>分類の基準</summary><p class="muted small">未学習：まだ一度も評価していないカード。定着：3回以上学習し、習熟度3以上・安定度5日以上・難易度5以下のカード。復習中：評価済みで、習得の基準に達していないカード。スキップや裏返す操作だけでは学習済みになりません。割合は四捨五入しています。</p></details>
  </section>
  <section class="panel settings-panel stack"><h2>直近7日間の学習カード数</h2><div class="weekly-chart">{#each statistics.trend as day}<div class="weekly-day"><span class="small">{day.cards}</span><div class="weekly-track"><span style:height={`${day.cards / maxDaily * 100}%`}></span></div><span class="small">{day.label}</span></div>{/each}</div><p class="muted small">各日の重複を除いた枚数です。端末のローカル日付で集計しています。</p></section>
  <p class="muted small">削除したカードは、過去の学習分も含めて統計から除外します。</p>
</div>
