#!/usr/bin/env node
// Kirjaa kehitysagenttien ajon, tapahtuman tai terveysraportin Momentumiin
// (Cloud Function momentumDevAgents -> Agentit-sivun Momentum-kehitys-välilehti).
//
// Ympäristö:
//   AGENT_LOG_TOKEN        sama arvo kuin firebase/functions/.env (pakollinen, muuten ohitetaan hiljaa)
//   MOMENTUM_DEV_URL       oletus https://europe-west1-momentum-69262.cloudfunctions.net/momentumDevAgents
//
// Esimerkit:
//   kirjaa.mjs aloita  --id dev-20260926-1 --type huolto --summary "Huoltokierros alkoi"
//   kirjaa.mjs tapahtuma --id dev-20260926-1 --agent huoltaja --text "Ajaa lintin ja tyyppitarkistuksen"
//   kirjaa.mjs valmis  --id dev-20260926-1 --summary "..." --results korjaukset=2,loydokset=5 \
//                      --decision "Päivitetäänkö Next 16.3:een?" --branch claude/huolto-0926 --pr https://github.com/...
//   kirjaa.mjs virhe   --id dev-20260926-1 --summary "Build kaatui, ks. loki"
//   kirjaa.mjs terveys                      ajaa terveys.mjs --json ja lähettää tuloksen
//   kirjaa.mjs pyynto  --request req-... --status kaynnissa|valmis|virhe [--id dev-...] [--note "..."]
//   kirjaa.mjs palaute --feedback <docId> --status in-progress|done|declined|open [--note "..."]
//
// Ei koskaan kaada kutsujaa: virheet tulostetaan stderriin, exit 0 (paitsi väärät argumentit).

import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const URL_DEFAULT = 'https://europe-west1-momentum-69262.cloudfunctions.net/momentumDevAgents';
const HERE = dirname(fileURLToPath(import.meta.url));

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      if (out[k] === undefined) out[k] = v;
      else out[k] = [].concat(out[k], v);
    } else out._.push(a);
  }
  return out;
}

const list = v => (v === undefined ? [] : [].concat(v));
const csv = v => list(v).flatMap(x => String(x).split(',')).map(s => s.trim()).filter(Boolean);

function results(v) {
  const out = {};
  for (const pair of csv(v)) {
    const [k, n] = pair.split('=');
    if (k && Number.isFinite(Number(n))) out[k] = Number(n);
  }
  return Object.keys(out).length ? out : undefined;
}

function usage(msg) {
  if (msg) console.error(`kirjaa.mjs: ${msg}`);
  console.error('Käyttö: kirjaa.mjs aloita|tapahtuma|valmis|virhe|paatos|terveys|pyynto|palaute [--optiot]  (ks. tiedoston alku)');
  process.exit(2);
}

async function post(body) {
  const token = process.env.AGENT_LOG_TOKEN || '';
  const url = process.env.MOMENTUM_DEV_URL || URL_DEFAULT;
  if (!token) {
    console.error('kirjaa.mjs: AGENT_LOG_TOKEN puuttuu, kirjaus ohitetaan (ajo jatkuu normaalisti).');
    return;
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-agent-token': token },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    if (!res.ok) console.error(`kirjaa.mjs: ${res.status} ${text.slice(0, 300)}`);
    else console.log(text);
  } catch (e) {
    console.error(`kirjaa.mjs: yhteysvirhe ${e.message}`);
  }
}

const a = args(process.argv.slice(2));
const cmd = a._[0];
const id = a.id ? String(a.id) : undefined;

switch (cmd) {
  case 'aloita': {
    if (!id) usage('--id puuttuu');
    await post({ run: {
      id, status: 'kesken', type: a.type || 'muu', agents: csv(a.agents).length ? csv(a.agents) : ['kehityspaallikko'],
      summary: a.summary || '', date: new Date().toISOString(), source: a.source || 'agentti', requestId: a.request,
      branch: a.branch,
    } });
    break;
  }
  case 'tapahtuma': {
    if (!id || !a.text) usage('--id ja --text vaaditaan');
    await post({ runId: id, event: { agent: a.agent, text: String(a.text) } });
    break;
  }
  case 'valmis':
  case 'virhe':
  case 'paatos': {
    if (!id) usage('--id puuttuu');
    const run = {
      id,
      status: cmd === 'valmis' ? 'ok' : cmd,
      summary: a.summary || '',
      results: results(a.results),
      decisions: list(a.decision).map(String),
      branch: a.branch,
      prUrl: a.pr,
      durationMin: a.min ? Number(a.min) : undefined,
    };
    if (a.agents) run.agents = csv(a.agents);
    if (a.type) run.type = a.type;
    await post({ run });
    break;
  }
  case 'terveys': {
    let report;
    try {
      report = execFileSync(process.execPath, [join(HERE, 'terveys.mjs'), '--json'], { encoding: 'utf8' });
    } catch (e) {
      report = e.stdout; // exit 1 = virheitä löytyi, raportti silti stdoutissa
    }
    try { await post({ health: JSON.parse(report) }); } catch { console.error('kirjaa.mjs: terveysraportin jäsennys epäonnistui'); }
    break;
  }
  case 'pyynto': {
    if (!a.request || !a.status) usage('--request ja --status vaaditaan');
    await post({ requestId: String(a.request), status: String(a.status), runId: id, note: a.note });
    break;
  }
  case 'palaute': {
    if (!a.feedback || !a.status) usage('--feedback ja --status vaaditaan');
    await post({ feedbackId: String(a.feedback), feedbackStatus: String(a.status), note: a.note });
    break;
  }
  default:
    usage(cmd ? `tuntematon komento ${cmd}` : '');
}
