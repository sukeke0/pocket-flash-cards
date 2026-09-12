<script lang="ts">
  import type { Snapshot, Tag } from '../lib/models';
  import { repository } from '../lib/db/repository';
  import { exportBackup, readBackup } from '../lib/transfer/backup';
  import BackupSave from '../components/BackupSave.svelte';
  import Icon from '../components/Icon.svelte';
  import Modal from '../components/Modal.svelte';
  import StorageUsage from '../components/StorageUsage.svelte';
  import ImageZipImport from '../components/ImageZipImport.svelte';
  import ZipImportHelp from '../components/ZipImportHelp.svelte';
  let showingZipHelp = false;
  let importingImages = false;
  export let snapshot: Snapshot;
  export let tags: Tag[];
  export let focusBackup = false;
  let backupSection: HTMLElement;
  $: if (focusBackup && backupSection) { backupSection.scrollIntoView({ block: "start" }); backupSection.focus({ preventScroll: true }); }
  export let onreset: () => Promise<string | undefined>;
  export let onbackupexecuted: () => void;
  let tagName = '';
  let editingTag: string | undefined;
  let deletingTag: Tag | undefined;
  let pending: Snapshot | null = null;
  let preparedBackup: File | null = null;
  let confirmingHistoryClear = false;
  let confirmingReset = false;
  let resetComplete = false;
  let resetConfirmation = '';
  let busy = false;
  let error = '';
  let status = '';
  const message = (e: unknown) => e instanceof Error ? e.message : '処理に失敗しました。';
  async function action(fn: () => Promise<void>) {
    busy = true; error = ''; status = '';
    try { await fn(); } catch (e) { error = message(e); } finally { busy = false; }
  }
  async function saveTag(event: SubmitEvent) {
    event.preventDefault();
    await action(async () => { await repository.saveTag(tagName, editingTag); tagName = ''; editingTag = undefined; status = 'タグを保存しました。'; });
  }
  async function backup() {
    if (busy) return;
    await action(async () => {
      const blob = await exportBackup(await repository.snapshot());
      preparedBackup = new File([blob], `pocket-flash-cards-${new Date().toISOString().slice(0, 10)}.zip`, { type: 'application/zip' });
    });
  }
  async function load(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) await action(async () => { pending = await readBackup(file); });
    input.value = '';
  }
  async function restore() {
    if (!pending) return;
    const data = pending;
    await action(async () => { await repository.restore(data); pending = null; status = `${data.cards.length}枚のカードを復元しました。`; });
  }
  async function clearHistory() {
    if (busy) return;
    await action(async () => {
      await repository.clearLearningHistory();
      confirmingHistoryClear = false;
      status = '学習履歴をクリアしました。すべてのカードを未学習に戻しました。';
    });
  }
  async function resetApp() {
    if (busy || !confirmingReset || resetConfirmation !== 'reset') return;
    await action(async () => {
      const warning = await onreset();
      confirmingReset = false; resetConfirmation = ''; confirmingHistoryClear = false;
      tagName = ''; editingTag = undefined; deletingTag = undefined; pending = null;
      resetComplete = true;
      if (warning) error = warning;
    });
  }
