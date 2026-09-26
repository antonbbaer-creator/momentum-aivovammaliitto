'use client';

// Aivojen Ehdotukset-näkymä: agenttien ja kirjausten ehdotukset välilehdittäin (Uudet, Myöhemmin,
// Hyväksytyt, Hylätyt), hyväksyntä/hylkäys/siirto palvelimen kautta, oma ehdotus ja päätösloki.
// Ehdotus ei ole päätös: mitään ei kirjoiteta aivoihin ennen kuin ihminen hyväksyy.

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import TabSwitcher from '@/components/TabSwitcher';
import { useToast } from '@/lib/toast';
import { useIsMobile } from '@/lib/use-mobile';
import {
  brainApi, useBrainAccess, useBrainDecisions, useBrainNotes, useBrainProposals, useBrainSections, useNoteIndex,
} from '@/lib/use-brain';
import {
  proposalIsDue, todayIso, OPERATION_LABELS,
  type BrainDecision, type BrainNote, type BrainOperation, type BrainProposal, type BrainSection,
  KIND_LABELS,
} from '@/lib/brain-shared';
import BrainMarkdown, { type WikiTarget } from './BrainMarkdown';
import { brainCard, brainLabel, noteHref, useBrainBase, useWikiResolver } from './BrainShell';

type TabId = 'uudet' | 'myohemmin' | 'hyvaksytyt' | 'hylatyt';
type Resolver = (target: string, heading: string | null) => WikiTarget;

const COLLAPSE_LINES = 12;

// ── Apurit (puhtaita, ei kellon lukua renderissä) ────────────────

function errMsg(e: unknown): string {
  return e instanceof Error && e.message ? e.message : 'Jokin meni vikaan. Yritä uudelleen.';
}

