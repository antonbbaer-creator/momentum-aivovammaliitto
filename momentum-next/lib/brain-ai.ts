// Aivojen tekoäly: Kirjaa-käsittely (kirjaus → ehdotetut operaatiot) ja Kysy (vastaus lähteineen).
// Claude API palvelimella, avain ympäristömuuttujassa ANTHROPIC_API_KEY (ei koskaan selaimessa).
// Malli: BRAIN_AI_MODEL (oletus claude-opus-5). Periaate: tekoäly ehdottaa, ihminen hyväksyy.
//
// Kutsu tehdään suoraan HTTP:llä kuten muualla Momentumissa (app/api/pdf/*): repo ei käytä Anthropic-SDK:ta.
// Rakenteinen vastaus: output_config.format (JSON-skeema), joten vastaus on aina jäsennettävä.
// Kieltäytymiset: palvelinpuolen fallbacks: "default" (reitittää kieltäytymisen luokan mukaan).
//
// Kontekstiksi lähetetään vain organisaation ydin, arvot ja tehtävän kannalta relevantit muistiinpanot,
// ei koko aivoja. Sisältöä ei lokiteta.

import { BrainError, loadNotes, searchBrain, col } from './brain-server';
import { adminDb } from './firebase-admin';
import {
  BRAIN_COLLECTIONS as C, nameKey, todayIso, type BrainNote, type BrainSection, type BrainGoal, type InboxSuggestion,
} from './brain-shared';
import { parseOperation } from './brain-server';

const API_URL = 'https://api.anthropic.com/v1/messages';
export const BRAIN_MODEL = process.env.BRAIN_AI_MODEL || 'claude-opus-5';

interface ClaudeResult { json: unknown; model: string }

async function callClaude(opts: {
  system: { text: string; cache?: boolean }[];
  user: string;
  schema: Record<string, unknown>;
  effort: 'low' | 'medium' | 'high';
  maxTokens?: number;
}): Promise<ClaudeResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new BrainError(503, 'Tekoäly ei ole käytössä (ANTHROPIC_API_KEY puuttuu palvelimelta). Kirjaus on tallessa.');
  const body: Record<string, unknown> = {
    model: BRAIN_MODEL,
    max_tokens: opts.maxTokens || 16000,
    system: opts.system.map(s => (s.cache ? { type: 'text', text: s.text, cache_control: { type: 'ephemeral' } } : { type: 'text', text: s.text })),
    messages: [{ role: 'user', content: opts.user }],
    output_config: { effort: opts.effort, format: { type: 'json_schema', schema: opts.schema } },
  };
  const useFallbacks = process.env.BRAIN_AI_FALLBACKS !== 'off';

  const send = async (withFallbacks: boolean) => {
    const headers: Record<string, string> = {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    };
    const b = { ...body };
    if (withFallbacks) {
      headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
      b.fallbacks = 'default';
    }
    return fetch(API_URL, { method: 'POST', headers, body: JSON.stringify(b), signal: AbortSignal.timeout(110_000) });
  };

  let res = await send(useFallbacks);
  // Jos tili tai malli ei tue fallback-betaa, yritetään kerran ilman
  if (res.status === 400 && useFallbacks) {
    const t = await res.text();
    if (/fallback/i.test(t)) res = await send(false);
    else throw new BrainError(502, `Tekoälyn pyyntö hylättiin (400). ${t.slice(0, 200)}`);
  }
  if (res.status === 429) throw new BrainError(429, 'Tekoäly on juuri nyt ruuhkainen. Yritä hetken päästä, kirjaus on tallessa.');
  if (!res.ok) throw new BrainError(502, `Tekoälypalvelu vastasi virheellä ${res.status}. Kirjaus on tallessa.`);
  const data = await res.json() as {
    stop_reason?: string; model?: string;
    content?: { type: string; text?: string }[];
  };
  if (data.stop_reason === 'refusal') throw new BrainError(422, 'Tekoäly ei käsitellyt tätä pyyntöä. Kirjaus on tallessa, voit käsitellä sen itse.');
  if (data.stop_reason === 'max_tokens') throw new BrainError(502, 'Tekoälyn vastaus jäi kesken (liian pitkä). Kokeile lyhyempää kirjausta.');
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text || '').join('');
  try {
    return { json: JSON.parse(text), model: data.model || BRAIN_MODEL };
  } catch {
    throw new BrainError(502, 'Tekoälyn vastausta ei voitu lukea. Kirjaus on tallessa.');
  }
}

// ── Konteksti ───────────────────────────────────────────────────

