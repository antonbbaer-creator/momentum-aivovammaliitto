// Cloud Function: vastaanottaa Hetki Companyn asiakashankinta-agenttien ajot.
//
// Kutsuja: hetki-myynti/bin/kirjaa-ajo.sh Mac minillä (curl POST).
// Tunnistus: otsake x-agent-token, verrataan parametriin AGENT_LOG_TOKEN.
//   Arvo tiedostossa firebase/functions/.env (ei repossa): AGENT_LOG_TOKEN=<satunnainen>
//   Secret Manager vaatisi Blaze-laskutuksen, siksi tavallinen ympäristöparametri.
// Kirjoittaa:
//   organizations/{orgId}/data/hetkiAgentRuns     { v: JSON(AgentRun[]), ts, updatedBy }
//   organizations/{orgId}/data/hetkiAgentMetrics  { v: JSON(AgentMetrics), ts, updatedBy }
// Momentumin Agentit-sivu lukee nämä useOrgData-hookilla.
//
// Tämä funktio ei lähetä mitään minnekään. Se vain tallentaa yhteenvedon.

import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { defineString } from 'firebase-functions/params';
import { timingSafeEqual } from 'crypto';

if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

const AGENT_LOG_TOKEN = defineString('AGENT_LOG_TOKEN', { default: '' });

const ALLOWED_ORGS = ['hetki-company'];
const RUNS_KEY = 'hetkiAgentRuns';
const METRICS_KEY = 'hetkiAgentMetrics';
const PIPELINE_KEY = 'hetkiPipeline';
const MAX_PROSPECTS = 600;
const VALID_STAGES = ['idea', 'tutkittu', 'luonnos', 'lahetetty', 'keskustelu', 'tarjous', 'voitettu', 'havitetty'];
const MAX_RUNS = 500;
const MAX_EVENTS = 200;

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
  const events = normalizeEvents(Array.isArray(raw.events) ? raw.events : []);
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
  if (events.length) out.events = events;
  return out;
}

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

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);

/** Pipeline-peili: vain kentät, jotka Momentumin näkymä tarvitsee; loki tiivistetään viimeiseen riviin. */
function normalizePipeline(raw: Dict): Dict {
  const prospectsRaw = Array.isArray(raw.prospects) ? raw.prospects : [];
  const prospects = prospectsRaw.map(pr => {
    const p = (pr && typeof pr === 'object' ? pr : {}) as Dict;
    const log = Array.isArray(p.log) ? (p.log as Dict[]) : [];
    const last = log.length ? log[log.length - 1] : null;
    const out: Dict = {
      id: str(p.id, 120) || str(p.name, 60) || 'x',
      name: str(p.name, 200) || String(p.id || ''),
      stage: VALID_STAGES.includes(String(p.stage)) ? String(p.stage) : 'idea',
    };
    for (const k of ['segment', 'contact', 'email', 'phone', 'source', 'sentDate', 'nextAction', 'nextDate', 'createdAt', 'updatedAt']) {
      const v = str(p[k], 300); if (v) out[k] = v;
    }
    const angle = str(p.angle, 600); if (angle) out.angle = angle;
    const value = Number(p.value); if (Number.isFinite(value) && value > 0) out.value = Math.round(value);
    if (last) out.lastLog = { date: str(last.date, 20) || '', text: str(last.text, 400) || '' };
    if (log.length) out.logCount = log.length;
    return out;
  }).slice(0, MAX_PROSPECTS);
  const out: Dict = { prospects, syncedAt: Date.now(), syncedBy: 'agent:myyntipaallikko' };
  if (raw.goal && typeof raw.goal === 'object') {
    const g = raw.goal as Dict;
    out.goal = { name: str(g.name, 120), target: Number(g.target) || undefined, deadline: str(g.deadline, 20), note: str(g.note, 400) };
  }
  if (raw.strategy && typeof raw.strategy === 'object') {
    const st = raw.strategy as Dict;
    out.strategy = {
      kampanja: str(st.kampanja, 300),
      mittarit: st.mittarit && typeof st.mittarit === 'object' ? st.mittarit : undefined,
      hypoteesit: (Array.isArray(st.hypoteesit) ? st.hypoteesit : []).slice(0, 20).map(h => {
        const o = (h && typeof h === 'object' ? h : {}) as Dict;
        return { id: str(o.id, 20), vaite: str(o.vaite, 400), tila: str(o.tila, 40), data: str(o.data, 600), paatos: str(o.paatos, 400) ?? null };
      }),
      kokeilujono: (Array.isArray(st.kokeilujono) ? st.kokeilujono : []).slice(0, 30).map(x => String(x).slice(0, 600)),
      opit: (Array.isArray(st.opit) ? st.opit : []).slice(-30).map(x => String(x).slice(0, 800)),
      viimeksiRaportoitu: str(st.viimeksiRaportoitu, 40),
    };
  }
  return JSON.parse(JSON.stringify(out)); // poistaa undefined-kentät
}