</script>
<header class="page-header"><div><p class="date">MAKE IT YOURS</p><h1>その他</h1></div></header>
<section class="panel settings-panel stack"><h2>学習の統計</h2><p class="muted small">学習状況や習熟度を、全体・デッキ別・タグ別に確認できます。</p><a class="secondary full settings-link" href="#statistics"><Icon name="chart" size={20} />統計を見る</a></section>
{#if error && !resetComplete}<p class="error" role="alert">{error}</p>{/if}
{#if status}<p class="success" role="status">{status}</p>{/if}
<StorageUsage {snapshot} />
<div class="section-heading"><h2>ZIPで一括登録</h2></div>
<section class="panel settings-panel stack"><p>カードを画像も含めてまとめて登録できます。</p><button class="text-button help-link" aria-label="一括登録ファイルの作り方" disabled={busy} onclick={() => showingZipHelp = true}><Icon name="info" size={20} />ファイルの作り方</button><button class="secondary full" disabled={busy} onclick={() => importingImages = true}>ZIPで一括登録</button></section>
<div class="section-heading"><h2>バックアップ</h2><Icon name="download" size={20} /></div>
<section bind:this={backupSection} tabindex="-1" aria-label="バックアップ" class="panel settings-panel stack"><p>カード・画像・タグ・デッキをまとめて保存。Android、Windowsなど異なるデバイスでも移行できます。</p><div class="notice small">SafariのWebサイトデータを削除するとカードも消えます。定期的にZIPを保存してください。</div><button class="primary full" disabled={busy} onclick={backup}><Icon name="download" size={19} />{busy ? '処理中…' : 'すべてのデータをZIPで保存'}</button><label class="file-button secondary full" class:disabled={busy}><Icon name="upload" size={19} />バックアップから復元<input type="file" accept=".zip,application/zip" disabled={busy} onchange={load} /></label><p class="muted small">バックアップZIP専用です。CSV／TSVの追加は「カード管理」から行えます。</p></section>
<div class="section-heading"><h2>タグを管理</h2><span class="count-badge">{tags.length}</span></div>
<section class="panel settings-panel stack">
  <form onsubmit={saveTag} class="row"><input aria-label="タグ名" placeholder="新しいタグ名" maxlength="80" bind:value={tagName} disabled={busy} /><button class="secondary nowrap" disabled={busy || !tagName.trim()}>{editingTag ? '変更を保存' : '追加'}</button></form>
  {#if editingTag}<button class="text-button" onclick={() => { editingTag = undefined; tagName = ''; }}>編集をキャンセル</button>{/if}
  <div>{#each tags as tag}<div class="tag-management-row"><span class="chip static">{tag.name}</span><div class="row"><button class="text-button" aria-label={`${tag.name}を変更`} disabled={busy} onclick={() => { tagName = tag.name; editingTag = tag.id; }}>変更</button><button class="text-button danger-text" aria-label={`${tag.name}タグを削除`} disabled={busy} onclick={() => deletingTag = tag}>削除</button></div></div>{/each}</div>
  {#if !tags.length}<p class="muted small">「英単語」「苦手」など、好きなタグを作れます。</p>{/if}
</section>
<div class="section-heading"><h2>アプリと保存先</h2></div>
<section class="panel settings-panel stack"><h3>学習履歴</h3><p class="muted small">履歴・学習回数・習熟度・復習予定をリセットして、最初から学習できます。</p><button class="secondary danger-text" disabled={busy} onclick={() => { error = ''; confirmingHistoryClear = true; }}>学習履歴をクリア</button></section>
<section class="panel settings-panel stack"><h3>アプリのリセット</h3><p class="muted small">この端末のデータと学習設定を削除し、サンプル入りの初期状態に戻します。</p><button class="secondary danger-text full" disabled={busy} onclick={() => { error = ''; resetConfirmation = ''; confirmingReset = true; }}>アプリをリセット</button></section>
<div class="section-heading"><h2>iPhoneで使う</h2></div>
<section class="panel settings-panel"><ol class="instructions"><li>公開URLをSafariで開く</li><li>共有ボタンから「ホーム画面に追加」</li><li>ホーム画面の「Cards」を開く</li></ol></section>
<p class="muted small centered version">Pocket Flash Cards · v0.1.0<br />端末内保存 / アカウント不要<br /><a href={`${import.meta.env.BASE_URL}licenses/dependencies.txt`} target="_blank" rel="noreferrer">オープンソースライセンス</a><br /><a href={`${import.meta.env.BASE_URL}licenses/font-awesome.txt`} target="_blank" rel="noreferrer">Icons: Font Awesome Free · CC BY 4.0</a></p>
{#if importingImages}<ImageZipImport onclose={() => importingImages = false} onimported={count => { importingImages = false; status = `${count}枚のカードを追加しました。既存のカードは保持しています。`; }} />{/if}
{#if showingZipHelp}<ZipImportHelp onclose={() => showingZipHelp = false} />{/if}
{#if resetComplete}<Modal title="アプリをリセットしました。" onclose={() => resetComplete = false}><div class="stack">{#if error}<p class="error" role="alert">{error}</p>{/if}<button class="primary full" onclick={() => resetComplete = false}>閉じる</button></div></Modal>{/if}
{#if preparedBackup}<BackupSave file={preparedBackup} onclose={() => preparedBackup = null} onsaved={() => { preparedBackup = null; status = ''; onbackupexecuted(); }} />{/if}
{#if confirmingReset}<Modal title="アプリをリセットしますか？" onclose={() => { confirmingReset = false; resetConfirmation = ''; }} {busy}><div class="stack"><p>この端末に保存したカード・画像・デッキ・タグ・学習履歴・学習設定をすべて削除します。</p><p class="notice">この操作は取り消せません。必要なデータは、先にZIPでバックアップしてください。</p><p class="muted small">保存済みのバックアップZIPと、他の端末のデータは削除されません。</p><label>確認のため「reset」と入力してください<input type="text" bind:value={resetConfirmation} disabled={busy} autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck={false} /></label><p class="muted small">半角・小文字で入力すると、リセットボタンが押せるようになります。</p>{#if error}<p class="error" role="alert">{error}</p>{/if}<button class="secondary full" disabled={busy} onclick={() => { confirmingReset = false; resetConfirmation = ''; }}>キャンセル</button><button class="danger full" disabled={busy || resetConfirmation !== 'reset'} onclick={resetApp}>{busy ? 'リセット中…' : 'すべてのデータを削除してリセット'}</button></div></Modal>{/if}
{#if confirmingHistoryClear}<Modal title="学習履歴をクリアしますか？" onclose={() => confirmingHistoryClear = false} {busy}><div class="stack"><p>全カードの学習履歴を削除し、学習回数・習熟度・復習予定を初期状態に戻します。</p><p>カードの文章・画像・タグ・デッキは残ります。</p><p class="notice">この操作は元に戻せません。現在の学習記録を残す場合は、先にZIPでバックアップしてください。</p>{#if error}<p class="error" role="alert">{error}</p>{/if}<button class="danger full" disabled={busy} onclick={clearHistory}>{busy ? 'クリア中…' : 'すべての学習履歴をクリアする'}</button><button class="secondary full" disabled={busy} onclick={() => confirmingHistoryClear = false}>キャンセル</button></div></Modal>{/if}
{#if pending}<Modal title="バックアップを復元" onclose={() => pending = null} {busy}><div class="stack"><p>カード {pending.cards.length}枚、タグ {pending.tags.length}個、デッキ {pending.decks.length}個を復元します。</p><p class="notice">現在のすべてのカード・タグ・デッキ・学習履歴を、このバックアップの内容で置き換えます。必要なデータは先にZIPで保存してください。</p>{#if error}<p class="error" role="alert">{error}</p>{/if}<button class="danger" disabled={busy} onclick={restore}>{busy ? '復元中…' : '現在のデータを置き換えて復元'}</button><button class="secondary" disabled={busy} onclick={() => pending = null}>キャンセル</button></div></Modal>{/if}
{#if deletingTag}<Modal title="タグを削除" onclose={() => deletingTag = undefined} {busy}><div class="stack"><p>「{deletingTag.name}」をカードから外して削除します。カード本体は残ります。</p>{#if error}<p class="error" role="alert">{error}</p>{/if}<button class="danger" disabled={busy} onclick={() => action(async () => { if (deletingTag) { await repository.deleteTag(deletingTag.id); if (editingTag === deletingTag.id) { editingTag = undefined; tagName = ''; } deletingTag = undefined; } })}>削除する</button><button class="secondary" disabled={busy} onclick={() => deletingTag = undefined}>キャンセル</button></div></Modal>{/if}
