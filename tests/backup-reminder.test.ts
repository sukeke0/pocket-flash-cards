import { describe, expect, it } from 'vitest';
import { nextMonth, shouldShowBackupReminder, recordBackupExecuted, recordBackupWarningShown, resetBackupReminder } from '../src/lib/backupReminder';

const date = (month: number, day = 1, hour = 12) => new Date(2026, month - 1, day, hour).getTime();
function storage(initial: string | null = null) {
  let value = initial;
  return { getItem: () => value, setItem: (_key: string, next: string) => { value = next; } };
}
describe('monthly backup reminders', () => {
  it('starts the first month without a prompt when no backup has been recorded', () => {
    const store = storage();
    expect(shouldShowBackupReminder(store, date(1))).toBe(false);
    expect(shouldShowBackupReminder(store, date(1, 31))).toBe(false);
    expect(shouldShowBackupReminder(store, date(2))).toBe(true);
  });
  it('does not postpone the reminder when the app opens daily', () => {
    const store = storage();
    for (let day = 1; day <= 31; day++) expect(shouldShowBackupReminder(store, date(1, day))).toBe(false);
    expect(shouldShowBackupReminder(store, date(2))).toBe(true);
  });
  it('uses the backup operation timestamp as the next monthly baseline', () => {
    const store = storage(); shouldShowBackupReminder(store, date(1));
    recordBackupExecuted(store, date(1, 20));
    expect(shouldShowBackupReminder(store, date(2, 19))).toBe(false);
    expect(shouldShowBackupReminder(store, date(2, 20))).toBe(true);
  });
  it('records only actual warning displays and then throttles for a month', () => {
    const store = storage(); shouldShowBackupReminder(store, date(1));
    expect(shouldShowBackupReminder(store, date(2))).toBe(true);
    expect(shouldShowBackupReminder(store, date(2))).toBe(true);
    recordBackupWarningShown(store, date(2, 10));
    expect(shouldShowBackupReminder(store, date(3, 9))).toBe(false);
    expect(shouldShowBackupReminder(store, date(3, 10))).toBe(true);
  });
  it('requires both the backup and warning to be at least one month old', () => {
    const store = storage(); shouldShowBackupReminder(store, date(1));
    recordBackupWarningShown(store, date(2, 10)); recordBackupExecuted(store, date(2, 20));
    expect(shouldShowBackupReminder(store, date(3, 10))).toBe(false);
    expect(shouldShowBackupReminder(store, date(3, 20))).toBe(true);
  });
  it('clamps month-end dates and preserves local time', () => {
    expect(nextMonth(date(1, 31, 23))).toBe(date(2, 28, 23));
    expect(nextMonth(date(12, 31))).toBe(new Date(2027, 0, 31, 12).getTime());
    expect(nextMonth(new Date(2028, 0, 31, 12).getTime())).toBe(new Date(2028, 1, 29, 12).getTime());
  });
  it('restarts the monthly cycle after app reset and recovers invalid state', () => {
    const store = storage('invalid'); expect(shouldShowBackupReminder(store, date(1))).toBe(false);
    recordBackupExecuted(store, date(1)); resetBackupReminder(store, date(2));
    expect(shouldShowBackupReminder(store, date(2, 28))).toBe(false);
    expect(shouldShowBackupReminder(store, date(3))).toBe(true);
  });
  it('does not interrupt startup or backup operations when storage is blocked', () => {
    const store = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(shouldShowBackupReminder(store)).toBe(false);
    expect(() => recordBackupExecuted(store)).not.toThrow();
    expect(() => recordBackupWarningShown(store)).not.toThrow();
  });
});