function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '\n[…katkaistu]' : s;
}

function noteBlock(n: BrainNote, max: number): string {
  const props = Object.entries(n.properties || {}).map(([k, v]) => `${k}: ${v}`).join('\n');
  return `<muistiinpano slug="${n.slug}" nimi="${n.name.replace(/"/g, "'")}" osio="${n.sectionSlug}" tyyppi="${n.kind}"${n.isDraft ? ' luonnos="kyllä"' : ''}>\n${props ? props + '\n---\n' : ''}${clip(n.bodyMd || '', max)}\n</muistiinpano>`;
}

/** Organisaation ydin (core) ja arvot: vakaa osa järjestelmäkehotetta (välimuistiin). */
function coreContext(notes: BrainNote[]): string {
  const core = notes.filter(n => n.kind === 'core');
  const values = notes.filter(n => n.kind !== 'core' && /\barvo(t|mme)?\b/i.test(`${n.name} ${n.title}`)).slice(0, 2);
  const parts = [...core.map(n => noteBlock(n, 12_000)), ...values.map(n => noteBlock(n, 4_000))];
  return parts.length ? parts.join('\n\n') : '(Organisaatiolla ei ole vielä ydinmuistiinpanoa.)';
}

function indexContext(notes: BrainNote[], sections: BrainSection[]): string {
  const bySec = new Map<string, BrainNote[]>();
  for (const n of notes) {
    const a = bySec.get(n.sectionSlug) || [];
    a.push(n);
    bySec.set(n.sectionSlug, a);
  }
  return sections.map(s => {
    const list = (bySec.get(s.slug) || []).map(n => `  - ${n.slug} | ${n.name}${n.kind !== 'note' ? ` (${n.kind})` : ''}`).join('\n');
    return `${s.slug} | ${s.title}\n${list || '  (tyhjä)'}`;
  }).join('\n');
}

async function loadContext(orgId: string) {
  const db = adminDb();
  const [notes, secSnap, goalSnap, orgSnap] = await Promise.all([
    loadNotes(orgId),
    col(db, orgId, C.sections).orderBy('sortOrder').get(),
    col(db, orgId, C.goals).get(),
    db.doc(`organizations/${orgId}`).get(),
  ]);
  return {
    notes,
    sections: secSnap.docs.map(d => d.data() as BrainSection),
    goals: goalSnap.docs.map(d => d.data() as BrainGoal),
    orgName: String(orgSnap.data()?.name || orgId),
  };
}

async function relevantNotes(orgId: string, notes: BrainNote[], text: string, max: number): Promise<BrainNote[]> {
  const hits = await searchBrain(orgId, text.slice(0, 500), max);
  const bySlug = new Map(notes.map(n => [n.slug, n]));
  // Myös suoraan mainitut [[linkit]] ja nimet
  const out = new Map<string, BrainNote>();
  for (const m of text.matchAll(/\[\[([^\]|#]+)/g)) {
    const n = notes.find(x => x.nameKey === nameKey(m[1]));
    if (n) out.set(n.slug, n);
  }
  for (const h of hits) {
    const n = bySlug.get(h.slug);
    if (n && n.kind !== 'core') out.set(n.slug, n);
    if (out.size >= max) break;
  }
  return [...out.values()].slice(0, max);
}

// ── Kirjaa ──────────────────────────────────────────────────────

const nullable = (type: string) => ({ type: [type, 'null'] });

const OPERATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    type: { type: 'string', enum: ['append_to_note', 'update_property', 'create_note', 'add_decision', 'add_proposal', 'update_goal_metric'] },
    targetSlug: nullable('string'),
    heading: nullable('string'),
    content: nullable('string'),
    key: nullable('string'),
    value: nullable('string'),
    name: nullable('string'),
    title: nullable('string'),
    sectionSlug: nullable('string'),
    decidedOn: nullable('string'),
    decision: nullable('string'),
    rationale: nullable('string'),
    area: nullable('string'),
    impact: nullable('string'),
    urgency: nullable('string'),
    goalId: nullable('string'),
    breakdownKey: nullable('string'),
    period: nullable('string'),
    metricValue: nullable('number'),
    reason: { type: 'string' },
  },
  required: ['type', 'targetSlug', 'heading', 'content', 'key', 'value', 'name', 'title', 'sectionSlug', 'decidedOn', 'decision', 'rationale', 'area', 'impact', 'urgency', 'goalId', 'breakdownKey', 'period', 'metricValue', 'reason'],
};

const INBOX_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    operations: { type: 'array', items: OPERATION_SCHEMA },
    questions: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'operations', 'questions'],
};

