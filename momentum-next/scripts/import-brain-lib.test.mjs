// Aivojen tuonnin muunnosten testit keksityllä seedillä (ei oikeaa dataa).
// Ajo: node --test momentum-next/scripts/import-brain-lib.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSeed, normalizeGoals, planNote, planProposal, planDoc, compareCounts, unresolvedSummary,
  normalizeProposalStatus, parseTime, sameNoteContent,
} from './import-brain-lib.mjs';

const NOW = Date.UTC(2026, 8, 26, 12);

const SEED = {
  meta: {
    org: 'Testi Oy',
    exported_at: '2026-09-25T10:00:00Z',
    counts_by_kind: { core: 1, note: 3, dashboard: 1, proposal: 1, inbox_entry: 1 },
    unresolved_links: ['Tuleva sivu'],
  },
  sections: [
    { id: 'ydin', name: 'Ydin', description: 'Miksi olemme olemassa', order: 0 },
    { slug: 'asiakkaat', title: 'Asiakkaat', order: 1 },
    { name: 'Ehdotukset', order: 2 },
    { name: 'Inbox', order: 3 },
  ],
  notes: [
    {
      id: 'Ydin/Keksitty Oy', path: 'Ydin/Keksitty Oy.md', name: 'Keksitty Oy', section: 'Ydin', kind: 'core',
      title: 'Keksitty Oy', properties: { tyyppi: 'ydin' },
      body_md: 'Asiakas [[Asiakas A|A]] ja [[Tuleva sivu]].\n\n⚠️ Tarkista luku\n',
      needs_review: false, modified_at: '2026-09-01T08:00:00Z',
    },
    {
      id: 'Asiakkaat/Asiakas A', path: 'Asiakkaat/Asiakas A.md', name: 'Asiakas A', section: 'asiakkaat', kind: 'note',
      properties: { tila: 'aktiivinen' }, body_md: 'Takaisin [[keksitty oy]].', needs_review: true, review_notes: ['Yhteyshenkilö puuttuu'],
    },
    {
      // Sama nimi kuin edellisellä: jälkimmäinen saa " (2)"
      id: 'Inbox/Asiakas A', path: 'Muut/Asiakas A.md', name: 'Asiakas A', section: 'Tuntematon osio', kind: 'inbox_entry',
      properties: {}, body_md: 'Kirjaus.',
    },
    {
      id: 'Ehdotukset/Uusi palvelu', path: 'Ehdotukset/Uusi palvelu.md', name: 'Uusi palvelu', section: 'Ehdotukset', kind: 'proposal',
      properties: { tila: 'Hyväksytty', alue: 'Myynti', vaikutus: 'suuri', kiire: 'pieni', tekijä: 'Strategiaagentti' },
      body_md: 'Ehdotus, ei päätös.\n\n## Lähteet\n\n- [[Asiakas A]]\n- https://example.com/a\n',
    },
    {
      id: 'Koti', path: 'Koti.base', name: 'Koti', kind: 'dashboard',
      saved_views: [
        { name: 'Aktiiviset asiakkaat', filters: { and: ['file.inFolder("Asiakkaat")', 'tila == "aktiivinen"'] }, order: ['file.name', 'note.tila'] },
        { name: 'Kaikki' },
      ],
    },
    {
      id: 'Toimintatavat/Muistio', path: 'Toimintatavat/Muistio.md', name: 'Muistio', section: 'Ydin', kind: 'note',
      properties: { lista: ['a', 'b'], 'huono.avain': 'x' }, body_md: '```\n[[Ei linkki]]\n```\n[[Asiakas A]]',
    },
  ],
  templates: [
    { name: 'Asiakas', kind: 'note', properties_template: { tila: '' }, body_md: '# {{title}}\n\n{{date}}' },
    { name: 'Ehdotukset', properties: { tila: 'uusi' }, body_md: '' },
  ],
  proposals: ['Ehdotukset/Uusi palvelu'],
  decisions: [
    { date: '2026-09-01', decision: 'Keskitytään yhteen palveluun', area: '[[Asiakas A]]', rationale: 'Resurssit' },
    { date: '2026-09-02', decision: 'Toinen päätös', area: 'Ei ole olemassa' },
    { date: '2026-09-02', decision: 'Toinen päätös', area: 'Ei ole olemassa' },
    { date: '2026-09-03' },
  ],
  links: [{ from: 'Ydin/Keksitty Oy', to: 'Asiakkaat/Asiakas A', target_name: 'Asiakas A', alias: 'A' }],
};

