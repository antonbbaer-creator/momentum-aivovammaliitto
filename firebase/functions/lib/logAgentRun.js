"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAgentRun = void 0;
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const crypto_1 = require("crypto");
if (admin.apps.length === 0)
    admin.initializeApp();
const db = admin.firestore();
const AGENT_LOG_TOKEN = (0, params_1.defineString)('AGENT_LOG_TOKEN', { default: '' });
const ALLOWED_ORGS = ['hetki-company'];
const RUNS_KEY = 'hetkiAgentRuns';
const METRICS_KEY = 'hetkiAgentMetrics';
const MAX_RUNS = 500;
const MAX_EVENTS = 200;
const VALID_TYPES = ['tuntiajo', 'paivatarkistus', 'viikkokierros', 'kartoitus', 'muu'];
const VALID_STATUS = ['ok', 'kesken', 'virhe', 'paatos'];
const VALID_AGENTS = ['myyntipaallikko', 'prospektoija', 'viestiluonnostelija', 'vastausseuraaja', 'kilpailutusvahti', 'strategi'];
const RESULT_KEYS = ['uudetProspektit', 'tutkitut', 'luonnokset', 'lahteneet', 'vastaukset', 'soitot', 'followupit', 'kilpailutukset', 'hypoteesit'];
const METRIC_NUM_KEYS = ['lahetetty', 'vastannut', 'kiinnostunut', 'tapaaminen', 'voitettuEur', 'tarjousEur', 'keskusteluEur', 'tavoiteEur'];
function safeEqual(a, b) {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ab.length !== bb.length)
        return false;
    return (0, crypto_1.timingSafeEqual)(ab, bb);
}
function normalizeRun(raw) {
    const now = Date.now();
    const type = VALID_TYPES.includes(String(raw.type)) ? String(raw.type) : 'muu';
    let status = VALID_STATUS.includes(String(raw.status)) ? String(raw.status) : 'ok';
    const agents = (Array.isArray(raw.agents) ? raw.agents : [])
        .map(a => String(a))
        .filter(a => VALID_AGENTS.includes(a));
    const results = {};
    const rr = (raw.results && typeof raw.results === 'object' ? raw.results : {});
    for (const k of RESULT_KEYS) {
        const n = Number(rr[k]);
        if (Number.isFinite(n) && n > 0)
            results[k] = Math.round(n);
    }
    const decisions = (Array.isArray(raw.decisions) ? raw.decisions : [])
        .map(d => String(d).trim()).filter(Boolean).slice(0, 10);
    if (decisions.length && status === 'ok')
        status = 'paatos';
    const dateStr = typeof raw.date === 'string' && !Number.isNaN(Date.parse(raw.date))
        ? raw.date
        : new Date(now).toISOString();
    const duration = Number(raw.durationMin);
    const events = normalizeEvents(Array.isArray(raw.events) ? raw.events : []);
    const out = {
        id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 80) : `run-${now}-${Math.random().toString(36).slice(2, 7)}`,
        date: dateStr,
        type,
        agents: agents.length ? agents : ['myyntipaallikko'],
        status,
        summary: String(raw.summary || '').trim().slice(0, 2000),
        source: 'mac-mini',
        createdAt: now,
    };
    if (Object.keys(results).length)
        out.results = results;
    if (decisions.length)
        out.decisions = decisions;
    if (Number.isFinite(duration) && duration > 0)
        out.durationMin = Math.round(duration);
    if (events.length)
        out.events = events;
    return out;
}
function normalizeEvents(raw) {
    const now = Date.now();
    return raw
        .map(e => {
        const o = (e && typeof e === 'object' ? e : {});
        const text = String(o.text || '').trim().slice(0, 300);
        const agent = VALID_AGENTS.includes(String(o.agent)) ? String(o.agent) : undefined;
        const t = Number.isFinite(Number(o.t)) ? Number(o.t) : now;
        const out = { t, text };
        if (agent)
            out.agent = agent;
        return out;
    })
        .filter(e => e.text)
        .slice(-MAX_EVENTS);
}
function normalizeMetrics(raw, prev) {
    const out = { ...prev };
    for (const k of METRIC_NUM_KEYS) {
        if (raw[k] === undefined || raw[k] === null)
            continue;
        const n = Number(raw[k]);
        if (Number.isFinite(n) && n >= 0)
            out[k] = Math.round(n);
    }
    if (typeof raw.tavoiteNimi === 'string')
        out.tavoiteNimi = raw.tavoiteNimi.slice(0, 120);
    if (typeof raw.deadline === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.deadline))
        out.deadline = raw.deadline;
    if (typeof raw.note === 'string')
        out.note = raw.note.slice(0, 1000);
    out.updatedAt = Date.now();
    return out;
}
function parseV(data) {
    if (!data || typeof data.v !== 'string')
        return undefined;
    try {
        return JSON.parse(data.v);
    }
    catch {
        return undefined;
    }
}
exports.logAgentRun = (0, https_1.onRequest)({ region: 'europe-west1', cors: false, maxInstances: 2 }, async (req, res) => {
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
    const body = (req.body && typeof req.body === 'object' ? req.body : {});
    const orgId = String(body.orgId || 'hetki-company');
    if (!ALLOWED_ORGS.includes(orgId)) {
        res.status(400).json({ ok: false, error: 'unknown org' });
        return;
    }
    const hasRun = body.run && typeof body.run === 'object';
    const hasMetrics = body.metrics && typeof body.metrics === 'object';
    // Tapahtuma ajon sisällä: { runId, event: { agent?, text } }
    const eventRaw = body.event && typeof body.event === 'object' ? body.event : null;
    const eventRunId = String(body.runId || (hasRun ? body.run.id || '' : '')).slice(0, 80);
    const hasEvent = !!eventRaw && !!eventRunId && !!String(eventRaw.text || '').trim();
    if (!hasRun && !hasMetrics && !hasEvent) {
        res.status(400).json({ ok: false, error: 'run, event or metrics required' });
        return;
    }
    const updatedBy = 'agent:myyntipaallikko';
    let runId;
    await db.runTransaction(async (tx) => {
        if (hasRun || hasEvent) {
            const ref = db.doc(`organizations/${orgId}/data/${RUNS_KEY}`);
            const snap = await tx.get(ref);
            const prev = parseV(snap.data());
            let list = (Array.isArray(prev) ? prev : []);
            if (hasRun) {
                const rawRun = body.run;
                const run = normalizeRun(rawRun);
                runId = run.id;
                // Sama id päivittää olemassa olevan (esim. kesken -> ok). Vain annetut kentät
                // korvataan: loppukirjaus ilman --type tai --agents ei nollaa alkukirjausta.
                const idx = list.findIndex(r => r && r.id === run.id);
                if (idx >= 0) {
                    const patch = { ...run };
                    for (const k of ['type', 'agents', 'date', 'status', 'events']) {
                        if (rawRun[k] === undefined)
                            delete patch[k];
                    }
                    if (!String(rawRun.summary || '').trim())
                        delete patch.summary;
                    delete patch.createdAt;
                    delete patch.source;
                    const merged = { ...list[idx], ...patch };
                    // Uudet agentit lisätään vanhojen jatkoksi, ei korvata
                    if (rawRun.agents !== undefined) {
                        const oldAgents = (Array.isArray(list[idx].agents) ? list[idx].agents : []);
                        merged.agents = Array.from(new Set([...oldAgents, ...run.agents]));
                    }
                    list = [...list];
                    list[idx] = merged;
                }
                else {
                    list = [run, ...list];
                }
            }
            if (hasEvent) {
                const ev = normalizeEvents([{ ...eventRaw, t: Date.now() }])[0];
                if (ev) {
                    const idx = list.findIndex(r => r && r.id === eventRunId);
                    let target;
                    if (idx >= 0) {
                        target = { ...list[idx] };
                        list = [...list];
                    }
                    else {
                        // Tapahtuma ennen aloituskirjausta: luodaan kesken-ajo
                        target = normalizeRun({ id: eventRunId, status: 'kesken', type: body.type || 'muu', agents: ev.agent ? [ev.agent] : [] });
                        list = [target, ...list];
                    }
                    const events = (Array.isArray(target.events) ? target.events : []);
                    target.events = [...events, ev].slice(-MAX_EVENTS);
                    const agents = (Array.isArray(target.agents) ? target.agents : []);
                    if (ev.agent && !agents.includes(ev.agent))
                        target.agents = [...agents, ev.agent];
                    if (idx >= 0)
                        list[idx] = target;
                    else
                        list[0] = target;
                    runId = eventRunId;
                }
            }
            list = list.slice(0, MAX_RUNS);
            tx.set(ref, { v: JSON.stringify(list), ts: Date.now(), updatedBy });
        }
        if (hasMetrics) {
            const ref = db.doc(`organizations/${orgId}/data/${METRICS_KEY}`);
            const snap = await tx.get(ref);
            const prev = parseV(snap.data());
            const merged = normalizeMetrics(body.metrics, (prev && typeof prev === 'object' ? prev : {}));
            tx.set(ref, { v: JSON.stringify(merged), ts: Date.now(), updatedBy });
        }
    });
    res.status(200).json({ ok: true, id: runId });
});
