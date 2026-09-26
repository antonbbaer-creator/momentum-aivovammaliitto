'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './auth';
import { QuickLink } from './link-types';

/**
 * useUserOrgLinks — käyttäjän omat pikalinkit aktiivisessa orgissa.
 * Polku: users/{uid}/orgLinks/{activeOrg}
 * Doc: { links: QuickLink[], ts: number }
 */
export function useUserOrgLinks(): [QuickLink[], (val: QuickLink[] | ((prev: QuickLink[]) => QuickLink[])) => void, boolean] {
  const { user, activeOrg } = useAuth();
  // Nollaa linkit ja lataustila renderissä, kun käyttäjä tai org vaihtuu (ei effektissä)
  const linksKey = user && activeOrg ? `${user.uid}/${activeOrg}` : '';
  const [prevLinksKey, setPrevLinksKey] = useState(linksKey);
  const [links, setLinksState] = useState<QuickLink[]>([]);
  const [loading, setLoading] = useState(() => linksKey !== '');
  if (linksKey !== prevLinksKey) {
    setPrevLinksKey(linksKey);
    setLinksState([]);
    setLoading(linksKey !== '');
  }
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const isLocalUpdate = useRef(false);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    isLocalUpdate.current = false;

    if (!user || !activeOrg) return;

    const ref = doc(db, 'users', user.uid, 'orgLinks', activeOrg);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const arr = Array.isArray(data.links) ? (data.links as QuickLink[]) : [];
        if (!isLocalUpdate.current) setLinksState(arr);
        isLocalUpdate.current = false;
      } else if (!isLocalUpdate.current) {
        setLinksState([]);
      }
      setLoading(false);
    }, (err) => {
      console.error('useUserOrgLinks listen error:', err);
      setLoading(false);
    });

    return () => unsub();
  }, [user, activeOrg]);

  const writeToFirestore = useCallback((next: QuickLink[]) => {
    if (!user || !activeOrg) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const ref = doc(db, 'users', user.uid, 'orgLinks', activeOrg);
        await setDoc(ref, { links: next, ts: Date.now() });
      } catch (e) {
        console.error('useUserOrgLinks write failed:', e);
      }
    }, 500);
  }, [user, activeOrg]);

  const setLinks = useCallback((valOrFn: QuickLink[] | ((prev: QuickLink[]) => QuickLink[])) => {
    setLinksState(prev => {
      const next = typeof valOrFn === 'function' ? (valOrFn as (p: QuickLink[]) => QuickLink[])(prev) : valOrFn;
      isLocalUpdate.current = true;
      writeToFirestore(next);
      return next;
    });
  }, [writeToFirestore]);

  return [links, setLinks, loading];
}
