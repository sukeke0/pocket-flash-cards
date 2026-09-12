<script lang="ts">
  import type { Deck } from '../lib/models';
  import type { DeckSelection } from '../lib/autoStudy';
  import { validateAutoStudySettings, type AutoStudySettings } from '../lib/autoStudySettings';
  import Modal from './Modal.svelte';
  export let decks: Deck[];
  export let selection: DeckSelection;
  export let title = '出題対象';
  export let settings: AutoStudySettings | undefined = undefined;
  export let onchange: (value: DeckSelection, settings?: AutoStudySettings) => boolean;
  export let onclose: () => void;
  $: all = selection === null;
  $: chosen = selection === null ? decks.map(deck => deck.id) : selection;
  let dailyLimit: number | undefined = settings?.dailyLimit ?? 30;
  let error = '';
  let inputError = '';
  function save(value: DeckSelection, updated?: AutoStudySettings) {
    error = '';
    try {
      if (onchange(value, updated)) return true;
      error = '変更を保存できませんでした。もう一度お試しください。';
    } catch (e) { error = e instanceof Error ? e.message : '変更を保存できませんでした。'; }
    return false;
  }
  function changeLimit(input: HTMLInputElement) {
    dailyLimit = Number.isNaN(input.valueAsNumber) ? undefined : input.valueAsNumber;
    inputError = '';
    if (!settings) return;
    try {
      const updated = validateAutoStudySettings({ ...settings, dailyLimit });
      save(selection, updated);
    } catch { inputError = '1以上の整数で入力してください。保存済みの枚数は変更していません。'; }
  }
  function changeRepeat(input: HTMLInputElement) {
    if (settings && !save(selection, { ...settings, repeatNonEasy: input.checked })) input.checked = settings.repeatNonEasy;
  }
  function toggle(id: string, input: HTMLInputElement) {
    const current = all ? decks.map(deck => deck.id) : chosen;
    const next = current.includes(id) ? current.filter(value => value !== id) : [...current, id];
    if (!save(next)) input.checked = current.includes(id);
  }
</script>
<Modal {title} {onclose}>
  <div class="stack">
    {#if settings}
      <label>1日の学習枚数<input type="number" inputmode="numeric" min="1" step="1" required value={dailyLimit} oninput={event => changeLimit(event.currentTarget)} aria-invalid={!!inputError} aria-describedby={inputError ? 'daily-limit-error' : undefined} /></label>
      {#if inputError}<p id="daily-limit-error" class="error" role="alert">{inputError}</p>{/if}
      <label class="setup-toggle"><span><strong>余裕以外を再出題</strong><small>学習の最後に1回だけ再出題します。</small></span><input type="checkbox" role="switch" checked={settings.repeatNonEasy} onchange={event => changeRepeat(event.currentTarget)} /></label>
      <p class="muted small">ホームから始める学習に適用します。再出題は学習枚数に含めません。</p>
    {/if}
    {#if title !== '出題対象'}<h3>出題対象</h3>{/if}
    <div class="row"><button class="text-button" onclick={() => save(null)}>すべて選択</button><button class="text-button" onclick={() => save([])}>すべて解除</button></div>
    <div class="auto-deck-list">{#each decks as deck (deck.id)}<label class="auto-deck-choice"><input type="checkbox" checked={all || chosen.includes(deck.id)} onchange={event => toggle(deck.id, event.currentTarget)} /><span>{deck.name}</span></label>{/each}</div>
    {#if !decks.length}<p class="muted">デッキ画面でデッキを作成してください。</p>{/if}
    {#if all}<p class="muted small">今後追加するデッキも対象になります。</p>{/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <button class="primary full" onclick={onclose}>閉じる</button>
  </div>
</Modal>
