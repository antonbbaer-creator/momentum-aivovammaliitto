// @ts-check
// Aivojen markdown-jäsennin: markdown → rakenteinen puu (AST), jonka BrainMarkdown-komponentti
// renderöi React-elementeiksi. Ei HTML-merkkijonoja eikä innerHTML:ää, joten XSS ei ole mahdollinen.
//
// Tukee Obsidian-vaultin käytössä olevan osajoukon: otsikot, kappaleet, lihavointi, kursiivi,
// yliviivaus, ==korostus==, inline-koodi, linkit, [[wikilinkit]], listat (sisäkkäiset, numeroidut,
// tehtävälistat), lainaukset ja callout-lohkot, koodilohkot, ```base-lohkot, taulukot ja vaakaviivat.
// Raaka HTML näytetään tekstinä.
// Testit: node --test momentum-next/lib/brain-markdown.test.mjs

/**
 * @typedef {{ t: 'text', v: string }
 *   | { t: 'strong' | 'em' | 'del' | 'mark', c: Inline[] }
 *   | { t: 'code', v: string }
 *   | { t: 'link', href: string, c: Inline[] }
 *   | { t: 'wikilink', target: string, alias: string | null, heading: string | null }
 *   | { t: 'br' }} Inline
 *
 * @typedef {{ task: boolean | null, review: boolean, c: Block[] }} ListItem
 *
 * @typedef {{ t: 'heading', level: number, c: Inline[], id: string }
 *   | { t: 'paragraph', c: Inline[], review: boolean }
 *   | { t: 'list', ordered: boolean, start: number, items: ListItem[] }
 *   | { t: 'quote', callout: string | null, title: Inline[] | null, c: Block[] }
 *   | { t: 'codeblock', lang: string, v: string }
 *   | { t: 'base', v: string }
 *   | { t: 'table', align: ('left' | 'center' | 'right' | null)[], head: Inline[][], rows: Inline[][][] }
 *   | { t: 'hr' }} Block
 */

const REVIEW_RE = /^\s*⚠/u;

/**
 * @param {string} md
 * @returns {Block[]}
 */
export function parseMarkdown(md) {
  const lines = String(md || '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
  return parseBlocks(lines);
}

/**
 * @param {string[]} lines
 * @returns {Block[]}
 */
function parseBlocks(lines) {
  /** @type {Block[]} */
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    // Koodilohko
    const fence = line.match(/^\s*(```+|~~~+)\s*([\w+-]*)\s*$/);
    if (fence) {
      const close = fence[1];
      const body = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(close)) { body.push(lines[i]); i++; }
      i++;
      const lang = fence[2].toLowerCase();
      out.push(lang === 'base' ? { t: 'base', v: body.join('\n') } : { t: 'codeblock', lang, v: body.join('\n') });
      continue;
    }

    // Otsikko
    const h = line.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) {
      const text = h[2];
      out.push({ t: 'heading', level: h[1].length, c: parseInline(text), id: headingId(text) });
      i++;
      continue;
    }

    // Vaakaviiva
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) { out.push({ t: 'hr' }); i++; continue; }

    // Lainaus / callout
    if (/^\s{0,3}>/.test(line)) {
      const inner = [];
      while (i < lines.length && /^\s{0,3}>/.test(lines[i])) { inner.push(lines[i].replace(/^\s{0,3}>\s?/, '')); i++; }
      const cm = inner[0] && inner[0].match(/^\[!([\w-]+)\][+-]?\s*(.*)$/);
      if (cm) {
        out.push({ t: 'quote', callout: cm[1].toLowerCase(), title: cm[2] ? parseInline(cm[2]) : null, c: parseBlocks(inner.slice(1)) });
      } else {
        out.push({ t: 'quote', callout: null, title: null, c: parseBlocks(inner) });
      }
      continue;
    }

    // Taulukko: otsikkorivi + erotinrivi
    if (line.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const head = splitRow(line).map(parseInline);
      const align = splitRow(lines[i + 1]).map(c => {
        const l = c.startsWith(':');
        const r = c.endsWith(':');
        return l && r ? 'center' : r ? 'right' : l ? 'left' : null;
      });
      i += 2;
      /** @type {Inline[][][]} */
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        const cells = splitRow(lines[i]);
        while (cells.length < head.length) cells.push('');
        rows.push(cells.slice(0, Math.max(head.length, 1)).map(parseInline));
        i++;
      }
      out.push({ t: 'table', align: /** @type {('left'|'center'|'right'|null)[]} */ (align), head, rows });
      continue;
    }

    // Lista
    if (listMarker(line)) {
      const { block, next } = parseList(lines, i);
      out.push(block);
      i = next;
      continue;
    }

    // Kappale: jatkuu tyhjään riviin tai uuden lohkon alkuun
    const para = [line.trim()];
    i++;
    while (i < lines.length && lines[i].trim() && !startsBlock(lines, i)) { para.push(lines[i].trim()); i++; }
    const text = para.join('\n');
    out.push({ t: 'paragraph', c: parseInline(text), review: REVIEW_RE.test(text) });
  }
  return out;
}

/**
 * @param {string[]} lines
 * @param {number} i
 */
function startsBlock(lines, i) {
  const l = lines[i];
  return /^\s{0,3}(#{1,6}\s|>|```|~~~)/.test(l)
    || /^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(l)
    || !!listMarker(l)
    || (l.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1]));
}

