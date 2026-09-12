<script lang="ts">
  import { tick } from 'svelte';
  import type { Card, Rating, Review } from '../lib/models';
  import { repository } from '../lib/db/repository';
  import { createSession, advanceSession, type StudyOptions } from '../lib/srs/session';
  import BlobImage from '../components/BlobImage.svelte';
  import Icon from '../components/Icon.svelte';
  import Modal from '../components/Modal.svelte';
  import SpeechButton from '../components/SpeechButton.svelte';
  import { stopSpeech } from '../lib/speech/player';

  export let cards: Card[];
  export let latestCards: Card[];
  export let reviews: Review[];
  export let title: string;
  export let options: StudyOptions;
  export let onclose: () => void;
  export let onsettings: () => void;
  export let onview: () => void;
  export let onhistory: (card: Card) => void;
  export let onedit: (card: Card) => void;
  let session = createSession(cards, reviews, options);
  let flipped = false;
  let skipped = 0;
  let busy = false;
  let error = '';
  let menu = false;
  let confirmingExit = false;
  let heading: HTMLHeadingElement;
  let results = { again: 0, hard: 0, easy: 0 };
  const ratings: { value: Rating; label: string }[] = [{ value: 'again', label: 'ダメ' }, { value: 'hard', label: 'あやしい' }, { value: 'easy', label: '余裕' }];
  $: queued = session.queue[0];
  // Refresh content after editing without rebuilding the queue or changing progress/side.
  $: current = queued && { ...queued, card: latestCards.find(card => card.id === queued.card.id) ?? queued.card };
  // Presentation only: never swap fields on the persisted card or its review history.
  $: promptSide = current && {
    text: options.reverse ? current.card.backText : current.card.frontText,
    image: options.reverse ? current.card.backImage : current.card.frontImage,
    label: options.reverse ? '裏面' : '表面',
    language: (options.reverse ? current.card.backLanguage : current.card.frontLanguage) ?? '',
  };
  $: otherSide = current && {
    text: options.reverse ? current.card.frontText : current.card.backText,
    image: options.reverse ? current.card.frontImage : current.card.backImage,
    label: options.reverse ? '表面' : '裏面',
    language: (options.reverse ? current.card.frontLanguage : current.card.backLanguage) ?? '',
  };
  $: total = session.completed + session.queue.length;
  async function next(card: Card, rating?: Rating) {
    session = advanceSession(session, card, rating ? { rating, repeatAgain: options.repeatAgain, repeatHard: options.repeatHard } : undefined);
    flipped = false; menu = false;
    await tick();
    heading?.focus({ preventScroll: true });
    document.querySelector('.study-surface')?.scrollTo(0, 0);
  }
  async function rate(rating: Rating) {
    if (!current || busy) return;
    stopSpeech();
    busy = true; error = '';
    try {
      const saved = await repository.reviewCard(current.card.id, rating, current.reviewId);
      results = { ...results, [rating]: results[rating] + 1 };
      await next(saved, rating);
      // Suppress the second tap of a physical double-tap on the next card.
      await new Promise(resolve => setTimeout(resolve, 280));
    } catch (e) { error = e instanceof Error ? e.message : '評価を保存できませんでした。もう一度お試しください。'; }
    finally { busy = false; }
  }
  async function skip() {
    if (!current || busy) return;
    stopSpeech();
    busy = true; error = '';
    try {
      // Advancing alone never writes the card or its review history.
      await next(current.card);
      skipped += 1;
      await new Promise(resolve => setTimeout(resolve, 280));
    } finally { busy = false; }
  }
