// PATCH /api/calendars/integration — päivitä kalenterien sync/mappaus -asetuksia
// DELETE /api/calendars/integration?provider=google — poista yhdistäminen
// Vaatii Firebase ID-tokenin.

import { NextRequest, NextResponse } from 'next/server';
import { getUidFromRequest } from '@/lib/auth-server';
import { adminDb } from '@/lib/firebase-admin';
import { CalendarMeta, CalendarProvider } from '@/lib/integrations-shared';

interface PatchPayload {
  provider: CalendarProvider;
  calendars: CalendarMeta[];
}

/**
 * Siivoa undefined-kentät pois — Firestore ei hyväksy niitä.
 * Säilytä vain ne avaimet joilla on määritelty arvo.
 */
function pruneCalendar(c: CalendarMeta): CalendarMeta {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(c)) {
    if (v !== undefined) out[k] = v;
  }
  return out as unknown as CalendarMeta;
}

export async function PATCH(req: NextRequest) {
  const uid = await getUidFromRequest(req);
  if (!uid) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json() as PatchPayload;
  const calendars = (body.calendars || []).map(pruneCalendar);
  const ref = adminDb().doc(`users/${uid}/integrations/${body.provider}`);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  await ref.update({ calendars });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const uid = await getUidFromRequest(req);
  if (!uid) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const provider = req.nextUrl.searchParams.get('provider') as CalendarProvider | null;
  if (!provider) return NextResponse.json({ error: 'provider missing' }, { status: 400 });

  await adminDb().doc(`users/${uid}/integrations/${provider}`).delete();
  return NextResponse.json({ ok: true });
}
