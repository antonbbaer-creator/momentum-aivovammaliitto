// Cloud Function: Momentumin ylläpito- ja kehitysagenttien rajapinta.
//
// Agentit ovat Claude Code -aliagentteja tässä repossa (.claude/agents/momentum-*.md),
// ja niitä ajetaan skilleillä /momentum-huolto ja /momentum-kehitys (Mac mini, pilvi tai kone).
// Kutsuja: agentit/bin/kirjaa.mjs ja agentit/bin/pyynnot.mjs (Node, ei riippuvuuksia).
// Tunnistus: otsake x-agent-token = AGENT_LOG_TOKEN (sama kuin logAgentRun ja agentQueue).
//
// GET                                             -> { ok, focus, pending, running, feedback }
// POST, yksi tai useampi kenttä samassa rungossa:
//   { run: {...} }                                 luo tai päivittää ajon (sama id = päivitys)
//   { runId, event: { agent?, text } }             tapahtuma käynnissä olevaan ajoon
//   { health: { checks: [...], commit? } }         viimeisin terveystarkistus
//   { requestId, status, runId?, note? }           kehityspyynnön tila
//   { create: { type, instructions } }             uusi kehityspyyntö (testaus, skriptit)
//   { feedbackId, feedbackStatus, note? }          Palaute-moduulin palautteen tila
//
// Kirjoittaa organizations/hetki-company/data/momentumDev* -avaimiin, joita Momentumin
// Agentit-sivun Momentum-kehitys-välilehti lukee. Ei deployaa, ei lähetä mitään minnekään.

import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { defineString } from 'firebase-functions/params';
import { timingSafeEqual } from 'crypto';

if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

const AGENT_LOG_TOKEN = defineString('AGENT_LOG_TOKEN', { default: '' });

// Momentumin omistaja-org: kehitysagenttien näkymä on Hetki Companyn Agentit-sivulla.
const ORG_ID = 'hetki-company';
const RUNS_KEY = 'momentumDevRuns';
const REQUESTS_KEY = 'momentumDevRequests';
const FOCUS_KEY = 'momentumDevFocus';
const HEALTH_KEY = 'momentumDevHealth';
const FEEDBACK_COLLECTION = 'momentumFeedback';

const MAX_RUNS = 300;
const MAX_EVENTS = 200;
const MAX_REQUESTS = 200;
const MAX_CHECKS = 60;
const MAX_FEEDBACK = 60;

const VALID_TYPES = ['huolto', 'kehitys', 'korjaus', 'katselmointi', 'muu'];
const VALID_STATUS = ['ok', 'kesken', 'virhe', 'paatos'];
const VALID_AGENTS = ['kehityspaallikko', 'huoltaja', 'kehittaja', 'tarkastaja', 'tietoturva', 'saavutettavuus', 'tuoteomistaja'];
const RESULT_KEYS = ['korjaukset', 'ominaisuudet', 'loydokset', 'tiedostot', 'palautteet'];
const VALID_REQ_STATUS = ['jonossa', 'kaynnissa', 'valmis', 'virhe', 'peruttu'];
const VALID_CHECK_STATUS = ['ok', 'varoitus', 'virhe'];
const VALID_FEEDBACK_STATUS = ['open', 'in-progress', 'done', 'declined'];

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

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);

function normalizeEvents(raw: unknown[]): Dict[] {
  const now = Date.now();
  return raw
    .map(e => {
      const o = (e && typeof e === 'object' ? e : {}) as Dict;
      const text = String(o.text || '').trim().slice(0, 300);
      const agent = VALID_AGENTS.includes(String(o.agent)) ? String(o.agent) : undefined;
      const t = Number.isFinite(Number(o.t)) ? Number(o.t) : now;
      const out: Dict = { t, text };
      if (agent) out.agent = agent;
      return out;
    })
    .filter(e => e.text)
    .slice(-MAX_EVENTS);
}

