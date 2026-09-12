'use client';

// Hetki Companyn asiakashankinta-agentit — jaettu tietomalli Momentumille.
//
// Agentit pyörivät Mac minillä Claude Code -sessiossa (repo hetki-myynti).
// Momentum ei aja agentteja, se näyttää mitä ne tekevät ja mitä ne saavat aikaan.
// Ajot tulevat Firestoreen kahta reittiä:
//   1. Cloud Function logAgentRun (hetki-myynti/bin/kirjaa-ajo.sh kutsuu sitä ajon lopuksi)
//   2. Käsin Agentit-sivulta (canEdit-käyttäjät)
//
// Firestore-avaimet (organizations/hetki-company/data/*):
//   hetkiAgentRuns     AgentRun[]     uusin ensin, enintään MAX_RUNS
//   hetkiAgentMetrics  AgentMetrics   strategi päivittää viikkokierroksella

import { useEffect, useState } from 'react';

export type AgentId =
  | 'myyntipaallikko'
  | 'prospektoija'
  | 'viestiluonnostelija'
  | 'vastausseuraaja'
  | 'kilpailutusvahti'
  | 'strategi';

export type RunType = 'tuntiajo' | 'paivatarkistus' | 'viikkokierros' | 'kartoitus' | 'muu';

// ok = valmis, kesken = ajo käynnissä, virhe = keskeytyi, paatos = odottaa Antonin päätöstä
export type RunStatus = 'ok' | 'kesken' | 'virhe' | 'paatos';

export interface AgentRunResults {
  uudetProspektit?: number;   // idea-vaiheeseen luodut
  tutkitut?: number;          // idea -> tutkittu
  luonnokset?: number;        // Gmail-luonnokset
  lahteneet?: number;         // Anton lähetti, agentti merkitsi lahetetty
  vastaukset?: number;        // uudet vastaukset prospekteilta
  soitot?: number;            // soittolistalle nostetut
  followupit?: number;        // follow-up-luonnokset
  kilpailutukset?: number;    // löydetyt realistiset haut
  hypoteesit?: number;        // päivitetyt hypoteesit strategy/active
}

// Yksi tapahtuma ajon sisällä: "prospektoija tutkii NRW.Global Business"
export interface AgentEvent {
  t: number;                  // aikaleima ms
  agent?: AgentId;            // kuka teki; puuttuu jos koordinaattorin yleinen huomio
  text: string;
}

export interface AgentRun {
  id: string;
  date: string;               // ISO 8601, ajon alkuhetki
  type: RunType;
  agents: AgentId[];          // ketkä osallistuivat (koordinaattori mukaan lukien)
  status: RunStatus;
  summary: string;            // 1–5 riviä, mitä tehtiin
  results?: AgentRunResults;
  decisions?: string[];       // mitä Anton päättää; tyhjä jos ei mitään
  resolved?: boolean;         // Anton merkitsi päätökset käsitellyiksi
  durationMin?: number;
  events?: AgentEvent[];      // tapahtumavirta ajon aikana, vanhin ensin
  source?: 'mac-mini' | 'manual';
  createdAt: number;
  deletedAt?: number;
}

export interface AgentMetrics {
  lahetetty?: number;
  vastannut?: number;
  kiinnostunut?: number;
  tapaaminen?: number;
  voitettuEur?: number;
  tarjousEur?: number;
  keskusteluEur?: number;
  tavoiteEur?: number;
  tavoiteNimi?: string;
  deadline?: string;          // YYYY-MM-DD
  note?: string;
  updatedAt?: number;
}

export const MAX_RUNS = 500;
export const MAX_EVENTS = 200;
export const RUNS_KEY = 'hetkiAgentRuns';
export const METRICS_KEY = 'hetkiAgentMetrics';

// Stabiilit oletukset (ei uusia objekteja renderissä, kts. org-defaults.ts)
export const EMPTY_RUNS: AgentRun[] = [];
export const DEFAULT_METRICS: AgentMetrics = {
  tavoiteEur: 10000,
  tavoiteNimi: 'Slush 2026 -myynti',
  deadline: '2026-11-19',
};

export type HetkiTone = 'blue' | 'green' | 'yellow' | 'pink' | 'black';