</script>
<div class="study-screen">
  <header class="study-header"><button class="text-button study-settings" aria-label="学習設定に戻る" disabled={busy} onclick={() => { stopSpeech(); menu = false; onsettings(); }}><Icon name="back" size={20} />設定</button><h1>{title}</h1><button class="icon-button" aria-label="学習メニュー" aria-expanded={menu} disabled={!current || busy} onclick={() => { stopSpeech(); menu = !menu; }}><Icon name="more" size={21} /></button></header>
  {#if menu && current}<div class="study-menu panel"><button class="text-button" onclick={() => { menu = false; onedit(current.card); }}>このカードを編集</button><button class="text-button" onclick={() => { menu = false; onhistory(current.card); }}>このカードの学習履歴</button><button class="text-button" onclick={() => confirmingExit = true}>学習を終了</button></div>{/if}
  {#if current && promptSide && otherSide}
    {@const spoken = flipped ? otherSide : promptSide}
    <div class="study-progress"><progress value={session.completed + 1} max={Math.max(total, 1)} aria-label="学習の進捗"></progress><span>{session.completed + 1} / {total}{#if current.repeated} · 再出題{/if}</span></div>
    <div class="study-surface">
      <article class="study-card">
        {#if flipped}
          <span class="answer-caption">{otherSide.label}</span>
          <BlobImage blob={otherSide.image} alt={otherSide.label + 'の画像'} />
          {#if otherSide.text}<h2 bind:this={heading} tabindex="-1">{otherSide.text}</h2>{/if}
          {#if current.card.notes}<p class="study-notes">{current.card.notes}</p>{/if}
        {:else}
          <span class="answer-caption">{promptSide.label}</span>
          <BlobImage blob={promptSide.image} alt={promptSide.label + 'の画像'} />
          {#if promptSide.text}<h2 bind:this={heading} tabindex="-1">{promptSide.text}</h2>{/if}
        {/if}
        <button class="study-flip" aria-label={(flipped ? promptSide.label : otherSide.label) + 'を見る'} aria-describedby="study-gesture-hint" disabled={busy} onclick={() => { flipped = !flipped; }}></button>
        {#key current.card.id + spoken.label + spoken.text + spoken.language}<SpeechButton text={spoken.text} language={spoken.language} side={spoken.label} disabled={busy} />{/key}
      </article>
    </div>
    <footer class="study-controls">
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <p class="study-hint" id="study-gesture-hint">タップで{flipped ? promptSide.label : otherSide.label}へ · 評価またはスキップで次へ</p>
      <div class="rating-buttons">{#each ratings as rating}<button class={'rate-button ' + rating.value} disabled={busy} onclick={() => rate(rating.value)}>{rating.label}</button>{/each}<button class="rate-button skip" disabled={busy} onclick={skip}>スキップ</button></div>
      <span class="sr-only" role="status">{flipped ? otherSide.label : promptSide.label}を表示しています。</span>
    </footer>
  {:else}
    <section class="study-complete"><span class="completion-icon"><Icon name="check" size={40} /></span><h2>{session.completed ? 'おつかれさまでした' : 'この設定の対象カードはありません'}</h2>
      {#if session.completed}<p>{session.initialCount}枚のカードを確認しました。</p><p>評価 {session.completed - skipped}{options.repeatAgain || options.repeatHard ? "回" : "枚"} · スキップ {skipped}{options.repeatAgain || options.repeatHard ? "回" : "枚"}</p><div class="result-counts">{#each ratings as rating}<div><span class={'rating-label ' + rating.value}>{rating.label}</span><strong>{results[rating.value]}</strong></div>{/each}</div><p class="muted small">{skipped === session.completed ? '学習記録は変更していません。' : '評価を保存しました。スキップしたカードの学習記録は変更していません。'}</p>
      {:else}<p>デッキに戻り、学習設定やカードを確認してください。</p>{#if cards.length}<button class="secondary" onclick={onview}>カードを確認する</button>{/if}{/if}
      <button class="primary full" onclick={onclose}>戻る</button>
    </section>
  {/if}
</div>
{#if confirmingExit}<Modal title="学習を終了しますか？" onclose={() => confirmingExit = false}><div class="stack"><p>ここまでの評価は保存されています。残りのカードは、次の学習で続けられます。</p><button class="primary" onclick={onclose}>学習を終了する</button><button class="secondary" onclick={() => confirmingExit = false}>学習を続ける</button></div></Modal>{/if}
