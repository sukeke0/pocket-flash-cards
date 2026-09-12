const key = `pocket-cards:${import.meta.env.BASE_URL}:backup-reminder:v2`;
type ReminderStorage = Pick<Storage, 'getItem' | 'setItem'>;
interface ReminderState { startedAt: number; lastBackupAt: number | null; lastWarnedAt: number | null }

/** A calendar month, clamped to the last day when the next month is shorter. */
export function nextMonth(time: number): number {
  const date = new Date(time);
  const day = date.getDate();
  date.setDate(1); date.setMonth(date.getMonth() + 1);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDay));
  return date.getTime();
}
function readState(storage: ReminderStorage, now: number): ReminderState {
  const raw = storage.getItem(key);
  let value: unknown;
  try { value = raw ? JSON.parse(raw) : null; } catch { value = null; }
  const valid = (time: unknown): time is number => typeof time === 'number' && Number.isFinite(time) && time > 0 && time <= now;
  if (value && typeof value === 'object' && 'startedAt' in value && valid(value.startedAt)) {
    return { startedAt: value.startedAt,
      lastBackupAt: 'lastBackupAt' in value && valid(value.lastBackupAt) ? value.lastBackupAt : null,
      lastWarnedAt: 'lastWarnedAt' in value && valid(value.lastWarnedAt) ? value.lastWarnedAt : null };
  }
  const initial = { startedAt: now, lastBackupAt: null, lastWarnedAt: null };
  storage.setItem(key, JSON.stringify(initial));
  return initial;
}
export function shouldShowBackupReminder(storage: ReminderStorage, now = Date.now()): boolean {
  try {
    const state = readState(storage, now);
    return now >= nextMonth(state.lastBackupAt ?? state.startedAt)
      && (state.lastWarnedAt === null || now >= nextMonth(state.lastWarnedAt));
  } catch { return false; }
}
function record(storage: ReminderStorage, field: 'lastBackupAt' | 'lastWarnedAt', now: number): void {
  try { storage.setItem(key, JSON.stringify({ ...readState(storage, now), [field]: now })); }
  catch { /* Reminder storage must not interrupt saving or opening the app. */ }
}
export function recordBackupExecuted(storage: ReminderStorage, now = Date.now()) { record(storage, 'lastBackupAt', now); }
export function recordBackupWarningShown(storage: ReminderStorage, now = Date.now()) { record(storage, 'lastWarnedAt', now); }
export function resetBackupReminder(storage: ReminderStorage, now = Date.now()) {
  try { storage.setItem(key, JSON.stringify({ startedAt: now, lastBackupAt: null, lastWarnedAt: null })); }
  catch { /* Optional reminder storage. */ }
}
