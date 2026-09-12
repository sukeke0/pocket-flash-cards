<script lang="ts">
  import type { ImageCardInput } from '../lib/models';
  import { readImageZip } from '../lib/transfer/imageZip';
  import { repository } from '../lib/db/repository';
  import { formatBytes } from '../lib/storage';
  import Modal from './Modal.svelte';
  import BlobImage from './BlobImage.svelte';
  import Icon from './Icon.svelte';
  import ZipImportHelp from './ZipImportHelp.svelte';
  let showingHelp = false;
  export let onclose: () => void;
  export let onimported: (count: number) => void;
  let rows: ImageCardInput[] = [];
  let filename = '';
  let busy = false;
  let error = '';
  let progress = '';
  let visible = 10;
  $: imageBytes = rows.reduce((sum, row) => sum + (row.frontImage?.size ?? 0) + (row.backImage?.size ?? 0), 0);
  async function load(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || busy) return;
    rows = []; visible = 10; error = ''; busy = true; filename = file.name; progress = 'ZIPを読み込んでいます…';
    try { rows = await readImageZip(file, (done, total) => progress = `画像を確認・圧縮しています… ${done} / ${total}`); }
    catch (e) { error = e instanceof Error ? e.message : 'ZIPを読み込めませんでした。'; }
    finally { busy = false; progress = ''; input.value = ''; }
  }
  async function save() {
    if (busy || !rows.length) return;
    busy = true; error = '';
    try { const result = await repository.importImageCards(rows); onimported(result.added); }
    catch (e) { error = e instanceof Error ? e.message : '追加できませんでした。空き容量を確認してください。'; }
    finally { busy = false; }
  }
</script>
<Modal title="ZIPで一括登録" {onclose} {busy}>
  <div class="stack">
    <p>カードを画像も含めてまとめて登録できます。</p>
    <button class="text-button help-link" aria-label="一括登録ファイルの作り方" disabled={busy} onclick={() => showingHelp = true}><Icon name="info" size={20} />ファイルの作り方</button>
    <p class="muted small">1回1,000枚・ZIPは50MBまで。画像はJPEG・PNG・WebP・GIFに対応し、200KB未満へ自動調整します。大きいGIFは静止画になります。</p>
    <label class="file-button secondary full" class:disabled={busy}>追加用ZIPを選択<input type="file" accept=".zip,application/zip" disabled={busy} onchange={load} /></label>
    {#if progress}<p role="status">{progress}</p>{/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    {#if rows.length}
      <h3>{rows.length}枚を追加できます</h3><p class="muted small">{filename} · 保存する画像 {formatBytes(imageBytes)}</p>
      <p class="notice small">同じZIPを再度取り込むと、その分も新しいカードとして追加されます。</p>
      <ol class="import-preview-list">{#each rows.slice(0, visible) as row}<li><strong>{row.frontText || '表面の画像'}</strong><BlobImage blob={row.frontImage} alt="追加する表面画像" compact /><p>{row.backText || '裏面の画像'}</p><BlobImage blob={row.backImage} alt="追加する裏面画像" compact /><p class="muted small">{row.tagNames.join(' · ')}</p>{#if row.notes}<p>{row.notes}</p>{/if}</li>{/each}</ol>
      {#if visible < rows.length}<button class="text-button" disabled={busy} onclick={() => visible += 10}>次の10枚を確認</button>{/if}
      <button class="primary full" disabled={busy} onclick={save}>{busy ? '追加中…' : rows.length + '枚を新しいカードとして追加'}</button>
    {/if}
  </div>
</Modal>
{#if showingHelp}<ZipImportHelp onclose={() => showingHelp = false} />{/if}
