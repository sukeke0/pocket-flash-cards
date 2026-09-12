import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { languageFields } from '../src/lib/speech/languages';
import { speak, stopSpeech } from '../src/lib/speech/player';
import { parseDelimited } from '../src/lib/transfer/delimited';
import { CardsDatabase } from '../src/lib/db/database';
import { createRepository } from '../src/lib/db/repository';
import { exportBackup, readBackup } from '../src/lib/transfer/backup';

afterEach(() => { stopSpeech(); vi.unstubAllGlobals(); });
describe('speech and language settings', () => {
  it('preserves old cards and validates canonical language codes', () => {
    expect(languageFields({})).toEqual({});
    expect(languageFields({ frontLanguage: 'en-us', backLanguage: '' })).toEqual({ frontLanguage: 'en-US', backLanguage: '' });
    expect(() => languageFields({ frontLanguage: '../en' })).toThrow('読み上げ言語');
    expect(() => languageFields({ backLanguage: 123 })).toThrow();
    expect(parseDelimited('front,back,frontLanguage,backLanguage\nhello,こんにちは,en-US,ja-JP').rows[0]).toMatchObject({ frontLanguage: 'en-US', backLanguage: 'ja-JP' });
    expect(parseDelimited('front,back,frontLanguage\na,b,not_valid').issues).toHaveLength(1);
  });
  it('keeps language metadata through backup restoration and learning reset', async () => {
    const db = new CardsDatabase('languages-' + crypto.randomUUID()); const repo = createRepository(db);
    try {
      const id = await repo.saveCard({ frontText: 'hello', backText: 'こんにちは', frontLanguage: 'en-US', backLanguage: 'ja-JP', frontImage: null, backImage: null, tags: [], notes: '' });
      await repo.reviewCard(id, 'easy', 'r');
      const before = await repo.snapshot();
      await repo.restore(await readBackup(await exportBackup(before)));
      expect(await repo.snapshot()).toEqual(before);
      await repo.clearLearningHistory();
      expect((await repo.snapshot()).cards[0]).toMatchObject({ frontLanguage: 'en-US', backLanguage: 'ja-JP', reviewCount: 0 });
    } finally { await db.delete(); }
  });
  it('prefers installed voices, interrupts old speech, and ignores stale callbacks', () => {
    class Utterance {
      lang = ''; voice: unknown; onend: (() => void) | null = null; onerror: ((event: { error: string }) => void) | null = null;
      constructor(public text: string) {}
    }
    const engine = { speak: vi.fn(), cancel: vi.fn(), getVoices: () => [{ lang: 'en-US', localService: false }, { lang: 'en-US', localService: true }] };
    vi.stubGlobal('window', { speechSynthesis: engine, SpeechSynthesisUtterance: Utterance });
    vi.stubGlobal('navigator', { language: 'ja-JP', onLine: true });
    vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
    const finished = vi.fn();
    const stopOld = speak('hello', 'en-US', finished);
    const first = engine.speak.mock.calls[0][0] as Utterance;
    expect(first.lang).toBe('en-US'); expect(first.voice).toMatchObject({ localService: true });
    const secondDone = vi.fn(); const stopNew = speak('こんにちは', 'ja-JP', secondDone);
    expect(finished).toHaveBeenCalledOnce();
    stopOld(); first.onend?.(); expect(secondDone).not.toHaveBeenCalled();
    stopNew(); expect(secondDone).toHaveBeenCalledOnce();
  });
  it('reports unsupported browsers', () => {
    vi.stubGlobal('window', {});
    expect(() => speak('hello', 'en-US', () => {})).toThrow('対応していません');
  });
});