function parseV(data: FirebaseFirestore.DocumentData | undefined): unknown {
  if (!data || typeof data.v !== 'string') return undefined;
  try { return JSON.parse(data.v); } catch { return undefined; }
}

export const logAgentRun = onRequest(
  { region: 'europe-west1', cors: false, maxInstances: 2 },
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
    // Tapahtuma ajon sisällä: { runId, event: { agent?, text } }
    const eventRaw = body.event && typeof body.event === 'object' ? (body.event as Dict) : null;
    const eventRunId = String(body.runId || (hasRun ? (body.run as Dict).id || '' : '')).slice(0, 80);
    const hasEvent = !!eventRaw && !!eventRunId && !!String(eventRaw.text || '').trim();
    const hasPipeline = !!body.pipeline && typeof body.pipeline === 'object' && Array.isArray((body.pipeline as Dict).prospects);
    if (!hasRun && !hasMetrics && !hasEvent && !hasPipeline) {
      res.status(400).json({ ok: false, error: 'run, event, metrics or pipeline required' });
      return;
    }

    const updatedBy = 'agent:myyntipaallikko';
    let runId: string | undefined;

    await db.runTransaction(async tx => {
      if (hasRun || hasEvent) {
        const ref = db.doc(`organizations/${orgId}/data/${RUNS_KEY}`);
        const snap = await tx.get(ref);
        const prev = parseV(snap.data());
        let list = (Array.isArray(prev) ? prev : []) as Dict[];

        if (hasRun) {
          const rawRun = body.run as Dict;
          const run = normalizeRun(rawRun);
          runId = run.id as string;
          // Sama id päivittää olemassa olevan (esim. kesken -> ok). Vain annetut kentät
          // korvataan: loppukirjaus ilman --type tai --agents ei nollaa alkukirjausta.
          const idx = list.findIndex(r => r && r.id === run.id);
          if (idx >= 0) {
            const patch: Dict = { ...run };
            for (const k of ['type', 'agents', 'date', 'status', 'events']) {
              if (rawRun[k] === undefined) delete patch[k];
            }
            if (!String(rawRun.summary || '').trim()) delete patch.summary;
            delete patch.createdAt;
            delete patch.source;
            const merged: Dict = { ...list[idx], ...patch };
            // Uudet agentit lisätään vanhojen jatkoksi, ei korvata
            if (rawRun.agents !== undefined) {
              const oldAgents = (Array.isArray(list[idx].agents) ? list[idx].agents : []) as string[];
              merged.agents = Array.from(new Set([...oldAgents, ...(run.agents as string[])]));
            }
            list = [...list];
            list[idx] = merged;
          } else {
            list = [run, ...list];
          }
        }

        if (hasEvent) {
          const ev = normalizeEvents([{ ...eventRaw, t: Date.now() }])[0];
          if (ev) {
            const idx = list.findIndex(r => r && r.id === eventRunId);
            let target: Dict;
            if (idx >= 0) {
              target = { ...list[idx] };
              list = [...list];
            } else {
              // Tapahtuma ennen aloituskirjausta: luodaan kesken-ajo
              target = normalizeRun({ id: eventRunId, status: 'kesken', type: (body.type as string) || 'muu', agents: ev.agent ? [ev.agent] : [] });
              list = [target, ...list];
            }
            const events = (Array.isArray(target.events) ? target.events : []) as Dict[];
            target.events = [...events, ev].slice(-MAX_EVENTS);
            const agents = (Array.isArray(target.agents) ? target.agents : []) as string[];
            if (ev.agent && !agents.includes(ev.agent as string)) target.agents = [...agents, ev.agent];
            if (idx >= 0) list[idx] = target; else list[0] = target;
            runId = eventRunId;
          }
        }

        list = list.slice(0, MAX_RUNS);
        tx.set(ref, { v: JSON.stringify(list), ts: Date.now(), updatedBy });
      }
      if (hasPipeline) {
        const ref = db.doc(`organizations/${orgId}/data/${PIPELINE_KEY}`);
        const mirror = normalizePipeline(body.pipeline as Dict);
        tx.set(ref, { v: JSON.stringify(mirror), ts: Date.now(), updatedBy });
      }
      if (hasMetrics) {
        const ref = db.doc(`organizations/${orgId}/data/${METRICS_KEY}`);
        const snap = await tx.get(ref);
        const prev = parseV(snap.data());
        const merged = normalizeMetrics(body.metrics as Dict, (prev && typeof prev === 'object' ? prev : {}) as Dict);
        tx.set(ref, { v: JSON.stringify(merged), ts: Date.now(), updatedBy });
      }
    });

    res.status(200).json({ ok: true, id: runId, pipeline: hasPipeline ? ((body.pipeline as Dict).prospects as unknown[]).length : undefined });
  },
);
