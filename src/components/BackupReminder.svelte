<script lang="ts">
  import { onMount } from 'svelte';
  import Modal from './Modal.svelte';
  export let onshown: () => void;
  export let onclose: () => void;
  export let onbackup: () => void;
  onMount(onshown);
</script>
<Modal title="バックアップをおすすめします" {onclose}>
  <div class="stack">
    <p>定期的なバックアップの時期です。ブラウザによって、カードや学習履歴が自動で削除される可能性があります。</p>
    <p>大切なデータを残すために、バックアップZIPを保存してください。</p>
    <button class="primary full" onclick={onbackup}>バックアップへ</button>
    <button class="secondary full" onclick={onclose}>あとで</button>
  </div>
</Modal>