function normalizeRun(raw: Dict): Dict {
  const now = Date.now();
  const type = VALID_TYPES.includes(String(raw.type)) ? String(raw.type) : 'muu';
  let status = VALID_STATUS.includes(String(raw.status)) ? String(raw.status) : 'ok';
  const agents = (Array.isArray(raw.agents) ? raw.agents : [])
    .map(a => String(a))
    .filter(a => VALID_AGENTS.includes(a));
  const results: Record<string, number> = {};
  const rr = (raw.results && typeof raw.results === 'object' ? raw.results : {}) as Dict;
  for (const k of RESULT_KEYS) {
    const n = Number(rr[k]);
    if (Number.isFinite(n) && n > 0) results[k] = Math.round(n);
  }
  const decisions = (Array.isArray(raw.decisions) ? raw.decisions : [])
    .map(d => String(d).trim()).filter(Boolean).slice(0, 10);
  if (decisions.length && status === 'ok') status = 'paatos';
  const dateStr = typeof raw.date === 'string' && !Number.isNaN(Date.parse(raw.date))
    ? raw.date
    : new Date(now).toISOString();
  const duration = Number(raw.durationMin);
  const events = normalizeEvents(Array.isArray(raw.events) ? raw.events : []);
  const out: Dict = {
    id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 80) : `dev-${now}-${Math.random().toString(36).slice(2, 7)}`,
    date: dateStr,
    type,
    agents: agents.length ? agents : ['kehityspaallikko'],
    status,
    summary: String(raw.summary || '').trim().slice(0, 2000),
    source: str(raw.source, 40) || 'agentti',
    createdAt: now,
  };
  if (Object.keys(results).length) out.results = results;
  if (decisions.length) out.decisions = decisions;
  if (Number.isFinite(duration) && duration > 0) out.durationMin = Math.round(duration);
  if (events.length) out.events = events;
  const branch = str(raw.branch, 120); if (branch) out.branch = branch;
  const prUrl = str(raw.prUrl, 300); if (prUrl && /^https:\/\/github\.com\//.test(prUrl)) out.prUrl = prUrl;
  const requestId = str(raw.requestId, 80); if (requestId) out.requestId = requestId;
  return out;
}

function normalizeHealth(raw: Dict): Dict {
  const checks = (Array.isArray(raw.checks) ? raw.checks : []).slice(0, MAX_CHECKS).map(c => {
    const o = (c && typeof c === 'object' ? c : {}) as Dict;
    return {
      id: str(o.id, 60) || 'x',
      label: str(o.label, 160) || String(o.id || ''),
      status: VALID_CHECK_STATUS.includes(String(o.status)) ? String(o.status) : 'varoitus',
      detail: str(o.detail, 1200) || '',
    };
  });
  const count = (s: string) => checks.filter(c => c.status === s).length;
  const out: Dict = {
    checks,
    ok: count('ok'),
    varoitus: count('varoitus'),
    virhe: count('virhe'),
    ranAt: Date.now(),
  };
  const commit = str(raw.commit, 60); if (commit) out.commit = commit;
  const branch = str(raw.branch, 120); if (branch) out.branch = branch;
  return out;
}

/** Ajon päivitys: vain annetut kentät korvataan, agentit lisätään vanhojen jatkoksi. */
function mergeRun(list: Dict[], rawRun: Dict): { list: Dict[]; id: string } {
  const run = normalizeRun(rawRun);
  const idx = list.findIndex(r => r && r.id === run.id);
  if (idx < 0) return { list: [run, ...list], id: run.id as string };
  const patch: Dict = { ...run };
  for (const k of ['type', 'agents', 'date', 'status', 'events', 'source']) {
    if (rawRun[k] === undefined) delete patch[k];
  }
  if (!String(rawRun.summary || '').trim()) delete patch.summary;
  delete patch.createdAt;
  const merged: Dict = { ...list[idx], ...patch };
  if (rawRun.agents !== undefined) {
    const oldAgents = (Array.isArray(list[idx].agents) ? list[idx].agents : []) as string[];
    merged.agents = Array.from(new Set([...oldAgents, ...(run.agents as string[])]));
  }
  const out = [...list];
  out[idx] = merged;
  return { list: out, id: run.id as string };
}

