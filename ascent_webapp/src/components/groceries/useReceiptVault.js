// The household's receipts vault: the list, adding photos and PDFs (read by the assistant when it is on),
// and editing or deleting one. Files go straight to the server, so adding one needs a connection.
import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ascent } from '@/api/client';
import { useTheme } from '@/components/ThemeProvider';
import { useWorkspaceId } from '@/lib/AuthContext';
import { useAssistStatus, useReceipts, workspaceKey } from '@/hooks/useWorkspaceData';
import { useOnline } from '@/lib/offline/network';
import { localDay } from '@/lib/localDay';
import { haptic } from '@/lib/haptics';
import { blobOf, prepareVaultFile } from './receiptImage';

const fileKey = (id, part) => ['receipt-file', id, part];

/** An object URL for a receipt's file or thumbnail, fetched once and kept while the app is open. */
export function useReceiptFile(receipt, part, enabled = true) {
  return useQuery({
    queryKey: fileKey(receipt?.id, part),
    enabled: !!receipt?.id && !receipt.uploading && enabled,
    staleTime: Infinity,
    gcTime: 15 * 60 * 1000,
    retry: 1,
    queryFn: async () => {
      const file = await ascent.entities.Receipt.getFile(receipt.id, part);
      return URL.createObjectURL(blobOf(file.data, file.type));
    },
  });
}

/** Opens (or saves) a receipt's file in the browser. */
export async function openReceiptFile(receipt) {
  const file = await ascent.entities.Receipt.getFile(receipt.id, 'file');
  const url = URL.createObjectURL(blobOf(file.data, file.type));
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name || receipt.name || 'receipt';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// What the assistant read, as the vault's fields
const fromRead = (read) => ({
  store: read.store || '',
  date: read.date || undefined,
  total: read.total ?? null,
  currency: read.currency || undefined,
  items: (read.items || []).map(({ matchId: _m, ...line }) => line),
  read: true,
});

export function useReceiptVault() {
  const { t, user } = useTheme();
  const workspaceId = useWorkspaceId();
  const queryClient = useQueryClient();
  const online = useOnline();
  const { data: receipts = [], isLoading } = useReceipts();
  const { data: status } = useAssistStatus();
  const aiReady = !!(status?.ai?.configured && status?.ai?.enabled);
  const [reading, setReading] = useState(() => new Set());
  const key = workspaceKey('receipts', workspaceId);
  const currency = user?.currency || 'ILS';

  const setList = useCallback((fn) => queryClient.setQueryData(key, (list = []) => fn(list)), [queryClient, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const put = useCallback((row, replaceId = row.id) => setList((list) => {
    const at = list.findIndex((r) => r.id === replaceId);
    if (at < 0) return [row, ...list];
    const next = [...list];
    next[at] = row;
    return next;
  }), [setList]);
  const markReading = (id, on) => setReading((s) => {
    const next = new Set(s);
    if (on) next.add(id); else next.delete(id);
    return next;
  });

  const update = useCallback(async (receipt, changes) => {
    put({ ...receipt, ...changes });
    try {
      const saved = await ascent.entities.Receipt.update(receipt.id, changes);
      put(saved);
      return saved;
    } catch {
      toast.error(t('grSaveFailed'));
      queryClient.invalidateQueries({ queryKey: key });
      return null;
    }
  }, [put, queryClient, key, t]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Has the assistant read a photo (again): fills in the shop, day, total and every line. `match` is the
   * grocery items the lines may be (id, name); `onRead(read, receipt)` hears what was read. Returns it, or null.
   */
  const readWithAssistant = useCallback(async (receipt, image, { match = [], onRead } = {}) => {
    if (!aiReady) return null;
    markReading(receipt.id, true);
    try {
      let b64 = image;
      if (!b64) b64 = (await ascent.entities.Receipt.getFile(receipt.id, 'file')).data;
      const read = await ascent.assist.readReceipt({ image: b64, mediaType: 'image/jpeg', items: match });
      if (!read?.isReceipt) { toast(t('rcptCouldNotRead')); return null; }
      await update(receipt, fromRead(read));
      onRead?.(read, receipt);
      return read;
    } catch {
      toast(t('rcptCouldNotRead'));
      return null;
    } finally {
      markReading(receipt.id, false);
    }
  }, [aiReady, update, t]);

  /** Photos or PDFs picked from the camera, gallery or files: each kept at once, then read. */
  const add = useCallback(async (fileList, readOptions) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    if (!online) { toast.error(t('rcptNeedOnline')); return; }
    for (const file of files) {
      const tmp = `tmp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      let prepared;
      try {
        prepared = await prepareVaultFile(file);
      } catch (e) {
        toast.error(t(e.message === 'too_large' ? 'rcTooLarge' : 'rcUnreadable'));
        continue;
      }
      const { image, preview, ...payload } = prepared;
      put({ id: tmp, uploading: true, preview, type: payload.type, store: '', date: localDay(), total: null, currency, created_date: new Date().toISOString() });
      try {
        const saved = await ascent.entities.Receipt.create({ ...payload, date: localDay(), currency });
        put(saved, tmp);
        // The grid shows the photo just taken, without fetching it back
        if (preview) queryClient.setQueryData(fileKey(saved.id, 'thumb'), preview);
        haptic('success');
        if (image && aiReady) readWithAssistant(saved, image, readOptions?.(saved));
      } catch (e) {
        setList((list) => list.filter((r) => r.id !== tmp));
        toast.error(t(e.status === 413 ? 'rcTooLarge' : 'rcUploadFailed'));
      }
    }
  }, [online, put, setList, queryClient, aiReady, readWithAssistant, currency, t]);

  const remove = useCallback(async (receipt) => {
    setList((list) => list.filter((r) => r.id !== receipt.id));
    try {
      await ascent.entities.Receipt.delete(receipt.id);
      toast(t('rcptDeleted'));
    } catch (e) {
      toast.error(t(e.status === 403 ? 'rcDeleteNotYours' : 'grSaveFailed'));
      queryClient.invalidateQueries({ queryKey: key });
    }
  }, [setList, queryClient, key, t]); // eslint-disable-line react-hooks/exhaustive-deps

  return { receipts, isLoading, online, aiReady, reading, add, update, remove, readWithAssistant };
}