const run = (existingNames) => normalizeSeed(SEED, { now: NOW, existingNames });

test('osiot: joustavat kentät, järjestys ja kuvaus', () => {
  const r = run();
  assert.deepEqual(r.sections.map(x => x.slug), ['ydin', 'asiakkaat', 'ehdotukset', 'inbox']);
  assert.equal(r.sections[0].title, 'Ydin');
  assert.equal(r.sections[0].description, 'Miksi olemme olemassa');
  assert.equal(r.sections[0].parentSlug, null);
});

test('dashboard ohitetaan sisältönä, näkymät tulkitaan', () => {
  const r = run();
  assert.equal(r.notes.length, 5);
  assert.ok(!r.notes.some(n => n.kind === 'dashboard'));
  assert.equal(r.report.skippedDashboards, 1);
  assert.equal(r.views.length, 2);
  const v = r.views[0];
  assert.equal(v.id, 'koti-aktiiviset-asiakkaat');
  assert.deepEqual(v.filter, { tila: 'aktiivinen' });
  assert.deepEqual(v.columns, ['name', 'tila']);
  assert.equal(v.sectionSlug, 'asiakkaat');
  assert.ok(v.raw.includes('Aktiiviset'));
});

test('linkit ratkeavat kaikkien tuotujen nimien hakemistosta, alias ja koodilohko', () => {
  const r = run();
  const core = r.notes.find(n => n.kind === 'core');
  assert.equal(core.slug, 'ydin-keksitty-oy');
  assert.deepEqual(core.linksOut, ['asiakkaat-asiakas-a']);
  assert.deepEqual(core.unresolvedLinks, ['tuleva sivu']);
  assert.deepEqual(core.linkAliases, { 'asiakkaat-asiakas-a': 'A' });
  assert.deepEqual(core.reviewItems, ['Tarkista luku']);
  assert.equal(core.needsReview, true);
  assert.equal(core.createdAt, Date.parse('2026-09-01T08:00:00Z'));
  const a = r.notes.find(n => n.slug === 'asiakkaat-asiakas-a');
  assert.deepEqual(a.linksOut, ['ydin-keksitty-oy']); // [[keksitty oy]] kirjainkoosta riippumatta
  assert.equal(a.needsReview, true);
  assert.equal(a.reviewNotes, 'Yhteyshenkilö puuttuu');
  assert.equal(a.createdAt, NOW);
  const m = r.notes.find(n => n.name === 'Muistio');
  assert.deepEqual(m.linksOut, ['asiakkaat-asiakas-a']);
  assert.deepEqual(m.unresolvedLinks, []);
  assert.deepEqual(m.properties, { lista: 'a, b' });
  assert.deepEqual(unresolvedSummary(r.notes), [['tuleva sivu', 1]]);
});

test('BrainNote-rakenne vastaa saveNotea', () => {
  const r = run();
  const keys = Object.keys(r.notes.find(n => n.kind === 'core')).sort();
  assert.deepEqual(keys, [
    'bodyMd', 'createdAt', 'createdBy', 'isDraft', 'kind', 'linkAliases', 'linksOut', 'name', 'nameKey', 'needsReview',
    'properties', 'reviewItems', 'sectionSlug', 'slug', 'sourcePath', 'title', 'unresolvedLinks', 'updatedAt', 'updatedBy', 'version',
  ]);
  for (const n of r.notes) {
    assert.equal(n.createdBy, 'Tuonti');
    assert.equal(n.version, 1);
    assert.equal(r.names.get(n.nameKey), n.slug);
  }
});

