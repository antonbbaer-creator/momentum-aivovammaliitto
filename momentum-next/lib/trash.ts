/**
 * Yhteinen roskakorijärjestelmä — pehmeä poisto kaikille moduuleille.
 * Poistetut itemit säilyvät datassa `deletedAt`-aikaleimalla 30 päivää.
 */

export interface Trashable {
  id: string | number;
  deletedAt?: number;
}

/** Merkitse item poistetuksi (pehmeä poisto) */
export function softDelete<T extends Trashable>(items: T[], id: string | number): T[] {
  return items.map(item => item.id === id ? { ...item, deletedAt: Date.now() } : item);
}

/** Palauta item roskakorista */
export function restoreItem<T extends Trashable>(items: T[], id: string | number): T[] {
  return items.map(item => {
    if (item.id !== id) return item;
    const { deletedAt, ...rest } = item;
    return rest as T;
  });
}

/** Suodata pois roskakorissa olevat — käytä renderöinnissä */
export function filterActive<T extends { deletedAt?: number }>(items: T[]): T[] {
  return items.filter(item => !item.deletedAt);
}

/** Palauta vain roskakorissa olevat */
export function filterTrashed<T extends { deletedAt?: number }>(items: T[]): T[] {
  return items.filter(item => !!item.deletedAt);
}

/** Poista lopullisesti yli N päivää vanhat roskakorista */
export function purgeExpired<T extends { deletedAt?: number }>(items: T[], days: number = 30): T[] {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return items.filter(item => !item.deletedAt || item.deletedAt > cutoff);
}

/** Poista yksittäinen item lopullisesti */
export function purgeItem<T extends Trashable>(items: T[], id: string | number): T[] {
  return items.filter(item => item.id !== id);
}

/** Montako päivää jäljellä ennen automaattista poistoa */
export function daysUntilPurge(deletedAt: number, maxDays: number = 30): number {
  const elapsed = Date.now() - deletedAt;
  const remaining = maxDays - Math.floor(elapsed / (24 * 60 * 60 * 1000));
  return Math.max(0, remaining);
}

/** Muotoile poistoaika luettavaksi */
export function formatDeletedDate(deletedAt: number): string {
  return new Date(deletedAt).toLocaleDateString('fi-FI', {
    day: 'numeric', month: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}
