<script lang="ts">
  import Modal from './Modal.svelte';
  import { formatBytes } from '../lib/storage';
  import { downloadBackup } from '../lib/transfer/backup';
  import { backupSaveMethod, saveBackupAtDestination } from '../lib/transfer/saveBackup';
  export let file: File;
  export let onclose: () => void;
  export let onsaved: () => void;
  const method = backupSaveMethod(file);
  let busy = false;
  let error = '';
  async function chooseDestination() {
    if (busy || method === 'download') return;
    busy = true; error = '';
    try {
      const result = await saveBackupAtDestination(file, method);
      if (result === 'saved' || result === 'shared') onsaved();
    } catch { error = '保存先を開けないか、保存に失敗しました。もう一度試すか、ZIPをダウンロードしてください。'; }
    finally { busy = false; }
  }
  function download() {
    if (busy) return;
    downloadBackup(file, file.name);
    onsaved();
  }
</script>
<Modal title="バックアップを保存" {onclose} {busy}>
  <div class="stack">
    <p>バックアップZIPを作成しました。保存先を選んでください。</p>
    <p class="muted small">{file.name} · {formatBytes(file.size)}</p>
    {#if method === 'share'}<p>共有メニューの「ファイルに保存」から、本体やiCloud Driveなどを選べます。</p>
    {:else if method === 'picker'}<p>保存ダイアログで、本体のフォルダーや、パソコンに設定済みのクラウド同期フォルダーを選べます。</p>
    {:else}<p>このブラウザでは保存先を直接選べません。ZIPをダウンロードし、「ファイル」アプリなどから保存したい場所へ移してください。</p>{/if}
    {#if method !== 'download'}<button class="primary full" disabled={busy} onclick={chooseDestination}>{busy ? '保存先を確認中…' : '保存先を選ぶ'}</button>{/if}
    <button class:primary={method === 'download'} class:secondary={method !== 'download'} class="full" disabled={busy} onclick={download}>ZIPをダウンロード</button>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <details><summary>Dropbox・Google Driveに保存するには</summary><p class="muted small">iPhoneでは、保存したいサービスのアプリをインストールしてログインし、「ファイル」アプリの「ブラウズ → … → 編集」でそのサービスを有効にしてください。共有メニューにアプリが表示される場合は、直接渡すこともできます。表示される保存先は端末の設定によって異なります。</p></details>
  </div>
</Modal>
