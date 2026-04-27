// POST/PATCH/DELETE /api/calendars/event
// Vaatii Authorization: Bearer <Firebase ID token>.
// Kirjoittaa, päivittää tai poistaa tapahtuman ulkoisessa kalenterissa.

import { NextRequest, NextResponse } from 'next/server';
import { getUidFromRequest } from '@/lib/auth-server';
import { getValidAccessToken } from '@/lib/integration-tokens';
import {
  googleCreateEvent,
  googleUpdateEvent,
  googleDeleteEvent,
  microsoftCreateEvent,
  microsoftUpdateEvent,
  microsoftDeleteEvent,
} from '@/lib/calendar-clients';
import { CalendarProvider } from '@/lib/integrations-shared';

interface CreatePayload {
  provider: CalendarProvider;
  calendarId: string;
  title: string;
  start: string;
  end: string;
}
interface UpdatePayload extends CreatePayload {
  externalEventId: string;
}
interface DeletePayload {
  provider: CalendarProvider;
  calendarId: string;
  externalEventId: string;
}

export async function POST(req: NextRequest) {
  const uid = await getUidFromRequest(req);
  if (!uid) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json() as CreatePayload;
  const auth = await getValidAccessToken(uid, body.provider);
  if (!auth) return NextResponse.json({ error: 'integration_not_found' }, { status: 404 });

  try {
    const result = body.provider === 'google'
      ? await googleCreateEvent(auth.accessToken, body.calendarId, body)
      : await microsoftCreateEvent(auth.accessToken, body.calendarId, body);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const uid = await getUidFromRequest(req);
  if (!uid) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json() as UpdatePayload;
  const auth = await getValidAccessToken(uid, body.provider);
  if (!auth) return NextResponse.json({ error: 'integration_not_found' }, { status: 404 });

  try {
    if (body.provider === 'google') {
      await googleUpdateEvent(auth.accessToken, body.calendarId, body.externalEventId, body);
    } else {
      await microsoftUpdateEvent(auth.accessToken, body.externalEventId, body);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const uid = await getUidFromRequest(req);
  if (!uid) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json() as DeletePayload;
  const auth = await getValidAccessToken(uid, body.provider);
  if (!auth) return NextResponse.json({ error: 'integration_not_found' }, { status: 404 });

  try {
    if (body.provider === 'google') {
      await googleDeleteEvent(auth.accessToken, body.calendarId, body.externalEventId);
    } else {
      await microsoftDeleteEvent(auth.accessToken, body.externalEventId);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
