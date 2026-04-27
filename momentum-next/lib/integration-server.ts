// Server-side Firestore-kirjoitus integraatio-tokeneille.
// Ainoastaan API-routesit kutsuu — vaatii Firebase Admin SDKn.

import { adminDb } from './firebase-admin';
import {
  CalendarMeta,
  CalendarProvider,
  IntegrationDoc,
} from './integrations-shared';

export interface SaveIntegrationPayload {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scopes: string[];
  email?: string;
  calendars: CalendarMeta[];
}

export async function saveIntegrationServer(
  uid: string,
  provider: CalendarProvider,
  payload: SaveIntegrationPayload,
): Promise<void> {
  const db = adminDb();
  const ref = db.doc(`users/${uid}/integrations/${provider}`);
  // Säilytä mahdolliset aiemmat kalenteri-asetukset (mappedCategoryId, syncEnabled)
  // ylikirjoittamatta niitä.
  const existing = await ref.get();
  let mergedCalendars = payload.calendars;
  if (existing.exists) {
    const old = existing.data() as IntegrationDoc;
    const oldById = new Map((old.calendars || []).map(c => [c.id, c]));
    mergedCalendars = payload.calendars.map(c => {
      const prev = oldById.get(c.id);
      if (!prev) return c;
      return {
        ...c,
        syncEnabled: prev.syncEnabled,
        mappedCategoryId: prev.mappedCategoryId,
        writeEnabled: prev.writeEnabled,
      };
    });
  }

  const doc: IntegrationDoc = {
    provider,
    email: payload.email,
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    expiresAt: payload.expiresAt,
    scopes: payload.scopes,
    connectedAt: existing.exists ? (existing.data() as IntegrationDoc).connectedAt : Date.now(),
    calendars: mergedCalendars,
  };
  await ref.set(doc, { merge: false });
}
