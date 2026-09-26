'use client';

// Momentumin ylläpito- ja kehitysagentit — jaettu tietomalli Agentit-sivun Momentum-kehitys-välilehdelle.
//
// Agentit ovat Claude Code -aliagentteja tämän repon .claude/agents/momentum-*.md -tiedostoissa,
// ja niitä ajetaan skilleillä /momentum-huolto, /momentum-kehitys ja /momentum-jono.
// Momentum ei aja agentteja: se näyttää ajot ja terveyden ja välittää pyynnöt.
// Ajot tulevat Cloud Functionin momentumDevAgents kautta (agentit/bin/kirjaa.mjs).
//
// Firestore-avaimet (organizations/hetki-company/data/*):
//   momentumDevRuns      DevRun[]       uusin ensin
//   momentumDevRequests  DevRequest[]   Antonin pyynnöt agenteille
//   momentumDevFocus     AgentFocus     pysyvä painotus
//   momentumDevHealth    DevHealth      viimeisin terveystarkistus (agentit/bin/terveys.mjs)

import type { AgentEvent, AgentFocus, HetkiTone, RequestStatus, RunStatus } from './agents-shared';

export type DevAgentId = 'kehityspaallikko' | 'huoltaja' | 'kehittaja' | 'tarkastaja' | 'tietoturva' | 'saavutettavuus' | 'tuoteomistaja';

export type DevRunType = 'huolto' | 'kehitys' | 'korjaus' | 'katselmointi' | 'muu';

export interface DevRunResults {
  korjaukset?: number;
  ominaisuudet?: number;
  loydokset?: number;
  tiedostot?: number;
  palautteet?: number;
}

export interface DevEvent extends Omit<AgentEvent, 'agent'> {
  agent?: DevAgentId;
}

export interface DevRun {
  id: string;
  date: string;
  type: DevRunType;
  agents: DevAgentId[];
  status: RunStatus;
  summary: string;
  results?: DevRunResults;
  decisions?: string[];
  resolved?: boolean;
  durationMin?: number;
  events?: DevEvent[];
  branch?: string;
  prUrl?: string;
  requestId?: string;
  source?: string;
  createdAt: number;
}

export interface DevRequest {
  id: string;
  createdAt: number;
  createdBy?: string;
  type: DevRunType;
  instructions: string;
  status: RequestStatus;
  claimedAt?: number;
  finishedAt?: number;
  runId?: string;
  note?: string;
}

export type HealthStatus = 'ok' | 'varoitus' | 'virhe';

export interface HealthCheck {
  id: string;
  label: string;
  status: HealthStatus;
  detail: string;
}

export interface DevHealth {
  checks: HealthCheck[];
  ok?: number;
  varoitus?: number;
  virhe?: number;
  ranAt?: number;
  commit?: string;
  branch?: string;
}

export const DEV_RUNS_KEY = 'momentumDevRuns';
export const DEV_REQUESTS_KEY = 'momentumDevRequests';
export const DEV_FOCUS_KEY = 'momentumDevFocus';
export const DEV_HEALTH_KEY = 'momentumDevHealth';
export const DEV_MAX_REQUESTS = 200;

// Stabiilit oletukset (ei uusia objekteja renderissä)
export const EMPTY_DEV_RUNS: DevRun[] = [];
export const EMPTY_DEV_REQUESTS: DevRequest[] = [];
export const EMPTY_HEALTH: DevHealth = { checks: [] };
export const DEFAULT_DEV_FOCUS: AgentFocus = {
  kulma: 'Tietoturva ja datan säilyminen ensin. Sitten AVL:n palautteet ja saavutettavuus. Ei uusia riippuvuuksia ilman syytä. Isot muutokset pilkotaan pieniksi PR:iksi.',
};

export interface DevAgentDef {
  id: DevAgentId;
  label: string;
  glyph: string;
  tone: HetkiTone;
  model: 'opus' | 'sonnet';
  role: string;
  does: string[];
  never: string[];
  file?: string;              // .claude/agents/<file>
}