const INBOX_RULES = `Olet organisaation aivojen kirjuri. Käyttäjä kirjasi jotain (tekstinä tai sanelemalla). Tehtäväsi on ehdottaa, mihin aivoihin se kuuluu. Et kirjoita mitään itse: ihminen hyväksyy, muokkaa tai hylkää jokaisen ehdotuksesi erikseen.

Säännöt:
1. Korjaa kielioppi ja kirjoitusvirheet, mutta säilytä merkitys ja käyttäjän oma ääni. Älä tiivistä pois yksityiskohtia, lukuja tai nimiä.
2. Merkitse käyttäjän omat sanat muodossa (Nimi, päivämäärä), esim. (Anton, 26.9.2026). Käytä annettua nimeä ja päivämäärää.
3. Älä lisää omia johtopäätöksiä faktoina. Jos ehdotat tulkintaa, tee siitä ehdotus (add_proposal) ja kirjoita siihen "Ehdotus, ei päätös."
4. Jos kohde on epäselvä (esim. kaksi samannimistä asiakasta, ei tiedä kumpaan projektiin), älä arvaa: kirjoita kysymys questions-listaan ja jätä operaatio pois.
5. Käytä vain annettuja slugeja (targetSlug, sectionSlug) ja tavoitteiden id:itä. Uusi muistiinpano (create_note) vain, jos sopivaa ei ole.
6. Linkitä mainitut asiat wikilinkeillä [[Nimi]] käyttäen olemassa olevien muistiinpanojen nimiä.
7. append_to_note: content on valmis markdown-teksti, joka lisätään sellaisenaan. heading = olemassa olevan otsikon teksti, jonka alle lisätään, tai null (loppuun).
8. Päätökset (add_decision) vain, kun käyttäjä sanoo päättäneensä jotain. Pelkkä idea on ehdotus, ei päätös.
9. update_goal_metric vain, kun käyttäjä kertoo toteuman luvun (esim. laskutettu summa). metricValue on luku.
10. Jokaiselle operaatiolle lyhyt reason: miksi juuri tämä kohde.
11. Täytä kentät, joita operaatio tarvitsee, ja laita muihin null:
   append_to_note: targetSlug, heading, content
   update_property: targetSlug, key, value
   create_note: name, title, sectionSlug, content
   add_decision: decidedOn (YYYY-MM-DD), decision, rationale
   add_proposal: title, content, area, impact, urgency
   update_goal_metric: goalId, breakdownKey, period, metricValue
12. summary: 1–2 lausetta suomeksi siitä, mitä kirjaus sisältää ja mitä ehdotat.
Kirjoita suomeksi, ellei kirjaus ole muulla kielellä.`;

export async function suggestForInbox(orgId: string, text: string, authorName: string): Promise<InboxSuggestion> {
  const ctx = await loadContext(orgId);
  const related = await relevantNotes(orgId, ctx.notes, text, 8);
  const goals = ctx.goals.map(g => `${g.id} | ${g.title} | kausi ${g.period} | tavoite ${g.targetValue} ${g.unit}${g.breakdown.length ? ' | osat: ' + g.breakdown.map(b => `${b.key}=${b.label}`).join(', ') : ''}`).join('\n') || '(ei tavoitteita)';
  const today = todayIso();
  const [y, m, d] = today.split('-');
  const { json, model } = await callClaude({
    system: [
      { text: `${INBOX_RULES}\n\nOrganisaatio: ${ctx.orgName}\n\n<ydin>\n${coreContext(ctx.notes)}\n</ydin>\n\n<osiot_ja_muistiinpanot>\n${indexContext(ctx.notes, ctx.sections)}\n</osiot_ja_muistiinpanot>\n\n<tavoitteet>\n${goals}\n</tavoitteet>`, cache: true },
    ],
    user: `Kirjaaja: ${authorName}\nPäivämäärä: ${Number(d)}.${Number(m)}.${y} (${today})\n\n<liittyvät_muistiinpanot>\n${related.map(n => noteBlock(n, 6_000)).join('\n\n') || '(ei osumia)'}\n</liittyvät_muistiinpanot>\n\n<kirjaus>\n${text}\n</kirjaus>`,
    schema: INBOX_SCHEMA,
    effort: 'medium',
  });
  const out = (json && typeof json === 'object' ? json : {}) as { summary?: unknown; operations?: unknown[]; questions?: unknown[] };
  const slugs = new Set(ctx.notes.map(n => n.slug));
  const sectionSlugs = new Set(ctx.sections.map(s => s.slug));
  const goalIds = new Set(ctx.goals.map(g => g.id));
  const ops = (Array.isArray(out.operations) ? out.operations : [])
    .map(o => {
      const r = (o && typeof o === 'object' ? { ...(o as Record<string, unknown>) } : {}) as Record<string, unknown>;
      if (r.type === 'update_goal_metric') r.value = r.metricValue;
      return parseOperation(r);
    })
    .filter((op): op is NonNullable<typeof op> => !!op)
    // Vain olemassa oleviin kohteisiin viittaavat operaatiot kelpaavat
    .filter(op => {
      if (op.type === 'append_to_note' || op.type === 'update_property') return slugs.has(op.targetSlug);
      if (op.type === 'create_note') return sectionSlugs.has(op.sectionSlug);
      if (op.type === 'update_goal_metric') return goalIds.has(op.goalId);
      return true;
    })
    .slice(0, 20);
  return {
    summary: typeof out.summary === 'string' ? out.summary.slice(0, 1000) : '',
    operations: ops,
    questions: (Array.isArray(out.questions) ? out.questions : []).map(q => String(q).slice(0, 500)).slice(0, 10),
    model,
    createdAt: Date.now(),
  };
}