function addEvent(list: Dict[], runId: string, eventRaw: Dict): Dict[] {
  const ev = normalizeEvents([{ ...eventRaw, t: Date.now() }])[0];
  if (!ev) return list;
  const idx = list.findIndex(r => r && r.id === runId);
  const target: Dict = idx >= 0
    ? { ...list[idx] }
    : normalizeRun({ id: runId, status: 'kesken', agents: ev.agent ? [ev.agent] : [] });
  const events = (Array.isArray(target.events) ? target.events : []) as Dict[];
  target.events = [...events, ev].slice(-MAX_EVENTS);
  const agents = (Array.isArray(target.agents) ? target.agents : []) as string[];
  if (ev.agent && !agents.includes(ev.agent as string)) target.agents = [...agents, ev.agent];
  if (idx >= 0) {
    const out = [...list];
    out[idx] = target;
    return out;
  }
  return [target, ...list];
}

/** Avoimet palautteet kaikista orgeista agenttien backlogiksi. Ei sähköposteja eikä uid:itä. */
async function openFeedback(): Promise<Dict[]> {
  const snap = await db.collection(FEEDBACK_COLLECTION)
    .where('status', 'in', ['open', 'in-progress'])
    .limit(MAX_FEEDBACK)
    .get();
  return snap.docs
    .map(d => {
      const f = d.data();
      return {
        id: d.id,
        orgId: String(f.orgId || ''),
        orgName: String(f.orgName || ''),
        userName: String(f.userName || ''),
        type: String(f.type || 'other'),
        text: String(f.text || '').slice(0, 4000),
        submittedAt: String(f.submittedAt || ''),
        status: String(f.status || 'open'),
        agentNote: f.agentNote ? String(f.agentNote).slice(0, 1000) : undefined,
      };
    })
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
}

