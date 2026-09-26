#!/usr/bin/env node
// Momentumin terveystarkistus: nopeat, deterministiset tarkistukset ilman riippuvuuksia.
// Huoltaja-agentti ajaa tämän jokaisen huoltokierroksen alussa, CI jokaisella pushilla.
//
//   node agentit/bin/terveys.mjs            ihmisluettava raportti
//   node agentit/bin/terveys.mjs --json     { checks: [{ id, label, status, detail }], commit, branch }
//
// status: ok | varoitus | virhe. Exit 1 jos yksikin virhe.
// Uusi tarkistus: lisää funktio CHECKS-listaan. Pidä jokainen alle sekunnin.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const NEXT = join(ROOT, 'momentum-next');
const FUNCS = join(ROOT, 'firebase', 'functions');

const read = p => readFileSync(join(ROOT, p), 'utf8');
const git = cmd => { try { return execSync(`git ${cmd}`, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };
const ok = detail => ({ status: 'ok', detail });
const warn = detail => ({ status: 'varoitus', detail });
const fail = detail => ({ status: 'virhe', detail });

function emailsIn(text) {
  return new Set((text.match(/'([a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]+)'/gi) || []).map(s => s.slice(1, -1).toLowerCase()));
}

function diffSets(a, b) {
  return { onlyA: [...a].filter(x => !b.has(x)), onlyB: [...b].filter(x => !a.has(x)) };
}

function walk(dir, exts, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name.startsWith('.')) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, exts, out);
    else if (exts.some(e => name.endsWith(e))) out.push(p);
  }
  return out;
}

// ── Tarkistukset ────────────────────────────────────────────────

