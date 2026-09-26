// Aivojen palvelinkerros: kaikki kirjoitukset kulkevat tämän kautta (API-reitit, agenttirajapinta).
// Selain ei kirjoita aivoihin suoraan (firestore.rules), joten jokainen muutos saa version ja audit-rivin.
//
// Tunnistus:
//   käyttäjä  Authorization: Bearer <Firebase ID token>  + rooli organizations/{orgId}/members/{uid}
//   agentti   Authorization: Bearer mbt_…                → brainAgentTokens/{sha256}, scopet, peruttavissa
//
// Ei lokiteta sisältöä (muistiinpanoja, kirjauksia) console-lokeihin: vain tunnisteet ja virhetyypit.

import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import type { Firestore, Transaction, DocumentReference, DocumentData } from 'firebase-admin/firestore';
import { createHash, randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { adminDb } from './firebase-admin';
import { isSuperAdminEmail } from './super-admins';
import {
  BRAIN_COLLECTIONS as C, AGENT_TOKENS_COLLECTION, AGENT_TOKEN_PREFIX, AGENT_SCOPES,
  slugify, nameKey, computeLinks, extractReviewItems, isDraftNotDecision, renameLinks, appendToBody, searchNotes,
  todayIso, canEditBrain, canAdminBrain, isBrainEnabledOrg,
  type BrainNote, type BrainRevision, type BrainRole, type ChangeSource, type NoteKind, type AgentScope,
  type BrainProposal, type BrainDecision, type BrainOperation, type BrainMetricEntry, type BrainGoal, type AgentTokenInfo,
  type BrainInboxEntry, type InboxChannel,
} from './brain-shared';

// ── Virheet ja vastaukset ───────────────────────────────────────

export class BrainError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Ajaa reitin käsittelijän ja muuntaa virheet JSON-vastauksiksi ilman sisältöä lokeihin. */
export async function handle(fn: () => Promise<unknown>): Promise<Response> {
  try {
    const out = await fn();
    if (out instanceof Response) return out;
    return NextResponse.json(out ?? { ok: true });
  } catch (e) {
    if (e instanceof BrainError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[brain] odottamaton virhe:', e instanceof Error ? e.name + ': ' + e.message.slice(0, 200) : 'tuntematon');
    return NextResponse.json({ error: 'Palvelinvirhe. Yritä uudelleen.' }, { status: 500 });
  }
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const b = await req.json();
    return b && typeof b === 'object' ? (b as Record<string, unknown>) : {};
  } catch {
    throw new BrainError(400, 'Virheellinen pyynnön runko');
  }
}

export const str = (v: unknown, max = 2000): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// Firestore-dokumentin tunniste: admin-SDK hyväksyy kauttaviivat polkuina (doc('a/b/c')), joten jokainen
// ulkoa tuleva tunniste validoidaan. slugify, newId ja stableId tuottavat tähän sopivia tunnisteita.
const ID_RE = /^[a-z0-9][a-z0-9-]{0,119}$/i;

export function isDocId(v: unknown): v is string {
  return typeof v === 'string' && ID_RE.test(v);
}

export function docId(v: unknown, what = 'tunniste'): string {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!ID_RE.test(s)) throw new BrainError(400, `Virheellinen ${what}`);
  return s;
}

/** Valinnainen tunniste: tyhjä → null, virheellinen → null (tekoälyn ja agentin syötteet). */
function optId(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : '';
  return s && ID_RE.test(s) ? s : null;
}

/** Poistaa undefined-kentät (Firestore ei hyväksy niitä). */
export function clean<T>(o: T): T {
  return JSON.parse(JSON.stringify(o)) as T;
}

// ── Tunnistus ───────────────────────────────────────────────────

export interface BrainActor {
  type: 'user' | 'agent';
  id: string;                 // uid tai tokenin tunniste
  name: string;
  orgId: string;
  role: BrainRole | 'agent';
  scopes?: AgentScope[];
  idToken?: string;           // käyttäjän token (välitetään workerille litteroinnissa)
}

export type Need = 'read' | 'edit' | 'admin';