export interface AgentDef {
  id: AgentId;
  label: string;
  glyph: string;              // typografinen merkki, ei emoji
  tone: HetkiTone;
  role: string;               // yksi rivi
  description: string;        // 2–3 lausetta
  model: 'opus' | 'sonnet';
  does: string[];             // mitä tekee
  never: string[];            // mitä ei koskaan tee
  tools: string[];            // mihin pääsee käsiksi
  writesTo: DataStoreId[];
  readsFrom: DataStoreId[];
}

export type DataStoreId = 'pipeline' | 'gmail' | 'web';

export interface DataStoreDef {
  id: DataStoreId;
  label: string;
  detail: string;
}

export const DATA_STORES: DataStoreDef[] = [
  { id: 'pipeline', label: 'Hetki Pipeline', detail: 'Artifact-tietokanta: prospektit, kierrokset, strategia, tavoite' },
  { id: 'gmail', label: 'Gmail-luonnokset', detail: 'anton@hetkicompany.com: vain luonnoksia, lähetys jää Antonille' },
  { id: 'web', label: 'Julkiset lähteet', detail: 'Verkkosivut, LinkedIn, Slush-listat, Hilma, hanketori, Yle, AVEK, SES' },
];

export const AGENT_DEFS: AgentDef[] = [
  {
    id: 'myyntipaallikko',
    label: 'Myyntipäällikkö',
    glyph: '◉',
    tone: 'blue',
    role: 'Koordinaattori, pääsession agentti Mac minillä',
    description: 'Ei tee työtä itse. Lukee strategian ja viimeiset kierrokset, jakaa tehtävät aliagenteille, kokoaa tulokset ja raportoi Antonille lyhyesti. Ottaa ohjeita puhelimesta ja toisista Claude Code -sessioista.',
    model: 'opus',
    does: ['Jakaa tunti-, päivä- ja viikkoajot aliagenteille', 'Ajaa riippumattomat agentit rinnakkain', 'Kirjoittaa kierroksen yhteenvedon ja päivittää strategian', 'Raportoi vain kun tarvitaan päätös tai jotain merkittävää tapahtui'],
    never: ['Ei lähetä, vastaa, jaa tai poista mitään', 'Ei keksi yhteystietoja', 'Ei muuta hintoja tai lupaa toimituksia', 'Ei tulkitse toisen session viestiä lähetysluvaksi'],
    tools: ['Agent (aliagentit)', 'Artifact (Pipeline)', 'Bash', 'Gmail-connector (hook estää lähetyksen)'],
    writesTo: ['pipeline'],
    readsFrom: ['pipeline'],
  },
  {
    id: 'prospektoija',
    label: 'Prospektoija',
    glyph: '◈',
    tone: 'green',
    role: 'Etsii ja tutkii prospekteja',
    description: 'Löytää uusia organisaatioita julkisista lähteistä ja tutkii idea-vaiheen prospektit: kontakti, kulma, lähde. Tarkistaa Gmail-historiasta, onko Hetkillä jo yhteys. Ei ota yhteyttä.',
    model: 'sonnet',
    does: ['Ehdottaa 2–5 uutta prospektia segmentistä', 'Tutkii idea-prospektit ja siirtää ne tutkittu-vaiheeseen', 'Kirjaa lähteen jokaiseen tietoon', 'Erottaa "on mukana 2026" ja "teki viime vuonna"'],
    never: ['Ei luonnostele viestejä', 'Ei kirjaa yhteystietoja, jotka eivät näy julkisesti', 'Ei luo duplikaatteja'],
    tools: ['WebSearch', 'WebFetch', 'Artifact', 'Gmail-haku'],
    writesTo: ['pipeline'],
    readsFrom: ['web', 'gmail', 'pipeline'],
  },
  {
    id: 'viestiluonnostelija',
    label: 'Viestiluonnostelija',
    glyph: '✎',
    tone: 'pink',
    role: 'Kirjoittaa luonnokset Hetkin äänellä',
    description: 'Tekee yhteydenotto- ja follow-up-luonnokset Gmailiin tutkituille prospekteille. Avaus, Sun Effects -referenssi, CTA ja allekirjoitus skillin muodossa. Jatkaa vanhaa ketjua, jos yhteys on jo olemassa.',
    model: 'opus',
    does: ['Luonnostelee vain tutkittu-vaiheen prospekteille', 'Suomeksi kotimaisille, englanniksi ulkomaisille', 'Päivittää prospektin luonnos-vaiheeseen', 'Näyttää uuden viestityypin Antonille ennen luonnosta'],
    never: ['Ei koskaan lähetä', 'Ei hintoja ilman Antonin ohjetta', 'Ei kylmää avausta, jos yhteys on jo olemassa'],
    tools: ['Gmail create_draft ja update_draft', 'Artifact'],
    writesTo: ['gmail', 'pipeline'],
    readsFrom: ['pipeline', 'gmail'],
  },
  {
    id: 'vastausseuraaja',
    label: 'Vastausseuraaja',
    glyph: '◎',
    tone: 'yellow',
    role: 'Lähteneet, vastaukset, soittolista, follow-upit',
    description: 'Tarkistaa Gmailista, mitkä luonnokset Anton lähetti ja kuka vastasi. Päivittää vaiheet ja soittopäivät, luonnostelee vastaukset samaan ketjuun ja nostaa Antonille päätökset hinnasta, laajuudesta ja aikataulusta.',
    model: 'sonnet',
    does: ['Lähtenyt luonnos: vaihe lähetetty ja soittopäivä 3 arkipäivän päähän', 'Uusi vastaus: vaihe, loki, vastausluonnos', 'Ei vastausta: soitto, follow-up, kolmen kierroksen jälkeen ehdotus', 'Rivit "soita tänään" ja "jatka keskustelua"'],
    never: ['Ei lähetä eikä vastaa itse', 'Ei päätä hinnasta tai laajuudesta', 'Ei hae verkosta'],
    tools: ['Gmail-haku ja luonnokset', 'Artifact'],
    writesTo: ['gmail', 'pipeline'],
    readsFrom: ['gmail', 'pipeline'],
  },
  {
    id: 'kilpailutusvahti',
    label: 'Kilpailutusvahti',
    glyph: '▤',
    tone: 'black',
    role: 'Hilma, hanketori, avoimet haut, kelpoisuus',
    description: 'Seuraa julkisia hankintailmoituksia ja avoimia hakuja ja sanoo suoraan, kelpaako Hetki niihin. Kirjaa realistiset haut pipelineen määräaikoineen ja nostaa alle 10 päivän määräajat erikseen.',
    model: 'sonnet',
    does: ['Hakee CPV-koodeilla ja hakusanoilla', 'Arvioi liikevaihto-, vakuutus- ja referenssivaatimukset', 'Kirjaa realistiset haut idea-vaiheeseen', 'Merkitsee "ei kelpaa" ja syyn'],
    never: ['Ei hae eikä lähetä mitään', 'Ei pehmennä kelpoisuutta', 'Ei koske Gmailiin'],
    tools: ['WebSearch', 'WebFetch', 'Artifact'],
    writesTo: ['pipeline'],
    readsFrom: ['web', 'pipeline'],
  },
  {
    id: 'strategi',
    label: 'Strategi',
    glyph: '◐',
    tone: 'blue',
    role: 'Mittarit, hypoteesit, strategy/active',
    description: 'Laskee pipeline-datasta lähetetty, vastannut, kiinnostunut ja tapaaminen segmenteittäin sekä eurot vastaan tavoite. Päivittää agenttien pitkän muistin ja ehdottaa muutoksia, kun data sitä tukee.',
    model: 'opus',
    does: ['Mittarit segmenteittäin ja kielittäin', 'Hypoteesien tila ja opit', 'Kokeilujono', 'Muutosehdotus, jos 8 viestiä ulkona ja alle 2 vastausta'],
    never: ['Ei koske Gmailiin', 'Ei päätä strategiasta, ehdottaa vain', 'Ei lisää oppeja ilman dataa'],
    tools: ['Artifact'],
    writesTo: ['pipeline'],
    readsFrom: ['pipeline'],
  },
];

