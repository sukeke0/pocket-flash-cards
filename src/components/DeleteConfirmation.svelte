<script lang="ts">
  import Modal from './Modal.svelte';
  export let kind: 'カード' | 'デッキ';
  // Snapshot exactly what the user selected when opening the warning.
  export let items: { id: string; label: string }[];
  export let deleteItems: (ids: string[]) => Promise<number>;
  export let onclose: () => void;
  export let ondeleted: (count: number) => void;
  let busy = false;
  let error = '';
  async function remove() {
    if (busy || !items.length) return;
    busy = true; error = '';
    try { const count = await deleteItems(items.map(item => item.id)); ondeleted(count); }
    catch { error = '削除できませんでした。変更は保存されていません。もう一度お試しください。'; }
    finally { busy = false; }
  }
</script>
<Modal title={`${kind}をまとめて削除`} {onclose} {busy}>
  <div class="stack">
    <p><strong>選択した{items.length}{kind === 'カード' ? '枚のカード' : '個のデッキ'}を削除しますか？</strong></p>
    <p class="notice">{kind === 'カード' ? 'カード本体・画像・学習履歴が削除され、すべてのデッキから外れます。この操作は取り消せません。' : '選択したデッキを削除します。カード本体・画像・学習履歴は残ります。この操作は取り消せません。'}</p>
    <details class="delete-targets"><summary>削除する{kind}を確認（{items.length}件）</summary><ul>{#each items as item (item.id)}<li>{item.label}</li>{/each}</ul></details>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <button class="secondary full" disabled={busy} onclick={onclose}>キャンセル</button>
    <button class="danger full" disabled={busy || !items.length} onclick={remove}>{busy ? '削除中…' : `${items.length}${kind === 'カード' ? '枚のカード' : '個のデッキ'}を削除する`}</button>
  </div>
</Modal>