function bearer(req: Request): string | null {
  const m = (req.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

export function validOrgId(orgId: unknown): string {
  const o = typeof orgId === 'string' ? orgId.trim() : '';
  if (!o || !/^[a-z0-9][a-z0-9-]{0,80}$/i.test(o)) throw new BrainError(400, 'orgId puuttuu tai on virheellinen');
  if (!isBrainEnabledOrg(o)) throw new BrainError(403, 'Aivot eivät ole käytössä tässä organisaatiossa');
  return o;
}

/** Käyttäjä: Firebase ID token + jäsenyys ja rooli orgissa. Super-admin saa omistajan oikeudet. */
export async function requireUser(req: Request, orgIdRaw: unknown, need: Need): Promise<BrainActor> {
  const orgId = validOrgId(orgIdRaw);
  const token = bearer(req);
  if (!token || token.startsWith(AGENT_TOKEN_PREFIX)) throw new BrainError(401, 'Kirjaudu sisään');
  const db = adminDb();
  let decoded: DecodedIdToken;
  try {
    decoded = await getAuth().verifyIdToken(token);
  } catch {
    throw new BrainError(401, 'Istunto on vanhentunut. Kirjaudu uudelleen.');
  }
  let role: BrainRole | null = null;
  if (decoded.email_verified && isSuperAdminEmail(decoded.email)) role = 'owner';
  else {
    const m = await db.doc(`organizations/${orgId}/members/${decoded.uid}`).get();
    const r = m.exists ? String(m.data()?.role || '') : '';
    if (r === 'owner' || r === 'admin' || r === 'member' || r === 'visitor') role = r;
  }
  if (!role) throw new BrainError(403, 'Et ole tämän organisaation jäsen');
  if (need === 'edit' && !canEditBrain(role)) throw new BrainError(403, 'Lukuoikeudella ei voi muokata aivoja');
  if (need === 'admin' && !canAdminBrain(role)) throw new BrainError(403, 'Vain omistaja tai ylläpitäjä voi tehdä tämän');
  return {
    type: 'user', id: decoded.uid, name: String(decoded.name || decoded.email || decoded.uid), orgId, role, idToken: token,
  };
}

export function hashToken(plain: string): string {
  return createHash('sha256').update(plain, 'utf8').digest('hex');
}

/** Agentti: organisaatiokohtainen token, rajatut oikeudet. Jokainen käyttö päivittää lastUsedAt. */
export async function requireAgent(req: Request, scope: AgentScope): Promise<BrainActor> {
  const token = bearer(req);
  if (!token || !token.startsWith(AGENT_TOKEN_PREFIX) || token.length < 30 || token.length > 200) {
    throw new BrainError(401, 'Agenttitoken puuttuu tai on virheellinen');
  }
  const db = adminDb();
  const hash = hashToken(token);
  const ref = db.collection(AGENT_TOKENS_COLLECTION).doc(hash);
  const snap = await ref.get();
  const d = snap.data();
  if (!snap.exists || !d || d.revokedAt) throw new BrainError(401, 'Agenttitoken ei ole voimassa');
  if (!isBrainEnabledOrg(String(d.orgId))) throw new BrainError(403, 'Aivot eivät ole käytössä tässä organisaatiossa');
  if (d.expiresAt && Date.now() > Number(d.expiresAt)) throw new BrainError(401, 'Agenttitoken on vanhentunut. Luo uusi Asetuksissa.');
  // Token on voimassa vain niin kauan kuin sen luoja on orgin omistaja tai ylläpitäjä
  if (!d.createdBySuperAdmin) {
    if (!d.createdByUid) throw new BrainError(401, 'Agenttitoken on vanhaa muotoa. Luo uusi Asetuksissa.');
    const m = await db.doc(`organizations/${String(d.orgId)}/members/${String(d.createdByUid)}`).get();
    const r = m.exists ? String(m.data()?.role || '') : '';
    if (r !== 'owner' && r !== 'admin') throw new BrainError(401, 'Tokenin luoja ei ole enää ylläpitäjä. Token ei ole voimassa.');
  }
  const scopes = (Array.isArray(d.scopes) ? d.scopes : []) as AgentScope[];
  if (!scopes.includes(scope)) throw new BrainError(403, `Tokenilla ei ole oikeutta: ${scope}`);
  ref.update({ lastUsedAt: Date.now() }).catch(() => {});
  return { type: 'agent', id: hash.slice(0, 12), name: String(d.name || 'agentti'), orgId: String(d.orgId), role: 'agent', scopes };
}

// ── Viittaukset ─────────────────────────────────────────────────

export function col(db: Firestore, orgId: string, name: string) {
  return db.collection(`organizations/${orgId}/${name}`);
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
}

// ── Audit ───────────────────────────────────────────────────────

/** Audit-rivi transaktiossa. diff sisältää vain metatiedot (kentät, versiot), ei sisältöä. */
export function auditTx(tx: Transaction, db: Firestore, actor: BrainActor, action: string, entity: string, entityId: string, diff?: Record<string, unknown>) {
  const ref = col(db, actor.orgId, C.audit).doc(newId('a'));
  tx.set(ref, clean({
    id: ref.id, actorType: actor.type, actorId: actor.id, actorName: actor.name,
    action, entity, entityId, diff: diff || {}, createdAt: Date.now(),
  }));
}

export async function audit(actor: BrainActor, action: string, entity: string, entityId: string, diff?: Record<string, unknown>) {
  const db = adminDb();
  const ref = col(db, actor.orgId, C.audit).doc(newId('a'));
  await ref.set(clean({
    id: ref.id, actorType: actor.type, actorId: actor.id, actorName: actor.name,
    action, entity, entityId, diff: diff || {}, createdAt: Date.now(),
  }));
}

// ── Muistiinpanot ───────────────────────────────────────────────

export interface NoteInput {
  slug?: string | null;       // olemassa oleva muistiinpano; puuttuu = uusi
  name: string;
  title?: string;
  sectionSlug: string;
  kind?: NoteKind;
  properties?: Record<string, string>;
  bodyMd: string;
  expectedVersion?: number | null;
  sourcePath?: string;
}

const KINDS: NoteKind[] = ['core', 'note', 'agent_instructions', 'inbox_entry', 'proposal'];

function normProps(p: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!p || typeof p !== 'object') return out;
  for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
    const key = String(k).trim().slice(0, 80);
    if (!key || key.includes('.') || key.startsWith('__')) continue;
    if (v === null || v === undefined) continue;
    out[key] = (Array.isArray(v) ? v.join(', ') : String(v)).slice(0, 2000);
    if (Object.keys(out).length >= 60) break;
  }
  return out;
}

