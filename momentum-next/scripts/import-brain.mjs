#!/usr/bin/env node
// Aivojen tuonti Hetki Brain -seedistä Firestoreen (ajetaan paikallisesti, data ei tule repoon).
//
// Käyttö (momentum-next-hakemistossa):
//   FIREBASE_ADMIN_KEY=<base64-tai-json> \
//     node scripts/import-brain.mjs <polku/hetki-brain-seed.json> --org hetki-company [--dry-run] [--views] [--goals <polku/goals.json>] [--force]
//   tai GOOGLE_APPLICATION_CREDENTIALS=<polku/service-account.json>
//
//   --dry-run  ei kirjoita mitään, näyttää mitä luotaisiin, päivitettäisiin ja ohitettaisiin
//   --views    tallentaa dashboard-muistiinpanojen näkymät (brainViews); ilman lippua vain raportoi
//   --goals    tavoitteet paikallisesta JSON-tiedostosta (rakenne: docs/aivot-kaytto.md)
//   --force    ylikirjoittaa myös muistiinpanot, joita on muokattu Momentumissa tuonnin jälkeen
//              (vanha sisältö säilyy versiohistoriassa)
//
// Idempotentti: muistiinpanon id = slugify(note.id). Uudelleenajo päivittää muuttuneet (versio + 1,
// revisio lähteellä 'import') ja ohittaa muuttumattomat. Mitään ei poisteta.
// Lokiin tulostetaan vain nimiä ja määriä, ei muistiinpanojen sisältöä.
// Ohje: docs/aivot-kaytto.md

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { randomBytes } from 'node:crypto';
import { initializeApp, cert, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { computeLinks } from '../lib/brain-core.mjs';
import {
  normalizeSeed, normalizeGoals, planNote, planProposal, planDoc, compareCounts, unresolvedSummary, stableJson,
  IMPORT_ACTOR,
} from './import-brain-lib.mjs';

const PROJECT_ID = 'momentum-69262';
const BATCH_LIMIT = 400;

// Kokoelmien nimet: samat kuin lib/brain-shared.ts BRAIN_COLLECTIONS (TS-tiedostoa ei voi tuoda .mjs:stä)
const C = {
  sections: 'brainSections',
  notes: 'brainNotes',
  noteNames: 'brainNoteNames',
  revisions: 'revisions',
  decisions: 'brainDecisions',
  proposals: 'brainProposals',
  goals: 'brainGoals',
  templates: 'brainTemplates',
  views: 'brainViews',
  audit: 'brainAuditLog',
};

class ImportError extends Error {}

// ── Argumentit ──────────────────────────────────────────────────

function parseArgs(argv) {
  const o = { seedPath: '', org: '', dryRun: false, views: false, goalsPath: '', force: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--org') o.org = argv[++i] || '';
    else if (a.startsWith('--org=')) o.org = a.slice(6);
    else if (a === '--goals') o.goalsPath = argv[++i] || '';
    else if (a.startsWith('--goals=')) o.goalsPath = a.slice(8);
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--views') o.views = true;
    else if (a === '--force') o.force = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else if (a.startsWith('--')) throw new ImportError(`Tuntematon valitsin: ${a}`);
    else if (!o.seedPath) o.seedPath = a;
    else throw new ImportError(`Ylimääräinen argumentti: ${a}`);
  }
  return o;
}

const USAGE = 'Käyttö: node scripts/import-brain.mjs <polku/hetki-brain-seed.json> --org <orgId> [--dry-run] [--views] [--goals <polku/goals.json>] [--force]';

function readJsonFile(path, label) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new ImportError(`${label}: tiedostoa ei voi lukea (${path})`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new ImportError(`${label}: virheellinen JSON (${e instanceof Error ? e.message.slice(0, 120) : 'tuntematon virhe'})`);
  }
}

// ── Firebase ────────────────────────────────────────────────────

