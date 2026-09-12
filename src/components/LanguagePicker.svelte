<script lang="ts">
  import { LANGUAGES } from '../lib/speech/languages';
  export let value = '';
  export let side: string;
</script>
<label class="language-picker">{side}の読み上げ言語<select aria-label={side + 'の読み上げ言語'} bind:value>
  <option value="">端末の標準言語</option>
  {#each LANGUAGES as [code, label]}<option value={code}>{label}</option>{/each}
  {#if value && !LANGUAGES.some(([code]) => code === value)}<option value={value}>{value}</option>{/if}
</select></label>