export function parseNoteInput(raw: unknown): NoteInput {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const name = str(o.name, 200).replace(/[[\]|#^]/g, '');
  if (!name) throw new BrainError(400, 'Muistiinpanolta puuttuu nimi');
  const sectionSlug = str(o.sectionSlug, 120);
  if (!sectionSlug) throw new BrainError(400, 'Valitse osio');
  if (!isDocId(sectionSlug)) throw new BrainError(400, 'Virheellinen osio');
  const body = typeof o.bodyMd === 'string' ? o.bodyMd : '';
  if (body.length > 400_000) throw new BrainError(413, 'Muistiinpano on liian pitkä (yli 400 000 merkkiä)');
  const kind = KINDS.includes(o.kind as NoteKind) ? (o.kind as NoteKind) : undefined;
  const ev = Number(o.expectedVersion);
  return {
    slug: o.slug ? docId(o.slug, 'muistiinpanon tunniste') : null,
    name,
    title: str(o.title, 300) || undefined,
    sectionSlug,
    kind,
    properties: o.properties !== undefined ? normProps(o.properties) : undefined,
    bodyMd: body,
    expectedVersion: Number.isFinite(ev) && ev > 0 ? ev : null,
  };
}

interface SaveResult { slug: string; version: number; created: boolean; renamedBacklinks: number }

/**
 * Tallentaa muistiinpanon transaktiossa:
 * versio + revisio, nimen yksikäsitteisyys, linkit ja takaisinlinkit, uudelleennimeämisen linkkipäivitys,
 * odottaneiden linkkien ratkaisu uudelle muistiinpanolle ja audit-rivi.
 */
export async function saveNote(actor: BrainActor, input: NoteInput, source: ChangeSource, reason?: string): Promise<SaveResult> {
  const db = adminDb();
  const notes = col(db, actor.orgId, C.notes);
  const names = col(db, actor.orgId, C.noteNames);
  const newKey = nameKey(input.name);
  if (!newKey) throw new BrainError(400, 'Muistiinpanolta puuttuu nimi');

  const result = await db.runTransaction(async tx => {
    const now = Date.now();
    // ── Luvut ensin ──
    let ref: DocumentReference<DocumentData>;
    let prev: BrainNote | null = null;
    if (input.slug) {
      ref = notes.doc(input.slug);
      const snap = await tx.get(ref);
      if (!snap.exists) throw new BrainError(404, 'Muistiinpanoa ei löydy');
      prev = snap.data() as BrainNote;
      if (input.expectedVersion && prev.version !== input.expectedVersion) {
        throw new BrainError(409, `Joku muu muokkasi tätä muistiinpanoa (versio ${prev.version}). Lataa sivu ja yhdistä muutoksesi.`);
      }
    } else {
      const base = slugify(input.name);
      let slug = base;
      let n = 1;
      // Vapaa slug: enintään 20 yritystä
      while (n <= 20) {
        const s = await tx.get(notes.doc(slug));
        if (!s.exists) break;
        n++;
        slug = `${base}-${n}`;
      }
      if (n > 20) throw new BrainError(409, 'Samannimisiä muistiinpanoja on liikaa');
      ref = notes.doc(slug);
    }
    const slug = ref.id;
    const nameSnap = await tx.get(names.doc(newKey));
    if (nameSnap.exists && nameSnap.data()?.slug !== slug) {
      throw new BrainError(409, `Nimi "${input.name}" on jo käytössä. Linkit viittaavat nimeen, joten sen on oltava yksilöllinen.`);
    }
    const allNames = await tx.get(names);
    const index = new Map<string, string>();
    allNames.forEach(d => index.set(d.id, String(d.data().slug)));
    index.set(newKey, slug);
    const renamed = !!prev && nameKey(prev.name) !== newKey;
    if (renamed && prev) index.delete(nameKey(prev.name));
    // Muistiinpanot, jotka linkittävät vanhaan nimeen (uudelleennimeäminen) tai odottavat uutta nimeä
    const backlinkSnap = renamed ? await tx.get(notes.where('linksOut', 'array-contains', slug)) : null;
    const waitingSnap = !prev || renamed ? await tx.get(notes.where('unresolvedLinks', 'array-contains', newKey)) : null;
    if (backlinkSnap && backlinkSnap.size > 200) {
      throw new BrainError(409, `Tähän muistiinpanoon linkittää ${backlinkSnap.size} muistiinpanoa. Nimen muutos päivittäisi liian monta kerralla; pyydä ylläpitäjää tekemään se tuonnilla.`);
    }
    const handled = new Set<string>();

    // ── Kirjoitukset ──
    const body = input.bodyMd;
    const links = computeLinks(body, k => index.get(k), slug);
    const reviewItems = extractReviewItems(body);
    const version = (prev?.version || 0) + 1;
    const note: BrainNote = clean({
      slug,
      sectionSlug: input.sectionSlug,
      name: input.name,
      nameKey: newKey,
      title: input.title || input.name,
      kind: input.kind || prev?.kind || 'note',
      properties: input.properties ?? prev?.properties ?? {},
      bodyMd: body,
      needsReview: reviewItems.length > 0 || (!!prev?.needsReview && source === 'import'),
      reviewItems,
      reviewNotes: prev?.reviewNotes,
      linksOut: links.linksOut,
      unresolvedLinks: links.unresolvedLinks,
      linkAliases: links.aliases,
      isDraft: isDraftNotDecision(body),
      // Vienti käyttää alkuperäistä polkua vain, jos nimi ja osio ovat ennallaan (muuten linkit rikkoutuisivat)
      sourcePath: input.sourcePath || (prev && !renamed && prev.sectionSlug === input.sectionSlug ? prev.sourcePath : undefined),
      createdBy: prev?.createdBy || actor.name,
      updatedBy: actor.name,
      createdAt: prev?.createdAt || now,
      updatedAt: now,
      version,
    });
    tx.set(ref, note);
    const rev: BrainRevision = clean({
      version, title: note.title, name: note.name, bodyMd: body, properties: note.properties,
      changedBy: actor.id, changedByName: actor.name, changeSource: source, changeReason: reason?.slice(0, 500), createdAt: now,
    });
    tx.set(ref.collection(C.revisions).doc(String(version)), rev);
    if (renamed && prev) tx.delete(names.doc(nameKey(prev.name)));
    tx.set(names.doc(newKey), { slug });

    let renamedBacklinks = 0;
    if (renamed && prev && backlinkSnap) {
      for (const d of backlinkSnap.docs) {
        if (d.id === slug) continue;
        const other = d.data() as BrainNote;
        const newBody = renameLinks(other.bodyMd, prev.name, input.name);
        if (newBody === other.bodyMd) continue;
        const v = (other.version || 0) + 1;
        const l = computeLinks(newBody, k => index.get(k), other.slug);
        handled.add(d.id);
        tx.update(d.ref, { bodyMd: newBody, linksOut: l.linksOut, unresolvedLinks: l.unresolvedLinks, linkAliases: l.aliases, version: v, updatedAt: now, updatedBy: actor.name });
        tx.set(d.ref.collection(C.revisions).doc(String(v)), clean({
          version: v, title: other.title, name: other.name, bodyMd: newBody, properties: other.properties,
          changedBy: actor.id, changedByName: actor.name, changeSource: source,
          changeReason: `Linkit päivitetty: "${prev.name}" → "${input.name}"`, createdAt: now,
        }));
        renamedBacklinks++;
      }
    }
    if (waitingSnap) {
      for (const d of waitingSnap.docs) {
        if (d.id === slug || handled.has(d.id)) continue;
        const other = d.data() as BrainNote;
        const l = computeLinks(other.bodyMd, k => index.get(k), other.slug);
        tx.update(d.ref, { linksOut: l.linksOut, unresolvedLinks: l.unresolvedLinks, linkAliases: l.aliases });
      }
    }
    auditTx(tx, db, actor, prev ? 'note.update' : 'note.create', 'note', slug, {
      version, source, renamed: renamed ? { from: prev?.name, to: input.name } : undefined,
      fields: prev ? changedFields(prev, note) : undefined, reason: reason?.slice(0, 200),
    });
    return { slug, version, created: !prev, renamedBacklinks };
  });
  invalidateCache(actor.orgId);
  return result;
}

function changedFields(a: BrainNote, b: BrainNote): string[] {
  const out: string[] = [];
  for (const k of ['name', 'title', 'sectionSlug', 'kind', 'bodyMd'] as const) if (a[k] !== b[k]) out.push(k);
  if (JSON.stringify(a.properties || {}) !== JSON.stringify(b.properties || {})) out.push('properties');
  return out;
}

export async function getNote(orgId: string, slug: string): Promise<BrainNote | null> {
  if (!isDocId(slug)) return null;
  const snap = await col(adminDb(), orgId, C.notes).doc(slug).get();
  return snap.exists ? (snap.data() as BrainNote) : null;
}

export async function findNoteByName(orgId: string, name: string): Promise<BrainNote | null> {
  const db = adminDb();
  const s = await col(db, orgId, C.noteNames).doc(nameKey(name)).get();
  const slug = s.exists ? String(s.data()?.slug || '') : '';
  return slug ? getNote(orgId, slug) : null;
}

/** Palauttaa vanhan version uutena versiona (historia säilyy). */
export async function restoreRevision(actor: BrainActor, slugRaw: string, version: number) {
  const slug = docId(slugRaw, 'muistiinpanon tunniste');
  const db = adminDb();
  const ref = col(db, actor.orgId, C.notes).doc(slug);
  const [noteSnap, revSnap] = await Promise.all([ref.get(), ref.collection(C.revisions).doc(String(version)).get()]);
  if (!noteSnap.exists || !revSnap.exists) throw new BrainError(404, 'Versiota ei löydy');
  const note = noteSnap.data() as BrainNote;
  const rev = revSnap.data() as BrainRevision;
  return saveNote(actor, {
    slug, name: rev.name || note.name, title: rev.title, sectionSlug: note.sectionSlug, kind: note.kind,
    properties: rev.properties, bodyMd: rev.bodyMd, expectedVersion: note.version,
  }, 'user', `Palautettu versio ${version}`);
}

// ── Haku (välimuisti per instanssi) ─────────────────────────────

const cache = new Map<string, { at: number; notes: BrainNote[] }>();
const CACHE_MS = 30_000;

function invalidateCache(orgId: string) { cache.delete(orgId); }

export async function loadNotes(orgId: string): Promise<BrainNote[]> {
  const hit = cache.get(orgId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.notes;
  const snap = await col(adminDb(), orgId, C.notes).get();
  const notes = snap.docs.map(d => d.data() as BrainNote);
  cache.set(orgId, { at: Date.now(), notes });
  return notes;
}

export interface SearchHit { slug: string; name: string; title: string; sectionSlug: string; kind: NoteKind; snippet: string; score: number }

export async function searchBrain(orgId: string, q: string, limit = 20): Promise<SearchHit[]> {
  const notes = await loadNotes(orgId);
  return searchNotes(notes, q, limit).map(r => ({
    slug: r.note.slug, name: r.note.name, title: r.note.title, sectionSlug: r.note.sectionSlug, kind: r.note.kind,
    snippet: r.snippet, score: Math.round(r.score * 10) / 10,
  }));
}

// ── Päätökset, ehdotukset, tavoitteet ───────────────────────────

export async function addDecision(actor: BrainActor, d: Omit<BrainDecision, 'id' | 'createdBy' | 'createdAt'>): Promise<string> {
  const db = adminDb();
  const ref = col(db, actor.orgId, C.decisions).doc(newId('d'));
  await db.runTransaction(async tx => {
    tx.set(ref, clean({ ...d, id: ref.id, createdBy: actor.name, createdAt: Date.now() }));
    auditTx(tx, db, actor, 'decision.create', 'decision', ref.id, { source: d.source });
  });
  return ref.id;
}

export interface ProposalInput {
  title: string;
  bodyMd: string;
  area?: string;
  impact?: string;
  urgency?: string;
  sources?: string[];
  operation?: BrainOperation | null;
}

export async function createProposal(actor: BrainActor, p: ProposalInput): Promise<string> {
  if (!p.title.trim()) throw new BrainError(400, 'Ehdotukselta puuttuu otsikko');
  const db = adminDb();
  const ref = col(db, actor.orgId, C.proposals).doc(newId('p'));
  const doc: BrainProposal = clean({
    id: ref.id, title: p.title.slice(0, 300), bodyMd: p.bodyMd.slice(0, 50_000), status: 'uusi',
    area: p.area?.slice(0, 200), impact: p.impact?.slice(0, 100), urgency: p.urgency?.slice(0, 100),
    sources: (p.sources || []).slice(0, 50).map(s => String(s).slice(0, 500)),
    noteSlug: null, createdBy: actor.name, createdAt: Date.now(), operation: p.operation || null,
  });
  await db.runTransaction(async tx => {
    tx.set(ref, doc);
    auditTx(tx, db, actor, 'proposal.create', 'proposal', ref.id, { actorType: actor.type, hasOperation: !!p.operation });
  });
  return ref.id;
}

/** Muistiinpano, johon hyväksytyt ehdotukset kirjataan tehtävinä. Nimi on yleinen, ei organisaatiokohtainen. */
export const PLAN_NOTE_NAME = 'Kehityssuunnitelma';
export const PLAN_HEADING = 'Hyväksytyt ehdotukset';

export async function decideProposal(actor: BrainActor, idRaw: string, action: 'accept' | 'reject' | 'later', opts: {
  note?: string; snoozeUntil?: string; logDecision?: boolean; decisionText?: string; decisionRationale?: string;
}) {
  const id = docId(idRaw, 'ehdotuksen tunniste');
  const db = adminDb();
  const ref = col(db, actor.orgId, C.proposals).doc(id);
  const now = Date.now();
  // Varaus transaktiossa: kaksi rinnakkaista päätöstä ei voi molempia kirjoittaa (tuplaklikkaus, kaksi välilehteä)
  const p = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new BrainError(404, 'Ehdotusta ei löydy');
    const cur = snap.data() as BrainProposal & { lockedAt?: number };
    if (cur.status === 'hyväksytty' || cur.status === 'hylätty') throw new BrainError(409, 'Ehdotus on jo käsitelty');
    if (cur.lockedAt && now - cur.lockedAt < 120_000) throw new BrainError(409, 'Ehdotusta käsitellään parhaillaan');
    tx.update(ref, { lockedAt: now });
    return cur;
  });
  try {
    return await decideLocked(actor, db, ref, id, p, action, opts, now);
  } finally {
    await ref.update({ lockedAt: null }).catch(() => {});
  }
}

async function decideLocked(
  actor: BrainActor, db: Firestore, ref: DocumentReference<DocumentData>, id: string, p: BrainProposal,
  action: 'accept' | 'reject' | 'later',
  opts: { note?: string; snoozeUntil?: string; logDecision?: boolean; decisionText?: string; decisionRationale?: string },
  now: number,
) {

  if (action === 'later') {
    const until = /^\d{4}-\d{2}-\d{2}$/.test(opts.snoozeUntil || '') ? opts.snoozeUntil! : null;
    if (!until || until <= todayIso()) throw new BrainError(400, 'Valitse tuleva päivä, jolloin ehdotus palaa');
    await db.runTransaction(async tx => {
      tx.update(ref, { status: 'myöhemmin', snoozeUntil: until, decisionNote: opts.note?.slice(0, 1000) || null, decidedBy: actor.name, decidedAt: now });
      auditTx(tx, db, actor, 'proposal.later', 'proposal', id, { snoozeUntil: until });
    });
    return { status: 'myöhemmin' };
  }
  if (action === 'reject') {
    await db.runTransaction(async tx => {
      tx.update(ref, { status: 'hylätty', decisionNote: opts.note?.slice(0, 1000) || null, decidedBy: actor.name, decidedAt: now, snoozeUntil: null });
      auditTx(tx, db, actor, 'proposal.reject', 'proposal', id, {});
    });
    return { status: 'hylätty' };
  }

  // Hyväksy: agentin muistiinpanomuutos kirjoitetaan nyt, tehtävä Kehityssuunnitelmaan, valinnainen päätös
  // Operaatio kirjataan ehdotukseen heti, jotta uusi yritys (katkos, virhe myöhemmin) ei kirjoita sitä toiseen kertaan
  const applied = p as BrainProposal & { operationAppliedAt?: number | null };
  if (p.operation && !applied.operationAppliedAt) {
    const target = await applyOperation(actor, p.operation, `Ehdotus hyväksytty: ${p.title}`, 'agent', 'agent');
    await ref.update({ operationAppliedAt: Date.now(), operationTarget: target });
  }
  const ref2 = p.noteSlug ? await getNote(actor.orgId, p.noteSlug) : null;
  const link = ref2 ? `[[${ref2.name}]]` : `ehdotus ${p.title}`;
  const task = `- [ ] ${p.title} (${link}, hyväksytty ${todayIso()})`;
  // Kehityssuunnitelman päivitys ei estä hyväksyntää: yksi uusi yritys versioristiriidassa, muuten virhe kirjataan
  let planError: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const plan = await findNoteByName(actor.orgId, PLAN_NOTE_NAME);
      if (plan) {
        if (plan.bodyMd.includes(task)) break;
        await saveNote(actor, {
          slug: plan.slug, name: plan.name, title: plan.title, sectionSlug: plan.sectionSlug, kind: plan.kind,
          properties: plan.properties, bodyMd: appendToBody(plan.bodyMd, task, PLAN_HEADING), expectedVersion: plan.version,
        }, 'user', `Hyväksytty ehdotus: ${p.title}`);
      } else {
        const section = ref2?.sectionSlug || (await firstSectionSlug(actor.orgId));
        await saveNote(actor, {
          name: PLAN_NOTE_NAME, sectionSlug: section, kind: 'note', properties: {},
          bodyMd: `# ${PLAN_NOTE_NAME}\n\n## ${PLAN_HEADING}\n\n${task}\n`,
        }, 'user', `Luotu hyväksytyn ehdotuksen yhteydessä: ${p.title}`);
      }
      planError = null;
      break;
    } catch (e) {
      planError = e instanceof Error ? e.message : 'Kehityssuunnitelman päivitys epäonnistui';
      if (!(e instanceof BrainError && e.status === 409)) break;
    }
  }
  let decisionId: string | null = null;
  if (opts.logDecision) {
    decisionId = await addDecision(actor, {
      decidedOn: todayIso(), decision: (opts.decisionText || p.title).slice(0, 1000),
      rationale: opts.decisionRationale?.slice(0, 2000), area: p.area, areaSlug: null, source: 'proposal', proposalId: id,
    });
  }
  await db.runTransaction(async tx => {
    tx.update(ref, { status: 'hyväksytty', decisionNote: opts.note?.slice(0, 1000) || null, decidedBy: actor.name, decidedAt: now, snoozeUntil: null, planError });
    auditTx(tx, db, actor, 'proposal.accept', 'proposal', id, { decisionId, planError: !!planError });
  });
  return { status: 'hyväksytty', decisionId, planError };
}

