'use client';

// Aivojen selainpuoli: reaaliaikaiset lukukoukut (Firestore onSnapshot, säännöt rajaavat orgiin)
// ja brainApi-apuri kirjoituksiin (/api/brain/*, Firebase ID-token otsakkeessa).
// Selain ei kirjoita Firestoreen suoraan: jokainen muutos kulkee palvelimen kautta versioineen.

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, orderBy, query, where, limit as qLimit } from 'firebase/firestore';
import { auth, db } from './firebase';
import { useAuth } from './auth';
import {
  BRAIN_COLLECTIONS as C, canEditBrain, canAdminBrain,
  type BrainSection, type BrainNote, type BrainRevision, type BrainProposal, type BrainDecision, type BrainGoal,
  type BrainMetricEntry, type BrainInboxEntry, type BrainTemplate, type BrainView, type BrainAuditEntry, type BrainRole,
} from './brain-shared';

export class BrainApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Kutsuu /api/brain-reittiä käyttäjän Firebase-tokenilla. Heittää BrainApiErrorin suomenkielisellä viestillä. */
export async function brainApi<T = unknown>(path: string, opts: { method?: 'GET' | 'POST'; body?: unknown; query?: Record<string, string> } = {}): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new BrainApiError(401, 'Kirjaudu sisään');
  const token = await user.getIdToken();
  const qs = opts.query ? '?' + new URLSearchParams(opts.query).toString() : '';
  const res = await fetch(`/api/brain/${path}${qs}`, {
    method: opts.method || (opts.body ? 'POST' : 'GET'),
    headers: { Authorization: `Bearer ${token}`, ...(opts.body ? { 'content-type': 'application/json' } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new BrainApiError(res.status, data.error || `Virhe ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/** Lataa tiedoston (esim. viennin zip) ja käynnistää selaimen latauksen. */
export async function brainDownload(path: string, queryParams: Record<string, string>, fallbackName: string) {
  const user = auth.currentUser;
  if (!user) throw new BrainApiError(401, 'Kirjaudu sisään');
  const token = await user.getIdToken();
  const res = await fetch(`/api/brain/${path}?${new URLSearchParams(queryParams)}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new BrainApiError(res.status, data.error || `Virhe ${res.status}`);
  }
  const blob = await res.blob();
  const name = (res.headers.get('content-disposition') || '').match(/filename="([^"]+)"/)?.[1] || fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Aktiivinen org ja käyttäjän oikeudet aivoihin. */
export function useBrainAccess() {
  const { activeOrg, activeOrgRole, user } = useAuth();
  const role = (activeOrgRole as BrainRole | null) ?? null;
  return {
    orgId: activeOrg,
    role,
    canEdit: canEditBrain(role),
    canAdmin: canAdminBrain(role),
    userName: user?.displayName || user?.email || '',
  };
}

interface Snap<T> { data: T; loading: boolean; error: string | null }

// Tila avaimella: kun org tai polku vaihtuu, vanha data ei näy uuden lataamisen ajan
function useCollection<T>(key: string | null, build: () => ReturnType<typeof query> | null): Snap<T[]> {
  const [state, setState] = useState<{ key: string | null; data: T[]; error: string | null; loaded: boolean }>({ key: null, data: [], error: null, loaded: false });
  useEffect(() => {
    const q = build();
    if (!q || !key) return;
    const unsub = onSnapshot(
      q,
      snap => setState({ key, data: snap.docs.map(d => d.data() as T), error: null, loaded: true }),
      err => setState({ key, data: [], error: err.code === 'permission-denied' ? 'Ei oikeutta' : 'Lataus epäonnistui', loaded: true }),
    );
    return () => unsub();
    // build muuttuu joka renderissä, key kuvaa kyselyn
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const current = state.key === key;
  return { data: current ? state.data : [], loading: !!key && (!current || !state.loaded), error: current ? state.error : null };
}

const orgCol = (orgId: string, name: string) => collection(db, 'organizations', orgId, name);

export function useBrainSections(orgId: string | null) {
  const s = useCollection<BrainSection>(orgId ? `sec:${orgId}` : null, () => orgId ? query(orgCol(orgId, C.sections), orderBy('sortOrder')) : null);
  return s;
}

export function useBrainNotes(orgId: string | null) {
  return useCollection<BrainNote>(orgId ? `notes:${orgId}` : null, () => orgId ? query(orgCol(orgId, C.notes)) : null);
}

export function useBrainBacklinks(orgId: string | null, slug: string | null) {
  return useCollection<BrainNote>(orgId && slug ? `bl:${orgId}:${slug}` : null, () => orgId && slug ? query(orgCol(orgId, C.notes), where('linksOut', 'array-contains', slug)) : null);
}

export function useBrainRevisions(orgId: string | null, slug: string | null) {
  return useCollection<BrainRevision>(orgId && slug ? `rev:${orgId}:${slug}` : null, () => orgId && slug ? query(collection(db, 'organizations', orgId, C.notes, slug, C.revisions), orderBy('version', 'desc'), qLimit(100)) : null);
}

export function useBrainProposals(orgId: string | null) {
  return useCollection<BrainProposal>(orgId ? `prop:${orgId}` : null, () => orgId ? query(orgCol(orgId, C.proposals)) : null);
}

export function useBrainDecisions(orgId: string | null) {
  return useCollection<BrainDecision>(orgId ? `dec:${orgId}` : null, () => orgId ? query(orgCol(orgId, C.decisions)) : null);
}

export function useBrainGoals(orgId: string | null) {
  return useCollection<BrainGoal>(orgId ? `goal:${orgId}` : null, () => orgId ? query(orgCol(orgId, C.goals)) : null);
}

export function useBrainMetrics(orgId: string | null) {
  return useCollection<BrainMetricEntry>(orgId ? `met:${orgId}` : null, () => orgId ? query(orgCol(orgId, C.metrics)) : null);
}

export function useBrainInbox(orgId: string | null) {
  return useCollection<BrainInboxEntry>(orgId ? `inbox:${orgId}` : null, () => orgId ? query(orgCol(orgId, C.inbox), orderBy('createdAt', 'desc'), qLimit(200)) : null);
}

export function useBrainTemplates(orgId: string | null) {
  return useCollection<BrainTemplate>(orgId ? `tpl:${orgId}` : null, () => orgId ? query(orgCol(orgId, C.templates)) : null);
}

export function useBrainViews(orgId: string | null) {
  return useCollection<BrainView>(orgId ? `view:${orgId}` : null, () => orgId ? query(orgCol(orgId, C.views)) : null);
}

export function useBrainAudit(orgId: string | null, enabled: boolean) {
  return useCollection<BrainAuditEntry>(orgId && enabled ? `audit:${orgId}` : null, () => orgId && enabled ? query(orgCol(orgId, C.audit), orderBy('createdAt', 'desc'), qLimit(200)) : null);
}

/** Yksittäinen muistiinpano reaaliaikaisesti. */
export function useBrainNote(orgId: string | null, slug: string | null): Snap<BrainNote | null> {
  const key = orgId && slug ? `${orgId}:${slug}` : null;
  const [state, setState] = useState<{ key: string | null; data: BrainNote | null; error: string | null; loaded: boolean }>({ key: null, data: null, error: null, loaded: false });
  useEffect(() => {
    if (!orgId || !slug) return;
    const k = `${orgId}:${slug}`;
    const unsub = onSnapshot(
      doc(db, 'organizations', orgId, C.notes, slug),
      snap => setState({ key: k, data: snap.exists() ? (snap.data() as BrainNote) : null, error: null, loaded: true }),
      err => setState({ key: k, data: null, error: err.code === 'permission-denied' ? 'Ei oikeutta' : 'Lataus epäonnistui', loaded: true }),
    );
    return () => unsub();
  }, [orgId, slug]);
  const current = state.key === key;
  return { data: current ? state.data : null, loading: !!key && (!current || !state.loaded), error: current ? state.error : null };
}

/** Nimi → muistiinpano (wikilinkkien ratkaisu selaimessa). */
export function useNoteIndex(notes: BrainNote[]) {
  return useMemo(() => {
    const byKey = new Map<string, BrainNote>();
    const bySlug = new Map<string, BrainNote>();
    for (const n of notes) {
      byKey.set(n.nameKey, n);
      bySlug.set(n.slug, n);
    }
    return { byKey, bySlug };
  }, [notes]);
}