// ── Kysy ────────────────────────────────────────────────────────

const ASK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    found: { type: 'boolean' },
    answer: { type: 'string' },
    sources: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { slug: { type: 'string' }, quote: { type: 'string' } },
        required: ['slug', 'quote'],
      },
    },
  },
  required: ['found', 'answer', 'sources'],
};

const ASK_RULES = `Vastaat kysymykseen organisaation aivojen sisällön perusteella. Käytä vain annettuja muistiinpanoja, et omaa yleistietoasi.

Säännöt:
1. Jos muistiinpanoissa ei ole vastausta, aseta found = false ja sano se suoraan answer-kentässä. Älä arvaa äläkä täydennä.
2. Merkitse väitteisiin lähde hakasulkeisiin numerona [1], [2] siinä järjestyksessä kuin lähteet ovat sources-listassa.
3. sources: jokaisesta käyttämästäsi muistiinpanosta slug ja lyhyt suora lainaus (enintään 200 merkkiä), joka tukee vastausta.
4. Jos muistiinpano on merkitty luonnokseksi tai siinä lukee "Ehdotus, ei päätös", kerro että kyse on ehdotuksesta, ei päätöksestä.
5. ⚠️-merkityt kohdat ovat vahvistamatta: mainitse se, jos vastaus nojaa niihin.
6. Vastaa suomeksi, lyhyesti ja selkeästi. Markdown on sallittu.`;

export interface AskAnswer {
  found: boolean;
  answer: string;
  sources: { slug: string; name: string; title: string; quote: string }[];
  model: string;
}

export async function askBrain(orgId: string, question: string): Promise<AskAnswer> {
  const ctx = await loadContext(orgId);
  const related = await relevantNotes(orgId, ctx.notes, question, 10);
  if (!related.length && !ctx.notes.some(n => n.kind === 'core')) {
    return { found: false, answer: 'Aivoista ei löytynyt tähän liittyviä muistiinpanoja.', sources: [], model: '' };
  }
  const { json, model } = await callClaude({
    system: [{ text: `${ASK_RULES}\n\nOrganisaatio: ${ctx.orgName}\n\n<ydin>\n${coreContext(ctx.notes)}\n</ydin>`, cache: true }],
    user: `<muistiinpanot>\n${related.map(n => noteBlock(n, 8_000)).join('\n\n') || '(ei hakuosumia)'}\n</muistiinpanot>\n\n<kysymys>\n${question}\n</kysymys>`,
    schema: ASK_SCHEMA,
    effort: 'medium',
  });
  const out = (json && typeof json === 'object' ? json : {}) as { found?: unknown; answer?: unknown; sources?: unknown[] };
  const bySlug = new Map(ctx.notes.map(n => [n.slug, n]));
  const sources = (Array.isArray(out.sources) ? out.sources : [])
    .map(s => (s && typeof s === 'object' ? s as Record<string, unknown> : {}))
    .map(s => ({ slug: String(s.slug || ''), quote: String(s.quote || '').slice(0, 300) }))
    .filter(s => bySlug.has(s.slug))
    .map(s => ({ ...s, name: bySlug.get(s.slug)!.name, title: bySlug.get(s.slug)!.title }));
  return {
    found: out.found === true && sources.length > 0,
    answer: typeof out.answer === 'string' ? out.answer.slice(0, 8000) : '',
    sources,
    model,
  };
}
