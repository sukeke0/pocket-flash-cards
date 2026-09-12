<script lang="ts">
  import type { Card, Review } from '../lib/models';
  import { planStudyStart, type StudyOptions } from '../lib/srs/session';
  import Modal from './Modal.svelte';
  import Icon from './Icon.svelte';
  export let cards: Card[];
  export let reviews: Review[];
  export let title: string;
  export let initialOptions: StudyOptions;
  export let revising = false;
  export let onstart: (options: StudyOptions) => void;
  export let onclose: () => void;
  let options = { ...initialOptions };
  let starting = false;
  const orders = [
    { value: 'sequential', label: '順番に表示', description: 'デッキに追加した順に出題します。', icon: 'cards' },
    { value: 'random', label: 'ランダム表示', description: '毎回シャッフルして出題します。', icon: 'sort' },
    { value: 'mastery', label: '習熟度に合わせて表示', description: '覚えていないカードや、復習が遅れているカードを優先します。', icon: 'chart' },
  ] as const;
  $: count = planStudyStart(cards, reviews, options).count;
  function start(event: SubmitEvent) {
    event.preventDefault();
    if (starting || !count) return;
    starting = true;
    onstart({ ...options });
  }
</script>

<Modal title="学習設定" {onclose} expanded busy={starting}>
  <form class="study-setup" onsubmit={start}>
    <div class="study-setup-body stack">
      <div class="setup-deck"><span class="tile-icon"><Icon name="book" /></span><div class="grow"><h3>{title}</h3><p>デッキ内 {cards.length}枚</p></div></div>
      {#if revising}<p class="muted small">ここまでの評価は保存されています。設定を適用すると、出題を最初から組み直します。</p>{/if}
      {#if options.mode === 'automatic'}<p class="notice small">自動学習：未学習と復習時刻を迎えたカードを優先して出題します。{#if options.dailyLimit}1日の学習目標は{Math.min(options.dailyLimit, cards.length)}枚です。今日学習済みの枚数を差し引き、目標達成後も追加で学習できます。{/if}</p>
      {:else}<fieldset class="form-fields setup-order"><legend>学習モード</legend>
        <label class="order-choice"><input type="radio" name="study-mode" value="deck" bind:group={options.mode} /><span><strong>デッキ学習</strong><small>未学習と復習時刻を迎えたカードを出題します。</small></span></label>
        <label class="order-choice"><input type="radio" name="study-mode" value="full" bind:group={options.mode} /><span><strong>総復習</strong><small>復習時刻にかかわらず、全カードを対象にします。</small></span></label>
      </fieldset>
      <fieldset class="form-fields setup-order"><legend>出題の順番</legend>
        {#each orders as order}
          <label class="order-choice" class:chosen={options.order === order.value}>
            <input type="radio" name="study-order" value={order.value} bind:group={options.order} />
            <Icon name={order.icon} size={22} /><span><strong>{order.label}</strong><small>{order.description}</small></span>
          </label>
        {/each}
      </fieldset>
      {/if}
      <label class="setup-toggle"><span><strong>表裏を入れ替える</strong><small>裏面から出題します。テキスト・画像が入れ替わり、学習記録は共通です。</small></span><input type="checkbox" role="switch" bind:checked={options.reverse} /></label>
      <label class="setup-toggle"><span><strong>余裕を除外</strong><small>直近の評価が「余裕」のカードを外します。</small></span><input type="checkbox" role="switch" bind:checked={options.excludeEasy} /></label>
      {#if !count}<p class="notice" role="status">対象のカードがありません。デッキの「編集」から追加してください。</p>{/if}
    </div>
    <footer class="study-setup-footer">
      <div class="row between" aria-live="polite"><strong>今回は {count}枚</strong><span class="muted small">{options.mode === 'automatic' ? '対象デッキ' : '対象すべて'} / 全 {cards.length}枚</span></div>
      <p class="muted small">{options.reverse ? '裏面から出題' : '表面から出題'} · {options.repeatAgain || options.repeatHard ? '余裕以外は最後に1回再出題' : '各カードを1回ずつ'}</p>
      <button class="primary full" type="submit" disabled={starting || !count}>{revising ? 'この設定でやり直す' : '学習を始める'}<Icon name="chevron" size={18} /></button>
      {#if revising}<button class="text-button full" type="button" disabled={starting} onclick={onclose}>変更せず学習に戻る</button>{/if}
    </footer>
  </form>
</Modal>