async function firstSectionSlug(orgId: string): Promise<string> {
  const snap = await col(adminDb(), orgId, C.sections).orderBy('sortOrder').limit(1).get();
  if (snap.empty) throw new BrainError(409, 'Aivoissa ei ole yhtään osiota');
  return snap.docs[0].id;
}

export async function addMetricEntry(actor: BrainActor, e: Omit<BrainMetricEntry, 'id' | 'createdBy' | 'createdAt'>): Promise<string> {
  docId(e.goalId, 'tavoitteen tunniste');
  const db = adminDb();
  const goal = await col(db, actor.orgId, C.goals).doc(e.goalId).get();
  if (!goal.exists) throw new BrainError(404, 'Tavoitetta ei löydy');
  const ref = col(db, actor.orgId, C.metrics).doc(newId('m'));
  await db.runTransaction(async tx => {
    tx.set(ref, clean({ ...e, id: ref.id, createdBy: actor.name, createdAt: Date.now() }));
    auditTx(tx, db, actor, 'metric.create', 'goal', e.goalId, { period: e.period, breakdownKey: e.breakdownKey });
  });
  return ref.id;
}

export async function upsertGoal(actor: BrainActor, g: BrainGoal): Promise<string> {
  const db = adminDb();
  const id = g.id ? slugify(g.id) : slugify(`${g.period}-${g.title}`);
  const ref = col(db, actor.orgId, C.goals).doc(id);
  await db.runTransaction(async tx => {
    tx.set(ref, clean({ ...g, id }));
    auditTx(tx, db, actor, 'goal.upsert', 'goal', id, { period: g.period });
  });
  return id;
}

