'use client';

// Aivojen muistiinpanonäkymä: runko markdownina, ominaisuudet, takaisinlinkit, tulevat sivut ja versiohistoria.
// Muokkaajalle editori (nimi, otsikko, osio, ominaisuudet, runko + esikatselu) ja vanhan version palautus.
// Kaikki kirjoitukset kulkevat brainApi:n kautta, joka tallentaa version ja audit-rivin.

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import TabSwitcher from '@/components/TabSwitcher';
import { useToast } from '@/lib/toast';
import { useIsMobile } from '@/lib/use-mobile';
import {
  brainApi, BrainApiError, useBrainAccess, useBrainBacklinks, useBrainNote, useBrainNotes, useBrainRevisions, useBrainSections,
} from '@/lib/use-brain';
import { KIND_LABELS, type BrainNote, type BrainRevision, type BrainSection, type ChangeSource } from '@/lib/brain-shared';
import BrainMarkdown, { type WikiTarget } from './BrainMarkdown';
import { brainCard, brainLabel, noteHref, useBrainBase, useWikiResolver } from './BrainShell';

type Resolver = (target: string, heading: string | null) => WikiTarget;

const SOURCE_LABELS: Record<ChangeSource, string> = {
  user: 'Käyttäjä',
  agent: 'Agentti',
  import: 'Tuonti',
  inbox: 'Kirjaus',
};

// Nimessä kielletyt merkit: ne rikkoisivat [[wikilinkit]]
export const FORBIDDEN_NAME_CHARS = /[[\]|#^]/;

export function formatTime(ts: number): string {
  if (!ts) return '';
  return new Date(ts).toLocaleString('fi-FI', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── Ominaisuusrivien editori (käytetään myös uuden muistiinpanon lomakkeessa) ──

export interface PropRow { id: number; key: string; value: string }

let rowSeq = 0;
export function newPropRow(key = '', value = ''): PropRow {
  rowSeq += 1;
  return { id: rowSeq, key, value };
}

export function rowsFromProps(props: Record<string, string> | undefined): PropRow[] {
  return Object.entries(props || {}).map(([k, v]) => newPropRow(k, String(v ?? '')));
}

export function propsFromRows(rows: PropRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) {
    const k = r.key.trim();
    if (k) out[k] = r.value;
  }
  return out;
}

export function PropertyRowsEditor({ rows, onChange, idPrefix }: { rows: PropRow[]; onChange: (rows: PropRow[]) => void; idPrefix: string }) {
  const update = (id: number, patch: Partial<PropRow>) => onChange(rows.map(r => (r.id === id ? { ...r, ...patch } : r)));
  const keys = rows.map(r => r.key.trim()).filter(Boolean);
  const dup = keys.find((k, i) => keys.indexOf(k) !== i);
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
      <legend style={{ ...brainLabel, marginBottom: 6 }}>Ominaisuudet</legend>
      {rows.length === 0 && <div style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 8 }}>Ei ominaisuuksia.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((r, i) => (
          <div key={r.id} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <label htmlFor={`${idPrefix}-k-${r.id}`} style={visuallyHidden}>Ominaisuuden {i + 1} nimi</label>
            <input id={`${idPrefix}-k-${r.id}`} className="input" value={r.key} placeholder="Nimi, esim. tila"
              onChange={e => update(r.id, { key: e.target.value })} style={{ flex: '1 1 120px', minHeight: 40 }} />
            <label htmlFor={`${idPrefix}-v-${r.id}`} style={visuallyHidden}>Ominaisuuden {i + 1} arvo</label>
            <input id={`${idPrefix}-v-${r.id}`} className="input" value={r.value} placeholder="Arvo"
              onChange={e => update(r.id, { value: e.target.value })} style={{ flex: '2 1 180px', minHeight: 40 }} />
            <button type="button" className="btn btn-ghost btn-sm" aria-label={`Poista ominaisuus ${r.key || i + 1}`}
              onClick={() => onChange(rows.filter(x => x.id !== r.id))} style={{ minHeight: 40, minWidth: 40 }}>
              <span aria-hidden>✕</span>
            </button>
          </div>
        ))}
      </div>
      {dup && <div role="alert" style={{ fontSize: 13, color: 'var(--red)', marginTop: 6 }}>Ominaisuus &quot;{dup}&quot; on kahdesti. Vain jälkimmäinen tallentuu.</div>}
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange([...rows, newPropRow()])} style={{ marginTop: 8, minHeight: 40 }}>
        Lisää ominaisuus
      </button>
    </fieldset>
  );
}