export const AGENT_BY_ID: Record<AgentId, AgentDef> = Object.fromEntries(
  AGENT_DEFS.map(a => [a.id, a]),
) as Record<AgentId, AgentDef>;

export const SUB_AGENT_IDS: AgentId[] = ['prospektoija', 'viestiluonnostelija', 'vastausseuraaja', 'kilpailutusvahti', 'strategi'];

export const RUN_TYPE_META: Record<RunType, { label: string; short: string; detail: string; agents: AgentId[] }> = {
  tuntiajo: {
    label: 'Tuntiajo',
    short: 'Tunti',
    detail: 'Joka tunti. Yksi tehtävä kiertäen, yksi aliagentti. Raportoi vain jos tarvitaan päätös tai jotain merkittävää tapahtui.',
    agents: ['myyntipaallikko'],
  },
  paivatarkistus: {
    label: 'Päivätarkistus',
    short: 'Päivä',
    detail: 'Tiistai–perjantai klo 9. Vain vastausseuraaja: lähteneet, vastaukset, soittolista. Korkeintaan 10 riviä.',
    agents: ['myyntipaallikko', 'vastausseuraaja'],
  },
  viikkokierros: {
    label: 'Viikkokierros',
    short: 'Viikko',
    detail: 'Maanantai klo 8. Kaikki aliagentit, strategi viimeisenä. Tutkii, luonnostelee, seuraa, laskee mittarit.',
    agents: ['myyntipaallikko', 'prospektoija', 'viestiluonnostelija', 'vastausseuraaja', 'kilpailutusvahti', 'strategi'],
  },
  kartoitus: {
    label: 'Kartoitus',
    short: 'Kartoitus',
    detail: 'Torstai klo 9. Kilpailutusvahti ja prospektoija rinnakkain: uudet haut ja segmentit.',
    agents: ['myyntipaallikko', 'kilpailutusvahti', 'prospektoija'],
  },
  muu: {
    label: 'Muu ajo',
    short: 'Muu',
    detail: 'Vapaamuotoinen pyyntö Antonilta.',
    agents: ['myyntipaallikko'],
  },
};

