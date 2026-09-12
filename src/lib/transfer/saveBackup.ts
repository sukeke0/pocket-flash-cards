type WritableBackup = { write: (file: Blob) => Promise<void>; close: () => Promise<void>; abort: () => Promise<void> };
type SaveWindow = Window & { showSaveFilePicker?: (options: {
  suggestedName: string; types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<{ createWritable: () => Promise<WritableBackup> }> };
export type BackupSaveMethod = 'picker' | 'share' | 'download';

export function backupSaveMethod(file: File): BackupSaveMethod {
  if (typeof (window as SaveWindow).showSaveFilePicker === 'function') return 'picker';
  try { if (typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) return 'share'; }
  catch { /* Some browsers reject ZIP sharing. Keep the download fallback. */ }
  return 'download';
}

/** Call directly from a click, with the ZIP already prepared, to retain user activation. */
export async function saveBackupAtDestination(file: File, method: Exclude<BackupSaveMethod, 'download'>): Promise<'saved' | 'shared' | 'cancelled'> {
  try {
    if (method === 'share') {
      await navigator.share({ files: [file] });
      return 'shared';
    }
    const picker = (window as SaveWindow).showSaveFilePicker;
    if (!picker) throw new Error('保存先の選択に対応していません。ZIPをダウンロードしてください。');
    const handle = await picker.call(window, { suggestedName: file.name, types: [{ description: 'ZIPバックアップ', accept: { 'application/zip': ['.zip'] } }] });
    const writable = await handle.createWritable();
    try { await writable.write(file); await writable.close(); }
    catch (error) { try { await writable.abort(); } catch { /* Keep the original error. */ } throw error; }
    return 'saved';
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return 'cancelled';
    throw error;
  }
}
