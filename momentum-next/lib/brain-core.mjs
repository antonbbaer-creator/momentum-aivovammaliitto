// @ts-check
// Aivot (organisaation tietopohja): puhdas ydinlogiikka ilman riippuvuuksia.
// Käytössä sekä sovelluksessa (TypeScript tuo tämän) että tuonti- ja vientiskripteissä (Node).
// Testit: node --test momentum-next/lib/brain-core.test.mjs
//
// Sisällön käytännöt (säilytetään sellaisenaan):
//   [[Nimi]] ja [[Nimi|alias]]  linkki toiseen muistiinpanoon nimen perusteella
//   ⚠️ rivin alussa              vahvistettava tai täydennettävä kohta
//   (Anton, 12.3.2026)           käyttäjän omat sanat, ei muotoilla uudelleen
//   "Ehdotus, ei päätös"         tekoälyn ehdotus, ei ihmisen päätös

/** Muistiinpanotyypit. dashboard ei ole sisältöä, vaan kertoo mitä näkymiä tarvitaan. */
export const NOTE_KINDS = ['core', 'note', 'agent_instructions', 'inbox_entry', 'proposal'];

export const PROPOSAL_STATUSES = ['uusi', 'hyväksytty', 'hylätty', 'myöhemmin'];
export const INBOX_STATUSES = ['uusi', 'käsitelty', 'ehdotettu', 'hyväksytty', 'hylätty'];
export const INBOX_CHANNELS = ['web', 'voice', 'api', 'siri'];
export const CHANGE_SOURCES = ['user', 'agent', 'import', 'inbox'];

/**
 * Slug polusta tai nimestä: pienaakkoset, ä→a, ö→o, å→a, välit ja erikoismerkit viivoiksi.
 * Firestoren dokumentti-id: ei '/', ei tyhjä, enintään 120 merkkiä.
 * @param {string} s
 * @returns {string}
 */
export function slugify(s) {
  const out = String(s || '')
    .toLowerCase()
    .replace(/\.md$/i, '')
    .replace(/[äå]/g, 'a')
    .replace(/ö/g, 'o')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
    .replace(/-+$/g, '');
  return out || 'muistiinpano';
}

/**
 * Nimen vertailuavain: linkit viittaavat nimeen kirjainkoosta riippumatta (kuten Obsidianissa).
 * Säilyttää ääkköset, koska "Tävlingar" ja "Tavlingar" ovat eri nimiä.
 * Firestoren dokumentti-id:ksi kelpaava (ei '/').
 * @param {string} name
 * @returns {string}
 */
export function nameKey(name) {
  return String(name || '')
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\//g, '∕')
    .slice(0, 300);
}