export const RUN_STATUS_META: Record<RunStatus, { label: string; color: string }> = {
  ok: { label: 'Valmis', color: 'var(--green)' },
  kesken: { label: 'Kesken', color: 'var(--yellow)' },
  virhe: { label: 'Keskeytyi', color: 'var(--red)' },
  paatos: { label: 'Odottaa päätöstäsi', color: 'var(--pink)' },
};

export const RESULT_LABELS: Record<keyof AgentRunResults, string> = {
  uudetProspektit: 'uutta prospektia',
  tutkitut: 'tutkittu',
  luonnokset: 'luonnosta',
  lahteneet: 'lähtenyt',
  vastaukset: 'vastausta',
  soitot: 'soittoa',
  followupit: 'follow-upia',
  kilpailutukset: 'hakua',
  hypoteesit: 'hypoteesia',
};

export const RESULT_KEYS = Object.keys(RESULT_LABELS) as (keyof AgentRunResults)[];

// ── Apurit ──────────────────────────────────────────────────────

export function toneVar(tone: HetkiTone): string {
  return `var(--hetki-${tone})`;
}

const VALID_TYPES: RunType[] = ['tuntiajo', 'paivatarkistus', 'viikkokierros', 'kartoitus', 'muu'];
const VALID_STATUS: RunStatus[] = ['ok', 'kesken', 'virhe', 'paatos'];
const VALID_AGENTS: AgentId[] = AGENT_DEFS.map(a => a.id);

/** Siistii ulkoa tulleen ajon: puuttuvat kentät, tuntemattomat agentit, tyhjät luvut. */
export function normalizeRun(raw: Partial<AgentRun> & Record<string, unknown>): AgentRun {
  const now = Date.now();
  const type = VALID_TYPES.includes(raw.type as RunType) ? (raw.type as RunType) : 'muu';
  const status = VALID_STATUS.includes(raw.status as RunStatus) ? (raw.status as RunStatus) : 'ok';
  const agents = (Array.isArray(raw.agents) ? raw.agents : [])
    .filter((a): a is AgentId => VALID_AGENTS.includes(a as AgentId));
  const results: AgentRunResults = {};
  const rr = (raw.results || {}) as Record<string, unknown>;
  for (const k of RESULT_KEYS) {
    const n = Number(rr[k]);
    if (Number.isFinite(n) && n > 0) results[k] = Math.round(n);
  }
  const decisions = (Array.isArray(raw.decisions) ? raw.decisions : [])
    .map(d => String(d).trim()).filter(Boolean).slice(0, 10);
  const dateStr = typeof raw.date === 'string' && !Number.isNaN(Date.parse(raw.date))
    ? raw.date
    : new Date(now).toISOString();
  const events: AgentEvent[] = (Array.isArray(raw.events) ? raw.events : [])
    .map((e: unknown) => {
      const o = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>;
      const text = String(o.text || '').trim().slice(0, 300);
      const agent = VALID_AGENTS.includes(o.agent as AgentId) ? (o.agent as AgentId) : undefined;
      const t = Number.isFinite(Number(o.t)) ? Number(o.t) : now;
      return { t, agent, text };
    })
    .filter(e => e.text)
    .slice(-MAX_EVENTS);
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `run-${now}-${Math.random().toString(36).slice(2, 7)}`,
    date: dateStr,
    type,
    agents: agents.length ? agents : ['myyntipaallikko'],
    status: decisions.length && status === 'ok' ? 'paatos' : status,
    summary: String(raw.summary || '').trim().slice(0, 2000),
    results: Object.keys(results).length ? results : undefined,
    decisions: decisions.length ? decisions : undefined,
    resolved: raw.resolved === true,
    durationMin: Number.isFinite(Number(raw.durationMin)) && Number(raw.durationMin) > 0 ? Math.round(Number(raw.durationMin)) : undefined,
    events: events.length ? events : undefined,
    source: raw.source === 'manual' ? 'manual' : 'mac-mini',
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : now,
  };
}

