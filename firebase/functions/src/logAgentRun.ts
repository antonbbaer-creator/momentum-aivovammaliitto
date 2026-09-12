// Cloud Function: vastaanottaa Hetki Companyn asiakashankinta-agenttien ajot.
//
// Kutsuja: hetki-myynti/bin/kirjaa-ajo.sh Mac minillä (curl POST).
// Tunnistus: otsake x-agent-token, verrataan salaisuuteen AGENT_LOG_TOKEN.
//   firebase functions:secrets:set AGENT_LOG_TOKEN
// Kirjoittaa:
//   organizations/{orgId}/data/hetkiAgentRuns     { v: JSON(AgentRun[]), ts, updatedBy }
//   organizations/{orgId}/data/hetkiAgentMetrics  { v: JSON(AgentMetrics), ts, updatedBy }
// Momentumin Agentit-sivu lukee nämä useOrgData-hookilla.
//
// Tämä funktio ei lähetä mitään minnekään. Se vain tallentaa yhteenvedon.

import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { timingSafeEqual } from 'crypto';

if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

const AGENT_LOG_TOKEN = defineSecret('AGENT_LOG_TOKEN');

const ALLOWED_ORGS = ['hetki-company'];
const RUNS_KEY = 'hetkiAgentRuns';
const METRICS_KEY = 'hetkiAgentMetrics';
const MAX_RUNS = 500;

const VALID_TYPES = ['tuntiajo', 'paivatarkistus', 'viikkokierros', 'kartoitus', 'muu'];
const VALID_STATUS = ['ok', 'kesken', 'virhe', 'paatos'];
const VALID_AGENTS = ['myyntipaallikko', 'prospektoija', 'viestiluonnostelija', 'vastausseuraaja', 'kilpailutusvahti', 'strategi'];
const RESULT_KEYS = ['uudetProspektit', 'tutkitut', 'luonnokset', 'lahteneet', 'vastaukset', 'soitot', 'followupit', 'kilpailutukset', 'hypoteesit'];
const METRIC_NUM_KEYS = ['lahetetty', 'vastannut', 'kiinnostunut', 'tapaaminen', 'voitettuEur', 'tarjousEur', 'keskusteluEur', 'tavoiteEur'];

type Dict = Record<string, unknown>;

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
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
  const out: Dict = {
    id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 80) : `run-${now}-${Math.random().toString(36).slice(2, 7)}`,
    date: dateStr,
    type,
    agents: agents.length ? agents : ['myyntipaallikko'],
    status,
    summary: String(raw.summary || '').trim().slice(0, 2000),
    source: 'mac-mini',
    createdAt: now,
  };
  if (Object.keys(results).length) out.results = results;
  if (decisions.length) out.decisions = decisions;
  if (Number.isFinite(duration) && duration > 0) out.durationMin = Math.round(duration);
  return out;
}

function normalizeMetrics(raw: Dict, prev: Dict): Dict {
  const out: Dict = { ...prev };
  for (const k of METRIC_NUM_KEYS) {
    if (raw[k] === undefined || raw[k] === null) continue;
    const n = Number(raw[k]);
    if (Number.isFinite(n) && n >= 0) out[k] = Math.round(n);
  }
  if (typeof raw.tavoiteNimi === 'string') out.tavoiteNimi = raw.tavoiteNimi.slice(0, 120);
  if (typeof raw.deadline === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.deadline)) out.deadline = raw.deadline;
  if (typeof raw.note === 'string') out.note = raw.note.slice(0, 1000);
  out.updatedAt = Date.now();
  return out;
}

function parseV(data: FirebaseFirestore.DocumentData | undefined): unknown {
  if (!data || typeof data.v !== 'string') return undefined;
  try { return JSON.parse(data.v); } catch { return undefined; }
}

export const logAgentRun = onRequest(
  { region: 'europe-west1', secrets: [AGENT_LOG_TOKEN], cors: false, maxInstances: 2 },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'POST only' });
      return;
    }
    const token = String(req.get('x-agent-token') || '');
    const expected = AGENT_LOG_TOKEN.value();
    if (!expected || !token || !safeEqual(token, expected)) {
      res.status(401).json({ ok: false, error: 'invalid token' });
      return;
    }

    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Dict;
    const orgId = String(body.orgId || 'hetki-company');
    if (!ALLOWED_ORGS.includes(orgId)) {
      res.status(400).json({ ok: false, error: 'unknown org' });
      return;
    }
    const hasRun = body.run && typeof body.run === 'object';
    const hasMetrics = body.metrics && typeof body.metrics === 'object';
    if (!hasRun && !hasMetrics) {
      res.status(400).json({ ok: false, error: 'run or metrics required' });
      return;
    }

    const updatedBy = 'agent:myyntipaallikko';
    let runId: string | undefined;

    await db.runTransaction(async tx => {
      if (hasRun) {
        const run = normalizeRun(body.run as Dict);
        runId = run.id as string;
        const ref = db.doc(`organizations/${orgId}/data/${RUNS_KEY}`);
        const snap = await tx.get(ref);
        const prev = parseV(snap.data());
        const list = (Array.isArray(prev) ? prev : []) as Dict[];
        // Sama id päivittää olemassa olevan (esim. kesken -> ok)
        const idx = list.findIndex(r => r && r.id === run.id);
        let next: Dict[];
        if (idx >= 0) {
          next = [...list];
          next[idx] = { ...list[idx], ...run, createdAt: list[idx].createdAt ?? run.createdAt };
        } else {
          next = [run, ...list];
        }
        next = next.slice(0, MAX_RUNS);
        tx.set(ref, { v: JSON.stringify(next), ts: Date.now(), updatedBy });
      }
      if (hasMetrics) {
        const ref = db.doc(`organizations/${orgId}/data/${METRICS_KEY}`);
        const snap = await tx.get(ref);
        const prev = parseV(snap.data());
        const merged = normalizeMetrics(body.metrics as Dict, (prev && typeof prev === 'object' ? prev : {}) as Dict);
        tx.set(ref, { v: JSON.stringify(merged), ts: Date.now(), updatedBy });
      }
    });

    res.status(200).json({ ok: true, id: runId });
  },
);