export const momentumDevAgents = onRequest(
  { region: 'europe-west1', cors: false, maxInstances: 2 },
  async (req, res) => {
    const token = String(req.get('x-agent-token') || '');
    const expected = AGENT_LOG_TOKEN.value();
    if (!expected || !token || !safeEqual(token, expected)) {
      res.status(401).json({ ok: false, error: 'invalid token' });
      return;
    }

    const runsRef = db.doc(`organizations/${ORG_ID}/data/${RUNS_KEY}`);
    const reqRef = db.doc(`organizations/${ORG_ID}/data/${REQUESTS_KEY}`);
    const focusRef = db.doc(`organizations/${ORG_ID}/data/${FOCUS_KEY}`);
    const healthRef = db.doc(`organizations/${ORG_ID}/data/${HEALTH_KEY}`);
    const updatedBy = 'agent:kehityspaallikko';

    if (req.method === 'GET') {
      const [reqSnap, focusSnap, feedback] = await Promise.all([reqRef.get(), focusRef.get(), openFeedback()]);
      const raw = parseV(reqSnap.data());
      const list = (Array.isArray(raw) ? raw : []) as Dict[];
      const focus = (parseV(focusSnap.data()) as Dict | undefined) || {};
      const pending = list
        .filter(r => r && r.status === 'jonossa')
        .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
      const running = list.filter(r => r && r.status === 'kaynnissa');
      res.status(200).json({ ok: true, focus: { kulma: String(focus.kulma || '') }, pending, running, feedback });
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'GET or POST' });
      return;
    }

    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Dict;
    const rawRun = body.run && typeof body.run === 'object' ? (body.run as Dict) : null;
    const eventRaw = body.event && typeof body.event === 'object' ? (body.event as Dict) : null;
    const eventRunId = String(body.runId || (rawRun ? rawRun.id || '' : '')).slice(0, 80);
    const hasEvent = !!eventRaw && !!eventRunId && !!String(eventRaw.text || '').trim();
    const health = body.health && typeof body.health === 'object' ? (body.health as Dict) : null;
    const create = body.create && typeof body.create === 'object' ? (body.create as Dict) : null;
    const requestId = String(body.requestId || '').slice(0, 80);
    const reqStatus = String(body.status || '');
    const hasReqUpdate = !!requestId && VALID_REQ_STATUS.includes(reqStatus);
    const feedbackId = String(body.feedbackId || '').slice(0, 120);
    const feedbackStatus = String(body.feedbackStatus || '');
    const hasFeedback = !!feedbackId && VALID_FEEDBACK_STATUS.includes(feedbackStatus);

    if (!rawRun && !hasEvent && !health && !create && !hasReqUpdate && !hasFeedback) {
      res.status(400).json({ ok: false, error: 'run, event, health, create, requestId+status or feedbackId+feedbackStatus required' });
      return;
    }

    let runId: string | undefined;
    let createdId: string | undefined;
    let requestNotFound = false;
    let feedbackNotFound = false;

    await db.runTransaction(async tx => {
      // Kaikki luvut ennen kirjoituksia (Firestore-transaktion sääntö)
      const runsSnap = rawRun || hasEvent ? await tx.get(runsRef) : null;
      const reqSnap = create || hasReqUpdate ? await tx.get(reqRef) : null;
      const fbRef = hasFeedback ? db.collection(FEEDBACK_COLLECTION).doc(feedbackId) : null;
      const fbSnap = fbRef ? await tx.get(fbRef) : null;
      const now = Date.now();

      if (runsSnap) {
        const prev = parseV(runsSnap.data());
        let list = (Array.isArray(prev) ? prev : []) as Dict[];
        if (rawRun) {
          const merged = mergeRun(list, rawRun);
          list = merged.list;
          runId = merged.id;
        }
        if (hasEvent && eventRaw) {
          list = addEvent(list, eventRunId, eventRaw);
          runId = eventRunId;
        }
        tx.set(runsRef, { v: JSON.stringify(list.slice(0, MAX_RUNS)), ts: now, updatedBy });
      }

      if (reqSnap) {
        const prev = parseV(reqSnap.data());
        let list = (Array.isArray(prev) ? prev : []) as Dict[];
        if (create) {
          createdId = `req-${now}-${Math.random().toString(36).slice(2, 7)}`;
          list = [{
            id: createdId,
            createdAt: now,
            createdBy: String(create.createdBy || 'skripti').slice(0, 120),
            type: VALID_TYPES.includes(String(create.type)) ? String(create.type) : 'muu',
            instructions: String(create.instructions || '').trim().slice(0, 4000),
            status: 'jonossa',
          }, ...list];
        }
        if (hasReqUpdate) {
          const idx = list.findIndex(r => r && r.id === requestId);
          if (idx < 0) {
            requestNotFound = true;
          } else {
            const item: Dict = { ...list[idx], status: reqStatus };
            if (reqStatus === 'kaynnissa') item.claimedAt = now;
            if (reqStatus === 'valmis' || reqStatus === 'virhe') item.finishedAt = now;
            if (typeof body.runId === 'string' && body.runId) item.runId = body.runId.slice(0, 80);
            if (typeof body.note === 'string') item.note = body.note.slice(0, 1000);
            list = [...list];
            list[idx] = item;
          }
        }
        tx.set(reqRef, { v: JSON.stringify(list.slice(0, MAX_REQUESTS)), ts: now, updatedBy });
      }

      if (fbRef && fbSnap) {
        if (!fbSnap.exists) {
          feedbackNotFound = true;
        } else {
          // Vain tila ja agentin muistiinpano; orgId, userUid ja submittedAt pysyvät ennallaan
          const patch: Record<string, string> = { status: feedbackStatus, agentUpdatedAt: new Date(now).toISOString() };
          if (typeof body.note === 'string' && body.note.trim()) patch.agentNote = body.note.trim().slice(0, 1000);
          tx.update(fbRef, patch);
        }
      }

      if (health) {
        tx.set(healthRef, { v: JSON.stringify(normalizeHealth(health)), ts: now, updatedBy });
      }
    });

    if (requestNotFound || feedbackNotFound) {
      res.status(404).json({ ok: false, error: requestNotFound ? 'request not found' : 'feedback not found', id: runId });
      return;
    }
    res.status(200).json({ ok: true, id: runId, created: createdId });
  },
);