/** @param {string} line */
function isTableSeparator(line) {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
}

/**
 * Jakaa taulukkorivin soluiksi. \| on kirjaimellinen pystyviiva, ja [[Nimi|alias]]-linkkien pystyviiva säilyy.
 * @param {string} line
 * @returns {string[]}
 */
function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  /** @type {string[]} */
  const cells = [];
  let cur = '';
  let depth = 0;
  for (let k = 0; k < s.length; k++) {
    const ch = s[k];
    if (ch === '\\' && s[k + 1] === '|') { cur += '|'; k++; continue; }
    if (ch === '[' && s[k + 1] === '[') { depth++; cur += '[['; k++; continue; }
    if (ch === ']' && s[k + 1] === ']' && depth > 0) { depth--; cur += ']]'; k++; continue; }
    if (ch === '|' && depth === 0) { cells.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

/**
 * @param {string} line
 * @returns {{ indent: number, ordered: boolean, num: number, rest: string, width: number } | null}
 */
function listMarker(line) {
  const m = line.match(/^(\s*)([-*+]|(\d{1,9})[.)])\s+(.*)$/);
  if (!m) return null;
  // "---" on vaakaviiva, ei lista
  if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) return null;
  return { indent: m[1].length, ordered: !!m[3], num: m[3] ? Number(m[3]) : 1, rest: m[4], width: m[1].length + m[2].length + 1 };
}

/**
 * @param {string[]} lines
 * @param {number} start
 * @returns {{ block: Block, next: number }}
 */
function parseList(lines, start) {
  const first = /** @type {NonNullable<ReturnType<typeof listMarker>>} */ (listMarker(lines[start]));
  const baseIndent = first.indent;
  /** @type {ListItem[]} */
  const items = [];
  let i = start;
  while (i < lines.length) {
    const mk = listMarker(lines[i]);
    if (!mk || mk.indent < baseIndent || mk.indent > baseIndent + 3 || mk.ordered !== first.ordered) {
      if (mk && mk.indent < baseIndent) break;
      if (!mk) break;
      if (mk.ordered !== first.ordered && mk.indent <= baseIndent + 3) break;
    }
    // Kohteen sisältö: ensimmäinen rivi + sisennetyt jatkorivit
    const content = [mk ? mk.rest : ''];
    const childIndent = mk ? mk.width : baseIndent + 2;
    i++;
    while (i < lines.length) {
      const l = lines[i];
      if (!l.trim()) {
        // Tyhjä rivi: jatkuu, jos seuraava rivi on sisennetty kohteen sisään
        const nextLine = lines[i + 1];
        if (nextLine !== undefined && nextLine.trim() && indentOf(nextLine) >= childIndent) { content.push(''); i++; continue; }
        break;
      }
      const nm = listMarker(l);
      if (nm && nm.indent <= baseIndent + 1) break;
      if (!nm && indentOf(l) < childIndent && startsBlock(lines, i)) break;
      content.push(indentOf(l) >= childIndent ? l.slice(childIndent) : l.trim());
      i++;
    }
    let task = null;
    const tm = content[0].match(/^\[([ xX])\]\s+(.*)$/);
    if (tm) { task = tm[1] !== ' '; content[0] = tm[2]; }
    const review = REVIEW_RE.test(content[0]);
    items.push({ task, review, c: parseBlocks(content) });
    // Seuraava kohde samalla tasolla?
    while (i < lines.length && !lines[i].trim()) {
      const nm = listMarker(lines[i + 1] || '');
      if (nm && nm.indent === baseIndent) { i++; break; }
      break;
    }
    const nm = listMarker(lines[i] || '');
    if (!nm || nm.indent !== baseIndent || nm.ordered !== first.ordered) break;
  }
  return { block: { t: 'list', ordered: first.ordered, start: first.num, items }, next: i };
}

/** @param {string} l */
function indentOf(l) {
  const m = l.match(/^(\s*)/);
  return m ? m[1].length : 0;
}

/**
 * Otsikon ankkuri (sama kuin Obsidianin [[Nimi#Otsikko]]-linkeissä käytettävä).
 * @param {string} text
 * @returns {string}
 */
export function headingId(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\[\[([^\]|]+)(\|([^\]]+))?\]\]/g, (_, a, __, b) => b || a)
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80);
}

// ── Inline ──────────────────────────────────────────────────────

/**
 * @param {string} text
 * @returns {Inline[]}
 */
