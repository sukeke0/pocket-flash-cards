import { afterEach, describe, expect, it, vi } from 'vitest';
import { backupSaveMethod, saveBackupAtDestination } from '../src/lib/transfer/saveBackup';

const file = new File(['zip data'], 'backup.zip', { type: 'application/zip' });
afterEach(() => vi.unstubAllGlobals());

describe('backup save destinations', () => {
  it('uses the native picker and writes the prepared ZIP without changing it', async () => {
    const writable = { write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined), abort: vi.fn() };
    const picker = vi.fn().mockResolvedValue({ createWritable: async () => writable });
    vi.stubGlobal('window', { showSaveFilePicker: picker });
    expect(backupSaveMethod(file)).toBe('picker');
    expect(await saveBackupAtDestination(file, 'picker')).toBe('saved');
    expect(picker).toHaveBeenCalledWith(expect.objectContaining({ suggestedName: 'backup.zip' }));
    expect(writable.write).toHaveBeenCalledWith(file); expect(writable.close).toHaveBeenCalledOnce();
  });
  it('shares the ZIP only when file sharing supports that file', async () => {
    vi.stubGlobal('window', {});
    const canShare = vi.fn().mockReturnValue(true); const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { canShare, share });
    expect(backupSaveMethod(file)).toBe('share'); expect(canShare).toHaveBeenCalledWith({ files: [file] });
    expect(await saveBackupAtDestination(file, 'share')).toBe('shared');
    expect(share).toHaveBeenCalledWith({ files: [file] });
  });
  it('keeps download available for unsupported ZIP sharing', () => {
    vi.stubGlobal('window', {}); vi.stubGlobal('navigator', { canShare: () => false, share: vi.fn() });
    expect(backupSaveMethod(file)).toBe('download');
    vi.stubGlobal('navigator', {}); expect(backupSaveMethod(file)).toBe('download');
  });
  it.each(['picker', 'share'] as const)('treats cancellation in %s as cancellation, not success', async method => {
    const cancel = vi.fn().mockRejectedValue(new DOMException('Cancelled', 'AbortError'));
    vi.stubGlobal('window', { showSaveFilePicker: cancel }); vi.stubGlobal('navigator', { share: cancel });
    expect(await saveBackupAtDestination(file, method)).toBe('cancelled');
  });
  it('aborts a failed write and reports the failure', async () => {
    const writable = { write: vi.fn().mockRejectedValue(new Error('disk full')), close: vi.fn(), abort: vi.fn().mockResolvedValue(undefined) };
    vi.stubGlobal('window', { showSaveFilePicker: async () => ({ createWritable: async () => writable }) });
    await expect(saveBackupAtDestination(file, 'picker')).rejects.toThrow('disk full');
    expect(writable.abort).toHaveBeenCalledOnce(); expect(writable.close).not.toHaveBeenCalled();
  });
});
