// Aivojen markdown-jäsentimen testit. Ajo: node --test momentum-next/lib/brain-*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdown, parseInline, safeHref, inlineText, headingId } from './brain-markdown.mjs';

test('otsikot, kappaleet ja inline-muotoilu', () => {
  const b = parseMarkdown('# Otsikko\n\nTeksti **lihava** ja *kursiivi* ja ~~pois~~ ja ==korostus== ja `koodi`.');
  assert.equal(b[0].t, 'heading');
  assert.equal(b[0].id, 'otsikko');
  const p = b[1];
  assert.equal(p.t, 'paragraph');
  assert.deepEqual(p.c.map(n => n.t), ['text', 'strong', 'text', 'em', 'text', 'del', 'text', 'mark', 'text', 'code', 'text']);
});

test('wikilinkit: alias ja otsikko', () => {
  const inl = parseInline('[[Hetki Company|Hetki]] ja [[Arvot#Rohkeus]]');
  assert.deepEqual(inl[0], { t: 'wikilink', target: 'Hetki Company', alias: 'Hetki', heading: null });
  assert.deepEqual(inl[2], { t: 'wikilink', target: 'Arvot', alias: null, heading: 'Rohkeus' });
});

test('listat: sisäkkäiset, tehtävät, numeroidut ja ⚠️', () => {
  const b = parseMarkdown('- yksi\n- ⚠️ kaksi\n  - sisäkkäinen\n- [x] tehty\n- [ ] kesken\n\n3. kolmas\n4. neljäs');
  assert.equal(b[0].t, 'list');
  assert.equal(b[0].items.length, 4);
  assert.equal(b[0].items[1].review, true);
  assert.equal(b[0].items[1].c[1].t, 'list');
  assert.equal(b[0].items[2].task, true);
  assert.equal(b[0].items[3].task, false);
  assert.equal(b[1].ordered, true);
  assert.equal(b[1].start, 3);
});

test('taulukko: tasaus ja wikilinkin pystyviiva', () => {
  const b = parseMarkdown('| Nimi | Arvo |\n|:--|--:|\n| [[A|a]] | 10 |\n| b |');
  assert.equal(b[0].t, 'table');
  assert.deepEqual(b[0].align, ['left', 'right']);
  assert.equal(b[0].rows[0][0][0].t, 'wikilink');
  assert.equal(b[0].rows[1].length, 2);
});

test('lainaus, callout, koodi, base-lohko ja vaakaviiva', () => {
  const b = parseMarkdown('> [!warning] Huom\n> sisältö\n\n```js\nconst a = 1;\n```\n\n```base\nviews:\n```\n\n---\n\n> tavallinen');
  assert.deepEqual(b.map(x => x.t), ['quote', 'codeblock', 'base', 'hr', 'quote']);
  assert.equal(b[0].callout, 'warning');
  assert.equal(b[1].v, 'const a = 1;');
  assert.equal(b[4].callout, null);
});

test('turvallisuus: raaka HTML on tekstiä, vaaralliset linkit hylätään', () => {
  const inl = parseInline('<script>alert(1)</script> [x](javascript:alert) [y](https://ok.fi)');
  assert.equal(inl[0].t, 'text');
  assert.ok(inl[0].v.includes('<script>'));
  assert.ok(!JSON.stringify(inl).includes('"href":"javascript'));
  assert.equal(safeHref('javascript:alert(1)'), null);
  assert.equal(safeHref('JaVaScRiPt:x'), null);
  assert.equal(safeHref('data:text/html,x'), null);
  assert.equal(safeHref('//evil.com'), null);
  assert.equal(safeHref('https://ok.fi'), 'https://ok.fi');
  assert.equal(safeHref('mailto:a@b.fi'), 'mailto:a@b.fi');
});

test('snake_case ei muutu kursiiviksi, autolinkki toimii', () => {
  const inl = parseInline('snake_case_word ja https://hetki.fi/x.');
  assert.equal(inlineText(inl), 'snake_case_word ja https://hetki.fi/x.');
  assert.equal(inl.find(n => n.t === 'link').href, 'https://hetki.fi/x');
});

test('⚠️-kappale merkitään', () => {
  assert.equal(parseMarkdown('⚠️ Vahvista')[0].review, true);
  assert.equal(parseMarkdown('Tavallinen')[0].review, false);
});

test('headingId poistaa välimerkit ja wikilinkin', () => {
  assert.equal(headingId('Mitä [[Hetki|me]] teemme?'), 'mitä-me-teemme');
});
