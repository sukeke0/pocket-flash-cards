export interface AutoStudySettings { dailyLimit: number; repeatNonEasy: boolean }
export const DEFAULT_AUTO_STUDY_SETTINGS: AutoStudySettings = { dailyLimit: 30, repeatNonEasy: false };
const key = `pocket-cards:${import.meta.env.BASE_URL}:auto-settings:v1`;
export function validateAutoStudySettings(value: unknown): AutoStudySettings {
  if (!value || typeof value !== 'object' || !('dailyLimit' in value) || !Number.isSafeInteger(value.dailyLimit) || Number(value.dailyLimit) < 1
    || !('repeatNonEasy' in value) || typeof value.repeatNonEasy !== 'boolean') {
    throw new Error('学習枚数は1以上の整数で入力してください。');
  }
  return { dailyLimit: Number(value.dailyLimit), repeatNonEasy: value.repeatNonEasy };
}
export function loadAutoStudySettings(storage: Pick<Storage, 'getItem'>): AutoStudySettings {
  const value = storage.getItem(key);
  if (value === null) return { ...DEFAULT_AUTO_STUDY_SETTINGS };
  const saved: unknown = JSON.parse(value);
  // Preserve enabled retries from either of the former individual switches.
  if (saved && typeof saved === 'object' && !('repeatNonEasy' in saved)
    && 'repeatAgain' in saved && typeof saved.repeatAgain === 'boolean'
    && 'repeatHard' in saved && typeof saved.repeatHard === 'boolean') {
    return validateAutoStudySettings({ ...saved, repeatNonEasy: saved.repeatAgain || saved.repeatHard });
  }
  return validateAutoStudySettings(saved);
}
export function saveAutoStudySettings(storage: Pick<Storage, 'setItem'>, value: AutoStudySettings) {
  storage.setItem(key, JSON.stringify(validateAutoStudySettings(value)));
}
export function clearAutoStudySettings(storage: Pick<Storage, 'removeItem'>) { storage.removeItem(key); }
