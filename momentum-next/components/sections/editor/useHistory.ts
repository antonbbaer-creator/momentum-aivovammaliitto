'use client';

/*
 * useHistory — design-tason undo/redo-stack muistissa.
 *
 * Drop-in useState-korvaaja. Kaikki setState-kutsut tallentuvat stackiin,
 * paitsi jos `opts.coalesce` -avain yhdistää peräkkäisiä kutsuja (esim.
 * raahauksen aikana) tai `opts.replace` ohittaa historiakirjauksen kokonaan
 * (esim. ohimenevälle esikatselulle).
 *
 * `reset(next)` tyhjentää historian ja asettaa tilan — käyttö mm. kun
 * toinen design ladataan Firestoresta, ettei vanha historia vuoda uuteen.
 */

import { useCallback, useRef, useState } from 'react';

interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

export interface HistoryController<T> {
  state: T;
  setState: (
    updater: T | ((prev: T) => T),
    opts?: { coalesce?: string; replace?: boolean }
  ) => void;
  undo: () => void;
  redo: () => void;
  reset: (next: T) => void;
  canUndo: boolean;
  canRedo: boolean;
}

const MAX_HISTORY = 100;
const COALESCE_WINDOW_MS = 500;

export function useHistory<T>(initial: T | (() => T)): HistoryController<T> {
  const [history, setHistory] = useState<HistoryState<T>>(() => ({
    past: [],
    present: typeof initial === 'function' ? (initial as () => T)() : initial,
    future: [],
  }));
  const coalesceRef = useRef<{ key: string; ts: number } | null>(null);

  const setState = useCallback<HistoryController<T>['setState']>((updater, opts) => {
    setHistory(h => {
      const next =
        typeof updater === 'function'
          ? (updater as (p: T) => T)(h.present)
          : updater;
      if (Object.is(next, h.present)) return h;

      if (opts?.replace) {
        return { past: h.past, present: next, future: h.future };
      }

      const coalKey = opts?.coalesce;
      const now = Date.now();
      if (
        coalKey &&
        coalesceRef.current?.key === coalKey &&
        now - coalesceRef.current.ts < COALESCE_WINDOW_MS
      ) {
        coalesceRef.current.ts = now;
        return { past: h.past, present: next, future: [] };
      }
      coalesceRef.current = coalKey ? { key: coalKey, ts: now } : null;

      const past = [...h.past, h.present];
      if (past.length > MAX_HISTORY) past.shift();
      return { past, present: next, future: [] };
    });
  }, []);

  const undo = useCallback(() => {
    setHistory(h => {
      if (!h.past.length) return h;
      const past = h.past.slice(0, -1);
      const present = h.past[h.past.length - 1];
      const future = [h.present, ...h.future];
      coalesceRef.current = null;
      return { past, present, future };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory(h => {
      if (!h.future.length) return h;
      const [present, ...rest] = h.future;
      const past = [...h.past, h.present];
      coalesceRef.current = null;
      return { past, present, future: rest };
    });
  }, []);

  const reset = useCallback((next: T) => {
    coalesceRef.current = null;
    setHistory({ past: [], present: next, future: [] });
  }, []);

  return {
    state: history.present,
    setState,
    undo,
    redo,
    reset,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}
