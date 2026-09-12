import { describe, expect, it } from 'vitest';
import { DEFAULT_AUTO_STUDY_SETTINGS, loadAutoStudySettings, saveAutoStudySettings, clearAutoStudySettings, validateAutoStudySettings } from '../src/lib/autoStudySettings';

describe('home study settings', () => {
  it('defaults to thirty cards and no repeats, persists edits, and resets', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
    expect(loadAutoStudySettings(storage)).toEqual(DEFAULT_AUTO_STUDY_SETTINGS);
    const edited = { dailyLimit: 75, repeatNonEasy: true };
    saveAutoStudySettings(storage, edited); expect(loadAutoStudySettings(storage)).toEqual(edited);
    clearAutoStudySettings(storage); expect(loadAutoStudySettings(storage)).toEqual(DEFAULT_AUTO_STUDY_SETTINGS);
  });
  it.each([[false, false], [true, false], [false, true], [true, true]])('merges old settings again=%s hard=%s into one switch', (repeatAgain, repeatHard) => {
    const storage = { getItem: () => JSON.stringify({ dailyLimit: 15, repeatAgain, repeatHard }) };
    expect(loadAutoStudySettings(storage)).toEqual({ dailyLimit: 15, repeatNonEasy: repeatAgain || repeatHard });
  });
  it.each([0, -1, 1.5, NaN, undefined, '30', Infinity])('rejects invalid manual input %s', dailyLimit => {
    expect(() => validateAutoStudySettings({ ...DEFAULT_AUTO_STUDY_SETTINGS, dailyLimit })).toThrow();
  });
});
