<script lang="ts">
  import { onMount } from 'svelte';
  import type { Snapshot } from '../lib/models';
  import { formatBytes, measureData } from '../lib/storage';
  export let snapshot: Snapshot;
  $: sizes = measureData(snapshot);
  let estimate: StorageEstimate | null = null;
  let busy = false;
  let unavailable = false;
  async function refresh() {
    if (busy) return;
    busy = true; unavailable = false;
    try {
      estimate = await navigator.storage?.estimate?.() ?? null;
      unavailable = !estimate || estimate.usage === undefined || estimate.quota === undefined;
    } catch { estimate = null; unavailable = true; }
    finally { busy = false; }
  }
  $: nearLimit = estimate?.quota && estimate.usage !== undefined && estimate.usage / estimate.quota >= 0.9;
  onMount(() => { void refresh(); });
</script>

<div class="section-heading"><h2>使用容量</h2><button class="text-button" disabled={busy} onclick={refresh} aria-label="使用容量を更新">{busy ? '確認中…' : '更新'}</button></div>
<section class="panel settings-panel stack storage-usage" aria-label="使用容量">
  <div><strong class="storage-total">{formatBytes(sizes.totalBytes)}</strong><p class="muted small">保存したデータの合計（目安）</p></div>
  <dl class="storage-breakdown">
    <div><dt>画像 {sizes.imageCount}枚</dt><dd>{formatBytes(sizes.imageBytes)}</dd></div>
    <div><dt>カード・デッキ・タグ・履歴</dt><dd>{formatBytes(sizes.recordBytes)}</dd></div>
  </dl>
  <p class="muted small">カード {snapshot.cards.length}枚 · デッキ {snapshot.decks.length}個 · 学習履歴 {snapshot.reviews.length}件</p>
  <div class="storage-browser">
    <dl class="storage-breakdown">
      <div><dt>アプリ全体の使用量（推定）</dt><dd>{estimate?.usage !== undefined ? formatBytes(estimate.usage) : '取得できません'}</dd></div>
      <div><dt>ブラウザの保存上限（推定）</dt><dd>{estimate?.quota !== undefined ? formatBytes(estimate.quota) : '取得できません'}</dd></div>
    </dl>
    {#if estimate?.quota && estimate.usage !== undefined}<progress aria-label="保存容量の使用割合" max={estimate.quota} value={Math.min(estimate.usage, estimate.quota)}></progress>{/if}
    <p class="muted small">アプリ全体にはオフライン用ファイルなども含まれます。上限は端末の空き容量や保存できる容量を保証する値ではありません。</p>
    {#if unavailable}<p class="muted small">このブラウザでは容量の推定値を取得できません。保存データの目安は上に表示しています。</p>{/if}
  </div>
  {#if nearLimit}<p class="notice" role="alert">保存上限に近づいています。バックアップを取り、不要なカードや画像を整理してください。</p>{/if}
  <p class="muted small">新しく選択する画像は1枚200KB未満に調整します。以前の画像とバックアップから復元した画像はそのまま保持します。</p>
</section>
