let active: { utterance: SpeechSynthesisUtterance; finish: (error?: string) => void } | null = null;
export const speechSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

export function stopSpeech() {
  if (!active) return;
  const previous = active;
  active = null;
  window.speechSynthesis.cancel();
  previous.finish();
}

/** Called directly by a user gesture. No timers or network roundtrips before speak(). */
export function speak(text: string, language: string, finished: (error?: string) => void): () => void {
  if (!speechSupported()) throw new Error('このブラウザは読み上げに対応していません。');
  stopSpeech();
  const engine = window.speechSynthesis;
  engine.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = language || navigator.language || 'ja-JP';
  const locale = utterance.lang.toLowerCase();
  const voices = engine.getVoices().filter(voice => voice.lang.toLowerCase().split('-')[0] === locale.split('-')[0] && (navigator.onLine || voice.localService));
  voices.sort((a, b) => Number(b.localService) - Number(a.localService) || Number(b.lang.toLowerCase() === locale) - Number(a.lang.toLowerCase() === locale));
  if (voices[0]) utterance.voice = voices[0];
  const entry = { utterance, finish: finished };
  active = entry;
  const finish = (error?: string) => { if (active === entry) { active = null; finished(error); } };
  utterance.onend = () => finish();
  utterance.onerror = event => finish(['canceled', 'interrupted'].includes(event.error) ? undefined : '読み上げできませんでした。端末の音声・言語設定や接続状態を確認してください。');
  try { engine.speak(utterance); }
  catch { finish('読み上げを開始できませんでした。もう一度お試しください。'); }
  return () => { if (active === entry) stopSpeech(); };
}
