<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { speak, speechSupported } from '../lib/speech/player';
  import Icon from './Icon.svelte';
  export let text: string;
  export let language = '';
  export let side: string;
  export let disabled = false;
  let playing = false;
  let error = '';
  let stop = () => {};
  const supported = speechSupported();
  function toggle() {
    if (playing) { stop(); return; }
    if (disabled || !text.trim()) return;
    error = ''; playing = true;
    try { stop = speak(text, language, message => { playing = false; error = message ?? ''; }); }
    catch (e) { playing = false; error = e instanceof Error ? e.message : '読み上げできません。'; }
  }
  onMount(() => {
    const hidden = () => { if (document.hidden) stop(); };
    document.addEventListener('visibilitychange', hidden);
    return () => document.removeEventListener('visibilitychange', hidden);
  });
  onDestroy(() => stop());
</script>
<div class="speech-control">
  <button type="button" class="icon-button speech-button" class:playing disabled={disabled || !supported || !text.trim()} aria-label={playing ? '読み上げを停止' : side + 'を読み上げ'} aria-pressed={playing} title={!supported ? 'このブラウザは読み上げに対応していません' : !text.trim() ? '読み上げる文章がありません' : playing ? '停止' : '読み上げ'} onclick={toggle}><Icon name={playing ? 'stop' : 'speaker'} size={23} /></button>
  {#if error}<p class="small error" role="alert">{error}</p>{/if}
</div>