test('kaksoisnimi: jälkimmäinen saa (2), tuntematon osio → inbox', () => {
  const r = run();
  assert.deepEqual(r.report.duplicateNames, [{ name: 'Asiakas A', renamedTo: 'Asiakas A (2)', slug: 'inbox-asiakas-a' }]);
  const dup = r.notes.find(n => n.slug === 'inbox-asiakas-a');
  assert.equal(dup.name, 'Asiakas A (2)');
  assert.equal(dup.nameKey, 'asiakas a (2)');
  assert.equal(dup.sectionSlug, 'inbox');
  assert.deepEqual(r.report.unknownSections, { 'Tuntematon osio': 1 });
});

test('kannassa oleva nimi toisella muistiinpanolla varaa nimen ja ratkaisee linkin', () => {
  const r = run(new Map([['tuleva sivu', 'momentumissa-luotu'], ['muistio', 'toinen']]));
  const core = r.notes.find(n => n.kind === 'core');
  assert.deepEqual(core.unresolvedLinks, []);
  assert.ok(core.linksOut.includes('momentumissa-luotu'));
  assert.equal(r.notes.find(n => n.slug === 'toimintatavat-muistio').name, 'Muistio (2)');
});

test('proposal tuottaa sekä muistiinpanon että ehdotuksen', () => {
  const r = run();
  const note = r.notes.find(n => n.kind === 'proposal');
  assert.equal(note.isDraft, true);
  assert.equal(r.proposals.length, 1);
  const p = r.proposals[0];
  assert.equal(p.id, note.slug);
  assert.equal(p.noteSlug, note.slug);
  assert.equal(p.status, 'hyväksytty');
  assert.equal(p.area, 'Myynti');
  assert.equal(p.impact, 'suuri');
  assert.equal(p.urgency, 'pieni');
  assert.equal(p.createdBy, 'Strategiaagentti');
  assert.deepEqual(p.sources, ['Asiakas A', 'https://example.com/a']);
  assert.deepEqual(r.report.missingProposalIds, []);
});

test('päätökset: vakaa id, areaSlug wikilinkistä, kaksoisrivit yhdistyvät, puutteellinen raportoidaan', () => {
  const r = run();
  assert.equal(r.decisions.length, 2);
  const d = r.decisions[0];
  assert.equal(d.areaSlug, 'asiakkaat-asiakas-a');
  assert.equal(d.area, '[[Asiakas A]]');
  assert.equal(d.source, 'user');
  assert.equal(d.proposalId, null);
  assert.equal(d.createdBy, 'Tuonti');
  assert.equal(r.decisions[1].areaSlug, null);
  assert.equal(r.report.invalidDecisions, 1);
  assert.equal(run().decisions[0].id, d.id);
});

test('pohjat: {{title}} säilyy, osio nimen perusteella', () => {
  const r = run();
  const t = r.templates.find(x => x.id === 'asiakas');
  assert.equal(t.bodyMd, '# {{title}}\n\n{{date}}');
  assert.deepEqual(t.propertiesTemplate, { tila: '' });
  assert.equal(t.sectionSlug, null);
  assert.equal(r.templates.find(x => x.id === 'ehdotukset').sectionSlug, 'ehdotukset');
});

test('counts-vertailu', () => {
  const r = run();
  const rows = compareCounts(SEED.meta.counts_by_kind, r.notes, r.report.skippedDashboards);
  const by = Object.fromEntries(rows.map(x => [x.kind, x]));
  assert.deepEqual([by.core.seed, by.core.imported, by.core.diff], [1, 1, 0]);
  assert.deepEqual([by.note.seed, by.note.imported, by.note.diff], [3, 2, -1]);
  assert.equal(by.dashboard.imported, 1);
  assert.ok(by.dashboard.note);
  assert.equal(by.inbox_entry.diff, 0);
});

