// @ts-check
// Aivojen tuonti: puhtaat muunnosfunktiot (seed → Firestore-dokumentit) ilman Firestorea.
// Käyttäjä: scripts/import-brain.mjs. Testit: node --test momentum-next/scripts/import-brain-lib.test.mjs
//
// Tuotetut dokumentit vastaavat täsmälleen lib/brain-server.ts saveNote-funktion rakennetta
// (BrainNote, BrainRevision, brainNoteNames/{nameKey} = { slug }), jotta tuodut ja Momentumissa
// muokatut muistiinpanot ovat samanlaisia. Seedin kenttien nimet vaihtelevat, joten luku on joustava.

import {
  NOTE_KINDS, PROPOSAL_STATUSES, slugify, nameKey, computeLinks, extractReviewItems, isDraftNotDecision,
  parseWikilinks, proposalSources, stableId,
} from '../lib/brain-core.mjs';

export const IMPORT_ACTOR = { id: 'import', name: 'Tuonti' };

// ── Pienet apurit ───────────────────────────────────────────────

/** @param {unknown} v */
const s = v => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

/**
 * Ensimmäinen ei-tyhjä merkkijonokenttä annetuista avaimista.
 * @param {Record<string, unknown>} o
 * @param {string[]} keys
 */
function pick(o, keys) {
  for (const k of keys) {
    const v = s(o[k]);
    if (v) return v;
  }
  return '';
}

/**
 * Lista tai avain→olio-kartta listaksi. Merkkijonoalkiot muutetaan muotoon { name }.
 * @param {unknown} v
 * @returns {Record<string, unknown>[]}
 */
function asList(v) {
  if (Array.isArray(v)) return v.map(x => (typeof x === 'string' ? { name: x } : x && typeof x === 'object' ? /** @type {Record<string, unknown>} */ (x) : null)).filter(x => !!x);
  if (v && typeof v === 'object') {
    return Object.entries(v).map(([k, x]) => (x && typeof x === 'object' ? { key: k, ...x } : { key: k, name: s(x) || k }));
  }
  return [];
}

/**
 * Ominaisuudet merkkijonokartaksi samoin säännöin kuin palvelimen normProps (lib/brain-server.ts).
 * @param {unknown} p
 * @returns {Record<string, string>}
 */
export function normProps(p) {
  /** @type {Record<string, string>} */
  const out = {};
  if (!p || typeof p !== 'object') return out;
  for (const [k, v] of Object.entries(p)) {
    const key = String(k).trim().slice(0, 80);
    if (!key || key.includes('.') || key.startsWith('__')) continue;
    if (v === null || v === undefined) continue;
    out[key] = (Array.isArray(v) ? v.join(', ') : String(v)).slice(0, 2000);
    if (Object.keys(out).length >= 60) break;
  }
  return out;
}

/** Poistaa undefined-kentät (Firestore ei hyväksy niitä), kuten palvelimen clean(). */
/** @template T @param {T} o @returns {T} */
export function clean(o) {
  return JSON.parse(JSON.stringify(o));
}

/**
 * Vakaa vertailumuoto (avaimet järjestyksessä), jotta Firestoresta luettu ja seedistä tehty vertautuvat.
 * @param {unknown} v
 * @returns {string}
 */
