<script lang="ts">
  import type { Deck } from '../lib/models';
  import type { DeckSelection } from '../lib/autoStudy';
  import type { AutoStudySettings } from '../lib/autoStudySettings';
  import Icon from '../components/Icon.svelte';
  import AutoDeckPicker from '../components/AutoDeckPicker.svelte';
  export let todayCount: number;
  export let decks: Deck[];
  export let selection: DeckSelection;
  export let settings: AutoStudySettings;
  export let onselect: (value: DeckSelection, settings?: AutoStudySettings) => boolean;
  export let onstart: () => void;
  export let error = '';
  let choosing: 'targets' | 'options' | null = null;
  $: selected = selection === null ? decks : decks.filter(deck => selection?.includes(deck.id));
  $: target = selection === null ? 'すべてのデッキ' : selected.length === 1 ? selected[0].name : selected.length ? `${selected.length}個のデッキ` : 'デッキを選択してください';
</script>
<header class="page-header"><h1>Pocket Flash Cards</h1><button class="icon-button" aria-label="学習オプション" onclick={() => choosing = 'options'}><Icon name="settings" size={22} /></button></header>
<section class="home-start">
  <div class="today-learning"><h2>今日の学習</h2><p><strong>{todayCount.toLocaleString()}</strong><span>枚</span></p></div>
  <button class="panel auto-target" onclick={() => choosing = 'targets'}><span class="grow"><small>出題対象</small><strong>{target}</strong></span><Icon name="chevron" size={20} /></button>
  <button class="primary full home-start-button" onclick={onstart}><Icon name="play" size={20} />学習を始める</button>
  {#if error}<p class="notice" role="alert">{error}</p>{/if}
  <p class="muted small centered">ブラウザによって、保存したカードや学習履歴が自動で削除される可能性があります。<a href="#more?section=backup">定期的なバックアップをおすすめします。</a></p>
</section>
{#if choosing}<AutoDeckPicker title={choosing === 'options' ? '学習オプション' : '出題対象'} {decks} {selection} settings={choosing === 'options' ? settings : undefined} onclose={() => choosing = null} onchange={onselect} />{/if}
