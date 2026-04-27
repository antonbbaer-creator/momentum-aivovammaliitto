'use client';

import { useEffect, useMemo, useState } from 'react';
import { useUserData } from './use-user-data';
import {
  ExternalEvent,
  ExternalEventsDoc,
  externalEventsKey,
} from './integrations-shared';
import { useIntegrationApi } from './use-integrations';

/**
 * useExternalEvents — lue pollatut tapahtumat + triggaa fresh poll
 * jos viimeisin haku on yli `maxStaleMs` vanha.
 */
export function useExternalEvents(autoPollMs = 15 * 60_000): {
  events: ExternalEvent[];
  lastFetchedAt: number;
  loading: boolean;
  pollNow: () => Promise<void>;
} {
  const [docVal] = useUserData<ExternalEventsDoc>(externalEventsKey, {
    events: [],
    windowStart: '',
    windowEnd: '',
    lastFetchedAt: 0,
  });
  const api = useIntegrationApi();
  const [polling, setPolling] = useState(false);

  // Auto-poll jos vanhentunut
  useEffect(() => {
    const stale = Date.now() - (docVal.lastFetchedAt || 0) > autoPollMs;
    if (stale && !polling) {
      setPolling(true);
      api.pollNow()
        .catch((e) => console.warn('Auto-poll failed:', e))
        .finally(() => setPolling(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docVal.lastFetchedAt]);

  const events = useMemo(() => docVal.events || [], [docVal.events]);

  return {
    events,
    lastFetchedAt: docVal.lastFetchedAt || 0,
    loading: polling,
    pollNow: async () => {
      setPolling(true);
      try { await api.pollNow(); } finally { setPolling(false); }
    },
  };
}