export function activeRuns(runs: AgentRun[]): AgentRun[] {
  return runs.filter(r => !r.deletedAt).sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}

export function sumResults(runs: AgentRun[]): Required<AgentRunResults> {
  const out = Object.fromEntries(RESULT_KEYS.map(k => [k, 0])) as Required<AgentRunResults>;
  for (const r of runs) {
    if (!r.results) continue;
    for (const k of RESULT_KEYS) out[k] += r.results[k] || 0;
  }
  return out;
}

export function runsSince(runs: AgentRun[], days: number, now = Date.now()): AgentRun[] {
  const limit = now - days * 86400000;
  return runs.filter(r => Date.parse(r.date) >= limit);
}

export function pendingDecisions(runs: AgentRun[]): AgentRun[] {
  return runs.filter(r => r.status === 'paatos' && !r.resolved && (r.decisions?.length || 0) > 0);
}

/** Käynnissä oleva ajo: uusin, jonka status on kesken ja joka on alkanut alle 6 h sitten. */
export function runningRun(runs: AgentRun[], now = Date.now()): AgentRun | undefined {
  return runs.find(r => r.status === 'kesken' && now - Date.parse(r.date) < 6 * 3600000);
}

/** Agentti, joka teki viimeisimmän tapahtuman (tai koordinaattori). */
export function activeAgentOf(run: AgentRun | undefined): AgentId | null {
  if (!run) return null;
  const ev = run.events && run.events.length ? run.events[run.events.length - 1] : undefined;
  return ev?.agent || 'myyntipaallikko';
}

export function fmtClock(ts: number): string {
  return new Intl.DateTimeFormat('fi-FI', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(ts));
}

export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h} h ${m % 60} min`;
  if (m > 0) return `${m} min ${s % 60} s`;
  return `${s} s`;
}

export function lastRunOfAgent(runs: AgentRun[], id: AgentId): AgentRun | undefined {
  return runs.find(r => r.agents.includes(id));
}

/** Seuraava ajastettu ajo Helsingin aikataulun mukaan (selaimen paikallisaika). */
export function nextScheduledRuns(now = new Date()): { type: RunType; at: Date }[] {
  const out: { type: RunType; at: Date }[] = [];
  // tuntiajo: seuraava tasatunti
  const hour = new Date(now);
  hour.setMinutes(0, 0, 0);
  hour.setHours(hour.getHours() + 1);
  out.push({ type: 'tuntiajo', at: hour });

  const findNext = (weekdays: number[], h: number): Date => {
    for (let d = 0; d < 8; d++) {
      const c = new Date(now);
      c.setDate(c.getDate() + d);
      c.setHours(h, 0, 0, 0);
      if (weekdays.includes(c.getDay()) && c.getTime() > now.getTime()) return c;
    }
    return now;
  };
  out.push({ type: 'viikkokierros', at: findNext([1], 8) });
  out.push({ type: 'paivatarkistus', at: findNext([2, 3, 4, 5], 9) });
  out.push({ type: 'kartoitus', at: findNext([4], 9) });
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

export function fmtRelative(ts: number, now = Date.now()): string {
  const diff = Math.max(0, now - ts);
  const min = Math.round(diff / 60000);
  if (min < 1) return 'juuri nyt';
  if (min < 60) return `${min} min sitten`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h sitten`;
  const d = Math.round(h / 24);
  return `${d} pv sitten`;
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('fi-FI', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })
    .format(d).replace('.,', ' ·');
}

export function fmtEurShort(n: number): string {
  return `${Math.round(n).toLocaleString('fi-FI')} €`;
}

/** Nykyhetki renderiin puhtaasti: alkuarvo kerran, päivitys minuutin välein. */
export function useNow(intervalMs = 60000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