test('planNote: uusi, sama, linkit muuttuneet, sisältö muuttunut, Momentumissa muokattu', () => {
  const r = run();
  const next = r.notes[0];
  const c = planNote(null, next, { now: NOW });
  assert.equal(c.action, 'create');
  assert.equal(c.revision.changeSource, 'import');
  assert.equal(c.revision.version, 1);
  const stored = { ...next, updatedAt: 1 };
  assert.equal(planNote(stored, next, { now: NOW }).action, 'skip');
  const relink = planNote({ ...stored, unresolvedLinks: [] }, next, { now: NOW });
  assert.equal(relink.action, 'relink');
  assert.deepEqual(Object.keys(relink.patch), ['unresolvedLinks']);
  const u = planNote({ ...stored, version: 3, bodyMd: 'vanha' }, next, { now: NOW });
  assert.equal(u.action, 'update');
  assert.equal(u.note.version, 4);
  assert.equal(u.revision.version, 4);
  assert.equal(planNote({ ...stored, bodyMd: 'vanha', updatedBy: 'Anton' }, next, { now: NOW }).action, 'conflict');
  assert.equal(planNote({ ...stored, bodyMd: 'vanha', updatedBy: 'Anton' }, next, { now: NOW, force: true }).action, 'update');
  assert.ok(sameNoteContent({ ...next, properties: { b: '1', a: '2' } }, { ...next, properties: { a: '2', b: '1' } }));
});

test('planProposal: Momentumissa tehty päätös säilyy', () => {
  const next = run().proposals[0];
  assert.equal(planProposal(null, next).action, 'create');
  assert.equal(planProposal(next, next).action, 'skip');
  const decided = { ...next, status: 'hylätty', decidedBy: 'Anton', decidedAt: 5, decisionNote: 'Ei nyt' };
  assert.equal(planProposal(decided, next).action, 'skip');
  const changed = planProposal(decided, { ...next, title: 'Uusi otsikko' });
  assert.equal(changed.action, 'update');
  assert.equal(changed.doc.status, 'hylätty');
  assert.equal(changed.doc.decidedBy, 'Anton');
  const fresh = planProposal({ ...next, status: 'uusi' }, next);
  assert.equal(fresh.doc.status, 'hyväksytty');
});

test('planDoc: createdAt säilyy, muuttumaton ohitetaan', () => {
  const d = run().decisions[0];
  assert.equal(planDoc(d, { ...d }).action, 'skip');
  assert.equal(planDoc({ ...d, createdAt: 1 }, d).action, 'skip');
  const u = planDoc({ ...d, createdAt: 1 }, { ...d, rationale: 'uusi' });
  assert.equal(u.action, 'update');
  assert.equal(u.doc.createdAt, 1);
});

test('tavoitteet ja apurit', () => {
  const { goals, errors } = normalizeGoals({
    goals: [
      { id: 'liikevaihto-2027', period: '2027', title: 'Liikevaihto', targetValue: 100000, unit: '€', breakdown: [{ key: 'a', label: 'A', targetValue: 50000 }] },
      { id: 'rikki', title: 'Ei kautta' },
    ],
  });
  assert.equal(goals.length, 1);
  assert.equal(goals[0].stretchValue, null);
  assert.equal(goals[0].sortOrder, 0);
  assert.equal(errors.length, 1);
  assert.equal(normalizeProposalStatus('Myöhemmin'), 'myöhemmin');
  assert.equal(normalizeProposalStatus('jotain'), 'uusi');
  assert.equal(parseTime('12.3.2026'), Date.UTC(2026, 2, 12, 12));
  assert.equal(parseTime(1_700_000_000), 1_700_000_000_000);
  assert.equal(parseTime('ei'), null);
});

test('tyhjä seed ei kaadu', () => {
  const r = normalizeSeed({}, { now: NOW });
  assert.deepEqual(r.sections.map(x => x.slug), ['inbox']);
  assert.equal(r.notes.length, 0);
});