// ── Operaatiot (Kirjaa ja hyväksytyt agenttiehdotukset) ─────────

// Ydin ja agenttien ohjeet päätyvät jokaisen tekoäly- ja agenttikutsun ohjeisiin. Tekoälyn tai agentin
// ehdottama muutos niihin vaatii ylläpitäjän hyväksynnän (suoja pysyvää kehoteinjektiota vastaan).
const PRIVILEGED_KINDS: NoteKind[] = ['core', 'agent_instructions'];

function guardPrivileged(actor: BrainActor, kind: NoteKind | undefined, origin: 'user' | 'ai' | 'agent') {
  if (origin === 'user' || !kind || !PRIVILEGED_KINDS.includes(kind)) return;
  if (actor.role !== 'owner' && actor.role !== 'admin') {
    throw new BrainError(403, 'Muutos organisaation ytimeen tai agenttien ohjeisiin vaatii omistajan tai ylläpitäjän hyväksynnän');
  }
}

/**
 * Kirjoittaa yhden hyväksytyn operaation aivoihin. Palauttaa kohteen tunnisteen.
 * origin: kuka operaation muotoili (ai = Kirjaa-tekoäly, agent = agentin ehdotus). Hyväksyjä on aina actor.
 */
export async function applyOperation(actor: BrainActor, op: BrainOperation, reason: string, source: ChangeSource = 'inbox', origin: 'user' | 'ai' | 'agent' = 'ai'): Promise<string> {
  switch (op.type) {
    case 'append_to_note': {
      const n = await getNote(actor.orgId, op.targetSlug);
      if (!n) throw new BrainError(404, `Muistiinpanoa ${op.targetSlug} ei löydy`);
      guardPrivileged(actor, n.kind, origin);
      await saveNote(actor, {
        slug: n.slug, name: n.name, title: n.title, sectionSlug: n.sectionSlug, kind: n.kind, properties: n.properties,
        bodyMd: appendToBody(n.bodyMd, op.content, op.heading || undefined), expectedVersion: n.version,
      }, source, reason);
      return n.slug;
    }
    case 'update_property': {
      const n = await getNote(actor.orgId, op.targetSlug);
      if (!n) throw new BrainError(404, `Muistiinpanoa ${op.targetSlug} ei löydy`);
      guardPrivileged(actor, n.kind, origin);
      const key = op.key.trim().slice(0, 80);
      if (!key || key.includes('.')) throw new BrainError(400, 'Virheellinen ominaisuuden nimi');
      await saveNote(actor, {
        slug: n.slug, name: n.name, title: n.title, sectionSlug: n.sectionSlug, kind: n.kind,
        properties: { ...n.properties, [key]: op.value.slice(0, 2000) }, bodyMd: n.bodyMd, expectedVersion: n.version,
      }, source, reason);
      return n.slug;
    }
    case 'create_note': {
      guardPrivileged(actor, op.kind, origin);
      const r = await saveNote(actor, {
        name: op.name, title: op.title, sectionSlug: op.sectionSlug, kind: op.kind || 'note',
        properties: normProps(op.properties), bodyMd: op.content,
      }, source, reason);
      return r.slug;
    }
    case 'add_decision':
      return addDecision(actor, {
        decidedOn: op.decidedOn || todayIso(), decision: op.decision, rationale: op.rationale,
        areaSlug: op.areaSlug || null, source: 'inbox', proposalId: null,
      });
    case 'add_proposal':
      return createProposal(actor, { title: op.title, bodyMd: op.content, area: op.area, impact: op.impact, urgency: op.urgency });
    case 'update_goal_metric':
      return addMetricEntry(actor, {
        goalId: op.goalId, breakdownKey: op.breakdownKey || null, period: op.period, value: Number(op.value) || 0, note: op.note,
      });
    default:
      throw new BrainError(400, 'Tuntematon operaatio');
  }
}

