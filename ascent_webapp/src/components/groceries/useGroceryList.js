// The household's groceries for every Groceries screen: the items, and every change to them. Changes go
// through the offline queue (they show at once, sync in the same tap with signal, and wait without),
// so the list works in a shop with no reception.
import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { useTheme } from '@/components/ThemeProvider';
import { useGroceries } from '@/hooks/useWorkspaceData';
import { useListWrites } from '@/lib/offline/listWrites';
import { localDay } from '@/lib/localDay';
import { haptic } from '@/lib/haptics';
import {
  boughtChanges, cleanStore, findByName, purchaseNear, receiptQty, receiptPurchases, groupByAisle, isTracked, levelChanges, listChanges, newItem, offListChanges, parseEntries, purchasePriceChanges, runningLow,
} from './groceryUtils';

export function useGroceryList() {
  const { user, t } = useTheme();
  const me = user?.email || '';
  const { data: items = [], isLoading } = useGroceries();
  const api = useListWrites('groceries');

  const failed = useCallback(() => toast.error(t('grSaveFailed')), [t]);
  const update = useCallback((item, changes) => api.update(item.id, changes).catch(failed), [api, failed]);

  const derived = useMemo(() => {
    const today = localDay();
    const onList = items.filter((i) => i.onList);
    return {
      today,
      onList,
      toBuy: onList.filter((i) => !i.inCart),
      inCart: onList.filter((i) => i.inCart),
      atHome: items.filter((i) => !i.onList && (isTracked(i) || (i.purchases || []).length > 0)),
      low: runningLow(items, today),
      groups: groupByAisle(onList),
    };
  }, [items]);

  /** "milk, 2 eggs, bread": known items go on the list, new names become items. Returns what was added. */
  const addText = useCallback(async (text) => {
    const entries = parseEntries(text);
    const added = [];
    for (const { name, qty } of entries) {
      const known = findByName(items, name) || findByName(added, name);
      if (known && !known.id) continue; // named twice in one go
      if (known) {
        if (!known.onList || qty) update(known, listChanges({ qty: qty || known.qty || '', by: me }));
        added.push(known);
      } else {
        const row = newItem(name, { qty, by: me });
        added.push(row);
        api.create(row).catch(failed);
      }
    }
    if (added.length) haptic('light');
    return added;
  }, [items, update, api, me, failed]);

  const putOnList = useCallback((item, extra = {}) => {
    haptic('selection');
    return update(item, { ...listChanges({ qty: item.qty || '', by: me }), ...extra });
  }, [update, me]);

  const takeOffList = useCallback((item) => {
    haptic('selection');
    const before = {
      onList: item.onList, qty: item.qty, note: item.note, listedAt: item.listedAt, listedBy: item.listedBy, inCart: item.inCart, cartBy: item.cartBy,
      level: item.level ?? null, levelAt: item.levelAt ?? null, levelBy: item.levelBy || '',
    };
    // Back to the pantry, not into Running low: taking it off says it is not needed yet
    update(item, offListChanges(item));
    toast(t('grRemovedFromList', { name: item.name }), { action: { label: t('ntUndo'), onClick: () => update(item, before) } });
  }, [update, t]);

  const toggleCart = useCallback((item) => {
    haptic(item.inCart ? 'selection' : 'light');
    return update(item, { inCart: !item.inCart, cartBy: item.inCart ? '' : me });
  }, [update, me]);

  const setLevel = useCallback((item, level) => {
    haptic('selection');
    return update(item, levelChanges(level, me));
  }, [update, me]);

  /** Bought today: each item off the list with a purchase recorded. `prices`: { [itemId]: price }. */
  const markBought = useCallback(async (list, { prices = {}, currency = null, date = localDay(), store = '' } = {}) => {
    haptic('success');
    await Promise.all(list.map((item) => update(item, boughtChanges(item, { date, by: me, price: prices[item.id] ?? null, currency, store }))));
  }, [update, me]);

  /** Things bought outside a shopping trip (tapped off the list at home), with one undo for all of them. */
  const boughtMany = useCallback((list) => {
    if (!list.length) return;
    haptic('light');
    const befores = list.map((item) => [item, {
      onList: item.onList, qty: item.qty || '', note: item.note || '', listedAt: item.listedAt || null, listedBy: item.listedBy || '',
      inCart: !!item.inCart, cartBy: item.cartBy || '', level: item.level ?? null, levelAt: item.levelAt ?? null, levelBy: item.levelBy || '', purchases: item.purchases || [],
    }]);
    list.forEach((item) => update(item, boughtChanges(item, { by: me })));
    const message = list.length === 1 ? t('grBoughtOne', { name: list[0].name }) : t('grBoughtMany', { n: list.length });
    toast(message, { action: { label: t('ntUndo'), onClick: () => befores.forEach(([item, before]) => update(item, before)) } });
  }, [update, me, t]);
  const boughtOne = useCallback((item) => boughtMany([item]), [boughtMany]);

  /**
   * Prices read from a receipt after the shop: written onto that day's purchase of each item, with the
   * shop's name and how many were bought (`qtys`: { [itemId]: '3' }) where the purchase does not have them yet.
   */
  const addPrices = useCallback((list, prices, { currency = null, date, store = '', qtys = {} }) => Promise.all(list
    .filter((item) => typeof prices[item.id] === 'number' || store || qtys[item.id])
    .map((item) => {
      const purchases = [...(item.purchases || [])];
      const at = purchases.map((p) => p.date).lastIndexOf(date);
      if (at < 0) return null;
      const price = typeof prices[item.id] === 'number' ? { price: prices[item.id], currency } : {};
      const shop = store && !purchases[at].store ? { store: cleanStore(store) } : {};
      const qty = qtys[item.id] && !purchases[at].qty ? { qty: String(qtys[item.id]).slice(0, 40) } : {};
      if (!Object.keys(price).length && !Object.keys(shop).length && !Object.keys(qty).length) return null;
      purchases[at] = { ...purchases[at], ...price, ...shop, ...qty };
      return update(item, { purchases });
    })), [update]);

  /**
   * A receipt read (again): each line matched to an item puts the price of one and how many onto that
   * item's purchase from the receipt's day (or the nearest within three days), replacing a price that was
   * the whole line's. Returns how many items were updated.
   */
  const applyReceipt = useCallback((read, { date, currency = null, store = '' }) => {
    const lines = new Map();
    (read.items || []).forEach((line) => { if (line.matchId && !lines.has(line.matchId)) lines.set(line.matchId, line); });
    let updated = 0;
    for (const [id, line] of lines) {
      const item = items.find((i) => i.id === id);
      const at = item ? purchaseNear(item, date) : -1;
      if (at < 0) continue;
      const purchases = [...item.purchases];
      const price = line.unitPrice ?? line.price;
      const qty = receiptQty(line);
      purchases[at] = {
        ...purchases[at],
        ...(price !== null && price !== undefined ? { price, currency } : {}),
        ...(qty ? { qty: qty.slice(0, 40) } : {}),
        ...(store && !purchases[at].store ? { store: cleanStore(store) } : {}),
      };
      update(item, { purchases });
      updated += 1;
    }
    return updated;
  }, [items, update]);

  /**
   * Everything a receipt says was bought, on the list or not (receiptPurchases): known items get the purchase
   * and come off the list, new products become items. `keep`: the lines' indexes to use (all by default).
   * Returns { updated, added, offList }.
   */
  const recordReceipt = useCallback((read, { keep, date = localDay(), currency = null, store = '' } = {}) => {
    const { updates, creates } = receiptPurchases(items, read.items || [], { date, currency, store, by: me, keep });
    updates.forEach(({ item, changes }) => update(item, changes));
    creates.forEach((row) => api.create(row).catch(failed));
    if (updates.length || creates.length) haptic('success');
    return { updated: updates.length, added: creates.length, offList: updates.filter((u) => u.item.onList).length };
  }, [items, update, api, me, failed]);

    /** A price (and shop) typed in by hand for one purchase. */
  const setPurchasePrice = useCallback((item, purchaseId, values) => update(item, purchasePriceChanges(item, purchaseId, values)), [update]);

  const save = useCallback((item, changes) => update(item, changes), [update]);

  const remove = useCallback((item) => {
    api.remove(item.id).catch(failed);
    toast(t('grDeleted', { name: item.name }), {
      action: {
        label: t('ntUndo'),
        onClick: () => {
          const { id: _id, _id: _oid, created_date: _c, updated_date: _u, createdBy: _b, created_by: _cb, workspaceId: _w, dedupeKey: _k, ...row } = item;
          api.create(row).catch(failed);
        },
      },
    });
  }, [api, failed, t]);

  return { items, isLoading, me, ...derived, addText, putOnList, takeOffList, toggleCart, setLevel, markBought, boughtOne, boughtMany, addPrices, applyReceipt, recordReceipt, setPurchasePrice, save, remove };
}