/** YYYY-MM-DD + n päivää (UTC-aritmetiikka, ei aikavyöhykeongelmia). */
function addDaysIso(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function fmtTime(ms: number | null | undefined): string {
  if (!ms) return '';
  return new Date(ms).toLocaleString('fi-FI', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtDay(ms: number | null | undefined): string {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric', year: 'numeric' });
}

/** YYYY-MM-DD → 12.3.2026. Muut muodot (tuonnin vapaa päiväys) sellaisenaan. */
function fmtIsoDay(s: string | null | undefined): string {
  if (!s) return '';
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${Number(m[3])}.${Number(m[2])}.${m[1]}` : s;
}

/** Päätöksen päiväys lajitteluavaimeksi (YYYY-MM-DD). Tuonnin d.m.yyyy muunnetaan, muuten tyhjä. */
function dayKey(s: string | null | undefined): string {
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
}

const DECISION_SOURCE_LABELS: Record<BrainDecision['source'], string> = {
  user: 'Käsin',
  proposal: 'Ehdotuksesta',
  inbox: 'Kirjauksesta',
};

// ── Pääkomponentti ───────────────────────────────────────────────

export default function BrainProposalsSection() {
  const { orgId, canEdit } = useBrainAccess();
  const proposals = useBrainProposals(orgId);
  const notes = useBrainNotes(orgId);
  const resolve = useWikiResolver(notes.data);
  const [today] = useState(() => todayIso());
  const [tab, setTab] = useState<TabId>('uudet');
  const [creating, setCreating] = useState(false);

  const groups = useMemo(() => {
    const g: Record<TabId, BrainProposal[]> = { uudet: [], myohemmin: [], hyvaksytyt: [], hylatyt: [] };
    for (const p of proposals.data) {
      if (p.status === 'uusi' || proposalIsDue(p, today)) g.uudet.push(p);
      else if (p.status === 'myöhemmin') g.myohemmin.push(p);
      else if (p.status === 'hyväksytty') g.hyvaksytyt.push(p);
      else if (p.status === 'hylätty') g.hylatyt.push(p);
    }
    g.uudet.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    g.myohemmin.sort((a, b) => (a.snoozeUntil || '').localeCompare(b.snoozeUntil || ''));
    g.hyvaksytyt.sort((a, b) => (b.decidedAt || 0) - (a.decidedAt || 0));
    g.hylatyt.sort((a, b) => (b.decidedAt || 0) - (a.decidedAt || 0));
    return g;
  }, [proposals.data, today]);

  const tabs = [
    { id: 'uudet', label: 'Uudet', count: groups.uudet.length },
    { id: 'myohemmin', label: 'Myöhemmin', count: groups.myohemmin.length },
    { id: 'hyvaksytyt', label: 'Hyväksytyt', count: groups.hyvaksytyt.length },
    { id: 'hylatyt', label: 'Hylätyt', count: groups.hylatyt.length },
  ];
  const list = groups[tab];

  const emptyText: Record<TabId, string> = {
    uudet: 'Ei uusia ehdotuksia. Agentit ja kirjaukset tuovat ehdotuksia tänne hyväksyttäväksi.',
    myohemmin: 'Ei myöhemmäksi siirrettyjä ehdotuksia.',
    hyvaksytyt: 'Ei vielä hyväksyttyjä ehdotuksia.',
    hylatyt: 'Ei hylättyjä ehdotuksia.',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <section aria-labelledby="brain-proposals-h" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="sec-h" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span className="t" id="brain-proposals-h">Ehdotukset</span>
          <span className="meta">Hyväksytty ehdotus lisätään Kehityssuunnitelmaan tehtäväksi.</span>
          {canEdit && !creating && (
            <button type="button" className="btn btn-primary btn-sm" style={{ marginLeft: 'auto', minHeight: 44 }} onClick={() => setCreating(true)}>
              Tee uusi ehdotus
            </button>
          )}
        </div>

        {canEdit && creating && orgId && <NewProposalForm orgId={orgId} proposals={proposals.data} onDone={() => setCreating(false)} />}

        <TabSwitcher tabs={tabs} active={tab} onChange={id => setTab(id as TabId)} style={{ marginBottom: 0 }} />

        {proposals.loading && <div style={{ color: 'var(--t3)', fontSize: 14 }} role="status">Ladataan ehdotuksia…</div>}
        {proposals.error && <div role="alert" style={{ color: 'var(--red)', fontSize: 14 }}>Ehdotusten lataus epäonnistui: {proposals.error}</div>}
        {!proposals.loading && !proposals.error && list.length === 0 && (
          <div style={{ ...brainCard, color: 'var(--t2)', fontSize: 14 }}>{emptyText[tab]}</div>
        )}

        {list.map(p => (
          <ProposalCard key={p.id} p={p} orgId={orgId} canEdit={canEdit} resolve={resolve} notes={notes.data}
            returned={proposalIsDue(p, today)} />
        ))}
      </section>

      <DecisionLog />
    </div>
  );
}

// ── Kortti ───────────────────────────────────────────────────────

function Pill({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, lineHeight: '20px', padding: '1px 9px',
      borderRadius: 12, border: `1px solid ${color || 'var(--border-l)'}`, color: 'var(--t1)', background: 'var(--card2)',
    }}>
      <span style={{ color: 'var(--t3)' }}>{label}:</span> <strong style={{ fontWeight: 600 }}>{value}</strong>
    </span>
  );
}

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span style={{
      display: 'inline-block', fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase',
      color, border: `1px solid ${color}`, borderRadius: 'var(--r)', padding: '1px 7px', lineHeight: '16px',
    }}>{children}</span>
  );
}

function SourceList({ sources, resolve }: { sources: string[]; resolve: Resolver }) {
  if (!sources.length) return null;
  return (
    <div>
      <div style={brainLabel}>Lähteet</div>
      <ul style={{ margin: '4px 0 0', paddingLeft: '1.2em', fontSize: 14, lineHeight: 1.6 }}>
        {sources.map(s => {
          if (/^https?:\/\//i.test(s)) {
            return (
              <li key={s}>
                <a href={s} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--pri)', overflowWrap: 'anywhere' }}>
                  {s}<span className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}> (avautuu uuteen välilehteen)</span>
                </a>
              </li>
            );
          }
          const t = resolve(s, null);
          return (
            <li key={s}>
              {t.href && t.exists
                ? <Link href={t.href} style={{ color: 'var(--pri)' }}>{t.label}</Link>
                : <span style={{ color: 'var(--t3)' }} title="Muistiinpanoa ei ole vielä olemassa">{s} (ei vielä muistiinpanoa)</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function operationTarget(op: BrainOperation, bySlug: Map<string, BrainNote>): { text: string; slug: string | null; isNote: boolean } {
  switch (op.type) {
    case 'append_to_note':
    case 'update_property': {
      const n = bySlug.get(op.targetSlug);
      const base = n ? (n.title || n.name) : op.targetSlug;
      return { text: op.type === 'append_to_note' && op.heading ? `${base}, kohta "${op.heading}"` : base, slug: n ? n.slug : null, isNote: true };
    }
    case 'create_note':
      return { text: `uusi muistiinpano "${op.title || op.name}" (${KIND_LABELS[op.kind || 'note']}, osio ${op.sectionSlug})`, slug: null, isNote: true };
    default:
      return { text: OPERATION_LABELS[op.type], slug: null, isNote: false };
  }
}

function operationContent(op: BrainOperation): string {
  switch (op.type) {
    case 'append_to_note':
    case 'create_note':
      return op.content;
    case 'add_proposal':
      return `**${op.title}**\n\n${op.content}`;
    case 'update_property':
      return `**${op.key}**: ${op.value}`;
    case 'add_decision':
      return `${op.decision}${op.rationale ? `\n\nPerustelu: ${op.rationale}` : ''}`;
    case 'update_goal_metric':
      return `Kausi ${op.period}${op.breakdownKey ? `, osa ${op.breakdownKey}` : ''}: ${op.value}${op.note ? `\n\n${op.note}` : ''}`;
  }
}

function OperationBox({ op, notes, resolve }: { op: BrainOperation; notes: BrainNote[]; resolve: Resolver }) {
  const base = useBrainBase();
  const { bySlug } = useNoteIndex(notes);
  const target = operationTarget(op, bySlug);
  return (
    <div style={{ border: '1px solid var(--border-l)', borderLeft: '4px solid var(--hetki-blue)', borderRadius: 'var(--r)', padding: '10px 14px', background: 'var(--card2)' }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
        {target.isNote ? 'Ehdottaa muutosta muistiinpanoon: ' : 'Ehdottaa: '}
        {target.slug ? <Link href={noteHref(base, target.slug)} style={{ color: 'var(--pri)' }}>{target.text}</Link> : target.text}
      </div>
      <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 6 }}>Muutos: {OPERATION_LABELS[op.type]}. Se tehdään vasta, kun ehdotus hyväksytään.</div>
      {op.type === 'create_note' && op.properties && Object.keys(op.properties).length > 0 && (
        <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 6 }}>
          Ominaisuudet: {Object.entries(op.properties).map(([k, v]) => `${k}: ${v}`).join(' · ')}
        </div>
      )}
      <BrainMarkdown source={operationContent(op)} resolve={resolve} compact />
      {op.reason && <div style={{ fontSize: 13, color: 'var(--t2)', marginTop: 6 }}>Syy: {op.reason}</div>}
    </div>
  );
}

type Mode = null | 'accept' | 'reject' | 'later';

function ProposalCard({ p, orgId, canEdit, resolve, notes, returned }: {
  p: BrainProposal; orgId: string | null; canEdit: boolean; resolve: Resolver; notes: BrainNote[]; returned: boolean;
}) {
  const base = useBrainBase();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<Mode>(null);
  const [busy, setBusy] = useState(false);
  // Hyväksyntä
  const [logDecision, setLogDecision] = useState(true);
  const [decisionText, setDecisionText] = useState(p.title);
  const [decisionRationale, setDecisionRationale] = useState('');
  // Kaikille toiminnoille yhteinen huomio / perustelu
  const [note, setNote] = useState('');
  // Myöhemmin
  const [laterDate, setLaterDate] = useState('');
  const [minDate, setMinDate] = useState('');

  const bodyLines = (p.bodyMd || '').split('\n');
  const long = bodyLines.length > COLLAPSE_LINES;
  const shownBody = long && !expanded ? bodyLines.slice(0, COLLAPSE_LINES).join('\n') : p.bodyMd || '';
  const bodyId = `brain-prop-body-${p.id}`;
  const panelId = `brain-prop-panel-${p.id}`;
  const open = p.status === 'uusi' || p.status === 'myöhemmin';
  const decided = p.status === 'hyväksytty' || p.status === 'hylätty';
  const linkedNote = p.noteSlug ? notes.find(n => n.slug === p.noteSlug) : undefined;

  const openMode = (m: Mode) => {
    if (m === 'later') {
      // Päivät lasketaan tässä tapahtumankäsittelijässä, ei renderissä
      const t = todayIso();
      setMinDate(addDaysIso(t, 1));
      setLaterDate(addDaysIso(t, 14));
    }
    setNote('');
    setMode(m);
  };

  const submit = async () => {
    if (!orgId || !mode) return;
    if (mode === 'later' && (!laterDate || laterDate < minDate)) {
      toast('Valitse päivä, joka on huomenna tai myöhemmin.', 'error');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'accept') {
        await brainApi('proposals', { body: {
          orgId, id: p.id, action: 'accept', logDecision,
          decisionText: logDecision ? decisionText.trim() || p.title : undefined,
          decisionRationale: logDecision ? decisionRationale.trim() || undefined : undefined,
          note: note.trim() || undefined,
        } });
        toast('Hyväksytty. Tehtävä lisättiin Kehityssuunnitelmaan.', 'success');
      } else if (mode === 'reject') {
        await brainApi('proposals', { body: { orgId, id: p.id, action: 'reject', note: note.trim() || undefined } });
        toast('Ehdotus hylätty.', 'success');
      } else {
        await brainApi('proposals', { body: { orgId, id: p.id, action: 'later', snoozeUntil: laterDate, note: note.trim() || undefined } });
        toast(`Siirretty. Ehdotus palaa uusiin ${fmtIsoDay(laterDate)}.`, 'success');
      }
      setMode(null);
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <article aria-labelledby={`brain-prop-t-${p.id}`} style={{ ...brainCard, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {returned && <Badge color="var(--pink)">Palasi</Badge>}
        {open && <Badge color="var(--t2)">Ehdotus, ei päätös</Badge>}
        {p.status === 'hyväksytty' && <Badge color="var(--green)">Hyväksytty</Badge>}
        {p.status === 'hylätty' && <Badge color="var(--red)">Hylätty</Badge>}
        {p.status === 'myöhemmin' && !returned && p.snoozeUntil && <Badge color="var(--t2)">Palaa {fmtIsoDay(p.snoozeUntil)}</Badge>}
      </div>

      <h3 id={`brain-prop-t-${p.id}`} style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 500, lineHeight: 1.3 }}>
        {p.title || 'Nimetön ehdotus'}
      </h3>

      {(p.area || p.impact || p.urgency) && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {p.area && <Pill label="Alue" value={p.area} />}
          {p.impact && <Pill label="Vaikutus" value={p.impact} color="var(--hetki-blue)" />}
          {p.urgency && <Pill label="Kiire" value={p.urgency} color="var(--hetki-yellow)" />}
        </div>
      )}

      <div style={{ fontSize: 13, color: 'var(--t3)' }}>
        Tekijä: <span style={{ color: 'var(--t2)' }}>{p.createdBy || 'tuntematon'}</span>
        {p.createdAt ? <> · Luotu {fmtDay(p.createdAt)}</> : null}
        {linkedNote && <> · <Link href={noteHref(base, linkedNote.slug)} style={{ color: 'var(--pri)' }}>Avaa muistiinpano</Link></>}
      </div>

      {p.bodyMd && (
        <div>
          <div id={bodyId}><BrainMarkdown source={shownBody} resolve={resolve} compact /></div>
          {long && (
            <button type="button" className="btn btn-ghost btn-sm" aria-expanded={expanded} aria-controls={bodyId}
              onClick={() => setExpanded(v => !v)} style={{ minHeight: 44, marginTop: 4 }}>
              {expanded ? 'Näytä vähemmän' : 'Näytä koko ehdotus'}
            </button>
          )}
        </div>
      )}

      {p.operation && <OperationBox op={p.operation} notes={notes} resolve={resolve} />}

      <SourceList sources={p.sources || []} resolve={resolve} />

      {(decided || p.status === 'myöhemmin') && p.decidedBy && (
        <div style={{ fontSize: 13, color: 'var(--t2)', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
          {p.status === 'hyväksytty' ? 'Hyväksyi' : p.status === 'hylätty' ? 'Hylkäsi' : 'Siirsi myöhemmäksi'}: {p.decidedBy}
          {p.decidedAt ? `, ${fmtTime(p.decidedAt)}` : ''}
          {p.decisionNote && <div style={{ marginTop: 4 }}>Huomio: {p.decisionNote}</div>}
        </div>
      )}

      {canEdit && open && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className={`btn btn-sm ${mode === 'accept' ? 'btn-primary' : 'btn-secondary'}`} style={{ minHeight: 44 }}
            aria-expanded={mode === 'accept'} aria-controls={panelId} onClick={() => openMode(mode === 'accept' ? null : 'accept')}>
            Hyväksy
          </button>
          <button type="button" className={`btn btn-sm ${mode === 'reject' ? 'btn-primary' : 'btn-secondary'}`} style={{ minHeight: 44 }}
            aria-expanded={mode === 'reject'} aria-controls={panelId} onClick={() => openMode(mode === 'reject' ? null : 'reject')}>
            Hylkää
          </button>
          <button type="button" className={`btn btn-sm ${mode === 'later' ? 'btn-primary' : 'btn-secondary'}`} style={{ minHeight: 44 }}
            aria-expanded={mode === 'later'} aria-controls={panelId} onClick={() => openMode(mode === 'later' ? null : 'later')}>
            Siirrä myöhemmäksi
          </button>
        </div>
      )}

      {canEdit && open && mode && (
        <form id={panelId} onSubmit={e => { e.preventDefault(); void submit(); }}
          style={{ display: 'flex', flexDirection: 'column', gap: 10, border: '1px solid var(--border-l)', borderRadius: 'var(--r)', padding: 14, background: 'var(--card2)' }}>
          {mode === 'accept' && (
            <>
              <div style={{ fontSize: 14, color: 'var(--t2)' }}>
                Hyväksytty ehdotus lisätään tehtäväksi Kehityssuunnitelmaan.
                {p.operation ? ' Ehdotettu muutos kirjoitetaan muistiinpanoon.' : ''}
              </div>
              <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14, minHeight: 44, cursor: 'pointer' }}>
                <input type="checkbox" checked={logDecision} onChange={e => setLogDecision(e.target.checked)} style={{ width: 20, height: 20 }} />
                Kirjaa myös päätöslokiin
              </label>
              {logDecision && (
                <>
                  <Field id={`${panelId}-dt`} label="Päätös">
                    <input id={`${panelId}-dt`} className="input" value={decisionText} onChange={e => setDecisionText(e.target.value)} maxLength={1000} />
                  </Field>
                  <Field id={`${panelId}-dr`} label="Perustelu (vapaaehtoinen)">
                    <textarea id={`${panelId}-dr`} className="input" rows={2} value={decisionRationale} onChange={e => setDecisionRationale(e.target.value)} maxLength={2000} />
                  </Field>
                </>
              )}
              <Field id={`${panelId}-n`} label="Huomio (vapaaehtoinen)">
                <textarea id={`${panelId}-n`} className="input" rows={2} value={note} onChange={e => setNote(e.target.value)} maxLength={1000} />
              </Field>
            </>
          )}
          {mode === 'reject' && (
            <>
              <div style={{ fontSize: 14, color: 'var(--t2)' }}>Hylättyjä ei ehdoteta uudelleen.</div>
              <Field id={`${panelId}-n`} label="Perustelu (vapaaehtoinen)">
                <textarea id={`${panelId}-n`} className="input" rows={2} value={note} onChange={e => setNote(e.target.value)} maxLength={1000} />
              </Field>
            </>
          )}
          {mode === 'later' && (
            <>
              <Field id={`${panelId}-d`} label="Palauta uusiin ehdotuksiin päivänä">
                <input id={`${panelId}-d`} className="input" type="date" required min={minDate} value={laterDate}
                  onChange={e => setLaterDate(e.target.value)} style={{ maxWidth: 220, minHeight: 44 }} />
              </Field>
              <Field id={`${panelId}-n`} label="Huomio (vapaaehtoinen)">
                <textarea id={`${panelId}-n`} className="input" rows={2} value={note} onChange={e => setNote(e.target.value)} maxLength={1000} />
              </Field>
            </>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy} style={{ minHeight: 44 }}>
              {busy ? 'Tallennetaan…' : mode === 'accept' ? 'Vahvista hyväksyntä' : mode === 'reject' ? 'Vahvista hylkäys' : 'Siirrä myöhemmäksi'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} style={{ minHeight: 44 }} onClick={() => setMode(null)}>
              Peruuta
            </button>
          </div>
        </form>
      )}
    </article>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label htmlFor={id} style={{ fontSize: 13, fontWeight: 600, color: 'var(--t2)' }}>{label}</label>
      {children}
    </div>
  );
}

// ── Uusi ehdotus ─────────────────────────────────────────────────

function NewProposalForm({ orgId, proposals, onDone }: { orgId: string; proposals: BrainProposal[]; onDone: () => void }) {
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [bodyMd, setBodyMd] = useState('');
  const [area, setArea] = useState('');
  const [impact, setImpact] = useState('');
  const [urgency, setUrgency] = useState('');
  const [busy, setBusy] = useState(false);

  // Ehdotetaan jo käytössä olevia arvoja, jotta alueet ja asteikot pysyvät yhtenäisinä
  const options = useMemo(() => {
    const uniq = (xs: (string | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x && !!x.trim()))].sort((a, b) => a.localeCompare(b, 'fi'));
    return { area: uniq(proposals.map(p => p.area)), impact: uniq(proposals.map(p => p.impact)), urgency: uniq(proposals.map(p => p.urgency)) };
  }, [proposals]);

  const submit = async () => {
    if (!title.trim()) { toast('Kirjoita ehdotukselle otsikko.', 'error'); return; }
    setBusy(true);
    try {
      await brainApi('proposals', { body: { orgId, create: {
        title: title.trim(), bodyMd, area: area.trim() || undefined, impact: impact.trim() || undefined, urgency: urgency.trim() || undefined,
      } } });
      toast('Ehdotus tallennettu uusiin ehdotuksiin.', 'success');
      onDone();
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={e => { e.preventDefault(); void submit(); }} aria-label="Uusi ehdotus"
      style={{ ...brainCard, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>Uusi ehdotus</div>
      <Field id="np-title" label="Otsikko">
        <input id="np-title" className="input" value={title} onChange={e => setTitle(e.target.value)} maxLength={300} required />
      </Field>
      <Field id="np-body" label="Ehdotus (mitä ja miksi)">
        <textarea id="np-body" className="input" rows={6} value={bodyMd} onChange={e => setBodyMd(e.target.value)} maxLength={50_000} />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
        <Field id="np-area" label="Alue (vapaaehtoinen)">
          <input id="np-area" className="input" list="np-area-list" value={area} onChange={e => setArea(e.target.value)} maxLength={200} />
        </Field>
        <Field id="np-impact" label="Vaikutus (vapaaehtoinen)">
          <input id="np-impact" className="input" list="np-impact-list" value={impact} onChange={e => setImpact(e.target.value)} maxLength={100} />
        </Field>
        <Field id="np-urgency" label="Kiire (vapaaehtoinen)">
          <input id="np-urgency" className="input" list="np-urgency-list" value={urgency} onChange={e => setUrgency(e.target.value)} maxLength={100} />
        </Field>
      </div>
      <datalist id="np-area-list">{options.area.map(o => <option key={o} value={o} />)}</datalist>
      <datalist id="np-impact-list">{options.impact.map(o => <option key={o} value={o} />)}</datalist>
      <datalist id="np-urgency-list">{options.urgency.map(o => <option key={o} value={o} />)}</datalist>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy} style={{ minHeight: 44 }}>{busy ? 'Tallennetaan…' : 'Tallenna ehdotus'}</button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} style={{ minHeight: 44 }} onClick={onDone}>Peruuta</button>
      </div>
    </form>
  );
}

// ── Päätösloki ───────────────────────────────────────────────────

function DecisionLog() {
  const { orgId, canEdit } = useBrainAccess();
  const decisions = useBrainDecisions(orgId);
  const sections = useBrainSections(orgId);
  const isMobile = useIsMobile();
  const [adding, setAdding] = useState(false);
  const [initialDay, setInitialDay] = useState('');

  const sectionTitle = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sections.data) m.set(s.slug, s.title);
    return m;
  }, [sections.data]);

  const sorted = useMemo(() => [...decisions.data].sort((a, b) => {
    const ka = dayKey(a.decidedOn);
    const kb = dayKey(b.decidedOn);
    if (ka !== kb) return kb.localeCompare(ka);
    return (b.createdAt || 0) - (a.createdAt || 0);
  }), [decisions.data]);

  const areaOf = (d: BrainDecision) => d.area || (d.areaSlug ? sectionTitle.get(d.areaSlug) || d.areaSlug : '');

  return (
    <section aria-labelledby="brain-decisions-h" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="sec-h" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span className="t" id="brain-decisions-h">Päätösloki</span>
        <span className="meta">{decisions.data.length} päätöstä, uusin ensin</span>
        {canEdit && !adding && (
          <button type="button" className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto', minHeight: 44 }}
            onClick={() => { setInitialDay(todayIso()); setAdding(true); }}>
            Kirjaa päätös
          </button>
        )}
      </div>

      {canEdit && adding && orgId && (
        <DecisionForm orgId={orgId} sections={sections.data} initialDay={initialDay} onDone={() => setAdding(false)} />
      )}

      {decisions.loading && <div role="status" style={{ color: 'var(--t3)', fontSize: 14 }}>Ladataan päätöksiä…</div>}
      {decisions.error && <div role="alert" style={{ color: 'var(--red)', fontSize: 14 }}>Päätösten lataus epäonnistui: {decisions.error}</div>}
      {!decisions.loading && !decisions.error && sorted.length === 0 && (
        <div style={{ ...brainCard, color: 'var(--t2)', fontSize: 14 }}>Päätöslokissa ei ole vielä päätöksiä.</div>
      )}

      {sorted.length > 0 && (isMobile ? (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sorted.map(d => (
            <li key={d.id} style={{ ...brainCard, padding: '10px 14px', fontSize: 14, lineHeight: 1.5 }}>
              <div style={{ fontSize: 12, color: 'var(--t3)' }}>
                {fmtIsoDay(d.decidedOn)}{areaOf(d) ? ` · ${areaOf(d)}` : ''} · {DECISION_SOURCE_LABELS[d.source] || d.source}
              </div>
              <div style={{ fontWeight: 600 }}>{d.decision}</div>
              {d.rationale && <div style={{ color: 'var(--t2)' }}>Perustelu: {d.rationale}</div>}
            </li>
          ))}
        </ul>
      ) : (
        <div style={{ ...brainCard, padding: 0, overflowX: 'auto' }} tabIndex={0} role="region" aria-labelledby="brain-decisions-h">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: 'left', background: 'var(--card2)' }}>
                {['Päivä', 'Päätös', 'Alue', 'Perustelu', 'Lähde'].map(h => (
                  <th key={h} scope="col" style={{ padding: '8px 12px', fontWeight: 600, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map(d => (
                <tr key={d.id} style={{ borderBottom: '1px solid var(--border)', verticalAlign: 'top' }}>
                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{fmtIsoDay(d.decidedOn)}</td>
                  <td style={{ padding: '8px 12px', fontWeight: 600 }}>{d.decision}</td>
                  <td style={{ padding: '8px 12px' }}>{areaOf(d)}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--t2)' }}>{d.rationale || ''}</td>
                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{DECISION_SOURCE_LABELS[d.source] || d.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  );
}

function DecisionForm({ orgId, sections, initialDay, onDone }: { orgId: string; sections: BrainSection[]; initialDay: string; onDone: () => void }) {
  const { toast } = useToast();
  const [decidedOn, setDecidedOn] = useState(initialDay);
  const [decision, setDecision] = useState('');
  const [rationale, setRationale] = useState('');
  const [areaSlug, setAreaSlug] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!decision.trim()) { toast('Kirjoita päätös.', 'error'); return; }
    setBusy(true);
    try {
      await brainApi('decisions', { body: { orgId, decision: {
        decidedOn: decidedOn || undefined, decision: decision.trim(), rationale: rationale.trim() || undefined, areaSlug: areaSlug || undefined,
      } } });
      toast('Päätös kirjattu päätöslokiin.', 'success');
      onDone();
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={e => { e.preventDefault(); void submit(); }} aria-label="Kirjaa päätös"
      style={{ ...brainCard, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
        <Field id="dec-day" label="Päivä">
          <input id="dec-day" className="input" type="date" value={decidedOn} onChange={e => setDecidedOn(e.target.value)} style={{ minHeight: 44 }} />
        </Field>
        <Field id="dec-area" label="Alue (vapaaehtoinen)">
          <select id="dec-area" className="input" value={areaSlug} onChange={e => setAreaSlug(e.target.value)} style={{ minHeight: 44 }}>
            <option value="">Ei aluetta</option>
            {sections.map(s => <option key={s.slug} value={s.slug}>{s.title}</option>)}
          </select>
        </Field>
      </div>
      <Field id="dec-text" label="Päätös">
        <input id="dec-text" className="input" value={decision} onChange={e => setDecision(e.target.value)} maxLength={1000} required />
      </Field>
      <Field id="dec-rat" label="Perustelu (vapaaehtoinen)">
        <textarea id="dec-rat" className="input" rows={3} value={rationale} onChange={e => setRationale(e.target.value)} maxLength={2000} />
      </Field>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy} style={{ minHeight: 44 }}>{busy ? 'Tallennetaan…' : 'Tallenna päätös'}</button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} style={{ minHeight: 44 }} onClick={onDone}>Peruuta</button>
      </div>
    </form>
  );
}
