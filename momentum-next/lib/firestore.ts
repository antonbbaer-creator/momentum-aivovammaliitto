'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { doc, getDoc, setDoc, onSnapshot, collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './auth';

/**
 * useOrgData — reads/writes org-scoped data from Firestore
 * Path: /organizations/{orgId}/data/{key}
 * Document format: { v: JSON.stringify(value), ts: number, updatedBy: uid }
 */
export function useOrgData<T>(key: string, defaultValue: T): [T, (val: T | ((prev: T) => T)) => void, boolean] {
  const { user, activeOrg, canEdit } = useAuth();
  const [value, setValueState] = useState<T>(defaultValue);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const isLocalUpdate = useRef(false);
  // Pidetään default-arvoa refissä jotta useEffect voi käyttää sitä muuttamatta dep-listaa
  const defaultValueRef = useRef(defaultValue);
  defaultValueRef.current = defaultValue;

  // Subscribe to real-time updates. Kun key tai org muuttuu,
  // nollataan tila default-arvoon jotta edellisen avaimen data ei vuoda uuteen.
  useEffect(() => {
    // Peruuta mahdollinen kesken oleva debounced kirjoitus — se kuului edelliseen avaimeen
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    // Nollaa tila default-arvoon kun key vaihtuu (tai kirjautuminen muuttuu)
    setValueState(defaultValueRef.current);
    isLocalUpdate.current = false;

    if (!activeOrg || !user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const docRef = doc(db, 'organizations', activeOrg, 'data', key);

    const unsub = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        try {
          const data = snap.data();
          const parsed = JSON.parse(data.v) as T;
          // Only update if this wasn't our own write
          if (!isLocalUpdate.current) {
            setValueState(parsed);
          }
          isLocalUpdate.current = false;
        } catch (e) {
          console.warn(`Failed to parse ${key}:`, e);
        }
      } else {
        // Dokumenttia ei ole vielä olemassa — varmistetaan että tila on default
        if (!isLocalUpdate.current) {
          setValueState(defaultValueRef.current);
        }
      }
      setLoading(false);
    }, (err) => {
      console.error(`Firestore listen error for ${key}:`, err);
      setLoading(false);
    });

    return () => unsub();
  }, [activeOrg, user, key]);

  // Debounced write to Firestore (blocked for visitors)
  const writeToFirestore = useCallback((newVal: T) => {
    if (!activeOrg || !user || !canEdit) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const docRef = doc(db, 'organizations', activeOrg, 'data', key);
        await setDoc(docRef, {
          v: JSON.stringify(newVal),
          ts: Date.now(),
          updatedBy: user.uid,
        });
      } catch (e) {
        console.error(`Failed to write ${key}:`, e);
      }
    }, 500);
  }, [activeOrg, user, key]);

  const setValue = useCallback((valOrFn: T | ((prev: T) => T)) => {
    setValueState(prev => {
      const next = typeof valOrFn === 'function' ? (valOrFn as (prev: T) => T)(prev) : valOrFn;
      isLocalUpdate.current = true;
      writeToFirestore(next);
      return next;
    });
  }, [writeToFirestore]);

  return [value, setValue, loading];
}

/**
 * useOrgProfile — reads/writes the org profile document
 * Path: /organizations/{orgId}
 */
export function useOrgProfile() {
  const { activeOrg, user } = useAuth();
  const [org, setOrg] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeOrg) return;
    const unsub = onSnapshot(doc(db, 'organizations', activeOrg), (snap) => {
      if (snap.exists()) setOrg({ id: snap.id, ...snap.data() });
      setLoading(false);
    });
    return () => unsub();
  }, [activeOrg]);

  const updateOrg = async (updates: Record<string, any>) => {
    if (!activeOrg) return;
    await setDoc(doc(db, 'organizations', activeOrg), updates, { merge: true });
  };

  return { org, updateOrg, loading };
}

/**
 * Bulk read all org data keys at once (for initial hydration)
 */
export async function fetchAllOrgData(orgId: string): Promise<Record<string, any>> {
  const snap = await getDocs(collection(db, 'organizations', orgId, 'data'));
  const result: Record<string, any> = {};
  snap.forEach(doc => {
    try {
      result[doc.id] = JSON.parse(doc.data().v);
    } catch (e) {
      result[doc.id] = doc.data().v;
    }
  });
  return result;
}
