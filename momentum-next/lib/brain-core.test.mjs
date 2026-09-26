// Aivojen ydinlogiikan testit. Ajo: node --test momentum-next/lib/brain-*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  slugify, nameKey, parseWikilinks, extractReviewItems, isDraftNotDecision, computeLinks,
  renameLinks, sectionUnderHeading, appendToBody, parseFrontmatter, serializeFrontmatter,
  searchNotes, proposalSources, stableId, safeFileName,
} from './brain-core.mjs';

test('slugify: ääkköset, polku ja erikoismerkit', () => {
  assert.equal(slugify('Ydin/Hetki Company – Arvot.md'), 'ydin-hetki-company-arvot');
  assert.equal(slugify('Päätösloki'), 'paatosloki');
  assert.equal(slugify(''), 'muistiinpano');
  assert.ok(slugify('x'.repeat(300)).length <= 120);
});

test('nameKey: kirjainkoko ja välilyönnit eivät erottele, ääkköset erottelevat', () => {
  assert.equal(nameKey(' Hetki  Company '), 'hetki company');
  assert.notEqual(nameKey('Päätös'), nameKey('Paatos'));
  assert.ok(!nameKey('a/b').includes('/'));
});

test('parseWikilinks: alias, otsikko, upotus ja koodi', () => {
  const links = parseWikilinks('[[A]] [[B|bee]] [[C#Otsikko|c]] ![[kuva.png]] ![[D]] `[[E]]`\n```\n[[F]]\n```');
  assert.deepEqual(links, [
    { target: 'A', alias: null },
    { target: 'B', alias: 'bee' },
    { target: 'C', alias: 'c' },
    { target: 'D', alias: null },
  ]);
});

test('extractReviewItems: ⚠️ rivin alussa, listassa ja lainauksessa, ei koodissa', () => {
  const items = extractReviewItems('⚠️ Vahvista hinta\n- ⚠️ Tarkista asiakas\n> ⚠ Lainaus\nTeksti ⚠️ keskellä\n```\n⚠️ koodi\n```\n⚠️');
  assert.deepEqual(items, ['Vahvista hinta', 'Tarkista asiakas', 'Lainaus']);
});

test('isDraftNotDecision', () => {
  assert.ok(isDraftNotDecision('**Ehdotus, ei päätös.** Tässä'));
  assert.ok(isDraftNotDecision('Luonnos, ei päätös'));
  assert.ok(!isDraftNotDecision('Päätös tehty'));
});

test('computeLinks: ratkaistut, ratkaisemattomat, oma linkki ohitetaan', () => {
  const idx = { 'hetki company': 'hetki-company', 'arvot': 'arvot' };
  const r = computeLinks('[[Hetki Company]] [[arvot|Arvomme]] [[Tuleva sivu]] [[Oma]]', k => idx[k] || (k === 'oma' ? 'oma' : undefined), 'oma');
  assert.deepEqual(r.linksOut, ['hetki-company', 'arvot']);
  assert.deepEqual(r.unresolvedLinks, ['tuleva sivu']);
  assert.equal(r.aliases.arvot, 'Arvomme');
});

test('renameLinks säilyttää aliaksen ja otsikon', () => {
  assert.equal(renameLinks('[[Vanha]] [[vanha|x]] [[Vanha#o]] [[Muu]]', 'Vanha', 'Uusi'), '[[Uusi]] [[Uusi|x]] [[Uusi#o]] [[Muu]]');
});

test('sectionUnderHeading ja appendToBody', () => {
  const body = '# A\n\n## Tehtävät\n- [ ] x\n\n## Lähteet\n- [[Asiakas]]\n';
  assert.equal(sectionUnderHeading(body, 'tehtävät'), '- [ ] x');
  assert.equal(sectionUnderHeading(body, 'Puuttuu'), null);
  assert.match(appendToBody(body, '- [ ] uusi', 'Tehtävät'), /- \[ \] x\n- \[ \] uusi\n\n## Lähteet/);
  assert.match(appendToBody('Teksti', 'Lisäys'), /^Teksti\n\nLisäys\n$/);
  assert.match(appendToBody('# A', '- [ ] t', 'Uusi osio'), /## Uusi osio\n\n- \[ \] t/);
});

test('frontmatter edestakaisin', () => {
  const md = serializeFrontmatter({ tila: 'käynnissä', asiakas: '[[Sun Effects]]', tyhjä: '', kuvaus: 'a: b' }) + 'Runko\n';
  const { properties, body } = parseFrontmatter(md);
  assert.deepEqual(properties, { tila: 'käynnissä', asiakas: '[[Sun Effects]]', kuvaus: 'a: b' });
  assert.equal(body, 'Runko\n');
  assert.deepEqual(parseFrontmatter('---\ntags:\n  - a\n  - b\n---\nx').properties, { tags: 'a, b' });
});

test('searchNotes: taivutusmuodot ja otsikon painotus', () => {
  const notes = [
    { slug: 'asiakkaat', title: 'Asiakkaat', bodyMd: 'Lista' },
    { slug: 'hinnasto', title: 'Hinnasto', bodyMd: 'Hinnat asiakkaalle ja asiakkaille' },
    { slug: 'muu', title: 'Muu', bodyMd: 'ei osumaa' },
  ];
  const r = searchNotes(notes, 'asiakas');
  assert.deepEqual(r.map(x => x.note.slug), ['asiakkaat', 'hinnasto']);
  assert.equal(searchNotes(notes, '').length, 0);
});

test('proposalSources: Lähteet-otsikon alta', () => {
  assert.deepEqual(proposalSources('Teksti [[Ei]]\n## Lähteet\n- [[Asiakas A]]\n- https://esim.fi/x\n## Muu\n[[Ei tämäkään]]'), ['Asiakas A', 'https://esim.fi/x']);
});

test('stableId on vakaa ja erottelee', () => {
  assert.equal(stableId('2026-01-01|Päätös'), stableId('2026-01-01|Päätös'));
  assert.notEqual(stableId('a'), stableId('b'));
  assert.equal(stableId('a').length, 16);
});

test('safeFileName poistaa kielletyt merkit', () => {
  assert.equal(safeFileName('A/B: C?'), 'A-B- C-');
});
