// Cloud Function: ajopyyntöjen jono Momentumin ja Mac minin välillä.
//
// Momentum (Agentit-sivu) kirjoittaa pyynnöt suoraan Firestoreen avaimeen
// organizations/hetki-company/data/hetkiAgentRequests. Mac minin vahti
// (hetki-myynti/bin/vahti.sh) kysyy tältä funktiolta jonossa olevat pyynnöt ja
// pysyvän kulman (hetkiAgentFocus), merkitsee pyynnön käynnissä ja lopuksi valmis.
//
// GET  ?orgId=hetki-company                        -> { ok, focus, pending, running }
// POST { requestId, status, runId?, note? }        päivittää pyynnön tilan
// POST { create: { type, instructions } }          luo pyynnön (testaus, skriptit)
// Tunnistus: otsake x-agent-token = AGENT_LOG_TOKEN (sama kuin logAgentRun).
//
// Tämä funktio ei aja agentteja eikä lähetä mitään. Se vain välittää pyynnöt.

import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { defineString } from 'firebase-functions/params';
import { timingSafeEqual } from 'crypto';

if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

const AGENT_LOG_TOKEN = defineString('AGENT_LOG_TOKEN', { default: '' });

const ALLOWED_ORGS = ['hetki-company'];
const REQUESTS_KEY = 'hetkiAgentRequests';
const FOCUS_KEY = 'hetkiAgentFocus';
const MAX_REQUESTS = 200;
const VALID_TYPES = ['tuntiajo', 'paivatarkistus', 'viikkokierros', 'kartoitus', 'muu'];
const VALID_STATUS = ['jonossa', 'kaynnissa', 'valmis', 'virhe', 'peruttu'];

type Dict = Record<string, unknown>;

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function parseV(data: FirebaseFirestore.DocumentData | undefined): unknown {
  if (!data || typeof data.v !== 'string') return undefined;
  try { return JSON.parse(data.v); } catch { return undefined; }
}

export const agentQueue = onRequest(
  { region: 'europe-west1', cors: false, maxInstances: 2 },
  async (req, res) => {
    const token = String(req.get('x-agent-token') || '');
    const expected = AGENT_LOG_TOKEN.value();
    if (!expected || !token || !safeEqual(token, expected)) {
      res.status(401).json({ ok: false, error: 'invalid token' });
      return;
    }
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Dict;
    const orgId = String((req.method === 'GET' ? req.query.orgId : body.orgId) || 'hetki-company');
    if (!ALLOWED_ORGS.includes(orgId)) {
      res.status(400).json({ ok: false, error: 'unknown org' });
      return;
    }
    const reqRef = db.doc(`organizations/${orgId}/data/${REQUESTS_KEY}`);
    const focusRef = db.doc(`organizations/${orgId}/data/${FOCUS_KEY}`);
    const updatedBy = 'agent:vahti';

    if (req.method === 'GET') {
      const [reqSnap, focusSnap] = await Promise.all([reqRef.get(), focusRef.get()]);
      const raw = parseV(reqSnap.data());
      const list = (Array.isArray(raw) ? raw : []) as Dict[];
      const focus = (parseV(focusSnap.data()) as Dict | undefined) || {};
      const pending = list
        .filter(r => r && r.status === 'jonossa')
        .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
      const running = list.filter(r => r && r.status === 'kaynnissa');
      res.status(200).json({ ok: true, focus: { kulma: String(focus.kulma || '') }, pending, running });
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'GET or POST' });
      return;
    }

    const create = body.create && typeof body.create === 'object' ? (body.create as Dict) : null;
    const requestId = String(body.requestId || '').slice(0, 80);
    const status = String(body.status || '');
    if (!create && (!requestId || !VALID_STATUS.includes(status))) {
      res.status(400).json({ ok: false, error: 'create or requestId+status required' });
      return;
    }

    let resultId = requestId;
    let notFound = false;
    await db.runTransaction(async tx => {
      const snap = await tx.get(reqRef);
      const prev = parseV(snap.data());
      let list = (Array.isArray(prev) ? prev : []) as Dict[];
      const now = Date.now();

      if (create) {
        const type = VALID_TYPES.includes(String(create.type)) ? String(create.type) : 'muu';
        const id = `req-${now}-${Math.random().toString(36).slice(2, 7)}`;
        resultId = id;
        list = [{
          id,
          createdAt: now,
          createdBy: String(create.createdBy || 'skripti').slice(0, 120),
          type,
          instructions: String(create.instructions || '').trim().slice(0, 4000),
          status: 'jonossa',
        }, ...list];
      } else {
        const idx = list.findIndex(r => r && r.id === requestId);
        if (idx < 0) { notFound = true; return; }
        const item: Dict = { ...list[idx], status };
        if (status === 'kaynnissa') item.claimedAt = now;
        if (status === 'valmis' || status === 'virhe') item.finishedAt = now;
        if (typeof body.runId === 'string' && body.runId) item.runId = body.runId.slice(0, 80);
        if (typeof body.note === 'string') item.note = body.note.slice(0, 1000);
        list = [...list];
        list[idx] = item;
      }
      list = list.slice(0, MAX_REQUESTS);
      tx.set(reqRef, { v: JSON.stringify(list), ts: now, updatedBy });
    });
    if (notFound) {
      res.status(404).json({ ok: false, error: 'request not found' });
      return;
    }
    res.status(200).json({ ok: true, id: resultId });
  },
);