const CHECKS = [
  {
    id: 'super-admin-sync',
    label: 'Super-admin-lista sama kolmessa paikassa',
    run() {
      const rulesText = read('firestore.rules');
      const fn = rulesText.match(/function isSuperAdmin\(\)[\s\S]*?\n\s{4}\}/);
      const rules = emailsIn(fn ? fn[0] : '');
      const next = emailsIn(read('momentum-next/lib/super-admins.ts'));
      const workerText = read('momentum-worker/src/index.js');
      const wm = workerText.match(/SUPER_ADMIN_EMAILS = new Set\(\[[\s\S]*?\]\)/);
      const worker = emailsIn(wm ? wm[0] : '');
      if (!rules.size || !next.size || !worker.size) return fail(`Listaa ei löytynyt: rules ${rules.size}, next ${next.size}, worker ${worker.size}`);
      const d1 = diffSets(rules, next);
      const d2 = diffSets(rules, worker);
      const problems = [];
      if (d1.onlyA.length) problems.push(`vain firestore.rules: ${d1.onlyA.join(', ')} (puuttuu super-admins.ts)`);
      if (d1.onlyB.length) problems.push(`vain super-admins.ts: ${d1.onlyB.join(', ')}`);
      if (d2.onlyA.length) problems.push(`puuttuu workerista: ${d2.onlyA.join(', ')}`);
      if (d2.onlyB.length) problems.push(`vain workerissa: ${d2.onlyB.join(', ')}`);
      return problems.length ? fail(problems.join('; ')) : ok(`${rules.size} osoitetta, kaikki kolme samassa`);
    },
  },
  {
    id: 'module-routes',
    label: 'Jokaisella moduulilla on sivu',
    run() {
      const text = read('momentum-next/lib/modules.ts');
      const reg = [...text.matchAll(/(\w+):\s*\{\s*id:\s*'(\w+)',[^}]*path:\s*'\/([\w-]+)'/g)].map(m => ({ key: m[1], id: m[2], path: m[3] }));
      if (!reg.length) return fail('MODULE_REGISTRY:n jäsentäminen epäonnistui');
      const missing = reg.filter(m => !existsSync(join(NEXT, 'app', '[orgSlug]', m.path, 'page.tsx'))).map(m => `${m.id} -> /${m.path}`);
      const mismatch = reg.filter(m => m.key !== m.id).map(m => `${m.key}≠${m.id}`);
      const orderM = text.match(/MODULE_ORDER = \[([^\]]*)\]/);
      const order = orderM ? [...orderM[1].matchAll(/'(\w+)'/g)].map(m => m[1]) : [];
      const ids = new Set(reg.map(m => m.id));
      const notInOrder = reg.filter(m => !order.includes(m.id)).map(m => m.id);
      const unknownInOrder = order.filter(id => !ids.has(id));
      const problems = [];
      if (missing.length) problems.push(`ei sivua: ${missing.join(', ')}`);
      if (mismatch.length) problems.push(`avain ja id eri: ${mismatch.join(', ')}`);
      if (unknownInOrder.length) problems.push(`MODULE_ORDER:ssa tuntematon: ${unknownInOrder.join(', ')}`);
      if (missing.length || mismatch.length || unknownInOrder.length) return fail(problems.join('; '));
      if (notInOrder.length) return warn(`ei MODULE_ORDER:ssa (ei näy sivupalkissa): ${notInOrder.join(', ')}`);
      return ok(`${reg.length} moduulia, kaikilla sivu`);
    },
  },
  {
    id: 'functions-exports',
    label: 'Cloud Functions: jokainen src-funktio exportattu',
    run() {
      const idx = read('firebase/functions/src/index.ts');
      const files = walk(join(FUNCS, 'src'), ['.ts']).filter(f => !f.includes(`${join('src', 'scripts')}`) && !f.endsWith('index.ts') && !f.endsWith('types.ts') && !f.includes(`${join('notifications', 'lib')}`));
      const notExported = files.filter(f => {
        const src = readFileSync(f, 'utf8');
        const names = [...src.matchAll(/export const (\w+)\s*=\s*on(Request|Document\w+|Schedule|Call)/g)].map(m => m[1]);
        return names.some(n => !idx.includes(n));
      }).map(f => relative(FUNCS, f));
      return notExported.length ? fail(`ei exportattu index.ts:ssä: ${notExported.join(', ')}`) : ok(`${files.length} lähdetiedostoa`);
    },
  },
  {
    id: 'dev-agent-ids',
    label: 'Kehitysagenttien id:t samat backendissä, UI:ssa ja .claude/agents:ssa',
    run() {
      const fnText = read('firebase/functions/src/devAgents.ts');
      const m = fnText.match(/VALID_AGENTS = \[([^\]]*)\]/);
      const backend = new Set(m ? [...m[1].matchAll(/'([\w-]+)'/g)].map(x => x[1]) : []);
      const uiText = existsSync(join(NEXT, 'lib', 'dev-agents-shared.ts')) ? read('momentum-next/lib/dev-agents-shared.ts') : '';
      const um = uiText.match(/export type DevAgentId =([^;]*);/);
      const ui = new Set(um ? [...um[1].matchAll(/'([\w-]+)'/g)].map(x => x[1]) : []);
      const agentsDir = join(ROOT, '.claude', 'agents');
      const files = existsSync(agentsDir) ? readdirSync(agentsDir).filter(f => f.startsWith('momentum-') && f.endsWith('.md')).map(f => f.slice(9, -3)) : [];
      const claude = new Set([...files, 'kehityspaallikko']); // koordinaattori on pääsessio, ei aliagentti
      const problems = [];
      const d1 = diffSets(backend, ui);
      const d2 = diffSets(backend, claude);
      if (d1.onlyA.length || d1.onlyB.length) problems.push(`backend vs UI: ${[...d1.onlyA.map(x => '+' + x), ...d1.onlyB.map(x => '-' + x)].join(' ')}`);
      if (d2.onlyA.length || d2.onlyB.length) problems.push(`backend vs .claude/agents: ${[...d2.onlyA.map(x => '+' + x), ...d2.onlyB.map(x => '-' + x)].join(' ')}`);
      return problems.length ? fail(problems.join('; ')) : ok(`${backend.size} agenttia`);
    },
  },
  {
    id: 'secrets',
    label: 'Ei salaisuuksia versionhallinnassa',
    run() {
      const tracked = git('ls-files').split('\n').filter(Boolean);
      const envFiles = tracked.filter(f => /(^|\/)\.env(\.|$)/.test(f) && !f.endsWith('.example'));
      const patterns = [
        [/sk-ant-[a-zA-Z0-9_-]{20,}/, 'Anthropic API -avain'],
        [/-----BEGIN (RSA |EC )?PRIVATE KEY-----/, 'yksityinen avain'],
        [/"private_key":\s*"-----BEGIN/, 'service account -avain'],
        [/AGENT_LOG_TOKEN\s*=\s*[A-Za-z0-9]{16,}/, 'AGENT_LOG_TOKEN-arvo'],
        [/ghp_[A-Za-z0-9]{30,}/, 'GitHub-token'],
        [/xox[bp]-[A-Za-z0-9-]{20,}/, 'Slack-token'],
      ];
      const hits = [];
      for (const f of tracked) {
        if (!/\.(ts|tsx|js|mjs|json|md|toml|sh|html|rules|yml|yaml|env)$/.test(f) || f.includes('package-lock')) continue;
        let text;
        try { text = readFileSync(join(ROOT, f), 'utf8'); } catch { continue; }
        if (text.length > 2_000_000) continue;
        for (const [re, what] of patterns) if (re.test(text)) hits.push(`${f} (${what})`);
      }
      if (envFiles.length) hits.push(...envFiles.map(f => `${f} (.env-tiedosto)`));
      return hits.length ? fail(hits.join(', ')) : ok(`${tracked.length} tiedostoa tarkistettu`);
    },
  },
  {
    id: 'rules-open-writes',
    label: 'Firestore- ja Storage-säännöissä ei avoimia kirjoituksia',
    run() {
      const problems = [];
      for (const f of ['firestore.rules', 'storage.rules', 'momentum-next/storage.rules']) {
        if (!existsSync(join(ROOT, f))) continue;
        const lines = read(f).split('\n');
        lines.forEach((l, i) => {
          if (/allow\s+[\w, ]*(write|create|update|delete)[\w, ]*:\s*if\s+true\s*;/.test(l)) problems.push(`${f}:${i + 1}`);
          if (/allow\s+[\w, ]*(write|create|update|delete)[\w, ]*;\s*$/.test(l)) problems.push(`${f}:${i + 1} (ei ehtoa)`);
        });
      }
      return problems.length ? fail(`avoin kirjoitus: ${problems.join(', ')}`) : ok('kaikilla kirjoituksilla on ehto');
    },
  },
  {
    id: 'functions-node',
    label: 'Cloud Functions -ajoympäristö yhtenäinen',
    run() {
      const pkg = JSON.parse(read('firebase/functions/package.json'));
      const fb = JSON.parse(read('firebase.json'));
      const rt = (fb.functions || [])[0]?.runtime || '';
      const engine = String(pkg.engines?.node || '');
      if (!rt.endsWith(engine)) return fail(`firebase.json ${rt} vs package.json engines.node ${engine}`);
      if (Number(engine) < 22) return warn(`Node ${engine}: yhteisön tuki päättyi 30.4.2026 ja Cloud Functions poistaa ajoympäristön käytöstä. Päivitä nodejs22:een (firebase.json + package.json engines) ja testaa emulaattorissa.`);
      return ok(`${rt}`);
    },
  },
  {
    id: 'big-files',
    label: 'Komponenttien koko hallinnassa',
    run() {
      const files = walk(join(NEXT, 'components'), ['.tsx', '.ts']).concat(walk(join(NEXT, 'app'), ['.tsx', '.ts'])).concat(walk(join(NEXT, 'lib'), ['.tsx', '.ts']));
      const big = files
        .map(f => ({ f: relative(NEXT, f), n: readFileSync(f, 'utf8').split('\n').length }))
        .filter(x => x.n > 1500)
        .sort((a, b) => b.n - a.n);
      if (!big.length) return ok(`${files.length} tiedostoa, kaikki alle 1500 riviä`);
      return warn(`yli 1500 riviä (${big.length}): ${big.slice(0, 8).map(x => `${x.f} ${x.n}`).join(', ')}${big.length > 8 ? ' …' : ''}`);
    },
  },
  {
    id: 'todos',
    label: 'Avoimet TODO/FIXME-merkinnät',
    run() {
      const files = [...walk(join(NEXT, 'app'), ['.ts', '.tsx']), ...walk(join(NEXT, 'components'), ['.ts', '.tsx']), ...walk(join(NEXT, 'lib'), ['.ts', '.tsx']), ...walk(join(FUNCS, 'src'), ['.ts']), 'firestore.rules'].map(f => f.startsWith('/') ? f : join(ROOT, f));
      const hits = [];
      for (const f of files) {
        readFileSync(f, 'utf8').split('\n').forEach((l, i) => { if (/\b(TODO|FIXME|XXX)\b/.test(l)) hits.push(`${relative(ROOT, f)}:${i + 1}`); });
      }
      if (!hits.length) return ok('ei merkintöjä');
      return warn(`${hits.length} kpl: ${hits.slice(0, 6).join(', ')}${hits.length > 6 ? ' …' : ''}`);
    },
  },
  {
    id: 'functions-lib-untracked',
    label: 'Käännettyä functions/lib-koodia ei versionhallinnassa',
    run() {
      const tracked = git('ls-files firebase/functions/lib').split('\n').filter(Boolean);
      return tracked.length ? warn(`${tracked.length} käännettyä tiedostoa gitissä: ne vanhenevat. git rm -r --cached firebase/functions/lib`) : ok('lib/ syntyy buildissa (predeploy)');
    },
  },
  {
    id: 'git-state',
    label: 'Git-tila',
    run() {
      const branch = git('rev-parse --abbrev-ref HEAD');
      const dirty = git('status --porcelain').split('\n').filter(Boolean).length;
      if (!branch) return warn('ei git-repoa');
      if (branch === 'main' || branch === 'master') return warn(`olet haarassa ${branch}: agentit työskentelevät aina omassa haarassa`);
      return ok(`${branch}${dirty ? `, ${dirty} muuttunutta tiedostoa` : ', puhdas'}`);
    },
  },
];

// ── Ajo ─────────────────────────────────────────────────────────

const results = CHECKS.map(c => {
  try {
    const r = c.run();
    return { id: c.id, label: c.label, ...r };
  } catch (e) {
    return { id: c.id, label: c.label, status: 'virhe', detail: `tarkistus kaatui: ${e.message}` };
  }
});

if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify({ checks: results, commit: git('rev-parse --short HEAD'), branch: git('rev-parse --abbrev-ref HEAD') }, null, 2) + '\n');
} else {
  const mark = { ok: '✓', varoitus: '!', virhe: '✗' };
  for (const r of results) console.log(`${mark[r.status]} ${r.label}\n    ${r.detail}`);
  const n = s => results.filter(r => r.status === s).length;
  console.log(`\n${n('ok')} ok · ${n('varoitus')} varoitusta · ${n('virhe')} virhettä`);
}
process.exit(results.some(r => r.status === 'virhe') ? 1 : 0);
