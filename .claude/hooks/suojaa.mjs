#!/usr/bin/env node
// PreToolUse-hook Momentumin agenteille: agentit kehittävät ja ehdottavat, ihminen julkaisee.
// Estää tuotantoon vaikuttavat ja peruuttamattomat komennot kaikilta sessioilta tässä repossa.
// Exit 2 = Claude Code estää työkalukutsun ja näyttää syyn mallille.
//
// Estetyt:
//   deploy: firebase deploy, npm run deploy, wrangler deploy/publish, netlify deploy
//   tuotantodata: firebase firestore:delete, auth:import, backfill-skripti
//   git: push päähaaraan (main/master), force-push, git reset --hard origin/*, branch -D main
//   salaisuudet: .env-tiedostojen muokkaus, service account -tiedostot
//
// Ihminen ajaa nämä itse terminaalissa (tai sanoo agentille "saat deployata" ja poistaa hookin väliaikaisesti).

import { readFileSync } from 'node:fs';

let input = {};
try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { process.exit(0); }

const tool = input.tool_name || '';
const ti = input.tool_input || {};

function block(reason) {
  process.stderr.write(`Estetty Momentumin suojahookilla: ${reason}\nAgentit eivät julkaise tuotantoon. Kirjaa tämä päätökseksi (kirjaa.mjs paatos --decision "...") ja jatka muuta työtä.\n`);
  process.exit(2);
}

if (tool === 'Bash') {
  const cmd = String(ti.command || '');
  const c = cmd.replace(/\s+/g, ' ');
  const rules = [
    [/\bfirebase\b[^|;&]*\bdeploy\b/, 'firebase deploy'],
    [/\bnpm\b[^|;&]*\brun\b[^|;&]*\bdeploy\b/, 'npm run deploy'],
    [/\bwrangler\b[^|;&]*\b(deploy|publish|secret put|kv:key put|r2 object delete)\b/, 'wrangler-julkaisu tai tuotantodatan muutos'],
    [/\bnetlify\b[^|;&]*\bdeploy\b/, 'netlify deploy'],
    [/\bfirebase\b[^|;&]*\b(firestore:delete|auth:import|functions:delete|hosting:disable)\b/, 'Firebase-tuotantodatan muutos'],
    [/backfillAssignedTasks|npm run backfill/, 'tuotantodatan backfill'],
    [/\bgit\b[^|;&]*\bpush\b[^|;&]*(--force(?!-with-lease)|\s-f\b|\s\+\S)/, 'force-push'],
    [/\bgit\b[^|;&]*\bpush\b[^|;&]*[\s:](main|master)(?=\s|$|[;&|])/, 'push päähaaraan'],
    [/\bgit\b[^|;&]*\breset\b[^|;&]*--hard\b[^|;&]*origin\//, 'git reset --hard origin/*'],
    [/\bgit\b[^|;&]*\bbranch\b[^|;&]*-D\s+(main|master)(?=\s|$|[;&|])/, 'päähaaran poisto'],
    [/(^|[\s;&|])(cat|less|head|tail|more|bat)\s+[^|;&]*\.env\b/, '.env-tiedoston lukeminen'],
  ];
  for (const [re, what] of rules) if (re.test(c)) block(what);
  // Push ilman haaraa päähaarasta on sama kuin push päähaaraan
  if (/\bgit\b[^|;&]*\bpush\b/.test(c) && !/\bpush\b\s+\S+\s+\S+/.test(c)) {
    try {
      const { execSync } = await import('node:child_process');
      const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8', cwd: input.cwd || process.cwd() }).trim();
      if (branch === 'main' || branch === 'master') block(`push ollessa haarassa ${branch}`);
    } catch { /* ei git-repoa */ }
  }
}

if (tool === 'Edit' || tool === 'Write' || tool === 'MultiEdit' || tool === 'NotebookEdit') {
  const p = String(ti.file_path || ti.notebook_path || '');
  if (/(^|\/)\.env(\.[\w-]+)?$/.test(p) && !p.endsWith('.example')) block(`salaisuustiedoston muokkaus (${p})`);
  if (/service-?account.*\.json$/i.test(p)) block(`service account -tiedoston muokkaus (${p})`);
}

process.exit(0);