export function parseInline(text) {
  /** @type {Inline[]} */
  const out = [];
  let buf = '';
  const flush = () => { if (buf) { out.push({ t: 'text', v: buf }); buf = ''; } };
  const s = String(text || '');
  let i = 0;
  while (i < s.length) {
    const rest = s.slice(i);
    const ch = s[i];

    if (ch === '\\' && i + 1 < s.length && /[\\`*_{}[\]()#+\-.!|=~>]/.test(s[i + 1])) { buf += s[i + 1]; i += 2; continue; }
    if (ch === '\n') { flush(); out.push({ t: 'br' }); i++; continue; }

    if (ch === '`') {
      const m = rest.match(/^(`+)([\s\S]*?[^`])\1(?!`)/);
      if (m) { flush(); out.push({ t: 'code', v: m[2].trim() }); i += m[0].length; continue; }
    }

    if (rest.startsWith('[[') || rest.startsWith('![[')) {
      const embed = ch === '!';
      const m = rest.slice(embed ? 1 : 0).match(/^\[\[([^\[\]|#\n]*)(?:#([^\[\]|\n]*))?(?:\|([^\[\]\n]*))?\]\]/);
      if (m && (m[1].trim() || m[2])) {
        flush();
        out.push({ t: 'wikilink', target: m[1].trim(), alias: m[3] ? m[3].trim() : null, heading: m[2] ? m[2].trim() : null });
        i += m[0].length + (embed ? 1 : 0);
        continue;
      }
    }

    if (ch === '[') {
      const m = rest.match(/^\[([^\]\n]*)\]\(\s*<?([^\s)>]+)>?(?:\s+"[^"]*")?\s*\)/);
      if (m) {
        const href = safeHref(m[2]);
        flush();
        if (href) out.push({ t: 'link', href, c: parseInline(m[1] || m[2]) });
        else out.push({ t: 'text', v: m[1] || m[2] });
        i += m[0].length;
        continue;
      }
    }

    const auto = rest.match(/^https?:\/\/[^\s<>()\]]+[^\s<>()\].,;:!?'"]/);
    if (auto && (i === 0 || /[\s(]/.test(s[i - 1]))) {
      flush();
      out.push({ t: 'link', href: auto[0], c: [{ t: 'text', v: auto[0] }] });
      i += auto[0].length;
      continue;
    }

    const pairs = /** @type {const} */ ([['**', 'strong'], ['__', 'strong'], ['~~', 'del'], ['==', 'mark'], ['*', 'em'], ['_', 'em']]);
    let matched = false;
    for (const [mark, type] of pairs) {
      if (!rest.startsWith(mark)) continue;
      // _ ja __ vain sanan rajalla (ei snake_case)
      if (mark[0] === '_' && i > 0 && /[\p{L}\p{N}]/u.test(s[i - 1])) continue;
      const after = rest[mark.length];
      if (!after || /\s/.test(after)) continue;
      const end = findClose(s, i + mark.length, mark);
      if (end < 0) continue;
      flush();
      out.push({ t: type, c: parseInline(s.slice(i + mark.length, end)) });
      i = end + mark.length;
      matched = true;
      break;
    }
    if (matched) continue;

    buf += ch;
    i++;
  }
  flush();
  return out;
}

/**
 * @param {string} s
 * @param {number} from
 * @param {string} mark
 */
function findClose(s, from, mark) {
  let k = from;
  while (k < s.length) {
    if (s[k] === '\\') { k += 2; continue; }
    if (s[k] === '`') {
      const e = s.indexOf('`', k + 1);
      if (e > 0) { k = e + 1; continue; }
    }
    if (s.startsWith(mark, k) && !/\s/.test(s[k - 1])) {
      if (mark === '*' && s[k + 1] === '*') { k += 2; continue; }
      if (mark[0] === '_' && /[\p{L}\p{N}]/u.test(s[k + mark.length] || '')) { k++; continue; }
      return k;
    }
    k++;
  }
  return -1;
}

/**
 * Sallii vain http(s)-, mailto- ja tel-linkit sekä suhteelliset polut. javascript: yms. hylätään.
 * @param {string} href
 * @returns {string | null}
 */
export function safeHref(href) {
  const h = String(href || '').trim();
  if (/^(https?:|mailto:|tel:)/i.test(h)) return h;
  if (/^[a-z][a-z0-9+.-]*:/i.test(h)) return null;
  if (h.startsWith('//')) return null;
  return h || null;
}

/**
 * Puun pelkkä teksti (haku, esikatselu, diff).
 * @param {Inline[]} inl
 * @returns {string}
 */
export function inlineText(inl) {
  return inl.map(n => {
    if (n.t === 'text' || n.t === 'code') return n.v;
    if (n.t === 'br') return '\n';
    if (n.t === 'wikilink') return n.alias || n.target;
    return inlineText(n.c);
  }).join('');
}