const visuallyHidden: React.CSSProperties = {
  position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap',
};

// ── Rivi-diff (LCS) ──────────────────────────────────────────────

type DiffOp = { t: 'same' | 'add' | 'del'; line: string };

/** Rivitason ero vanhasta uuteen. Yhteinen alku ja loppu karsitaan ensin, keskiosa LCS:llä. */
export function diffLines(oldText: string, newText: string): DiffOp[] | null {
  const a = oldText.split('\n');
  const b = newText.split('\n');
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const n = midA.length;
  const m = midB.length;
  // Liian suuri vertailu: ei jäädytetä selainta
  if (n * m > 4_000_000) return null;
  const w = m + 1;
  const dp = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] = midA[i] === midB[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
    }
  }
  const ops: DiffOp[] = a.slice(0, start).map(line => ({ t: 'same' as const, line }));
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (midA[i] === midB[j]) { ops.push({ t: 'same', line: midA[i] }); i++; j++; }
    else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) { ops.push({ t: 'del', line: midA[i] }); i++; }
    else { ops.push({ t: 'add', line: midB[j] }); j++; }
  }
  while (i < n) ops.push({ t: 'del', line: midA[i++] });
  while (j < m) ops.push({ t: 'add', line: midB[j++] });
  for (const line of a.slice(endA)) ops.push({ t: 'same', line });
  return ops;
}

type DiffRow = DiffOp | { t: 'skip'; count: number };

/** Pitkät muuttumattomat jaksot tiivistetään: 2 riviä kontekstia muutosten ympärillä. */
function collapseDiff(ops: DiffOp[], context = 2): DiffRow[] {
  const out: DiffRow[] = [];
  let skipped = 0;
  for (let idx = 0; idx < ops.length; idx++) {
    const o = ops[idx];
    let near = o.t !== 'same';
    for (let k = Math.max(0, idx - context); !near && k <= Math.min(ops.length - 1, idx + context); k++) {
      if (ops[k].t !== 'same') near = true;
    }
    if (!near) { skipped++; continue; }
    if (skipped > 0) { out.push({ t: 'skip', count: skipped }); skipped = 0; }
    out.push(o);
  }
  if (skipped > 0) out.push({ t: 'skip', count: skipped });
  return out;
}

function DiffView({ oldText, newText }: { oldText: string; newText: string }) {
  const ops = useMemo(() => diffLines(oldText, newText), [oldText, newText]);
  if (!ops) return <div style={{ fontSize: 14, color: 'var(--t3)' }}>Muistiinpano on liian pitkä rivivertailuun.</div>;
  const changed = ops.filter(o => o.t !== 'same').length;
  if (changed === 0) return <div style={{ fontSize: 14, color: 'var(--t2)' }}>Rungossa ei ole eroja nykyiseen versioon.</div>;

  const rows = collapseDiff(ops).map((r, idx) => {
    if (r.t === 'skip') {
      return <div key={`s${idx}`} style={{ padding: '2px 8px', color: 'var(--t3)', fontStyle: 'italic' }}>… {r.count} samaa riviä</div>;
    }
    const add = r.t === 'add';
    const del = r.t === 'del';
    return (
      <div key={idx} style={{
        display: 'flex', gap: 8, padding: '1px 8px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
        background: add ? 'rgba(46,160,67,.14)' : del ? 'rgba(193,69,69,.12)' : undefined,
        borderLeft: `3px solid ${add ? 'var(--green)' : del ? 'var(--red)' : 'transparent'}`,
      }}>
        <span aria-hidden style={{ width: 12, flex: 'none', fontWeight: 700, color: add ? 'var(--green)' : del ? 'var(--red)' : 'var(--t3)' }}>{add ? '+' : del ? '−' : ' '}</span>
        <span style={visuallyHidden}>{add ? 'Lisätty: ' : del ? 'Poistettu: ' : ''}</span>
        <span style={{ flex: 1, textDecoration: del ? 'line-through' : undefined, textDecorationColor: 'rgba(193,69,69,.5)' }}>{r.line || ' '}</span>
      </div>
    );
  });
  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 8 }}>
        <b style={{ color: 'var(--green)' }}>+</b> = rivi on lisätty tämän version jälkeen, <b style={{ color: 'var(--red)' }}>−</b> = rivi on poistettu tämän version jälkeen.
      </div>
      <div style={{ fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace', fontSize: 13, lineHeight: 1.55, border: '1px solid var(--border)', borderRadius: 'var(--r)', overflowX: 'auto', padding: '4px 0' }}>
        {rows}
      </div>
    </div>
  );
}