const WIKILINK_RE = /\[\[([^\[\]|#^\n]+?)(?:#[^\[\]|\n]*)?(?:\|([^\[\]\n]+?))?\]\]/g;

/**
 * Poimii wikilinkit. Ohittaa koodilohkot ja inline-koodin, kuten Obsidian.
 * Upotukset ![[kuva.png]] eivät ole linkkejä muistiinpanoihin, jos kohteessa on tiedostopääte.
 * @param {string} body
 * @returns {{ target: string, alias: string | null }[]}
 */
export function parseWikilinks(body) {
  const text = stripCode(String(body || ''));
  /** @type {{ target: string, alias: string | null }[]} */
  const out = [];
  for (const m of text.matchAll(WIKILINK_RE)) {
    const target = m[1].trim();
    if (!target) continue;
    const embed = m.index > 0 && text[m.index - 1] === '!';
    if (embed && /\.[a-z0-9]{2,5}$/i.test(target)) continue;
    out.push({ target, alias: m[2] ? m[2].trim() : null });
  }
  return out;
}

/**
 * Korvaa koodilohkot ja inline-koodin välilyönneillä (säilyttää pituudet).
 * @param {string} text
 * @returns {string}
 */
export function stripCode(text) {
  return text
    .replace(/```[\s\S]*?(```|$)/g, s => s.replace(/[^\n]/g, ' '))
    .replace(/`[^`\n]*`/g, s => ' '.repeat(s.length));
}

/**
 * ⚠️-merkillä alkavat rivit (myös listan tai lainauksen sisällä). Palauttaa rivin tekstin ilman merkkiä.
 * @param {string} body
 * @returns {string[]}
 */
export function extractReviewItems(body) {
  const lines = stripCode(String(body || '')).split('\n');
  /** @type {string[]} */
  const out = [];
  for (const raw of lines) {
    const m = raw.match(/^\s*(?:>\s*)*(?:[-*+]\s+|\d+[.)]\s+)?(?:\[[ xX]\]\s+)?⚠\uFE0F?\s*(.+)$/u);
    const text = m ? m[1].replace(/^[\uFE0F\s]+/u, '').trim() : '';
    if (text) out.push(text.slice(0, 500));
  }
  return out;
}

/**
 * Onko muistiinpano tekoälyn ehdotus tai luonnos eikä ihmisen päätös.
 * @param {string} body
 * @returns {boolean}
 */
export function isDraftNotDecision(body) {
  return /\b(ehdotus|luonnos),?\s+ei\s+päätös\b/iu.test(String(body || ''));
}

/**
 * Laskee muistiinpanon linkit annetulla nimi→slug-hakemistolla.
 * @param {string} body
 * @param {(key: string) => string | undefined} resolve  nameKey → slug
 * @param {string} [selfSlug]
 * @returns {{ linksOut: string[], unresolvedLinks: string[], aliases: Record<string, string> }}
 */
export function computeLinks(body, resolve, selfSlug) {
  /** @type {Set<string>} */
  const out = new Set();
  /** @type {Set<string>} */
  const unresolved = new Set();
  /** @type {Record<string, string>} */
  const aliases = {};
  for (const l of parseWikilinks(body)) {
    const key = nameKey(l.target);
    const slug = resolve(key);
    if (slug) {
      if (slug !== selfSlug) out.add(slug);
      if (l.alias) aliases[slug] = l.alias;
    } else {
      unresolved.add(key);
    }
  }
  return { linksOut: [...out].slice(0, 500), unresolvedLinks: [...unresolved].slice(0, 500), aliases };
}

/**
 * Nimeää linkit uudelleen: [[Vanha]] → [[Uusi]], [[Vanha|alias]] → [[Uusi|alias]], [[Vanha#otsikko]] säilyttää otsikon.
 * @param {string} body
 * @param {string} oldName
 * @param {string} newName
 * @returns {string}
 */
export function renameLinks(body, oldName, newName) {
  const oldKey = nameKey(oldName);
  return String(body || '').replace(/\[\[([^\[\]|#^\n]+?)((?:#[^\[\]|\n]*)?(?:\|[^\[\]\n]+?)?)\]\]/g, (all, target, rest) =>
    nameKey(target) === oldKey ? `[[${newName}${rest}]]` : all,
  );
}

/**
 * Markdown-otsikon alla oleva osio (seuraavaan saman tai ylemmän tason otsikkoon asti).
 * @param {string} body
 * @param {string} heading  otsikon teksti ilman #-merkkejä, kirjainkoolla ei väliä
 * @returns {string | null}
 */
export function sectionUnderHeading(body, heading) {
  const lines = String(body || '').split('\n');
  const want = heading.trim().toLowerCase();
  let start = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (!m) continue;
    if (start < 0 && m[2].trim().toLowerCase() === want) { start = i + 1; level = m[1].length; continue; }
    if (start >= 0 && m[1].length <= level) return lines.slice(start, i).join('\n').trim();
  }
  return start >= 0 ? lines.slice(start).join('\n').trim() : null;
}

/**
 * Lisää tekstin muistiinpanon loppuun tai otsikon alle (otsikon osion loppuun).
 * @param {string} body
 * @param {string} text
 * @param {string} [heading]
 * @returns {string}
 */
export function appendToBody(body, text, heading) {
  const b = String(body || '').replace(/\s+$/, '');
  const t = String(text || '').trim();
  if (!t) return b;
  if (!heading) return b ? `${b}\n\n${t}\n` : `${t}\n`;
  const lines = b.split('\n');
  const want = heading.trim().toLowerCase();
  let start = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (!m) continue;
    if (start < 0 && m[2].trim().toLowerCase() === want) { start = i; level = m[1].length; continue; }
    if (start >= 0 && m[1].length <= level) {
      let end = i;
      while (end > start + 1 && lines[end - 1].trim() === '') end--;
      lines.splice(end, 0, t);
      return lines.join('\n') + '\n';
    }
  }
  if (start >= 0) return `${b}\n${t}\n`;
  return `${b}\n\n## ${heading.trim()}\n\n${t}\n`;
}

// ── Frontmatter (vienti ja tuonti) ───────────────────────────────

/**
 * Erottaa YAML-frontmatterin. Tukee vain avain: arvo -rivejä ja listoja (- arvo), kuten Obsidianin ominaisuudet.
 * Arvot palautetaan merkkijonoina (listat pilkulla erotettuina), kuten tuontidatassa.
 * @param {string} md
 * @returns {{ properties: Record<string, string>, body: string }}
 */
export function parseFrontmatter(md) {
  const text = String(md || '');
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { properties: {}, body: text };
  /** @type {Record<string, string>} */
  const props = {};
  let lastKey = '';
  /** @type {Record<string, string[]>} */
  const lists = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([^:\s][^:]*):\s*(.*)$/);
    if (kv) {
      lastKey = kv[1].trim();
      props[lastKey] = unquote(kv[2].trim());
      continue;
    }
    const li = line.match(/^\s*-\s+(.*)$/);
    if (li && lastKey) (lists[lastKey] ||= []).push(unquote(li[1].trim()));
  }
  for (const [k, v] of Object.entries(lists)) props[k] = v.join(', ');
  return { properties: props, body: text.slice(m[0].length) };
}

/** @param {string} v */
function unquote(v) {
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  return v;
}

/**
 * Kirjoittaa ominaisuudet YAML-frontmatteriksi (Obsidian-yhteensopiva).
 * @param {Record<string, unknown>} properties
 * @returns {string}
 */
export function serializeFrontmatter(properties) {
  const entries = Object.entries(properties || {}).filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (!entries.length) return '';
  const lines = entries.map(([k, v]) => {
    const s = Array.isArray(v) ? v.join(', ') : String(v);
    const needsQuote = /^[\s>|&*!%@`#'"{}\[\],?:-]|:\s|\s#|^\s|\s$|^(true|false|null|yes|no)$/i.test(s) || s.includes('\n');
    return `${k}: ${needsQuote ? JSON.stringify(s) : s}`;
  });
  return `---\n${lines.join('\n')}\n---\n`;
}

/**
 * Tiedostonimeksi kelpaava nimi (vienti): poistaa merkit, joita macOS, Windows tai Obsidian ei salli.
 * @param {string} name
 * @returns {string}
 */
export function safeFileName(name) {
  return String(name || 'Nimetön').replace(/[\\/:*?"<>|#^\[\]]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 150) || 'Nimetön';
}

// ── Haku ────────────────────────────────────────────────────────

/**
 * Suomen hakunormalisointi: pienaakkoset, välimerkit pois, ääkköset säilyvät.
 * @param {string} s
 * @returns {string[]}
 */
export function tokenize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/[\s-]+/)
    .filter(t => t.length > 1);
}

/**
 * Kevyt päätteenkatkaisu suomelle: vertailu tehdään sanan alulla (vähintään 4 merkkiä),
 * jolloin "asiakkaat", "asiakkaan" ja "asiakkaalle" löytyvät haulla "asiakas" → "asia".
 * @param {string} t
 * @returns {string}
 */
export function stem(t) {
  if (t.length <= 4) return t;
  return t.slice(0, Math.max(4, Math.ceil(t.length * 0.7)));
}

/**
 * Pisteyttää muistiinpanot hakulauseelle. Otsikko ja nimi painavat eniten.
 * @template {{ slug: string, name?: string, title?: string, bodyMd?: string, properties?: Record<string, unknown> }} N
 * @param {N[]} notes
 * @param {string} query
 * @param {number} [limit]
 * @returns {{ note: N, score: number, snippet: string }[]}
 */
export function searchNotes(notes, query, limit = 20) {
  const qTokens = tokenize(query);
  if (!qTokens.length) return [];
  const qStems = qTokens.map(stem);
  const phrase = query.trim().toLowerCase();
  /** @type {{ note: N, score: number, snippet: string }[]} */
  const results = [];
  for (const n of notes) {
    const title = `${n.title || ''} ${n.name || ''}`.toLowerCase();
    const body = String(n.bodyMd || '');
    const bodyLower = body.toLowerCase();
    const props = Object.values(n.properties || {}).join(' ').toLowerCase();
    const titleTokens = tokenize(title);
    const bodyTokens = tokenize(body);
    const propTokens = tokenize(props);
    let score = 0;
    let matched = 0;
    for (const qs of qStems) {
      const inTitle = titleTokens.some(t => t.startsWith(qs));
      const inProps = propTokens.some(t => t.startsWith(qs));
      const bodyHits = bodyTokens.filter(t => t.startsWith(qs)).length;
      if (inTitle || inProps || bodyHits) matched++;
      score += (inTitle ? 10 : 0) + (inProps ? 4 : 0) + Math.min(bodyHits, 10);
    }
    if (!matched) continue;
    // Kaikkien sanojen löytyminen painaa enemmän kuin yksittäisen sanan toisto
    score *= matched / qStems.length;
    if (phrase.length > 3 && (title.includes(phrase) || bodyLower.includes(phrase))) score += 15;
    results.push({ note: n, score, snippet: makeSnippet(body, qStems) });
  }
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * @param {string} body
 * @param {string[]} qStems
 * @returns {string}
 */
function makeSnippet(body, qStems) {
  const flat = body.replace(/\s+/g, ' ');
  const lower = flat.toLowerCase();
  let pos = -1;
  for (const s of qStems) {
    const i = lower.indexOf(s);
    if (i >= 0 && (pos < 0 || i < pos)) pos = i;
  }
  if (pos < 0) return flat.slice(0, 160);
  const start = Math.max(0, pos - 60);
  return (start > 0 ? '…' : '') + flat.slice(start, start + 180) + (start + 180 < flat.length ? '…' : '');
}

// ── Päätösloki ja ehdotukset (tuonti) ────────────────────────────

/**
 * Ehdotuksen lähteet: `## Lähteet` -otsikon alla olevat wikilinkit ja URL:t.
 * @param {string} body
 * @returns {string[]}
 */
export function proposalSources(body) {
  const sec = sectionUnderHeading(body, 'Lähteet');
  if (!sec) return [];
  /** @type {string[]} */
  const out = parseWikilinks(sec).map(l => l.target);
  for (const m of sec.matchAll(/https?:\/\/[^\s)>\]]+/g)) out.push(m[0]);
  return [...new Set(out)].slice(0, 50);
}

/**
 * Vakaa tunniste merkkijonosta (tuonnin idempotenssi): FNV-1a 32-bit heksana.
 * @param {string} s
 * @returns {string}
 */
export function stableId(s) {
  // Kaksi eri siementä: 64 bittiä riittää tuontirivien (satoja) törmäyksettömyyteen
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ 0x5bd1e995;
  for (const ch of String(s)) {
    const c = ch.codePointAt(0) || 0;
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}