export const DEV_AGENT_DEFS: DevAgentDef[] = [
  {
    id: 'kehityspaallikko', label: 'Kehityspäällikkö', glyph: '◉', tone: 'blue', model: 'opus',
    role: 'Koordinaattori: pääsessio, joka ajaa kierrokset',
    does: ['Jakaa työn aliagenteille ja ajaa riippumattomat rinnakkain', 'Päättää: korjataan nyt, backlogiin vai päätös Antonille', 'Kirjaa ajot ja terveyden tänne'],
    never: ['Ei kirjoita tuotantokoodia itse', 'Ei deployaa eikä pushaa main-haaraan'],
  },
  {
    id: 'tuoteomistaja', label: 'Tuoteomistaja', glyph: '◈', tone: 'green', model: 'opus', file: 'momentum-tuoteomistaja.md',
    role: 'Palautteet ja pyynnöt priorisoiduksi backlogiksi',
    does: ['Lukee Palaute-moduulin ja tämän sivun pyynnöt', 'Yhdistää päällekkäiset, arvioi koon ja riskin', 'Kirjoittaa hyväksymiskriteerit'],
    never: ['Ei koske koodiin', 'Ei linjaa isoja asioita ilman Antonia'],
  },
  {
    id: 'kehittaja', label: 'Kehittäjä', glyph: '✎', tone: 'pink', model: 'opus', file: 'momentum-kehittaja.md',
    role: 'Toteuttaa rajatun tehtävän',
    does: ['Kopioi lähimmän olemassa olevan toteutuksen rakenteen', 'Ajaa lintin, tyypit ja buildin', 'Committaa omaan haaraan'],
    never: ['Ei arvaa epäselvää', 'Ei uusia riippuvuuksia ilman lupaa', 'Ei riko vanhaa dataa'],
  },
  {
    id: 'tarkastaja', label: 'Tarkastaja', glyph: '◎', tone: 'yellow', model: 'opus', file: 'momentum-tarkastaja.md',
    role: 'Koodikatselmointi ennen PR:ää',
    does: ['Lukee muuttuneet tiedostot kokonaan', 'Ajaa tarkistukset itse', 'Vahvistaa jokaisen epäilyn ennen raportointia'],
    never: ['Ei muokkaa tiedostoja', 'Ei raportoi tyylimakua bugeina'],
  },
  {
    id: 'tietoturva', label: 'Tietoturva', glyph: '▤', tone: 'black', model: 'opus', file: 'momentum-tietoturva.md',
    role: 'Säännöt, auth, org-rajat, salaisuudet',
    does: ['Firestore- ja Storage-säännöt', 'Functionsin ja Workerin tunnistus', 'Riippuvuuksien haavoittuvuudet'],
    never: ['Ei muokkaa', 'Ei raportoi teoreettisia riskejä ilman hyökkäyspolkua'],
  },
  {
    id: 'saavutettavuus', label: 'Saavutettavuus', glyph: '◐', tone: 'green', model: 'sonnet', file: 'momentum-saavutettavuus.md',
    role: 'WCAG 2.1 AA, selkokieli, mobiili',
    does: ['Näppäimistö, kontrasti, ruudunlukija', 'Selkokieli AVL:n käyttäjille', 'Yksi moduuli per huoltokierros'],
    never: ['Ei muokkaa', 'Ei hyväksy pelkkää väriä merkityksenä'],
  },
  {
    id: 'huoltaja', label: 'Huoltaja', glyph: '◇', tone: 'blue', model: 'sonnet', file: 'momentum-huoltaja.md',
    role: 'Ylläpito: terveys, buildit, riippuvuudet',
    does: ['Terveystarkistus, lint, tyypit, buildit', 'Patch-tason tietoturvapäivitykset', 'Synkasta poikenneet listat'],
    never: ['Ei major-päivityksiä ilman päätöstä', 'Ei käytösmuutoksia'],
  },
];

export const DEV_AGENT_BY_ID: Record<DevAgentId, DevAgentDef> = Object.fromEntries(
  DEV_AGENT_DEFS.map(a => [a.id, a]),
) as Record<DevAgentId, DevAgentDef>;

export const DEV_RUN_TYPE_META: Record<DevRunType, { label: string; short: string; detail: string }> = {
  huolto: { label: 'Huoltokierros', short: 'Huolto', detail: 'Terveys, lint, tyypit, buildit, tietoturva ja yhden moduulin saavutettavuus. Turvalliset korjaukset omaan haaraan. 15–30 min.' },
  kehitys: { label: 'Kehitys', short: 'Kehitys', detail: 'Kuvaa mitä haluat. Tuoteomistaja rajaa, kehittäjä toteuttaa, tarkastaja katselmoi. Valmis muutos haaraan tai PR:ksi.' },
  korjaus: { label: 'Bugikorjaus', short: 'Korjaus', detail: 'Kerro mikä on rikki ja missä. Kehittäjä korjaa, tarkastaja varmistaa ettei muu hajoa.' },
  katselmointi: { label: 'Katselmointi', short: 'Katselmointi', detail: 'Anna haara tai PR-linkki. Tarkastaja ja tarvittaessa tietoturva käyvät muutoksen läpi.' },
  muu: { label: 'Vapaa tehtävä', short: 'Vapaa', detail: 'Kehityspäällikkö päättää, kenelle tehtävä kuuluu.' },
};

export const DEV_RESULT_LABELS: Record<keyof DevRunResults, string> = {
  korjaukset: 'korjausta',
  ominaisuudet: 'ominaisuutta',
  loydokset: 'löydöstä',
  tiedostot: 'tiedostoa',
  palautteet: 'palautetta',
};

export const HEALTH_META: Record<HealthStatus, { label: string; mark: string; color: string }> = {
  ok: { label: 'Kunnossa', mark: '✓', color: 'var(--green)' },
  varoitus: { label: 'Varoitus', mark: '!', color: 'var(--yellow)' },
  virhe: { label: 'Virhe', mark: '✗', color: 'var(--red)' },
};

export function activeDevRuns(runs: DevRun[]): DevRun[] {
  return [...runs].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}

export function pendingDevDecisions(runs: DevRun[]): DevRun[] {
  return runs.filter(r => !r.resolved && (r.decisions?.length || 0) > 0);
}

/** Käynnissä oleva ajo: kesken-tilassa ja alkanut alle 3 h sitten (vanhempi = kaatunut hiljaa). */
export function runningDevRun(runs: DevRun[], now: number): DevRun | undefined {
  return runs.find(r => r.status === 'kesken' && now - Date.parse(r.date) < 3 * 3600000);
}

export function newDevRequestId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
