#!/usr/bin/env node
// Hakee Momentumista kehitysagenttien työjonon: kehityspyynnöt (Agentit > Momentum-kehitys),
// pysyvän painotuksen ja avoimet palautteet (Palaute-moduuli, kaikki orgit).
//
//   node agentit/bin/pyynnot.mjs            tiivis lista
//   node agentit/bin/pyynnot.mjs --json     koko vastaus
//
// Ympäristö: AGENT_LOG_TOKEN, MOMENTUM_DEV_URL (kuten kirjaa.mjs).
// Ilman tokenia tulostaa ohjeen ja palauttaa tyhjän jonon (exit 0), jotta skillit toimivat offline.

const URL_DEFAULT = 'https://europe-west1-momentum-69262.cloudfunctions.net/momentumDevAgents';
const token = process.env.AGENT_LOG_TOKEN || '';
const url = process.env.MOMENTUM_DEV_URL || URL_DEFAULT;
const asJson = process.argv.includes('--json');

const empty = { ok: false, offline: true, focus: { kulma: '' }, pending: [], running: [], feedback: [] };

async function main() {
  if (!token) {
    console.error('pyynnot.mjs: AGENT_LOG_TOKEN puuttuu. Käytetään vain repon agentit/BACKLOG.md:tä.');
    if (asJson) console.log(JSON.stringify(empty, null, 2));
    return;
  }
  let data = empty;
  try {
    const res = await fetch(url, { headers: { 'x-agent-token': token }, signal: AbortSignal.timeout(15000) });
    data = await res.json();
    if (!res.ok) console.error(`pyynnot.mjs: ${res.status} ${JSON.stringify(data).slice(0, 300)}`);
  } catch (e) {
    console.error(`pyynnot.mjs: yhteysvirhe ${e.message}`);
  }
  if (asJson) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  const d = s => (s ? String(s).replace(/\s+/g, ' ').slice(0, 160) : '');
  console.log(`Painotus: ${d(data.focus?.kulma) || '(ei asetettu)'}`);
  console.log(`\nKehityspyynnöt jonossa (${data.pending?.length || 0}):`);
  for (const r of data.pending || []) console.log(`  ${r.id} [${r.type}] ${d(r.instructions)}`);
  if (data.running?.length) {
    console.log(`\nKäynnissä (${data.running.length}):`);
    for (const r of data.running) console.log(`  ${r.id} [${r.type}] ${d(r.instructions)}`);
  }
  console.log(`\nAvoimet palautteet (${data.feedback?.length || 0}):`);
  for (const f of data.feedback || []) console.log(`  ${f.id} [${f.type}/${f.status}] ${f.orgName || f.orgId}: ${d(f.text)}`);
}

await main();
