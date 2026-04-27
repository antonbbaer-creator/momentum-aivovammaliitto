'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './auth';

/**
 * useUserData — käyttäjäkohtainen henkilökohtainen tila.
 * Polku: users/{uid}/personalData/{key}
 * Doc: { v: JSON.stringify(value), ts: number, updatedBy: uid }
 *
 * Toimii kuten useOrgData mutta käyttäjän alla — ei org-kontekstia.
 * Kirjoitus on aina sallittu omistajalle (canEdit ei rajoita).
 */
export function useUserData<T>(
  key: string,
  defaultValue: T,
): [T, (val: T | ((prev: T) => T)) => void, boolean] {
  const { user } = useAuth();
  const [value, setValueState] = useState<T>(defaultValue);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const isLocalUpdate = useRef(false);
  const defaultValueRef = useRef(defaultValue);
  defaultValueRef.current = defaultValue;

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    setValueState(defaultValueRef.current);
    isLocalUpdate.current = false;

    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const ref = doc(db, 'users', user.uid, 'personalData', key);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          try {
            const data = snap.data();
            const parsed = JSON.parse(data.v) as T;
            if (!isLocalUpdate.current) setValueState(parsed);
            isLocalUpdate.current = false;
          } catch (e) {
            console.warn(`useUserData parse failed for ${key}:`, e);
          }
        } else if (!isLocalUpdate.current) {
          setValueState(defaultValueRef.current);
        }
        setLoading(false);
      },
      (err) => {
        console.error(`useUserData listen error for ${key}:`, err);
        setLoading(false);
      },
    );

    return () => unsub();
  }, [user, key]);

  const writeToFirestore = useCallback(
    (next: T) => {
      if (!user) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        try {
          const ref = doc(db, 'users', user.uid, 'personalData', key);
          await setDoc(ref, {
            v: JSON.stringify(next),
            ts: Date.now(),
            updatedBy: user.uid,
          });
        } catch (e) {
          console.error(`useUserData write failed for ${key}:`, e);
        }
      }, 500);
    },
    [user, key],
  );

  const setValue = useCallback(
    (valOrFn: T | ((prev: T) => T)) => {
      setValueState((prev) => {
        const next = typeof valOrFn === 'function' ? (valOrFn as (p: T) => T)(prev) : valOrFn;
        isLocalUpdate.current = true;
        writeToFirestore(next);
        return next;
      });
    },
    [writeToFirestore],
  );

  return [value, setValue, loading];
}
