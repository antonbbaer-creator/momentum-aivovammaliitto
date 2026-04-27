// POST /api/calendars/poll
// Vaatii: Authorization: Bearer <Firebase ID token>
// Pollaa kaikki käyttäjän yhdistetyt kalenterit (Google + Microsoft),
// kirjoittaa tulokset polkuun users/{uid}/personalData/externalEvents.

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { getUidFromRequest } from '@/lib/auth-server';
import { getValidAccessToken } from '@/lib/integration-tokens';
import {
  ExternalEvent,
  ExternalEventsDoc,
  externalEventsKey,
  IntegrationDoc,
} from '@/lib/integrations-shared';
import {
  googleListEvents,
  microsoftListEvents,
} from '@/lib/calendar-clients';

const WINDOW_BACK_DAYS = 7;
const WINDOW_FORWARD_DAYS = 28;

export async function POST(req: NextRequest) {
  const uid = await getUidFromRequest(req);
  if (!uid) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const db = adminDb();
  const now = new Date();
  const windowStart = new Date(now.getTime() - WINDOW_BACK_DAYS * 86_400_000);
  const windowEnd = new Date(now.getTime() + WINDOW_FORWARD_DAYS * 86_400_000);
  const windowStartISO = windowStart.toISOString();
  const windowEndISO = windowEnd.toISOString();

  const events: ExternalEvent[] = [];
  const errors: Record<string, string> = {};

  for (const provider of ['google', 'microsoft'] as const) {
    const auth = await getValidAccessToken(uid, provider);
    if (!auth) continue;
    const integration = auth.doc as IntegrationDoc;
    const enabledCalendars = (integration.calendars || []).filter(c => c.syncEnabled);
    for (const cal of enabledCalendars) {
      try {
        const list = provider === 'google'
          ? await googleListEvents(auth.accessToken, cal.id, windowStartISO, windowEndISO)
          : await microsoftListEvents(auth.accessToken, cal.id, windowStartISO, windowEndISO);
        events.push(...list);
      } catch (e) {
        errors[`${provider}:${cal.id}`] = String(e);
      }
    }
    // Päivitä lastSyncAt
    await db.doc(`users/${uid}/integrations/${provider}`).update({
      lastSyncAt: Date.now(),
      lastSyncError: errors[`${provider}:*`] || null,
    });
  }

  // Tallenna tulokset
  const doc: ExternalEventsDoc = {
    events,
    windowStart: windowStart.toISOString().slice(0, 10),
    windowEnd: windowEnd.toISOString().slice(0, 10),
    lastFetchedAt: Date.now(),
  };
  await db.doc(`users/${uid}/personalData/${externalEventsKey}`).set({
    v: JSON.stringify(doc),
    ts: Date.now(),
    updatedBy: uid,
  });

  return NextResponse.json({ ok: true, count: events.length, errors });
}