/** Tunnistus kuten lib/firebase-admin.ts: FIREBASE_ADMIN_KEY (base64 tai JSON) tai GOOGLE_APPLICATION_CREDENTIALS. */
function initDb() {
  if (getApps().length) return getFirestore();
  const raw = process.env.FIREBASE_ADMIN_KEY;
  if (raw) {
    let json = raw.trim();
    if (!json.startsWith('{')) json = Buffer.from(json, 'base64').toString('utf-8');
    let sa;
    try {
      sa = JSON.parse(json);
    } catch {
      throw new ImportError('FIREBASE_ADMIN_KEY ei ole validia base64- tai JSON-muotoa');
    }
    if (sa.project_id && sa.project_id !== PROJECT_ID) {
      throw new ImportError(`Palvelutili kuuluu projektiin ${sa.project_id}, odotettiin ${PROJECT_ID}`);
    }
    initializeApp({ credential: cert(sa), projectId: PROJECT_ID });
    return getFirestore();
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
    return getFirestore();
  }
  return null;
}

/** Organisaatio on olemassa, jos dokumentti tai sen alikokoelmia on. */
async function orgExists(db, org) {
  const ref = db.doc(`organizations/${org}`);
  const snap = await ref.get();
  if (snap.exists) return true;
  const cols = await ref.listCollections();
  return cols.length > 0;
}

async function readCollection(db, org, name) {
  if (!db) return new Map();
  const snap = await db.collection(`organizations/${org}/${name}`).get();
  return new Map(snap.docs.map(d => [d.id, d.data()]));
}

/** Kirjoitukset ryhminä: yhden kohteen operaatiot (esim. muistiinpano + revisio) pysyvät samassa batchissa. */
class Writer {
  constructor(db) {
    this.db = db;
    this.batch = null;
    this.count = 0;
    this.total = 0;
    this.commits = 0;
  }
  async group(ops) {
    if (!ops.length) return;
    if (this.batch && this.count + ops.length > BATCH_LIMIT) await this.flush();
    if (!this.batch) this.batch = this.db.batch();
    for (const op of ops) {
      if (op.type === 'set') this.batch.set(op.ref, op.data);
      else if (op.type === 'update') this.batch.update(op.ref, op.data);
      else this.batch.delete(op.ref);
    }
    this.count += ops.length;
    this.total += ops.length;
  }
  async flush() {
    if (!this.batch || !this.count) return;
    await this.batch.commit();
    this.commits++;
    this.batch = null;
    this.count = 0;
  }
}

// ── Tulostus ────────────────────────────────────────────────────

const log = (...a) => console.log(...a);

function table(headers, rows) {
  const w = headers.map((h, i) => Math.max(h.length, ...rows.map(r => String(r[i] ?? '').length)));
  const line = cells => cells.map((c, i) => String(c ?? '').padEnd(w[i])).join('  ').trimEnd();
  log('  ' + line(headers));
  log('  ' + w.map(n => '-'.repeat(n)).join('  '));
  for (const r of rows) log('  ' + line(r));
}

function listNames(title, names, max = 100) {
  if (!names.length) return;
  log(`\n${title} (${names.length}):`);
  for (const n of names.slice(0, max)) log(`  - ${n}`);
  if (names.length > max) log(`  … ja ${names.length - max} muuta`);
}

