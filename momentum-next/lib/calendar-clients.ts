// Server-side: Google Calendar + Microsoft Graph -kutsujen keskittäminen.
// Käytetään API-route-handlereista (poll, push, delete).

import { CalendarProvider, ExternalEvent } from './integrations-shared';

// --- Apurit päivämäärille ---

const toLocalISO = (s: string): string => {
  // Google/Graph palauttaa esim. "2026-04-27T09:00:00+03:00" tai date "2026-04-27".
  // Pidetään lyhyenä paikallisena: "YYYY-MM-DDTHH:MM"
  if (!s) return s;
  if (s.length === 10) return s; // all-day date
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
};

// --- GOOGLE ---

interface GoogleEvent {
  id: string;
  summary?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  status?: string;
  htmlLink?: string;
  recurringEventId?: string;
}

export async function googleListEvents(
  accessToken: string,
  calendarId: string,
  timeMinISO: string,
  timeMaxISO: string,
): Promise<ExternalEvent[]> {
  const params = new URLSearchParams({
    timeMin: new Date(timeMinISO).toISOString(),
    timeMax: new Date(timeMaxISO).toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '500',
  });
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    throw new Error(`Google list events failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json() as { items: GoogleEvent[] };
  return (data.items || [])
    .filter(e => e.status !== 'cancelled')
    .map(e => ({
      id: `google:${e.id}`,
      source: 'google' as CalendarProvider,
      calendarId,
      externalEventId: e.id,
      title: e.summary || '(ei otsikkoa)',
      start: toLocalISO(e.start.dateTime || e.start.date || ''),
      end: toLocalISO(e.end.dateTime || e.end.date || ''),
      allDay: !e.start.dateTime,
      recurringId: e.recurringEventId,
      htmlLink: e.htmlLink,
      updatedAt: Date.now(),
    }));
}

export async function googleCreateEvent(
  accessToken: string,
  calendarId: string,
  block: { title: string; start: string; end: string },
): Promise<{ externalEventId: string; htmlLink?: string }> {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  const body = {
    summary: block.title || '(Momentum)',
    start: { dateTime: new Date(block.start).toISOString() },
    end: { dateTime: new Date(block.end).toISOString() },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Google create failed: ${await res.text()}`);
  const data = await res.json() as { id: string; htmlLink?: string };
  return { externalEventId: data.id, htmlLink: data.htmlLink };
}

export async function googleUpdateEvent(
  accessToken: string,
  calendarId: string,
  externalEventId: string,
  block: { title: string; start: string; end: string },
): Promise<void> {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${externalEventId}`;
  const body = {
    summary: block.title || '(Momentum)',
    start: { dateTime: new Date(block.start).toISOString() },
    end: { dateTime: new Date(block.end).toISOString() },
  };
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Google update failed: ${await res.text()}`);
}

export async function googleDeleteEvent(
  accessToken: string,
  calendarId: string,
  externalEventId: string,
): Promise<void> {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${externalEventId}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 410 && res.status !== 404) {
    throw new Error(`Google delete failed: ${await res.text()}`);
  }
}

// --- MICROSOFT GRAPH ---

interface GraphEvent {
  id: string;
  subject?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  isAllDay?: boolean;
  webLink?: string;
  seriesMasterId?: string;
}

export async function microsoftListEvents(
  accessToken: string,
  calendarId: string,
  timeMinISO: string,
  timeMaxISO: string,
): Promise<ExternalEvent[]> {
  // Käytetään calendarView jotta toistuvat tapahtumat laajennetaan automaattisesti.
  const params = new URLSearchParams({
    startDateTime: new Date(timeMinISO).toISOString(),
    endDateTime: new Date(timeMaxISO).toISOString(),
    $top: '500',
    $orderby: 'start/dateTime',
  });
  const url = `https://graph.microsoft.com/v1.0/me/calendars/${calendarId}/calendarView?${params}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Prefer: 'outlook.timezone="Europe/Helsinki"',
    },
  });
  if (!res.ok) {
    throw new Error(`MS list events failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json() as { value: GraphEvent[] };
  return (data.value || []).map(e => ({
    id: `microsoft:${e.id}`,
    source: 'microsoft' as CalendarProvider,
    calendarId,
    externalEventId: e.id,
    title: e.subject || '(ei otsikkoa)',
    start: toLocalISO(e.start.dateTime),
    end: toLocalISO(e.end.dateTime),
    allDay: e.isAllDay,
    recurringId: e.seriesMasterId,
    htmlLink: e.webLink,
    updatedAt: Date.now(),
  }));
}

export async function microsoftCreateEvent(
  accessToken: string,
  calendarId: string,
  block: { title: string; start: string; end: string },
): Promise<{ externalEventId: string; htmlLink?: string }> {
  const url = `https://graph.microsoft.com/v1.0/me/calendars/${calendarId}/events`;
  const body = {
    subject: block.title || '(Momentum)',
    start: { dateTime: block.start, timeZone: 'Europe/Helsinki' },
    end: { dateTime: block.end, timeZone: 'Europe/Helsinki' },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`MS create failed: ${await res.text()}`);
  const data = await res.json() as { id: string; webLink?: string };
  return { externalEventId: data.id, htmlLink: data.webLink };
}

export async function microsoftUpdateEvent(
  accessToken: string,
  externalEventId: string,
  block: { title: string; start: string; end: string },
): Promise<void> {
  const url = `https://graph.microsoft.com/v1.0/me/events/${externalEventId}`;
  const body = {
    subject: block.title || '(Momentum)',
    start: { dateTime: block.start, timeZone: 'Europe/Helsinki' },
    end: { dateTime: block.end, timeZone: 'Europe/Helsinki' },
  };
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`MS update failed: ${await res.text()}`);
}

export async function microsoftDeleteEvent(
  accessToken: string,
  externalEventId: string,
): Promise<void> {
  const url = `https://graph.microsoft.com/v1.0/me/events/${externalEventId}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`MS delete failed: ${await res.text()}`);
  }
}