// ── Pääkomponentti ───────────────────────────────────────────────

export default function BrainNoteSection({ slug }: { slug: string }) {
  // Avain slugilla: muokkaus- ja versiotila nollautuvat, kun siirrytään toiseen muistiinpanoon
  return <NoteView key={slug} slug={slug} />;
}

interface EditDraft {
  name: string;
  title: string;
  sectionSlug: string;
  rows: PropRow[];
  bodyMd: string;
  baseVersion: number;
}

function NoteView({ slug }: { slug: string }) {
  const base = useBrainBase();
  const { orgId, canEdit } = useBrainAccess();
  const note = useBrainNote(orgId, slug);
  const notes = useBrainNotes(orgId);
  const sections = useBrainSections(orgId);
  const resolve = useWikiResolver(notes.data);
  const narrow = useIsMobile(1100);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);

  const n = note.data;
  const loaded = !!n;

  // Hash-ankkuri (#otsikko): sisältö latautuu vasta sivun jälkeen, joten vieritetään kun runko on näkyvissä
  useEffect(() => {
    if (!loaded) return;
    const raw = window.location.hash.slice(1);
    if (!raw) return;
    let id = raw;
    try { id = decodeURIComponent(raw); } catch { /* jätetään sellaisenaan */ }
    const el = document.getElementById(id) || document.getElementById(raw);
    if (el) el.scrollIntoView();
  }, [loaded]);

  if (!orgId || note.loading) return <div style={{ ...brainCard, color: 'var(--t2)' }}>Ladataan…</div>;
  if (note.error) {
    return (
      <div role="alert" style={{ ...brainCard, lineHeight: 1.6 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Muistiinpanoa ei voitu avata: {note.error}</div>
        <Link href={base} className="btn btn-secondary btn-sm" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>Siirry Aivojen kotiin</Link>
      </div>
    );
  }
  if (!n) {
    return (
      <div style={{ ...brainCard, lineHeight: 1.6 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 500, margin: '0 0 6px' }}>Muistiinpanoa ei löydy</h1>
        <p style={{ fontSize: 14, color: 'var(--t2)', margin: '0 0 12px' }}>Se on ehkä poistettu, tai osoite on väärä.</p>
        <Link href={base} className="btn btn-secondary btn-sm" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>Siirry Aivojen kotiin</Link>
      </div>
    );
  }

  const startEdit = () => {
    setSelectedVersion(null);
    setDraft({
      name: n.name,
      title: n.title || '',
      sectionSlug: n.sectionSlug,
      rows: rowsFromProps(n.properties),
      bodyMd: n.bodyMd || '',
      baseVersion: n.version,
    });
  };

  if (draft && canEdit && orgId) {
    return <NoteEditor note={n} orgId={orgId} initial={draft} sections={sections.data} resolve={resolve} onClose={() => setDraft(null)} />;
  }

  const section = sections.data.find(s => s.slug === n.sectionSlug);
  const props = Object.entries(n.properties || {});

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <NoteHeader note={n} section={section} canEdit={canEdit} onEdit={startEdit} />

      <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'minmax(0, 1fr) 280px', gap: 16, alignItems: 'start' }}>
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {selectedVersion !== null ? (
            <RevisionView orgId={orgId} note={n} version={selectedVersion} canEdit={canEdit} resolve={resolve} onClose={() => setSelectedVersion(null)} />
          ) : (
            <article style={brainCard} aria-label="Muistiinpanon sisältö">
              {n.bodyMd?.trim()
                ? <BrainMarkdown source={n.bodyMd} resolve={resolve} />
                : <div style={{ fontSize: 14, color: 'var(--t3)' }}>Muistiinpano on tyhjä.</div>}
            </article>
          )}
        </div>

        <aside aria-label="Muistiinpanon tiedot" style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <section style={brainCard} aria-labelledby="brain-props-h">
            <h2 id="brain-props-h" style={{ ...brainLabel, margin: '0 0 10px', fontWeight: 400 }}>Ominaisuudet</h2>
            {props.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--t3)' }}>Ei ominaisuuksia.</div>
            ) : (
              <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {props.map(([k, v]) => (
                  <div key={k}>
                    <dt style={{ fontSize: 12, color: 'var(--t3)' }}>{k}</dt>
                    <dd style={{ margin: 0 }}>
                      {String(v ?? '').trim() ? <BrainMarkdown source={String(v)} resolve={resolve} compact /> : <span style={{ fontSize: 13, color: 'var(--t3)' }}>(tyhjä)</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </section>

          <BacklinksPanel orgId={orgId} slug={n.slug} />

          {(n.unresolvedLinks || []).length > 0 && (
            <section style={brainCard} aria-labelledby="brain-future-h">
              <h2 id="brain-future-h" style={{ ...brainLabel, margin: '0 0 6px', fontWeight: 400 }}>Tulevat sivut</h2>
              <p style={{ fontSize: 12.5, color: 'var(--t3)', margin: '0 0 8px' }}>Linkkejä sivuille, joita ei vielä ole.</p>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {n.unresolvedLinks.map(k => (
                  <li key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}>
                    <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere', color: 'var(--t2)' }}>{k}</span>
                    {canEdit && (
                      <Link href={`${base}/uusi?nimi=${encodeURIComponent(k)}&osio=${encodeURIComponent(n.sectionSlug)}`}
                        aria-label={`Luo sivu ${k}`} className="btn btn-ghost btn-sm"
                        style={{ minHeight: 36, display: 'inline-flex', alignItems: 'center' }}>
                        Luo
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <HistoryPanel orgId={orgId} slug={n.slug} currentVersion={n.version} selected={selectedVersion} onSelect={setSelectedVersion} />
        </aside>
      </div>
    </div>
  );
}

function NoteHeader({ note: n, section, canEdit, onEdit }: { note: BrainNote; section: BrainSection | undefined; canEdit: boolean; onEdit: () => void }) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const reviewCount = n.reviewItems?.length || 0;
  const chip: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5, padding: '2px 10px', borderRadius: 20, border: '1px solid var(--border)', color: 'var(--t2)', minHeight: 26 };
  return (
    <header style={{ ...brainCard, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 280px', minWidth: 0 }}>
          <div style={brainLabel}>{section?.title || n.sectionSlug}</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 500, margin: '4px 0 0', lineHeight: 1.2, overflowWrap: 'anywhere' }}>{n.title || n.name}</h1>
          {n.title && n.title !== n.name && <div style={{ fontSize: 13, color: 'var(--t3)', marginTop: 2 }}>Linkkinimi: [[{n.name}]]</div>}
        </div>
        {canEdit && (
          <button type="button" className="btn btn-primary" onClick={onEdit} style={{ minHeight: 44 }}>Muokkaa</button>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={chip}>{KIND_LABELS[n.kind] || n.kind}</span>
        {n.isDraft && (
          <span style={{ ...chip, borderColor: 'var(--hetki-yellow)', color: 'var(--t1)', background: 'rgba(241,180,52,.18)' }}>
            <span aria-hidden>✎</span> Ehdotus, ei päätös
          </span>
        )}
        {reviewCount > 0 && (
          <button type="button" aria-expanded={reviewOpen} aria-controls="brain-review-list" onClick={() => setReviewOpen(v => !v)}
            style={{ ...chip, borderColor: 'var(--red)', color: 'var(--red)', background: 'rgba(193,69,69,.08)', cursor: 'pointer', font: 'inherit', fontSize: 12.5, minHeight: 32 }}>
            <span aria-hidden>⚠</span> {reviewCount} vahvistettavaa {reviewCount === 1 ? 'kohta' : 'kohtaa'}
            <span aria-hidden style={{ marginLeft: 2 }}>{reviewOpen ? '▴' : '▾'}</span>
          </button>
        )}
      </div>
      {reviewOpen && reviewCount > 0 && (
        <ul id="brain-review-list" style={{ margin: 0, padding: '8px 12px 8px 28px', background: 'rgba(193,69,69,.06)', borderLeft: '4px solid var(--red)', borderRadius: '0 var(--r) var(--r) 0', fontSize: 14, lineHeight: 1.5 }}>
          {n.reviewItems.map((r, i) => <li key={i} style={{ margin: '2px 0' }}>{r}</li>)}
        </ul>
      )}
      <div style={{ fontSize: 12.5, color: 'var(--t3)' }}>
        Päivitetty {formatTime(n.updatedAt)}{n.updatedBy ? ` · ${n.updatedBy}` : ''} · versio {n.version}
      </div>
    </header>
  );
}

function BacklinksPanel({ orgId, slug }: { orgId: string; slug: string }) {
  const base = useBrainBase();
  const backlinks = useBrainBacklinks(orgId, slug);
  const list = backlinks.data.filter(b => b.slug !== slug).sort((a, b) => (a.title || a.name).localeCompare(b.title || b.name, 'fi'));
  return (
    <section style={brainCard} aria-labelledby="brain-bl-h">
      <h2 id="brain-bl-h" style={{ ...brainLabel, margin: '0 0 10px', fontWeight: 400 }}>Takaisinlinkit{list.length ? ` (${list.length})` : ''}</h2>
      {backlinks.loading ? (
        <div style={{ fontSize: 13, color: 'var(--t3)' }}>Ladataan…</div>
      ) : backlinks.error ? (
        <div style={{ fontSize: 13, color: 'var(--red)' }}>{backlinks.error}</div>
      ) : list.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--t3)' }}>Ei takaisinlinkkejä</div>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {list.map(b => (
            <li key={b.slug}>
              <Link href={noteHref(base, b.slug)} style={{ display: 'flex', alignItems: 'center', minHeight: 36, fontSize: 14, color: 'var(--pri)', textDecoration: 'underline', textUnderlineOffset: 2 }}>
                {b.title || b.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function HistoryPanel({ orgId, slug, currentVersion, selected, onSelect }: {
  orgId: string; slug: string; currentVersion: number; selected: number | null; onSelect: (v: number | null) => void;
}) {
  const revisions = useBrainRevisions(orgId, slug);
  const [showAll, setShowAll] = useState(false);
  const list = showAll ? revisions.data : revisions.data.slice(0, 8);
  return (
    <section style={brainCard} aria-labelledby="brain-hist-h">
      <h2 id="brain-hist-h" style={{ ...brainLabel, margin: '0 0 10px', fontWeight: 400 }}>Versiohistoria</h2>
      {revisions.loading ? (
        <div style={{ fontSize: 13, color: 'var(--t3)' }}>Ladataan…</div>
      ) : revisions.error ? (
        <div style={{ fontSize: 13, color: 'var(--red)' }}>{revisions.error}</div>
      ) : revisions.data.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--t3)' }}>Ei aiempia versioita.</div>
      ) : (
        <>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {list.map(r => {
              const act = selected === r.version;
              const current = r.version === currentVersion;
              return (
                <li key={r.version}>
                  <button type="button" aria-pressed={act} onClick={() => onSelect(act ? null : r.version)}
                    style={{
                      width: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'var(--t1)',
                      background: act ? 'var(--card2)' : 'none', border: `1px solid ${act ? 'var(--pri)' : 'transparent'}`,
                      borderRadius: 'var(--r)', padding: '6px 8px', minHeight: 44, display: 'flex', flexDirection: 'column', gap: 2,
                    }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>
                      Versio {r.version}{current ? ' (nykyinen)' : ''}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--t3)' }}>
                      {formatTime(r.createdAt)} · {r.changedByName || r.changedBy} · {SOURCE_LABELS[r.changeSource] || r.changeSource}
                    </span>
                    {r.changeReason && <span style={{ fontSize: 12.5, color: 'var(--t2)', overflowWrap: 'anywhere' }}>{r.changeReason}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          {revisions.data.length > 8 && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowAll(v => !v)} style={{ marginTop: 6, minHeight: 40 }}>
              {showAll ? 'Näytä vähemmän' : `Näytä kaikki (${revisions.data.length})`}
            </button>
          )}
        </>
      )}
    </section>
  );
}

function RevisionView({ orgId, note, version, canEdit, resolve, onClose }: {
  orgId: string; note: BrainNote; version: number; canEdit: boolean; resolve: Resolver; onClose: () => void;
}) {
  const { toast } = useToast();
  const revisions = useBrainRevisions(orgId, note.slug);
  const [tab, setTab] = useState<'diff' | 'content'>('diff');
  const [busy, setBusy] = useState(false);
  const rev: BrainRevision | undefined = revisions.data.find(r => r.version === version);
  const isCurrent = version === note.version;

  const restore = async () => {
    if (!window.confirm(`Palautetaanko versio ${version}? Nykyinen sisältö säilyy historiassa, ja palautuksesta tulee uusi versio.`)) return;
    setBusy(true);
    try {
      const res = await brainApi<{ slug: string; version: number }>('notes/restore', { body: { orgId, slug: note.slug, version } });
      toast(`Versio ${version} palautettu (uusi versio ${res.version})`, 'success');
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Palautus epäonnistui', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={brainCard} aria-labelledby="brain-rev-h">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <h2 id="brain-rev-h" style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 500, margin: 0, flex: 1 }}>
          Versio {version}{isCurrent ? ' (nykyinen)' : ''}
        </h2>
        {canEdit && rev && !isCurrent && (
          <button type="button" className="btn btn-primary btn-sm" onClick={restore} disabled={busy} style={{ minHeight: 44 }}>
            {busy ? 'Palautetaan…' : 'Palauta tämä versio'}
          </button>
        )}
        <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} style={{ minHeight: 44 }}>Sulje versio</button>
      </div>
      {revisions.loading ? (
        <div style={{ fontSize: 14, color: 'var(--t3)' }}>Ladataan…</div>
      ) : !rev ? (
        <div style={{ fontSize: 14, color: 'var(--t3)' }}>Versiota ei löydy.</div>
      ) : (
        <>
          <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 10, lineHeight: 1.5 }}>
            {formatTime(rev.createdAt)} · {rev.changedByName || rev.changedBy} · {SOURCE_LABELS[rev.changeSource] || rev.changeSource}
            {rev.changeReason && <><br />Syy: {rev.changeReason}</>}
            {(rev.name !== note.name || (rev.title || '') !== (note.title || '')) && (
              <><br />Tässä versiossa nimi oli &quot;{rev.name}&quot;{rev.title ? `, otsikko "${rev.title}"` : ''}.</>
            )}
          </div>
          <TabSwitcher
            tabs={[{ id: 'diff', label: 'Muutokset nykyiseen' }, { id: 'content', label: 'Version sisältö' }]}
            active={tab}
            onChange={id => setTab(id === 'content' ? 'content' : 'diff')}
            style={{ marginBottom: 12 }}
          />
          {tab === 'diff'
            ? <DiffView oldText={rev.bodyMd || ''} newText={note.bodyMd || ''} />
            : (rev.bodyMd?.trim() ? <BrainMarkdown source={rev.bodyMd} resolve={resolve} /> : <div style={{ fontSize: 14, color: 'var(--t3)' }}>Tämä versio on tyhjä.</div>)}
        </>
      )}
    </section>
  );
}

// ── Editori ──────────────────────────────────────────────────────

function NoteEditor({ note, orgId, initial, sections, resolve, onClose }: {
  note: BrainNote; orgId: string; initial: EditDraft; sections: BrainSection[]; resolve: Resolver; onClose: () => void;
}) {
  const { toast } = useToast();
  const [d, setD] = useState<EditDraft>(initial);
  const [reason, setReason] = useState('');
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameTrim = d.name.trim();
  const nameBad = FORBIDDEN_NAME_CHARS.test(d.name);
  const renamed = nameTrim !== note.name;
  const newerExists = note.version !== d.baseVersion;
  const dirty =
    d.name !== initial.name || d.title !== initial.title || d.sectionSlug !== initial.sectionSlug || d.bodyMd !== initial.bodyMd ||
    JSON.stringify(propsFromRows(d.rows)) !== JSON.stringify(propsFromRows(initial.rows)) || reason.trim() !== '';

  const set = (patch: Partial<EditDraft>) => setD(prev => ({ ...prev, ...patch }));

  const save = async () => {
    if (saving) return;
    if (!nameTrim) { setError('Anna muistiinpanolle nimi.'); return; }
    if (nameBad) { setError('Nimessä ei voi olla merkkejä [ ] | # ^'); return; }
    if (!d.sectionSlug) { setError('Valitse osio.'); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await brainApi<{ slug: string; version: number; created: boolean; renamedBacklinks: number }>('notes', {
        body: {
          orgId,
          note: {
            slug: note.slug,
            name: nameTrim,
            title: d.title.trim() || nameTrim,
            sectionSlug: d.sectionSlug,
            kind: note.kind,
            properties: propsFromRows(d.rows),
            bodyMd: d.bodyMd,
            expectedVersion: d.baseVersion,
          },
          reason: reason.trim() || undefined,
        },
      });
      toast(
        renamed && res.renamedBacklinks > 0
          ? `Tallennettu (versio ${res.version}). Linkit päivitetty ${res.renamedBacklinks} muistiinpanossa.`
          : `Tallennettu (versio ${res.version})`,
        'success',
      );
      onClose();
    } catch (e) {
      if (e instanceof BrainApiError && e.status === 409) {
        setError(`Tallennus ei onnistunut: ${e.message} Muutoksesi ovat yhä tässä editorissa. Kopioi ne talteen ennen kuin lataat sivun uudelleen.`);
      } else {
        setError(e instanceof Error ? e.message : 'Tallennus epäonnistui');
      }
      toast('Tallennus epäonnistui', 'error');
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    if (dirty && !window.confirm('Hylätäänkö tallentamattomat muutokset?')) return;
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      void save();
    }
  };

  const labelStyle: React.CSSProperties = { ...brainLabel, display: 'block', marginBottom: 4 };
  const sectionMissing = !!d.sectionSlug && !sections.some(s => s.slug === d.sectionSlug);

  return (
    <div onKeyDown={onKeyDown} style={{ ...brainCard, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 500, margin: 0, flex: 1 }}>Muokkaa: {note.title || note.name}</h1>
        <span style={{ fontSize: 12.5, color: 'var(--t3)' }}>Tallenna myös Ctrl+S / Cmd+S</span>
      </div>

      {newerExists && (
        <div role="status" style={{ padding: '8px 12px', borderLeft: '4px solid var(--hetki-yellow)', background: 'rgba(241,180,52,.14)', borderRadius: '0 var(--r) var(--r) 0', fontSize: 14 }}>
          Joku muu tallensi tästä muistiinpanosta uuden version ({note.version}) sillä aikaa, kun muokkasit. Tallennus ei onnistu ennen kuin yhdistät muutokset: kopioi tekstisi talteen, peru ja aloita muokkaus uudelleen.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <div>
          <label htmlFor="brain-edit-name" style={labelStyle}>Nimi (pakollinen)</label>
          <input id="brain-edit-name" className="input" value={d.name} onChange={e => set({ name: e.target.value })}
            aria-invalid={nameBad || !nameTrim} aria-describedby="brain-edit-name-help" style={{ width: '100%', minHeight: 44 }} />
          <div id="brain-edit-name-help" style={{ fontSize: 12.5, color: nameBad ? 'var(--red)' : 'var(--t3)', marginTop: 4 }}>
            {nameBad
              ? 'Nimessä ei voi olla merkkejä [ ] | # ^'
              : renamed
                ? 'Huom: linkit viittaavat nimeen. Kun tallennat, linkit muissa muistiinpanoissa päivitetään uuteen nimeen.'
                : 'Linkit muista muistiinpanoista viittaavat tähän nimeen.'}
          </div>
        </div>
        <div>
          <label htmlFor="brain-edit-title" style={labelStyle}>Otsikko</label>
          <input id="brain-edit-title" className="input" value={d.title} placeholder={nameTrim} onChange={e => set({ title: e.target.value })}
            style={{ width: '100%', minHeight: 44 }} />
        </div>
        <div>
          <label htmlFor="brain-edit-section" style={labelStyle}>Osio</label>
          <select id="brain-edit-section" className="input" value={d.sectionSlug} onChange={e => set({ sectionSlug: e.target.value })}
            style={{ width: '100%', minHeight: 44 }}>
            {sectionMissing && <option value={d.sectionSlug}>{d.sectionSlug}</option>}
            {sections.map(s => <option key={s.slug} value={s.slug}>{s.parentSlug ? '– ' : ''}{s.title}</option>)}
          </select>
        </div>
      </div>

      <PropertyRowsEditor rows={d.rows} onChange={rows => set({ rows })} idPrefix="brain-edit-prop" />

      <div>
        <TabSwitcher
          tabs={[{ id: 'edit', label: 'Muokkaa' }, { id: 'preview', label: 'Esikatsele' }]}
          active={tab}
          onChange={id => setTab(id === 'preview' ? 'preview' : 'edit')}
          style={{ marginBottom: 8 }}
        />
        {tab === 'edit' ? (
          <>
            <label htmlFor="brain-edit-body" style={labelStyle}>Sisältö (markdown)</label>
            <textarea id="brain-edit-body" className="input" value={d.bodyMd} rows={24} spellCheck
              onChange={e => set({ bodyMd: e.target.value })}
              style={{ width: '100%', fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace', fontSize: 14, lineHeight: 1.55, resize: 'vertical' }} />
          </>
        ) : (
          <div role="region" aria-label="Esikatselu" style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '12px 16px', minHeight: 200 }}>
            {d.bodyMd.trim() ? <BrainMarkdown source={d.bodyMd} resolve={resolve} /> : <div style={{ fontSize: 14, color: 'var(--t3)' }}>Ei sisältöä.</div>}
          </div>
        )}
      </div>

      <div>
        <label htmlFor="brain-edit-reason" style={labelStyle}>Muutoksen syy (valinnainen)</label>
        <input id="brain-edit-reason" className="input" value={reason} maxLength={500} placeholder="Esim. päivitin hinnat"
          onChange={e => setReason(e.target.value)} style={{ width: '100%', minHeight: 44 }} />
      </div>

      {error && (
        <div role="alert" style={{ padding: '8px 12px', borderLeft: '4px solid var(--red)', background: 'rgba(193,69,69,.08)', borderRadius: '0 var(--r) var(--r) 0', fontSize: 14, lineHeight: 1.5 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={saving} style={{ minHeight: 44 }}>
          {saving ? 'Tallennetaan…' : 'Tallenna'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={cancel} disabled={saving} style={{ minHeight: 44 }}>Peru</button>
      </div>
    </div>
  );
}