// ── Pääohjelma ──────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { log(USAGE); return; }
  if (!args.seedPath || !args.org) throw new ImportError(USAGE);
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/i.test(args.org)) throw new ImportError(`Virheellinen organisaation tunnus: ${args.org}`);

  const seed = readJsonFile(args.seedPath, 'Seed');
  if (!seed || typeof seed !== 'object' || !seed.notes) throw new ImportError('Seed: notes-kenttä puuttuu. Onko tiedosto hetki-brain-seed.json?');
  const goalsInput = args.goalsPath ? normalizeGoals(readJsonFile(args.goalsPath, 'Tavoitteet')) : null;
  if (goalsInput?.errors.length) throw new ImportError(`Tavoitteet: ${goalsInput.errors.join('; ')}`);

  const db = initDb();
  if (!db && !args.dryRun) {
    throw new ImportError('Tunnukset puuttuvat: aseta FIREBASE_ADMIN_KEY (base64 tai JSON) tai GOOGLE_APPLICATION_CREDENTIALS.');
  }
  log(`Aivojen tuonti → organizations/${args.org} (${PROJECT_ID})${args.dryRun ? '  [KUIVAHARJOITUS: ei kirjoiteta]' : ''}`);
  log(`Seed: ${basename(args.seedPath)}${seed.meta?.exported_at ? `, viety ${seed.meta.exported_at}` : ''}`);
  if (!db) log('HUOM: tunnuksia ei ole, joten kantaa ei lueta. Kaikki näytetään uusina, eikä organisaation olemassaoloa tarkisteta.');
  else if (!(await orgExists(db, args.org))) throw new ImportError(`Organisaatiota "${args.org}" ei löydy Firestoresta`);

  const now = Date.now();
  const [exNotes, exNames, exSections, exProposals, exDecisions, exTemplates, exViews, exGoals] = await Promise.all([
    readCollection(db, args.org, C.notes),
    readCollection(db, args.org, C.noteNames),
    readCollection(db, args.org, C.sections),
    readCollection(db, args.org, C.proposals),
    readCollection(db, args.org, C.decisions),
    readCollection(db, args.org, C.templates),
    args.views ? readCollection(db, args.org, C.views) : Promise.resolve(new Map()),
    goalsInput ? readCollection(db, args.org, C.goals) : Promise.resolve(new Map()),
  ]);
  const existingNames = new Map([...exNames].map(([k, v]) => [k, String(v?.slug || '')]).filter(([, v]) => v));

  const data = normalizeSeed(seed, { now, existingNames });
  const reason = `Tuonti: ${basename(args.seedPath)}`;
  const col = name => db && db.collection(`organizations/${args.org}/${name}`);

  /** @type {Record<string, { create: number, update: number, skip: number, relink?: number, conflict?: number }>} */
  const stats = {};
  const bump = (type, action) => {
    stats[type] ||= { create: 0, update: 0, skip: 0 };
    stats[type][action] = (stats[type][action] || 0) + 1;
  };
  /** @type {{ type: string, ops: { type: 'set' | 'update' | 'delete', path: string[], data?: any }[] }[]} */
  const groups = [];
  const created = [];
  const updated = [];
  const conflicts = [];

  // Osiot
  for (const s of data.sections) {
    const p = planDoc(exSections.get(s.slug) || null, s);
    bump('osiot', p.action);
    if (p.doc) groups.push({ type: 'osiot', ops: [{ type: 'set', path: [C.sections, s.slug], data: p.doc }] });
  }

  // Muistiinpanot
  const desiredNames = new Map();
  const seedSlugs = new Set(data.notes.map(n => n.slug));
  for (const n of data.notes) {
    const prev = exNotes.get(n.slug) || null;
    const p = planNote(prev, n, { now, force: args.force, reason });
    bump('muistiinpanot', p.action);
    if (p.action === 'conflict') {
      conflicts.push(`${n.name} (${n.slug})`);
      if (prev?.nameKey) desiredNames.set(prev.nameKey, n.slug);
      continue;
    }
    desiredNames.set(n.nameKey, n.slug);
    if (p.action === 'create' || p.action === 'update') {
      (p.action === 'create' ? created : updated).push(n.name);
      groups.push({ type: 'muistiinpanot', ops: [
        { type: 'set', path: [C.notes, n.slug], data: p.note },
        { type: 'set', path: [C.notes, n.slug, C.revisions, String(p.note.version)], data: p.revision },
      ] });
    } else if (p.action === 'relink') {
      groups.push({ type: 'muistiinpanot', ops: [{ type: 'update', path: [C.notes, n.slug], data: p.patch }] });
    }
  }

  // Momentumissa luodut muistiinpanot: odottaneet linkit ratkeavat uusiin nimiin (kuten saveNote), ei uutta versiota
  let otherRelinked = 0;
  let notInSeed = 0;
  for (const [slug, prev] of exNotes) {
    if (seedSlugs.has(slug)) continue;
    if (prev.sourcePath) notInSeed++;
    const l = computeLinks(String(prev.bodyMd || ''), k => data.names.get(k), slug);
    const patch = { linksOut: l.linksOut, unresolvedLinks: l.unresolvedLinks, linkAliases: l.aliases };
    if (stableJson(patch) === stableJson({ linksOut: prev.linksOut || [], unresolvedLinks: prev.unresolvedLinks || [], linkAliases: prev.linkAliases || {} })) continue;
    otherRelinked++;
    groups.push({ type: 'linkit', ops: [{ type: 'update', path: [C.notes, slug], data: patch }] });
  }

  // Nimi-indeksi: brainNoteNames/{nameKey} = { slug }
  for (const [key, slug] of desiredNames) {
    if (existingNames.get(key) === slug) { bump('nimet', 'skip'); continue; }
    bump('nimet', existingNames.has(key) ? 'update' : 'create');
    groups.push({ type: 'nimet', ops: [{ type: 'set', path: [C.noteNames, key], data: { slug } }] });
  }
  // Seedin muistiinpanojen vanhat nimet (nimi muuttunut seedissä) poistetaan indeksistä
  let removedNames = 0;
  for (const [key, slug] of existingNames) {
    if (seedSlugs.has(slug) && !desiredNames.has(key)) {
      removedNames++;
      groups.push({ type: 'nimet', ops: [{ type: 'delete', path: [C.noteNames, key] }] });
    }
  }

  // Ehdotukset
  for (const pr of data.proposals) {
    const p = planProposal(exProposals.get(pr.id) || null, pr);
    bump('ehdotukset', p.action);
    if (p.doc) groups.push({ type: 'ehdotukset', ops: [{ type: 'set', path: [C.proposals, pr.id], data: p.doc }] });
  }

  // Päätökset, pohjat, näkymät, tavoitteet
  const simple = [
    ['päätökset', C.decisions, data.decisions, exDecisions, 'id'],
    ['pohjat', C.templates, data.templates, exTemplates, 'id'],
    ...(args.views ? [['näkymät', C.views, data.views, exViews, 'id']] : []),
    ...(goalsInput ? [['tavoitteet', C.goals, goalsInput.goals, exGoals, 'id']] : []),
  ];
  for (const [type, colName, docs, existing, idKey] of simple) {
    for (const d of docs) {
      const p = planDoc(existing.get(d[idKey]) || null, d);
      bump(type, p.action);
      if (p.doc) groups.push({ type, ops: [{ type: 'set', path: [colName, d[idKey]], data: p.doc }] });
    }
  }

  // ── Raportti ──
  log('\nMuutokset tyypeittäin' + (args.dryRun ? ' (kuivaharjoitus: näin tehtäisiin)' : '') + ':');
  table(
    ['tyyppi', 'luodaan', 'päivitetään', 'ohitetaan', 'lisätietoa'],
    Object.entries(stats).map(([t, s]) => [
      t, s.create, s.update, s.skip,
      [s.relink ? `${s.relink} linkkipäivitystä ilman uutta versiota` : '', s.conflict ? `${s.conflict} Momentumissa muokattua ohitettu` : ''].filter(Boolean).join(', '),
    ]),
  );
  if (removedNames) log(`  Nimi-indeksistä poistetaan ${removedNames} vanhaa nimeä (nimi muuttunut seedissä).`);
  if (otherRelinked) log(`  Momentumissa luotujen muistiinpanojen linkkejä päivitetään: ${otherRelinked}.`);
  if (notInSeed) log(`  Kannassa on ${notInSeed} aiemmin tuotua muistiinpanoa, joita ei ole tässä seedissä. Niitä ei poisteta.`);
  if (!args.views) log(`  Näkymiä löytyi ${data.views.length} (${data.report.skippedDashboards} dashboardista). Tallenna ne lipulla --views.`);

  listNames('Uudet muistiinpanot', created);
  listNames('Päivitettävät muistiinpanot', updated);
  listNames('Momentumissa muokattu, ei ylikirjoiteta (käytä --force, vanha sisältö jää versiohistoriaan)', conflicts);

  log('\nVertailu meta.counts_by_kind-lukuihin:');
  const rows = compareCounts(seed.meta?.counts_by_kind, data.notes, data.report.skippedDashboards);
  table(['tyyppi', 'seed', 'tuotu', 'ero', ''], rows.map(r => [
    r.kind, r.seed ?? '–', r.imported, r.diff === null ? '–' : r.diff > 0 ? `+${r.diff}` : r.diff, r.note || (r.diff ? 'TARKISTA' : ''),
  ]));

  const unresolved = unresolvedSummary(data.notes);
  const metaUnresolved = Array.isArray(seed.meta?.unresolved_links) ? seed.meta.unresolved_links.length : null;
  log(`\nRatkaisemattomat linkit: ${unresolved.length} eri nimeä${metaUnresolved !== null ? ` (seedin meta: ${metaUnresolved})` : ''}. Osa on tarkoituksella tulevia sivuja.`);
  for (const [k, c] of unresolved.slice(0, 50)) log(`  - ${k}${c > 1 ? ` (${c} viittausta)` : ''}`);
  if (unresolved.length > 50) log(`  … ja ${unresolved.length - 50} muuta`);

  const r = data.report;
  if (r.duplicateNames.length) {
    log(`\nKaksoisnimet (${r.duplicateNames.length}): jälkimmäinen sai numeron, jotta linkit pysyvät yksiselitteisinä.`);
    for (const d of r.duplicateNames) log(`  - "${d.name}" → "${d.renamedTo}" (${d.slug})`);
  }
  if (r.duplicateSlugs.length) {
    log(`\nSama tunniste useammalla muistiinpanolla (${r.duplicateSlugs.length}): jälkimmäinen sai päätteen.`);
    for (const d of r.duplicateSlugs) log(`  - ${d.id} → ${d.slug}`);
  }
  const unknown = Object.entries(r.unknownSections);
  if (unknown.length) {
    log(`\nTuntemattomat osiot (muistiinpanot osioon "${data.sections.find(s => s.slug === 'inbox')?.title || data.sections[0].title}"):`);
    for (const [name, c] of unknown) log(`  - ${name}: ${c}`);
  }
  const kinds = Object.entries(r.unknownKinds);
  if (kinds.length) log(`\nTuntemattomat tyypit tuotiin tyyppinä note: ${kinds.map(([k, c]) => `${k} (${c})`).join(', ')}`);
  if (r.missingProposalIds.length) log(`\nproposals-listan id:t, joille ei löytynyt muistiinpanoa: ${r.missingProposalIds.join(', ')}`);
  if (r.invalidDecisions) log(`\nPäätösrivejä ilman päätöstekstiä ohitettiin: ${r.invalidDecisions}`);
  if (r.notesWithoutName) log(`\nMuistiinpanoja ilman nimeä (nimeksi tuli tunniste): ${r.notesWithoutName}`);

  const opCount = groups.reduce((a, g) => a + g.ops.length, 0);
  if (args.dryRun || !db) {
    log(`\nKuivaharjoitus valmis: ${opCount} kirjoitusta tehtäisiin. Mitään ei kirjoitettu.`);
    return;
  }

  // ── Kirjoitus ──
  const w = new Writer(db);
  const ref = path => {
    let r0 = col(path[0]).doc(path[1]);
    for (let i = 2; i < path.length; i += 2) r0 = r0.collection(path[i]).doc(path[i + 1]);
    return r0;
  };
  for (const g of groups) await w.group(g.ops.map(op => ({ type: op.type, ref: ref(op.path), data: op.data })));
  // Yksi kokoava audit-rivi per ajo, ettei loki tulvi
  const auditRef = col(C.audit).doc(`a-${now.toString(36)}-${randomBytes(4).toString('hex')}`);
  await w.group([{ type: 'set', ref: auditRef, data: {
    id: auditRef.id, actorType: 'user', actorId: IMPORT_ACTOR.id, actorName: IMPORT_ACTOR.name,
    action: 'import.run', entity: 'brain', entityId: args.org,
    diff: JSON.parse(JSON.stringify({ seed: basename(args.seedPath), exportedAt: seed.meta?.exported_at, stats, views: args.views, goals: !!goalsInput, force: args.force })),
    createdAt: now,
  } }]);
  await w.flush();
  log(`\nValmis: ${w.total} kirjoitusta ${w.commits} erässä. Audit-rivi: ${auditRef.id}`);
}

main().then(
  () => process.exit(0),
  e => {
    const msg = e instanceof ImportError ? e.message : `Odottamaton virhe: ${e instanceof Error ? `${e.name}: ${e.message.slice(0, 300)}` : 'tuntematon'}`;
    console.error(`\nVirhe: ${msg}`);
    process.exit(1);
  },
);
