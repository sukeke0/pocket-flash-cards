<script lang="ts">
  export let count: number;
  export let visibleCount: number;
  export let hiddenCount: number;
  export let allVisibleSelected: boolean;
  export let ontoggleVisible: () => void;
  export let onclear: () => void;
  export let ondelete: () => void;
</script>
<div class="selection-tools">
  <button class="text-button" disabled={!visibleCount} onclick={ontoggleVisible}>{allVisibleSelected ? '表示中の選択を解除' : `表示中の${visibleCount}件をすべて選択`}</button>
  <button class="text-button" disabled={!count} onclick={onclear}>すべて解除</button>
</div>
<div class="selection-footer">
  <div aria-live="polite"><strong>{count}件を選択中</strong>{#if hiddenCount}<p>絞り込み外の{hiddenCount}件を含みます</p>{/if}</div>
  <button class="danger" disabled={!count} onclick={ondelete}>選択した項目を削除</button>
</div>
