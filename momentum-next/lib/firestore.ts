'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { doc, getDoc, setDoc, onSnapshot, collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './auth';

/**
 * writeOrgDataNow — kirjoittaa org-datan heti ja palauttaa vasta kun kirjoitus
 * on varmasti perillä Firestoressa. Käytä tätä kun tallennuksen onnistuminen
 * pitää varmistaa käyttäjälle (esim. muistiinpanon tallennus).
 */
export async function writeOrgDataNow<T>(orgId: string, key: string, value: T, uid: string): Promise<void> {
  const docRef = doc(db, 'organizations', orgId, 'data', key);
  await setDoc(docRef, {
    v: JSON.stringify(value),
    ts: Date.now(),
    updatedBy: uid,
  });
}

// Kesken olevien debounced-kirjoitusten flush-funktiot. Kun sivu piilotetaan
// tai suljetaan, kaikki odottavat kirjoitukset lähetetään heti — muuten
// 500 ms:n debounce-ikkunaan osunut tallennus katoaisi jäljettömiin.
const pendingFlushes = new Set<() => void>();

if (typeof window !== 'undefined') {
  const flushAll = () => { pendingFlushes.forEach(fn => fn()); };
  window.addEventListener('pagehide', flushAll);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAll();
  });
}

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
  // Odottava kirjoitus talteen refiin, jotta se voidaan lähettää heti
  // unmountissa / sivun piiloutuessa sen sijaan että se hylätään
  const pendingWriteRef = useRef<{ orgId: string; key: string; value: T; uid: string } | null>(null);
  // Pidetään default-arvoa refissä jotta useEffect voi käyttää sitä muuttamatta dep-listaa
  const defaultValueRef = useRef(defaultValue);
  defaultValueRef.current = defaultValue;
  // Throttle remote snapshot updates to avoid excessive re-renders
  const snapshotThrottleRef = useRef<NodeJS.Timeout | null>(null);
  const pendingSnapshotRef = useRef<T | null>(null);

  // Lähetä odottava debounced-kirjoitus heti. Kutsutaan kun key/org vaihtuu,
  // komponentti unmountataan tai sivu piiloutuu — kirjoitus menee alkuperäiseen
  // polkuunsa (orgId ja key talletettu payloadiin), joten se ei voi kadota
  // eikä mennä väärään dokumenttiin.
  const flushPendingWrite = useCallback(() => {
    const pending = pendingWriteRef.current;
    if (!pending) return;
    pendingWriteRef.current = null;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    writeOrgDataNow(pending.orgId, pending.key, pending.value, pending.uid)
      .catch(e => console.error(`Failed to flush ${pending.key}:`, e));
  }, []);

  // Rekisteröi flush sivunlaajuiseen pagehide/visibilitychange-käsittelyyn
  // ja aja se myös unmountissa.
  useEffect(() => {
    pendingFlushes.add(flushPendingWrite);
    return () => {
      pendingFlushes.delete(flushPendingWrite);
      flushPendingWrite();
    };
  }, [flushPendingWrite]);

  // Subscribe to real-time updates. Kun key tai org muuttuu,
  // nollataan tila default-arvoon jotta edellisen avaimen data ei vuoda uuteen.
  useEffect(() => {
    // Lähetä mahdollinen kesken oleva debounced kirjoitus heti —
    // se kuului edelliseen avaimeen eikä saa hävitä
    flushPendingWrite();
    if (snapshotThrottleRef.current) {
      clearTimeout(snapshotThrottleRef.current);
      snapshotThrottleRef.current = null;
    }
    pendingSnapshotRef.current = null;
    // Nollaa tila default-arvoon kun key vaihtuu (tai kirjautuminen muuttuu)
    setValueState(defaultValueRef.current);
    isLocalUpdate.current = false;

    if (!activeOrg || !user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const docRef = doc(db, 'organizations', activeOrg, 'data', key);
    let isFirst = true;

    const applyUpdate = (val: T) => {
      // First snapshot always applies immediately (initial load)
      if (isFirst) {
        isFirst = false;
        setValueState(val);
        setLoading(false);
        return;
      }
      // Throttle subsequent remote updates: max 1 per 150ms
      if (snapshotThrottleRef.current) {
        pendingSnapshotRef.current = val;
        return;
      }
      setValueState(val);
      setLoading(false);
      snapshotThrottleRef.current = setTimeout(() => {
        snapshotThrottleRef.current = null;
        if (pendingSnapshotRef.current !== null) {
          setValueState(pendingSnapshotRef.current as T);
          pendingSnapshotRef.current = null;
        }
      }, 150);
    };

    const unsub = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        try {
          const data = snap.data();
          const parsed = JSON.parse(data.v) as T;
          // Only update if this wasn't our own write
          if (!isLocalUpdate.current) {
            applyUpdate(parsed);
          } else {
            isFirst = false; // count local writes towards first-load flag
          }
          isLocalUpdate.current = false;
        } catch (e) {
          console.warn(`Failed to parse ${key}:`, e);
        }
      } else {
        // Dokumenttia ei ole vielä olemassa — varmistetaan että tila on default
        if (!isLocalUpdate.current) {
          applyUpdate(defaultValueRef.current);
        }
      }
      setLoading(false);
    }, (err) => {
      console.error(`Firestore listen error for ${key}:`, err);
      setLoading(false);
    });

    return () => {
      unsub();
      if (snapshotThrottleRef.current) {
        clearTimeout(snapshotThrottleRef.current);
        snapshotThrottleRef.current = null;
      }
    };
  }, [activeOrg, user, key, flushPendingWrite]);

  // Debounced write to Firestore (blocked for visitors)
  const writeToFirestore = useCallback((newVal: T) => {
    if (!activeOrg || !user || !canEdit) return;

    pendingWriteRef.current = { orgId: activeOrg, key, value: newVal, uid: user.uid };
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      debounceRef.current = null;
      const pending = pendingWriteRef.current;
      pendingWriteRef.current = null;
      if (!pending) return;
      try {
        await writeOrgDataNow(pending.orgId, pending.key, pending.value, pending.uid);
      } catch (e) {
        console.error(`Failed to write ${key}:`, e);
      }
    }, 500);
  }, [activeOrg, user, key, canEdit]);

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