const OP_TYPES = ['append_to_note', 'update_property', 'create_note', 'add_decision', 'add_proposal', 'update_goal_metric'];

/** Siistii ulkoa (tekoäly, agentti, selain) tulleen operaation. Palauttaa null, jos se ei kelpaa. */
export function parseOperation(raw: unknown, origin: 'user' | 'ai' | 'agent' = 'user'): BrainOperation | null {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const type = String(o.type || '');
  if (!OP_TYPES.includes(type)) return null;
  const reason = str(o.reason, 1000);
  switch (type) {
    case 'append_to_note': {
      const targetSlug = optId(o.targetSlug) || ''; const content = str(o.content, 50_000);
      return targetSlug && content ? { type: 'append_to_note' as const, targetSlug, heading: str(o.heading, 200) || null, content, reason } : null;
    }
    case 'update_property': {
      const targetSlug = optId(o.targetSlug) || ''; const key = str(o.key, 80);
      return targetSlug && key ? { type: 'update_property' as const, targetSlug, key, value: str(o.value, 2000), reason } : null;
    }
    case 'create_note': {
      const name = str(o.name, 200).replace(/[[\]|#^]/g, ''); const sectionSlug = optId(o.sectionSlug) || '';
      let kind: NoteKind = KINDS.includes(o.kind as NoteKind) ? (o.kind as NoteKind) : 'note';
      // Tekoäly tai agentti ei voi luoda ydintä eikä agenttien ohjeita
      if (origin !== 'user' && PRIVILEGED_KINDS.includes(kind)) kind = 'note';
      return name && sectionSlug ? {
        type: 'create_note' as const, name, title: str(o.title, 300) || undefined, sectionSlug,
        kind,
        properties: normProps(o.properties), content: str(o.content, 50_000), reason,
      } : null;
    }
    case 'add_decision': {
      const decision = str(o.decision, 1000);
      return decision ? { type: 'add_decision' as const, decidedOn: str(o.decidedOn, 20) || todayIso(), decision, rationale: str(o.rationale, 2000) || undefined, areaSlug: optId(o.areaSlug), reason } : null;
    }
    case 'add_proposal': {
      const title = str(o.title, 300);
      return title ? { type: 'add_proposal' as const, title, content: str(o.content, 50_000), area: str(o.area, 200) || undefined, impact: str(o.impact, 100) || undefined, urgency: str(o.urgency, 100) || undefined, reason } : null;
    }
    case 'update_goal_metric': {
      const goalId = optId(o.goalId) || '';
      const hasValue = o.value !== null && o.value !== undefined && o.value !== '';
      const value = Number(o.value);
      const period = str(o.period, 20);
      return goalId && hasValue && Number.isFinite(value) && period ? { type: 'update_goal_metric' as const, goalId, breakdownKey: str(o.breakdownKey, 80) || null, period, value, note: str(o.note, 500) || undefined, reason } : null;
    }
  }
  return null;
}

// ── Agenttitokenit ──────────────────────────────────────────────

const TOKEN_TTL_MS = 365 * 86_400_000;

export async function createAgentToken(actor: BrainActor, name: string, scopes: AgentScope[]): Promise<{ token: string; info: AgentTokenInfo }> {
  const valid = AGENT_SCOPES.map(s => s.id);
  const sc = [...new Set(scopes.filter(s => valid.includes(s)))];
  if (!name.trim()) throw new BrainError(400, 'Anna tokenille nimi (esim. strategiaagentti)');
  if (!sc.length) throw new BrainError(400, 'Valitse vähintään yksi oikeus');
  const token = AGENT_TOKEN_PREFIX + randomBytes(32).toString('base64url');
  const hash = hashToken(token);
  const db = adminDb();
  const info: AgentTokenInfo = { id: hash.slice(0, 12), name: name.trim().slice(0, 100), scopes: sc, createdBy: actor.name, createdAt: Date.now(), lastUsedAt: null, revokedAt: null, expiresAt: Date.now() + TOKEN_TTL_MS };
  const member = await db.doc(`organizations/${actor.orgId}/members/${actor.id}`).get();
  await db.collection(AGENT_TOKENS_COLLECTION).doc(hash).set({
    ...info, orgId: actor.orgId, createdByUid: actor.id, createdBySuperAdmin: !member.exists,
  });
  await audit(actor, 'token.create', 'agentToken', info.id, { name: info.name, scopes: sc });
  return { token, info };
}

export async function listAgentTokens(orgId: string): Promise<AgentTokenInfo[]> {
  const snap = await adminDb().collection(AGENT_TOKENS_COLLECTION).where('orgId', '==', orgId).get();
  return snap.docs.map(d => {
    const x = d.data();
    return { id: String(x.id), name: String(x.name), scopes: (x.scopes || []) as AgentScope[], createdBy: String(x.createdBy || ''), createdAt: Number(x.createdAt || 0), lastUsedAt: x.lastUsedAt ?? null, revokedAt: x.revokedAt ?? null, expiresAt: x.expiresAt ?? null };
  }).sort((a, b) => b.createdAt - a.createdAt);
}

export async function revokeAgentToken(actor: BrainActor, id: string) {
  const snap = await adminDb().collection(AGENT_TOKENS_COLLECTION).where('orgId', '==', actor.orgId).where('id', '==', id).limit(1).get();
  if (snap.empty) throw new BrainError(404, 'Tokenia ei löydy');
  await snap.docs[0].ref.update({ revokedAt: Date.now() });
  await audit(actor, 'token.revoke', 'agentToken', id, {});
}

// ── Inbox (Kirjaa) ──────────────────────────────────────────────

/**
 * Tallentaa kirjauksen heti tilassa "uusi". Tämä on ainoa välttämätön askel: jatkokäsittely
 * (litterointi, tekoäly) voi epäonnistua, mutta kirjaus ei katoa.
 */
export async function createInboxEntry(actor: BrainActor, e: { rawText: string; channel: InboxChannel; audioPath?: string | null }): Promise<string> {
  const text = e.rawText.slice(0, 20_000);
  if (!text.trim() && !e.audioPath) throw new BrainError(400, 'Kirjaus on tyhjä');
  const db = adminDb();
  const ref = col(db, actor.orgId, C.inbox).doc(newId('i'));
  const entry: BrainInboxEntry = clean({
    id: ref.id, rawText: text, audioPath: e.audioPath || null, transcript: null, channel: e.channel, status: 'uusi',
    aiSuggestion: null, error: null, createdBy: actor.id, createdByName: actor.name, createdAt: Date.now(), processedAt: null,
  });
  await db.runTransaction(async tx => {
    tx.set(ref, entry);
    auditTx(tx, db, actor, 'inbox.create', 'inbox', ref.id, { channel: e.channel, hasAudio: !!e.audioPath });
  });
  return ref.id;
}

// ── Tekoälyn käyttöraja ─────────────────────────────────────────

const AI_PER_USER_HOUR = Number(process.env.BRAIN_AI_USER_HOURLY || 30);
const AI_PER_ORG_DAY = Number(process.env.BRAIN_AI_ORG_DAILY || 400);

/**
 * Kiinteän ikkunan laskuri Firestoressa (organizations/{orgId}/brainUsage, vain palvelin).
 * Suojaa Anthropic-laskua silmukoilta ja väärinkäytöltä. Rajat ympäristömuuttujista.
 */
export async function aiQuota(actor: BrainActor, kind: 'ask' | 'process') {
  const db = adminDb();
  const now = Date.now();
  const hour = Math.floor(now / 3_600_000);
  const day = Math.floor(now / 86_400_000);
  const userRef = db.doc(`organizations/${actor.orgId}/brainUsage/u-${actor.id.replace(/[^a-zA-Z0-9-]/g, '')}-${hour}`);
  const orgRef = db.doc(`organizations/${actor.orgId}/brainUsage/org-${day}`);
  await db.runTransaction(async tx => {
    const [u, o] = await Promise.all([tx.get(userRef), tx.get(orgRef)]);
    const nu = Number(u.data()?.n || 0);
    const no = Number(o.data()?.n || 0);
    if (nu >= AI_PER_USER_HOUR) throw new BrainError(429, 'Olet käyttänyt tekoälyä tämän tunnin enimmäismäärän. Kirjaukset tallentuvat silti, käsittele ne myöhemmin.');
    if (no >= AI_PER_ORG_DAY) throw new BrainError(429, 'Organisaation päivittäinen tekoälyraja on täynnä. Kirjaukset tallentuvat silti.');
    tx.set(userRef, { n: nu + 1, hour, kind, expiresAt: now + 2 * 86_400_000 }, { merge: true });
    tx.set(orgRef, { n: no + 1, day, expiresAt: now + 3 * 86_400_000 }, { merge: true });
  });
}
