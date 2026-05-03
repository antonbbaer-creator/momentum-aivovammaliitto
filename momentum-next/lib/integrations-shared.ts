// Ulkoisten kalenteri-integrointien tyypit (Google + Microsoft).
// Tokenit ja kalenterilistat tallennetaan polkuun
//   users/{uid}/integrations/{provider}
// Pollatut tapahtumat:
//   users/{uid}/personalData/externalEvents

export type CalendarProvider = 'google' | 'microsoft';

export interface CalendarMeta {
  id: string;                    // ulkoinen kalenteri-id
  name: string;
  isPrimary?: boolean;
  syncEnabled: boolean;          // näkyy viikkonäkymässä
  /** @deprecated käytä mappedCategoryIds */
  mappedCategoryId?: string;
  /** Kategoriat joille tämä kalenteri syöttää tapahtumia. */
  mappedCategoryIds?: string[];
  /** @deprecated käytä writeForCategoryIds */
  writeEnabled?: boolean;
  /** Kategoriat joille tämä kalenteri toimii kirjoituskohteena (subset of mappedCategoryIds). */
  writeForCategoryIds?: string[];
  color?: string;                // UI-väri (kalenterin oma jos saatavilla)
}

/** Palauta kategoriat joihin kalenteri on liitetty — yhdistää uudet + legacy-kentät. */
export function getCalendarCategoryIds(c: CalendarMeta): string[] {
  const set = new Set<string>(c.mappedCategoryIds ?? []);
  if (c.mappedCategoryId) set.add(c.mappedCategoryId);
  return Array.from(set);
}

/** Onko kalenteri kirjoituskohde annetulle kategorialle? */
export function isCalendarWriteFor(c: CalendarMeta, categoryId: string): boolean {
  if (c.writeForCategoryIds && c.writeForCategoryIds.includes(categoryId)) return true;
  // Legacy: jos mappedCategoryId === categoryId ja writeEnabled (oletus true), kirjoita
  if (c.mappedCategoryId === categoryId && (c.writeEnabled ?? true)) return true;
  return false;
}

export interface IntegrationDoc {
  provider: CalendarProvider;
  email?: string;
  accessToken: string;
  refreshToken: string;          // pakollinen — vaatii offline_access scopen
  expiresAt: number;             // ms epoch
  scopes: string[];
  connectedAt: number;
  calendars: CalendarMeta[];
  lastSyncAt?: number;
  lastSyncError?: string;
}

export interface ExternalEvent {
  id: string;                    // mirror-id (provider:eventId)
  source: CalendarProvider;
  calendarId: string;
  externalEventId: string;
  title: string;
  start: string;                 // ISO 'YYYY-MM-DDTHH:MM'
  end: string;
  allDay?: boolean;
  recurringId?: string;          // toistuvan instanssin "master"-id
  htmlLink?: string;
  updatedAt: number;
}

export interface ExternalEventsDoc {
  events: ExternalEvent[];
  windowStart: string;           // 'YYYY-MM-DD' — pollausikkunan alku
  windowEnd: string;
  lastFetchedAt: number;
}

// Scopet
export const GOOGLE_CALENDAR_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar',
];

export const MICROSOFT_CALENDAR_SCOPES = [
  'openid',
  'email',
  'offline_access',
  'Calendars.ReadWrite',
];

// Microsoft endpoint helpers
export const MICROSOFT_TENANT = 'common'; // tai env-arvo myöhemmin
export const MICROSOFT_AUTHORITY = `https://login.microsoftonline.com/${MICROSOFT_TENANT}`;

// Apurit
export const isExpired = (doc: { expiresAt: number }): boolean =>
  doc.expiresAt <= Date.now() + 30_000; // 30s puskuri

export const integrationDocPath = (uid: string, provider: CalendarProvider) =>
  `users/${uid}/integrations/${provider}`;

export const externalEventsKey = 'externalEvents';