export function stableJson(v) {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = /** @type {Record<string, unknown>} */ (v);
    return `{${Object.keys(o).filter(k => o[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${stableJson(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

/**
 * Aikaleima millisekunteina: ISO-päiväys, epoch-sekunnit tai -millisekunnit. Jäsentymätön → null.
 * @param {unknown} v
 * @returns {number | null}
 */
export function parseTime(v) {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v < 1e11 ? Math.round(v * 1000) : Math.round(v);
  const str = s(v);
  if (!str) return null;
  if (/^\d+(\.\d+)?$/.test(str)) return parseTime(Number(str));
  // Suomalainen päiväys 12.3.2026
  const fi = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (fi) return Date.UTC(Number(fi[3]), Number(fi[2]) - 1, Number(fi[1]), 12);
  const t = Date.parse(str);
  return Number.isFinite(t) ? t : null;
}

/** Nimi ilman merkkejä, jotka rikkovat wikilinkit (kuten palvelimen parseNoteInput). @param {string} n */
const cleanName = n => n.replace(/[[\]|#^]/g, '').trim().slice(0, 200);

/** Polun viimeinen osa ilman .md-päätettä. @param {string} p */
const baseName = p => p.split('/').filter(Boolean).pop()?.replace(/\.md$/i, '') || '';

// ── Osiot ───────────────────────────────────────────────────────

/**
 * @typedef {{ slug: string, title: string, description: string, sortOrder: number, parentSlug: null }} SectionDoc
 * @typedef {{ doc: SectionDoc, keys: Set<string> }} SectionEntry
 */

/**
 * @param {unknown} raw
 * @returns {SectionEntry[]}
 */
export function normalizeSections(raw) {
  /** @type {SectionEntry[]} */
  const out = [];
  const used = new Set();
  asList(raw).forEach((o, i) => {
    const title = pick(o, ['title', 'name', 'id', 'slug', 'key']);
    if (!title) return;
    let slug = slugify(pick(o, ['slug', 'id', 'key']) || title);
    for (let n = 2; used.has(slug); n++) slug = `${slugify(pick(o, ['slug', 'id', 'key']) || title)}-${n}`;
    used.add(slug);
    const order = Number(o.order ?? o.sortOrder ?? o.sort_order);
    const keys = new Set([slug]);
    for (const k of ['id', 'slug', 'name', 'title', 'key', 'folder', 'path']) {
      const v = s(o[k]);
      if (v) { keys.add(nameKey(v)); keys.add(slugify(v)); }
    }
    out.push({
      doc: {
        slug, title,
        description: pick(o, ['description', 'desc', 'kuvaus']),
        sortOrder: Number.isFinite(order) ? order : i,
        parentSlug: null,
      },
      keys,
    });
  });
  return out;
}

/**
 * Osion slug seedin osioarvolle (id, slug, nimi tai otsikko, kirjainkoolla ei väliä). Ei löydy → null.
 * @param {SectionEntry[]} sections
 * @param {string} value
 * @returns {string | null}
 */
export function matchSection(sections, value) {
  const v = s(value);
  if (!v) return null;
  const k = nameKey(v);
  const sl = slugify(v);
  const hit = sections.find(x => x.keys.has(k)) || sections.find(x => x.keys.has(sl));
  return hit ? hit.doc.slug : null;
}

// ── Ehdotuksen tila ─────────────────────────────────────────────

/** @type {Record<string, string>} */
const STATUS_ALIASES = {
  uusi: 'uusi', new: 'uusi', avoin: 'uusi', odottaa: 'uusi', open: 'uusi', ehdotettu: 'uusi',
  hyväksytty: 'hyväksytty', hyvaksytty: 'hyväksytty', accepted: 'hyväksytty', approved: 'hyväksytty', toteutettu: 'hyväksytty',
  hylätty: 'hylätty', hylatty: 'hylätty', rejected: 'hylätty', declined: 'hylätty',
  myöhemmin: 'myöhemmin', myohemmin: 'myöhemmin', later: 'myöhemmin', siirretty: 'myöhemmin', snoozed: 'myöhemmin',
};

/**
 * @param {unknown} v
 * @returns {'uusi' | 'hyväksytty' | 'hylätty' | 'myöhemmin'}
 */
export function normalizeProposalStatus(v) {
  const k = nameKey(s(v));
  const out = STATUS_ALIASES[k] || 'uusi';
  return /** @type {any} */ (PROPOSAL_STATUSES.includes(out) ? out : 'uusi');
}

// ── Näkymät (dashboard → brainViews) ────────────────────────────

/**
 * Tulkitsee Obsidianin base-näkymän (tai vastaavan) suodattimet: `tila == "käynnissä"`, `note.tila = x`,
 * `file.inFolder("Projektit")`. Tuntemattomat lausekkeet jätetään tulkitsematta (raw säilyy).
 * @param {unknown} f
 * @param {Record<string, string>} filter
 * @param {string[]} folders
 */
function collectFilters(f, filter, folders) {
  if (!f) return;
  if (typeof f === 'string') {
    const folder = f.match(/file\.inFolder\(\s*["']([^"']+)["']\s*\)/);
    if (folder) { folders.push(folder[1]); return; }
    const m = f.match(/^\s*(?:note\.)?([\p{L}\p{N}_ -]+?)\s*={1,3}\s*["']?([^"']*?)["']?\s*$/u);
    if (m && !m[1].startsWith('file')) filter[m[1].trim()] = m[2].trim();
    return;
  }
  if (Array.isArray(f)) { f.forEach(x => collectFilters(x, filter, folders)); return; }
  if (typeof f === 'object') {
    const o = /** @type {Record<string, unknown>} */ (f);
    for (const [k, v] of Object.entries(o)) {
      if (k === 'and' || k === 'or' || k === 'filters' || k === 'filter') collectFilters(v, filter, folders);
      else if (k === 'not') continue;
      else if (typeof v === 'string' || typeof v === 'number') filter[k.replace(/^note\./, '')] = String(v);
    }
  }
}

/**
 * @param {Record<string, unknown>} dashboard  dashboard-muistiinpano seedistä
 * @param {string} dashboardSlug
 * @param {SectionEntry[]} sections
 * @param {number} startOrder
 */
export function viewsFromDashboard(dashboard, dashboardSlug, sections, startOrder = 0) {
  const raw = dashboard.saved_views ?? dashboard.savedViews ?? dashboard.views;
  const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? Object.entries(raw).map(([k, v]) => (v && typeof v === 'object' ? { name: k, ...v } : { name: k, value: v })) : [];
  const dashTitle = pick(dashboard, ['title', 'name']) || dashboardSlug;
  return list.map((v, i) => {
    const o = /** @type {Record<string, unknown>} */ (v && typeof v === 'object' ? v : { name: s(v) });
    const name = pick(o, ['name', 'title', 'label']) || `${dashTitle} ${i + 1}`;
    /** @type {Record<string, string>} */
    const filter = {};
    /** @type {string[]} */
    const folders = [];
    collectFilters(o.filters ?? o.filter ?? o.where, filter, folders);
    collectFilters(dashboard.filters, filter, folders);
    const colsRaw = o.columns ?? o.order ?? o.properties ?? o.fields;
    const columns = (Array.isArray(colsRaw) ? colsRaw : colsRaw && typeof colsRaw === 'object' ? Object.keys(colsRaw) : [])
      .map(c => s(typeof c === 'object' && c ? /** @type {any} */ (c).name ?? /** @type {any} */ (c).key : c))
      .filter(Boolean)
      .map(c => (c === 'file.name' || c === 'file.basename' ? 'name' : c.replace(/^note\./, '')))
      .slice(0, 30);
    const sectionSlug = folders.map(f => matchSection(sections, f) || matchSection(sections, f.split('/')[0])).find(Boolean) || null;
    return clean({
      id: slugify(`${dashboardSlug}-${name}`),
      title: name,
      sectionSlug,
      filter,
      columns,
      sortOrder: startOrder + i,
      raw: JSON.stringify(v).slice(0, 20_000),
    });
  });
}

// ── Koko seedin normalisointi ───────────────────────────────────

/**
 * @typedef {object} NormalizeOptions
 * @property {number} now                         aikaleima, kun modified_at puuttuu
 * @property {Map<string, string>} [existingNames] kannan brainNoteNames: nameKey → slug
 */

/**
 * Muuntaa seedin Firestore-dokumenteiksi. Linkit lasketaan kahdessa vaiheessa: ensin kaikkien tuotujen
 * (ja kannassa jo olevien) nimien hakemisto, sitten jokaisen muistiinpanon linkit sitä vasten.
 * @param {any} seed
 * @param {NormalizeOptions} opts
 */
export function normalizeSeed(seed, opts) {
  const now = opts.now;
  const existingNames = opts.existingNames || new Map();
  const meta = seed && typeof seed.meta === 'object' && seed.meta ? seed.meta : {};
  const rawNotes = asList(seed?.notes);

  /** @type {{ duplicateNames: { name: string, renamedTo: string, slug: string }[], duplicateSlugs: { id: string, slug: string }[], unknownSections: Record<string, number>, unknownKinds: Record<string, number>, missingProposalIds: string[], skippedDashboards: number, viewsFound: number, notesWithoutName: number, invalidDecisions: number }} */
  const report = {
    duplicateNames: [], duplicateSlugs: [], unknownSections: {}, unknownKinds: {}, missingProposalIds: [],
    skippedDashboards: 0, viewsFound: 0, notesWithoutName: 0, invalidDecisions: 0,
  };

  // Osiot. Jos seedissä ei ole osiolistaa, osiot päätellään muistiinpanojen section-arvoista.
  let sections = normalizeSections(seed?.sections);
  if (!sections.length) {
    const names = [...new Set(rawNotes.map(n => s(n.section)).filter(Boolean))];
    sections = normalizeSections(names.length ? names : ['Inbox']);
  }
  const fallbackSection = sections.find(x => x.doc.slug === 'inbox')?.doc.slug || sections[0].doc.slug;

  const proposalIds = new Set(asList(seed?.proposals).map(p => pick(p, ['id', 'name', 'slug'])).filter(Boolean));

  // ── Vaihe 1: slugit, nimet ja nimihakemisto ──
  /** @type {Map<string, string>} */
  const index = new Map();
  // Kannassa olevat nimet, jotka kuuluvat muille kuin seedin muistiinpanoille, pysyvät varattuina
  const seedSlugs = new Set();
  /** @type {{ raw: Record<string, unknown>, slug: string, name: string, kind: string, isProposal: boolean }[]} */
  const staged = [];
  /** @type {Record<string, unknown>[]} */
  const dashboards = [];
  const usedSlugs = new Set();

  for (const n of rawNotes) {
    const kindRaw = s(n.kind) || 'note';
    const rawId = pick(n, ['id', 'slug', 'path', 'name', 'title']);
    if (kindRaw === 'dashboard') {
      dashboards.push(n);
      continue;
    }
    const base = slugify(rawId);
    let slug = base;
    for (let i = 2; usedSlugs.has(slug); i++) slug = `${base}-${i}`;
    if (slug !== base) report.duplicateSlugs.push({ id: rawId, slug });
    usedSlugs.add(slug);
    seedSlugs.add(slug);
    let kind = kindRaw;
    if (!NOTE_KINDS.includes(kind)) {
      report.unknownKinds[kind] = (report.unknownKinds[kind] || 0) + 1;
      kind = 'note';
    }
    let name = cleanName(pick(n, ['name', 'title']) || baseName(s(n.path)) || rawId);
    if (!name) { report.notesWithoutName++; name = slug; }
    const isProposal = kind === 'proposal' || proposalIds.has(rawId) || proposalIds.has(slug);
    staged.push({ raw: n, slug, name, kind, isProposal });
  }

  const taken = (/** @type {string} */ key, /** @type {string} */ slug) => {
    const own = index.get(key);
    if (own && own !== slug) return true;
    const ex = existingNames.get(key);
    return !!ex && ex !== slug && !seedSlugs.has(ex);
  };
  for (const st of staged) {
    let key = nameKey(st.name);
    if (taken(key, st.slug)) {
      const original = st.name;
      let i = 2;
      while (taken(nameKey(`${original} (${i})`), st.slug)) i++;
      st.name = `${original} (${i})`;
      key = nameKey(st.name);
      report.duplicateNames.push({ name: original, renamedTo: st.name, slug: st.slug });
    }
    index.set(key, st.slug);
  }
  // Kannan muut nimet (Momentumissa luodut muistiinpanot) ratkaisevat myös linkkejä
  for (const [k, sl] of existingNames) if (!index.has(k) && !seedSlugs.has(sl)) index.set(k, sl);
  const resolve = (/** @type {string} */ k) => index.get(k);

  // ── Vaihe 2: muistiinpanot, linkit ja ehdotukset ──
  /** @type {any[]} */
  const notes = [];
  /** @type {any[]} */
  const proposals = [];
  for (const st of staged) {
    const n = st.raw;
    const body = typeof n.body_md === 'string' ? n.body_md : typeof n.bodyMd === 'string' ? n.bodyMd : typeof n.body === 'string' ? n.body : '';
    const sectionValue = s(n.section);
    let sectionSlug = matchSection(sections, sectionValue);
    if (!sectionSlug) {
      // Toinen yritys: polun ensimmäinen kansio
      const folder = s(n.path).split('/').filter(Boolean)[0];
      sectionSlug = folder && s(n.path).includes('/') ? matchSection(sections, folder) : null;
    }
    if (!sectionSlug) {
      const label = sectionValue || '(tyhjä)';
      report.unknownSections[label] = (report.unknownSections[label] || 0) + 1;
      sectionSlug = fallbackSection;
    }
    const properties = normProps(n.properties);
    const links = computeLinks(body, resolve, st.slug);
    const reviewItems = extractReviewItems(body);
    const rn = n.review_notes ?? n.reviewNotes;
    const reviewNotes = Array.isArray(rn) ? rn.map(x => s(x)).filter(Boolean).join('\n') : s(rn);
    const t = parseTime(n.modified_at ?? n.modifiedAt ?? n.mtime) ?? now;
    notes.push(clean({
      slug: st.slug,
      sectionSlug,
      name: st.name,
      nameKey: nameKey(st.name),
      title: s(n.title) || st.name,
      kind: st.kind,
      properties,
      bodyMd: body,
      needsReview: n.needs_review === true || n.needsReview === true || reviewItems.length > 0,
      reviewItems,
      reviewNotes: reviewNotes || undefined,
      linksOut: links.linksOut,
      unresolvedLinks: links.unresolvedLinks,
      linkAliases: links.aliases,
      isDraft: isDraftNotDecision(body),
      sourcePath: s(n.path) || undefined,
      createdBy: IMPORT_ACTOR.name,
      updatedBy: IMPORT_ACTOR.name,
      createdAt: t,
      updatedAt: t,
      version: 1,
    }));
    if (st.isProposal) {
      proposals.push(clean({
        id: st.slug,
        title: s(n.title) || st.name,
        bodyMd: body.slice(0, 50_000),
        status: normalizeProposalStatus(properties.tila ?? properties.status),
        area: properties.alue || undefined,
        impact: properties.vaikutus || undefined,
        urgency: properties.kiire || undefined,
        sources: proposalSources(body),
        noteSlug: st.slug,
        createdBy: properties['tekijä'] || properties.tekija || properties.author || IMPORT_ACTOR.name,
        createdAt: parseTime(properties.luotu ?? properties.päivä ?? properties.date) ?? t,
        decidedBy: null,
        decidedAt: null,
      }));
    }
  }
  for (const id of proposalIds) {
    if (!staged.some(st => st.isProposal && (s(st.raw.id) === id || st.slug === id || st.slug === slugify(id)))) report.missingProposalIds.push(id);
  }

  // ── Päätökset ──
  /** @type {Map<string, any>} */
  const decisionMap = new Map();
  for (const d of asList(seed?.decisions)) {
    const decision = pick(d, ['decision', 'päätös', 'paatos', 'title', 'text']);
    if (!decision) { report.invalidDecisions++; continue; }
    const decidedOn = pick(d, ['date', 'decidedOn', 'decided_on', 'päivä', 'pvm']);
    const area = pick(d, ['area', 'alue']);
    const areaTarget = area ? (parseWikilinks(area)[0]?.target || area) : '';
    const id = stableId(`${decidedOn}|${decision}`);
    decisionMap.set(id, clean({
      id,
      decidedOn,
      decision: decision.slice(0, 1000),
      rationale: pick(d, ['rationale', 'perustelu', 'reason']) || undefined,
      area: area || undefined,
      areaSlug: areaTarget ? (resolve(nameKey(areaTarget)) || null) : null,
      source: 'user',
      proposalId: null,
      createdBy: IMPORT_ACTOR.name,
      createdAt: parseTime(decidedOn) ?? now,
    }));
  }
  const decisions = [...decisionMap.values()];

  // ── Pohjat ──
  /** @type {Map<string, any>} */
  const templateMap = new Map();
  for (const t of asList(seed?.templates)) {
    const name = pick(t, ['name', 'title', 'key', 'id']);
    if (!name) continue;
    const kind = NOTE_KINDS.includes(s(t.kind)) ? s(t.kind) : 'note';
    const sec = s(t.section) || s(t.sectionSlug);
    const id = slugify(name);
    templateMap.set(id, {
      id,
      name,
      kind,
      sectionSlug: (sec && matchSection(sections, sec)) || matchSection(sections, name) || null,
      propertiesTemplate: normProps(t.properties_template ?? t.propertiesTemplate ?? t.properties),
      bodyMd: typeof t.body_md === 'string' ? t.body_md : typeof t.bodyMd === 'string' ? t.bodyMd : typeof t.body === 'string' ? t.body : '',
    });
  }
  const templates = [...templateMap.values()];

  // ── Näkymät dashboard-muistiinpanoista ──
  /** @type {any[]} */
  const views = [];
  const viewIds = new Set();
  for (const d of dashboards) {
    report.skippedDashboards++;
    const dSlug = slugify(pick(d, ['id', 'slug', 'path', 'name', 'title']));
    for (const v of viewsFromDashboard(d, dSlug, sections, views.length)) {
      let id = v.id;
      for (let i = 2; viewIds.has(id); i++) id = `${v.id}-${i}`;
      viewIds.add(id);
      views.push({ ...v, id });
    }
  }
  report.viewsFound = views.length;

  return {
    meta,
    sections: sections.map(x => x.doc),
    notes,
    names: index,
    proposals,
    decisions,
    templates,
    views,
    report,
  };
}

// ── Tavoitteet (paikallinen goals.json) ─────────────────────────

/** @param {unknown} v */
const num = v => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(s(v).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/**
 * @param {any} json  { goals: [...] } tai pelkkä lista
 * @returns {{ goals: any[], errors: string[] }}
 */
export function normalizeGoals(json) {
  const list = Array.isArray(json) ? json : Array.isArray(json?.goals) ? json.goals : [];
  /** @type {string[]} */
  const errors = [];
  /** @type {any[]} */
  const goals = [];
  list.forEach((g, i) => {
    const o = g && typeof g === 'object' ? g : {};
    const rawId = s(o.id);
    const id = /^[A-Za-z0-9_-]{1,120}$/.test(rawId) ? rawId : slugify(rawId || s(o.title));
    const title = s(o.title);
    const targetValue = num(o.targetValue);
    if (!title || targetValue === null || !s(o.period)) {
      errors.push(`Tavoite ${i + 1} (${rawId || 'ei id:tä'}): title, period ja targetValue ovat pakollisia`);
      return;
    }
    goals.push({
      id,
      period: s(o.period),
      title,
      targetValue,
      stretchValue: num(o.stretchValue),
      baselineValue: num(o.baselineValue),
      baselinePeriod: s(o.baselinePeriod) || null,
      unit: s(o.unit),
      breakdown: (Array.isArray(o.breakdown) ? o.breakdown : [])
        .map((/** @type {any} */ b) => ({ key: s(b?.key), label: s(b?.label) || s(b?.key), targetValue: num(b?.targetValue) ?? 0 }))
        .filter((/** @type {{ key: string }} */ b) => b.key),
      noteSlug: s(o.noteSlug) || null,
      sortOrder: num(o.sortOrder) ?? i,
    });
  });
  return { goals, errors };
}

// ── Suunnittelu: mitä kannassa pitää muuttaa ─────────────────────

const NOTE_CONTENT_FIELDS = ['name', 'title', 'sectionSlug', 'kind', 'bodyMd'];
const NOTE_META_FIELDS = ['nameKey', 'needsReview', 'reviewItems', 'reviewNotes', 'linksOut', 'unresolvedLinks', 'linkAliases', 'isDraft', 'sourcePath'];

/**
 * Onko muistiinpanon sisältö (name, title, sectionSlug, kind, properties, bodyMd) sama.
 * @param {any} a
 * @param {any} b
 */
export function sameNoteContent(a, b) {
  return NOTE_CONTENT_FIELDS.every(k => (a?.[k] ?? '') === (b?.[k] ?? '')) && stableJson(a?.properties || {}) === stableJson(b?.properties || {});
}

/**
 * Muistiinpanon tallennussuunnitelma kannan nykytilaa vasten.
 *   create   uusi, versio 1 + revisio
 *   update   sisältö muuttui: versio + 1 + revisio
 *   relink   sisältö sama, vain linkit tai tarkistusmerkinnät muuttuivat: päivitys ilman uutta versiota
 *   skip     ei muutoksia
 *   conflict muokattu Momentumissa tuonnin jälkeen (ei ylikirjoiteta ilman --force)
 * @param {any | null} prev  kannan dokumentti
 * @param {any} next         normalizeSeed-tulos
 * @param {{ now: number, force?: boolean, reason?: string }} o
 * @returns {{ action: 'create' | 'update' | 'relink' | 'skip' | 'conflict', note?: any, revision?: any, patch?: Record<string, unknown> }}
 */
export function planNote(prev, next, o) {
  const revision = (/** @type {any} */ n) => clean({
    version: n.version, title: n.title, name: n.name, bodyMd: n.bodyMd, properties: n.properties,
    changedBy: IMPORT_ACTOR.id, changedByName: IMPORT_ACTOR.name, changeSource: 'import',
    changeReason: o.reason || 'Tuonti', createdAt: o.now,
  });
  if (!prev) return { action: 'create', note: next, revision: revision(next) };
  if (sameNoteContent(prev, next)) {
    /** @type {Record<string, unknown>} */
    const patch = {};
    for (const k of NOTE_META_FIELDS) {
      if (stableJson(prev[k] ?? null) !== stableJson(next[k] ?? null)) patch[k] = next[k] ?? null;
    }
    // Momentumissa muokattua tarkistusmerkintää ei kumota
    if (prev.updatedBy !== IMPORT_ACTOR.name) { delete patch.needsReview; delete patch.reviewNotes; }
    return Object.keys(patch).length ? { action: 'relink', patch: clean(patch) } : { action: 'skip' };
  }
  if (prev.updatedBy && prev.updatedBy !== IMPORT_ACTOR.name && !o.force) return { action: 'conflict' };
  const note = clean({
    ...next,
    createdBy: prev.createdBy || next.createdBy,
    createdAt: prev.createdAt || next.createdAt,
    updatedAt: next.updatedAt > (prev.updatedAt || 0) ? next.updatedAt : o.now,
    version: (Number(prev.version) || 0) + 1,
  });
  return { action: 'update', note, revision: revision(note) };
}

/**
 * Ehdotuksen yhdistäminen kannan versioon: Momentumissa tehty päätös (tila ≠ uusi) säilyy.
 * @param {any | null} prev
 * @param {any} next
 * @returns {{ action: 'create' | 'update' | 'skip', doc?: any }}
 */
export function planProposal(prev, next) {
  if (!prev) return { action: 'create', doc: next };
  const doc = { ...prev, ...next, createdAt: prev.createdAt || next.createdAt };
  if (prev.status && prev.status !== 'uusi') {
    for (const k of ['status', 'decidedBy', 'decidedAt', 'decisionNote', 'snoozeUntil']) {
      if (k in prev) doc[k] = prev[k];
      else delete doc[k];
    }
  }
  if (prev.operation !== undefined) doc.operation = prev.operation;
  const out = clean(doc);
  return stableJson(out) === stableJson(prev) ? { action: 'skip' } : { action: 'update', doc: out };
}

/**
 * Yleinen upsert-suunnitelma (osiot, päätökset, pohjat, näkymät, tavoitteet). createdAt säilyy.
 * @param {any | null} prev
 * @param {any} next
 * @returns {{ action: 'create' | 'update' | 'skip', doc?: any }}
 */
export function planDoc(prev, next) {
  if (!prev) return { action: 'create', doc: next };
  const doc = clean(next.createdAt !== undefined && prev.createdAt ? { ...next, createdAt: prev.createdAt } : next);
  const cmp = clean({ ...prev });
  return stableJson(doc) === stableJson(cmp) ? { action: 'skip' } : { action: 'update', doc };
}

// ── Raportti ────────────────────────────────────────────────────

/**
 * Vertailu meta.counts_by_kind-lukuihin. dashboard ei tuoda sisältönä: sen rivi kertoo näkymälähteiden määrän.
 * @param {Record<string, unknown> | undefined} countsByKind
 * @param {{ kind: string }[]} notes      tuodut muistiinpanot
 * @param {number} dashboards
 * @returns {{ kind: string, seed: number | null, imported: number, diff: number | null, note?: string }[]}
 */
export function compareCounts(countsByKind, notes, dashboards) {
  /** @type {Record<string, number>} */
  const got = {};
  for (const n of notes) got[n.kind] = (got[n.kind] || 0) + 1;
  got.dashboard = dashboards;
  const kinds = [...new Set([...Object.keys(countsByKind || {}), ...Object.keys(got)])];
  return kinds.map(kind => {
    const seedVal = countsByKind && kind in countsByKind ? Number(countsByKind[kind]) : null;
    const imported = got[kind] || 0;
    const row = { kind, seed: Number.isFinite(seedVal) ? seedVal : null, imported, diff: Number.isFinite(seedVal) && seedVal !== null ? imported - seedVal : null };
    return kind === 'dashboard' ? { ...row, note: 'ei tuoda sisältönä, näkymien lähteitä' } : row;
  });
}

/**
 * Ratkaisemattomat linkit (nameKeyt) kaikista muistiinpanoista: nimi → montako muistiinpanoa viittaa.
 * @param {{ unresolvedLinks?: string[] }[]} notes
 * @returns {[string, number][]}
 */
export function unresolvedSummary(notes) {
  /** @type {Map<string, number>} */
  const m = new Map();
  for (const n of notes) for (const k of n.unresolvedLinks || []) m.set(k, (m.get(k) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fi'));
}
