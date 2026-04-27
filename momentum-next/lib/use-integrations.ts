'use client';

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './auth';
import {
  CalendarMeta,
  CalendarProvider,
  IntegrationDoc,
} from './integrations-shared';

/** Lue käyttäjän integraatio-doc kerralla (Google + Microsoft). */
export function useIntegrations(): {
  google: IntegrationDoc | null;
  microsoft: IntegrationDoc | null;
  loading: boolean;
} {
  const { user } = useAuth();
  const [google, setGoogle] = useState<IntegrationDoc | null>(null);
  const [microsoft, setMicrosoft] = useState<IntegrationDoc | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setGoogle(null); setMicrosoft(null); setLoading(false);
      return;
    }
    setLoading(true);
    const unsubs = [
      onSnapshot(doc(db, 'users', user.uid, 'integrations', 'google'),
        (snap) => setGoogle(snap.exists() ? (snap.data() as IntegrationDoc) : null)),
      onSnapshot(doc(db, 'users', user.uid, 'integrations', 'microsoft'),
        (snap) => setMicrosoft(snap.exists() ? (snap.data() as IntegrationDoc) : null)),
    ];
    setLoading(false);
    return () => { for (const u of unsubs) u(); };
  }, [user]);

  return { google, microsoft, loading };
}

// --- API-clientti (käyttää Firebase ID-tokenia) ---

async function authedFetch(input: string, init: RequestInit, getToken: () => Promise<string>) {
  const token = await getToken();
  return fetch(input, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
}

export function useIntegrationApi() {
  const { user } = useAuth();
  const getToken = async () => {
    if (!user) throw new Error('Ei kirjautunutta käyttäjää');
    return user.getIdToken();
  };

  return {
    pollNow: async () => {
      const r = await authedFetch('/api/calendars/poll', { method: 'POST' }, getToken);
      if (!r.ok) throw new Error(`Poll epäonnistui: ${r.status}`);
      return r.json();
    },
    updateCalendars: async (provider: CalendarProvider, calendars: CalendarMeta[]) => {
      const r = await authedFetch('/api/calendars/integration', {
        method: 'PATCH',
        body: JSON.stringify({ provider, calendars }),
      }, getToken);
      if (!r.ok) throw new Error(`P\u00e4ivitys ep\u00e4onnistui: ${r.status}`);
      return r.json();
    },
    disconnect: async (provider: CalendarProvider) => {
      const r = await authedFetch(`/api/calendars/integration?provider=${provider}`, {
        method: 'DELETE',
      }, getToken);
      if (!r.ok) throw new Error(`Poisto ep\u00e4onnistui: ${r.status}`);
      return r.json();
    },
    pushEvent: async (
      verb: 'POST' | 'PATCH' | 'DELETE',
      payload: Record<string, unknown>,
    ) => {
      const r = await authedFetch('/api/calendars/event', {
        method: verb,
        body: JSON.stringify(payload),
      }, getToken);
      if (!r.ok) throw new Error(`Push ep\u00e4onnistui: ${r.status}`);
      return r.json();
    },
  };
}
