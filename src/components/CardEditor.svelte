<script lang="ts">
  import type { Card, Tag } from '../lib/models';
  import { repository } from '../lib/db/repository';
  import { readImage } from '../lib/images';
  import Modal from './Modal.svelte';
  import BlobImage from './BlobImage.svelte';
  import TagPicker from './TagPicker.svelte';
  import LanguagePicker from './LanguagePicker.svelte';
  export let card: Card | undefined = undefined;
  export let tags: Tag[];
  export let onclose: () => void;
  export let onsaved: () => void;
  export let allowDelete = true;
  let frontText = card?.frontText ?? '';
  let backText = card?.backText ?? '';
  let frontLanguage = card?.frontLanguage ?? '';
  let backLanguage = card?.backLanguage ?? '';
  let frontImage = card?.frontImage ?? null;
  let backImage = card?.backImage ?? null;
  let selected = [...(card?.tags ?? [])];
  let notes = card?.notes ?? '';
  let tagName = '';
  let error = '';
  let busy = false;
  let imageBusy = 0;
  let confirmDelete = false;
  const message = (e: unknown) => e instanceof Error ? e.message : '操作に失敗しました。';
  async function chooseImage(event: Event, side: 'front' | 'back') {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    imageBusy++;
    error = '';
    try { const blob = await readImage(file); if (side === 'front') frontImage = blob; else backImage = blob; }
    catch (e) { error = message(e); }
    finally { input.value = ''; imageBusy--; }
  }
  async function addTag() {
    busy = true; error = '';
    try { const id = await repository.saveTag(tagName); selected = [...new Set([...selected, id])]; tagName = ''; }
    catch (e) { error = message(e); }
    finally { busy = false; }
  }
  async function save(event: SubmitEvent) {
    event.preventDefault(); busy = true; error = '';
    try { await repository.saveCard({ frontText, backText, frontImage, backImage, frontLanguage, backLanguage, tags: selected, notes }, card?.id); onsaved(); }
    catch (e) { error = message(e); }
    finally { busy = false; }
  }
  async function remove() {
    if (!card) return;
    busy = true;
    try { await repository.deleteCard(card.id); onsaved(); }
    catch (e) { error = message(e); }
    finally { busy = false; }
  }
</script>
<Modal title={card ? 'カードを編集' : 'カードを追加'} {onclose} busy={busy || imageBusy > 0}>
  <form onsubmit={save} class="stack">
    <p class="muted small">画像は自動で200KB未満・長辺1,600px以下に調整します。大きいGIFは静止画になります。</p>
    <fieldset disabled={busy || imageBusy > 0} class="form-fields stack">
      <label>表面 <span class="muted small">問題・単語</span><textarea bind:value={frontText} rows="3" placeholder="例：ubiquitous"></textarea></label>
      <LanguagePicker side="表面" bind:value={frontLanguage} />
      <BlobImage blob={frontImage} alt="表面の画像" />
      <div class="row"><label class="file-button">表面の画像を選択<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onchange={event => chooseImage(event, 'front')} /></label>{#if frontImage}<button type="button" class="text-button danger-text" onclick={() => frontImage = null}>画像を外す</button>{/if}</div>
      <label>裏面 <span class="muted small">答え・意味</span><textarea bind:value={backText} rows="3" placeholder="例：至るところにある"></textarea></label>
      <LanguagePicker side="裏面" bind:value={backLanguage} />
      <p class="muted small">言語設定は通常のタグとは別です。使える声とオフライン再生は端末の音声設定に依存します。</p>
      <BlobImage blob={backImage} alt="裏面の画像" />
      <div class="row"><label class="file-button">裏面の画像を選択<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onchange={event => chooseImage(event, 'back')} /></label>{#if backImage}<button type="button" class="text-button danger-text" onclick={() => backImage = null}>画像を外す</button>{/if}</div>
      <TagPicker {tags} bind:selected />
      <div class="row"><input aria-label="新しいタグ名" placeholder="新しいタグ" bind:value={tagName} maxlength="80" onkeydown={event => { if (event.key === 'Enter') { event.preventDefault(); if (tagName.trim()) void addTag(); } }} /><button type="button" class="secondary nowrap" disabled={!tagName.trim()} onclick={addTag}>タグを追加</button></div>
      <label>メモ <span class="muted small">任意</span><textarea bind:value={notes} rows="2" placeholder="例文や補足など"></textarea></label>
    </fieldset>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    {#if imageBusy}<p class="muted" role="status">画像を圧縮しています…</p>{/if}
    <button type="submit" class="primary full" disabled={busy || imageBusy > 0}>{busy ? '保存中…' : 'カードを保存'}</button>
    {#if card && allowDelete}
      {#if confirmDelete}<div class="notice"><p>このカードと学習履歴を削除します。</p><div class="row"><button type="button" class="danger" disabled={busy} onclick={remove}>削除する</button><button type="button" class="secondary" disabled={busy} onclick={() => confirmDelete = false}>キャンセル</button></div></div>
      {:else}<button type="button" class="text-button danger-text" disabled={busy} onclick={() => confirmDelete = true}>カードを削除</button>{/if}
    {/if}
  </form>
</Modal>
