'use client';

// Aivojen Koti-koontinäkymä: pikatoiminnot, tavoitteet ja toteumat, uudet ehdotukset, vahvistettavat
// ⚠️-kohdat, käsittelemättömät kirjaukset, koontitaulukot (Obsidianin base-näkymien vastineet)
// ja viimeksi muokatut muistiinpanot. Kaikki kirjoitukset kulkevat brainApi-reittien kautta.

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useIsMobile } from '@/lib/use-mobile';
import { useToast } from '@/lib/toast';
import {
  useBrainAccess, useBrainNotes, useBrainSections, useBrainGoals, useBrainMetrics, useBrainProposals,
  useBrainInbox, useBrainViews, brainApi, BrainApiError,
} from '@/lib/use-brain';
import {
  goalProgress, formatValue, proposalIsDue, todayIso, slugify, INBOX_STATUS_META, PROPOSAL_STATUS_META,
  type BrainGoal, type BrainMetricEntry, type BrainNote, type BrainSection, type BrainView, type GoalBreakdown,
} from '@/lib/brain-shared';
import BrainMarkdown, { type WikiTarget } from './BrainMarkdown';
import { useBrainBase, noteHref, useWikiResolver, brainCard, brainLabel } from './BrainShell';

type Resolver = (target: string, heading: string | null) => WikiTarget;

const REVIEW_LIMIT = 30;
const RECENT_LIMIT = 10;
const PROPOSAL_LIMIT = 5;
const INBOX_LIMIT = 8;

// ── Apurit ──────────────────────────────────────────────────────

function errMsg(e: unknown): string {
  if (e instanceof BrainApiError) return e.message;
  return 'Tallennus epäonnistui. Yritä uudelleen.';
}

/** "1 200 000" tai "1,5" → luku. Tyhjä tai virheellinen → null. */
function parseNum(s: string): number | null {
  const t = s.replace(/[\s €]/g, '').replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function pct(value: number, target: number): number {
  return target > 0 ? Math.round((value / target) * 100) : 0;
}

/** Ominaisuuden arvo vertailuun: [[Linkki|alias]] → linkki, pienaakkosin. */
function normValue(v: string): string {
  const m = v.trim().match(/^\[\[([^\]|#]*)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]$/);
  return (m ? m[1] : v).trim().toLowerCase();
}

/** Ominaisuus avaimella kirjainkoosta riippumatta. */
function propOf(note: BrainNote, key: string): string | undefined {
  const props = note.properties || {};
  if (key in props) return props[key];
  const k = key.toLowerCase();
  for (const [pk, pv] of Object.entries(props)) if (pk.toLowerCase() === k) return pv;
  return undefined;
}

/** Vastaako ominaisuuden arvo suodatinta. Arvo voi olla myös pilkulla eroteltu lista. */
function valueMatches(actual: string | undefined, wanted: string): boolean {
  if (actual === undefined) return false;
  const w = normValue(wanted);
  if (normValue(actual) === w) return true;
  return actual.split(',').some(part => normValue(part) === w);
}

function fmtRelative(ts: number, now: number): string {
  const diff = now - ts;
  if (diff < 60_000) return 'juuri nyt';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min sitten`;
  const d = new Date(ts);
  const today = new Date(now);
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return `${Math.floor(diff / 3_600_000)} t sitten`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'eilen';
  return d.toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric', year: 'numeric' });
}

function fmtDateTime(ts: number): string {
  return new Date(ts).toLocaleString('fi-FI', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function truncate(s: string, n: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t;
}

/** Osio ja sen alaosiot. */
function sectionFamily(sections: BrainSection[], root: string): Set<string> {
  const out = new Set<string>([root]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const s of sections) {
      if (s.parentSlug && out.has(s.parentSlug) && !out.has(s.slug)) { out.add(s.slug); grew = true; }
    }
  }
  return out;
}

/** Sarakkeet: ominaisuudet, jotka esiintyvät vähintään puolessa riveistä (enintään 5), yleisin ensin. */
function commonColumns(rows: BrainNote[]): string[] {
  const count = new Map<string, { key: string; n: number }>();
  for (const r of rows) {
    for (const [k, v] of Object.entries(r.properties || {})) {
      if (!v || !String(v).trim()) continue;
      const lk = k.toLowerCase();
      const c = count.get(lk);
      if (c) c.n++; else count.set(lk, { key: k, n: 1 });
    }
  }
  return [...count.values()]
    .filter(c => c.n * 2 >= rows.length)
    .sort((a, b) => b.n - a.n || a.key.localeCompare(b.key, 'fi'))
    .slice(0, 5)
    .map(c => c.key);
}

const byTitle = (a: BrainNote, b: BrainNote) => (a.title || a.name).localeCompare(b.title || b.name, 'fi');

interface TableSpec { id: string; title: string; rows: BrainNote[]; columns: string[] }

// ── Pääkomponentti ──────────────────────────────────────────────

export default function BrainHomeSection() {
  const base = useBrainBase();
  const isMobile = useIsMobile();
  const { orgId, canEdit, canAdmin } = useBrainAccess();
  const notes = useBrainNotes(orgId);
  const sections = useBrainSections(orgId);
  const goals = useBrainGoals(orgId);
  const metrics = useBrainMetrics(orgId);
  const proposals = useBrainProposals(orgId);
  const inbox = useBrainInbox(orgId);
  const views = useBrainViews(orgId);
  const resolve = useWikiResolver(notes.data);
  const [now] = useState(() => Date.now());
  const today = todayIso(now);

  const sectionTitle = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sections.data) m.set(s.slug, s.title);
    return m;
  }, [sections.data]);

  const sortedGoals = useMemo(
    () => [...goals.data].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || b.period.localeCompare(a.period) || a.title.localeCompare(b.title, 'fi')),
    [goals.data],
  );

  const openProposals = useMemo(
    () => proposals.data.filter(p => p.status === 'uusi' || proposalIsDue(p, today)).sort((a, b) => b.createdAt - a.createdAt),
    [proposals.data, today],
  );

  const reviewNotes = useMemo(
    () => notes.data.filter(n => (n.reviewItems || []).length > 0).sort(byTitle),
    [notes.data],
  );
  const reviewTotal = reviewNotes.reduce((s, n) => s + n.reviewItems.length, 0);

  const openInbox = useMemo(
    () => inbox.data.filter(e => e.status === 'uusi' || e.status === 'ehdotettu').sort((a, b) => b.createdAt - a.createdAt),
    [inbox.data],
  );

  const recent = useMemo(
    () => [...notes.data].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, RECENT_LIMIT),
    [notes.data],
  );

  const tables = useMemo<TableSpec[]>(
    () => buildTables(views.data, notes.data, sections.data),
    [views.data, notes.data, sections.data],
  );

  const notesReady = !notes.loading;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <QuickActions base={base} canEdit={canEdit} proposalCount={openProposals.length} />

      <GoalsBlock
        orgId={orgId} goals={sortedGoals} metrics={metrics.data} loading={goals.loading}
        canEdit={canEdit} canAdmin={canAdmin} now={now}
      />

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) minmax(0, 1fr)', gap: 24, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, minWidth: 0 }}>
          {openProposals.length > 0 && (
            <section aria-labelledby="brain-home-proposals">
              <div className="sec-h">
                <span className="t" id="brain-home-proposals">Uudet ehdotukset</span>
                <span className="meta">{openProposals.length} odottaa</span>
              </div>
              <div style={brainCard}>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {openProposals.slice(0, PROPOSAL_LIMIT).map(p => {
                    const meta = [p.area && `Alue: ${p.area}`, p.impact && `Vaikutus: ${p.impact}`, p.urgency && `Kiire: ${p.urgency}`].filter(Boolean).join(' · ');
                    const due = p.status === 'myöhemmin';
                    return (
                      <li key={p.id} style={{ borderLeft: `3px solid ${PROPOSAL_STATUS_META.uusi.color}`, paddingLeft: 10 }}>
                        <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.35 }}>{p.title}</div>
                        {(meta || due) && (
                          <div style={{ fontSize: 13, color: 'var(--t2)', marginTop: 2 }}>
                            {due && <span>Palasi myöhemmin-listalta. </span>}{meta}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <div style={{ marginTop: 14 }}>
                  <Link href={`${base}/ehdotukset`} className="btn btn-secondary btn-sm" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
                    Käsittele ehdotukset ({openProposals.length})
                  </Link>
                </div>
              </div>
            </section>
          )}

          {reviewTotal > 0 && (
            <ReviewBlock notes={reviewNotes} total={reviewTotal} base={base} resolve={resolve} />
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, minWidth: 0 }}>
          {openInbox.length > 0 && (
            <section aria-labelledby="brain-home-inbox">
              <div className="sec-h">
                <span className="t" id="brain-home-inbox">Käsittelemättömät kirjaukset</span>
                <span className="meta">{openInbox.length} kpl</span>
              </div>
              <div style={brainCard}>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {openInbox.slice(0, INBOX_LIMIT).map(e => {
                    const st = INBOX_STATUS_META[e.status];
                    const text = e.rawText || e.transcript || (e.audioPath ? 'Ääniviesti, ei vielä litteroitu' : '(tyhjä kirjaus)');
                    return (
                      <li key={e.id} style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 12, color: 'var(--t3)', fontVariantNumeric: 'tabular-nums' }}>{fmtDateTime(e.createdAt)}</span>
                          <span style={{ fontSize: 12, color: st.color, border: `1px solid ${st.color}`, borderRadius: 'var(--r)', padding: '0 6px' }}>{st.label}</span>
                          {e.createdByName && <span style={{ fontSize: 12, color: 'var(--t3)' }}>{e.createdByName}</span>}
                        </div>
                        <div style={{ fontSize: 14, color: 'var(--t1)', lineHeight: 1.45 }}>{truncate(text, 140)}</div>
                      </li>
                    );
                  })}
                </ul>
                {openInbox.length > INBOX_LIMIT && (
                  <div style={{ fontSize: 13, color: 'var(--t3)', marginTop: 8 }}>Ja {openInbox.length - INBOX_LIMIT} muuta.</div>
                )}
                <div style={{ marginTop: 14 }}>
                  <Link href={`${base}/kirjaa`} className="btn btn-secondary btn-sm" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
                    Käsittele kirjaukset
                  </Link>
                </div>
              </div>
            </section>
          )}

          {notesReady && recent.length > 0 && (
            <section aria-labelledby="brain-home-recent">
              <div className="sec-h">
                <span className="t" id="brain-home-recent">Viimeksi muokatut</span>
                <span className="meta">{recent.length} uusinta</span>
              </div>
              <div style={brainCard}>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {recent.map(n => (
                    <li key={n.slug} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <Link href={noteHref(base, n.slug)} style={{ fontSize: 15, fontWeight: 600, color: 'var(--pri)', textDecoration: 'none' }}>
                        {n.title || n.name}
                      </Link>
                      <span style={{ fontSize: 12.5, color: 'var(--t3)' }}>
                        {[sectionTitle.get(n.sectionSlug), n.updatedBy, n.updatedAt ? fmtRelative(n.updatedAt, now) : null].filter(Boolean).join(' · ')}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}
        </div>
      </div>

      {tables.map(t => (
        <NoteTable key={t.id} spec={t} base={base} resolve={resolve} />
      ))}

      {notes.loading && <div style={{ fontSize: 13, color: 'var(--t3)' }} role="status">Ladataan aivoja…</div>}
    </div>
  );
}

// ── Pikatoiminnot ───────────────────────────────────────────────

function QuickActions({ base, canEdit, proposalCount }: { base: string; canEdit: boolean; proposalCount: number }) {
  const linkStyle: React.CSSProperties = { minHeight: 48, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' };
  return (
    <nav aria-label="Pikatoiminnot" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      <Link href={`${base}/kirjaa`} className="btn btn-primary" style={{ ...linkStyle, fontSize: 16, padding: '0 1.6rem' }}>
        Kirjaa
      </Link>
      <Link href={`${base}/kysy`} className="btn btn-secondary" style={linkStyle}>Kysy aivoilta</Link>
      {canEdit && <Link href={`${base}/uusi`} className="btn btn-secondary" style={linkStyle}>Uusi muistiinpano</Link>}
      <Link href={`${base}/ehdotukset`} className="btn btn-ghost" style={linkStyle}>
        Avaa ehdotukset{proposalCount > 0 ? ` (${proposalCount} uutta)` : ''}
      </Link>
    </nav>
  );
}

// ── Tavoitteet ──────────────────────────────────────────────────

function GoalsBlock({ orgId, goals, metrics, loading, canEdit, canAdmin, now }: {
  orgId: string | null; goals: BrainGoal[]; metrics: BrainMetricEntry[]; loading: boolean;
  canEdit: boolean; canAdmin: boolean; now: number;
}) {
  return (
    <section aria-labelledby="brain-home-goals">
      <div className="sec-h">
        <span className="t" id="brain-home-goals">Tavoitteet</span>
        {goals.length > 0 && <span className="meta">{goals.length} kpl</span>}
      </div>
      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--t3)' }} role="status">Ladataan tavoitteita…</div>
      ) : goals.length === 0 ? (
        <div style={{ ...brainCard, fontSize: 14, color: 'var(--t2)', lineHeight: 1.6 }}>
          <p style={{ margin: 0 }}>
            Tavoitteita ei ole vielä. Ne tuodaan aivojen tuonnissa tiedostosta <code>goals.json</code>, tai omistaja luo ne tässä.
            Kun tavoite on olemassa, jäsenet voivat kirjata sille toteumia.
          </p>
          {canAdmin && orgId && <NewGoalForm orgId={orgId} now={now} />}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 16 }}>
          {goals.map(g => <GoalCard key={g.id} goal={g} metrics={metrics} orgId={orgId} canEdit={canEdit} />)}
        </div>
      )}
    </section>
  );
}

function GoalCard({ goal, metrics, orgId, canEdit }: { goal: BrainGoal; metrics: BrainMetricEntry[]; orgId: string | null; canEdit: boolean }) {
  // Vanhassa datassa breakdown voi puuttua: goalProgress olettaa taulukon
  const { total, byKey } = useMemo(() => goalProgress(goal.breakdown ? goal : { ...goal, breakdown: [] }, metrics), [goal, metrics]);
  const [formOpen, setFormOpen] = useState(false);
  const p = pct(total, goal.targetValue);
  const breakdown = goal.breakdown || [];
  const formId = `brain-goal-form-${goal.id}`;

  return (
    <article style={{ ...brainCard, display: 'flex', flexDirection: 'column', gap: 12 }} aria-labelledby={`brain-goal-${goal.id}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <h3 id={`brain-goal-${goal.id}`} style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 17, lineHeight: 1.3 }}>{goal.title}</h3>
        <span style={brainLabel}>Kausi {goal.period}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{formatValue(total, goal.unit)}</span>
        <span style={{ fontSize: 14, color: 'var(--t2)' }}>/ {formatValue(goal.targetValue, goal.unit)}</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: p >= 100 ? 'var(--green)' : 'var(--t1)' }}>{p} %{p >= 100 ? ', tavoite saavutettu' : ''}</span>
      </div>

      <GoalBar value={total} target={goal.targetValue} stretch={goal.stretchValue ?? null} unit={goal.unit} />

      {goal.baselineValue != null && (
        <div style={{ fontSize: 12.5, color: 'var(--t3)' }}>
          Lähtötaso{goal.baselinePeriod ? ` ${goal.baselinePeriod}` : ''}: {formatValue(goal.baselineValue, goal.unit)}
        </div>
      )}

      {breakdown.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
          <div style={brainLabel}>Osat</div>
          {breakdown.map(b => {
            const v = byKey[b.key] || 0;
            return (
              <div key={b.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13.5, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600 }}>{b.label || b.key}</span>
                  <span style={{ color: 'var(--t2)', fontVariantNumeric: 'tabular-nums' }}>
                    {formatValue(v, goal.unit)} / {formatValue(b.targetValue, goal.unit)} ({pct(v, b.targetValue)} %)
                  </span>
                </div>
                <GoalBar value={v} target={b.targetValue} stretch={null} unit={goal.unit} compact />
              </div>
            );
          })}
        </div>
      )}

      {canEdit && orgId && (
        <div>
          <button type="button" className="btn btn-secondary btn-sm" aria-expanded={formOpen} aria-controls={formId}
            onClick={() => setFormOpen(o => !o)} style={{ minHeight: 44 }}>
            {formOpen ? 'Sulje kirjaus' : 'Kirjaa toteuma'}
          </button>
          {formOpen && <MetricForm id={formId} goal={goal} orgId={orgId} onDone={() => setFormOpen(false)} />}
        </div>
      )}
    </article>
  );
}

/** Vaakapalkki: täyttö = toteuma, yhtenäinen viiva = tavoite, katkoviiva = venytystavoite. Luvut myös tekstinä. */
function GoalBar({ value, target, stretch, unit, compact }: { value: number; target: number; stretch: number | null; unit: string; compact?: boolean }) {
  const max = Math.max(target, stretch || 0, value, 1);
  const w = (n: number) => `${Math.min(100, Math.max(0, (n / max) * 100))}%`;
  const reached = target > 0 && value >= target;
  const h = compact ? 10 : 16;
  return (
    <div>
      <div aria-hidden style={{ position: 'relative', height: h, background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 4, marginTop: compact ? 0 : 4, marginBottom: compact ? 0 : 4 }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: w(value), background: reached ? 'var(--green)' : 'var(--hetki-blue)', borderRadius: 3 }} />
        <div style={{ position: 'absolute', left: w(target), top: -4, bottom: -4, width: 0, borderLeft: '2px solid var(--t1)', transform: 'translateX(-1px)' }} />
        {stretch != null && stretch > 0 && (
          <div style={{ position: 'absolute', left: w(stretch), top: -4, bottom: -4, width: 0, borderLeft: '2px dashed var(--t2)', transform: 'translateX(-1px)' }} />
        )}
      </div>
      {!compact && (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--t2)', marginTop: 4 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span aria-hidden style={{ width: 12, height: 10, background: reached ? 'var(--green)' : 'var(--hetki-blue)', borderRadius: 2 }} />
            Toteuma {formatValue(value, unit)}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span aria-hidden style={{ width: 0, height: 12, borderLeft: '2px solid var(--t1)' }} />
            Tavoite {formatValue(target, unit)}
          </span>
          {stretch != null && stretch > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span aria-hidden style={{ width: 0, height: 12, borderLeft: '2px dashed var(--t2)' }} />
              Venytystavoite {formatValue(stretch, unit)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function MetricForm({ id, goal, orgId, onDone }: { id: string; goal: BrainGoal; orgId: string; onDone: () => void }) {
  const { toast } = useToast();
  const breakdown = goal.breakdown || [];
  const [part, setPart] = useState<string>(breakdown[0]?.key || '');
  const [value, setValue] = useState('');
  const [period, setPeriod] = useState(goal.period);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = parseNum(value);
    if (v === null) { toast('Anna toteuma numerona, esimerkiksi 120000', 'error'); return; }
    if (!period.trim()) { toast('Anna kausi, esimerkiksi ' + goal.period, 'error'); return; }
    setBusy(true);
    try {
      await brainApi('goals', {
        body: {
          orgId,
          metric: { goalId: goal.id, breakdownKey: breakdown.length ? part || null : null, period: period.trim(), value: v, note: note.trim() || undefined },
        },
      });
      toast('Toteuma kirjattu', 'success');
      setValue('');
      setNote('');
      onDone();
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const f = (k: string) => `${id}-${k}`;
  return (
    <form id={id} onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
      {breakdown.length > 0 && (
        <Field label="Osa" htmlFor={f('part')}>
          <select id={f('part')} className="input" value={part} onChange={e => setPart(e.target.value)} style={{ minHeight: 44 }}>
            {breakdown.map(b => <option key={b.key} value={b.key}>{b.label || b.key}</option>)}
          </select>
        </Field>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        <Field label={`Toteuma${goal.unit ? ` (${goal.unit})` : ''}`} htmlFor={f('value')}>
          <input id={f('value')} className="input" inputMode="decimal" required value={value} onChange={e => setValue(e.target.value)} style={{ minHeight: 44 }} />
        </Field>
        <Field label="Kausi" htmlFor={f('period')}>
          <input id={f('period')} className="input" required value={period} onChange={e => setPeriod(e.target.value)} style={{ minHeight: 44 }} />
        </Field>
      </div>
      <Field label="Huomio (valinnainen)" htmlFor={f('note')}>
        <input id={f('note')} className="input" value={note} onChange={e => setNote(e.target.value)} style={{ minHeight: 44 }} />
      </Field>
      <div style={{ fontSize: 12.5, color: 'var(--t3)' }}>
        Kirjaa kauden tilanne tähän mennessä. Uusin kirjaus korvaa aiemman saman osan luvun.
      </div>
      <div>
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy} style={{ minHeight: 44 }}>
          {busy ? 'Tallennetaan…' : 'Tallenna toteuma'}
        </button>
      </div>
    </form>
  );
}

interface PartDraft { key: string; label: string; target: string }
const EMPTY_PART: PartDraft = { key: '', label: '', target: '' };

function NewGoalForm({ orgId, now }: { orgId: string; now: number }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [period, setPeriod] = useState(() => String(new Date(now).getFullYear()));
  const [target, setTarget] = useState('');
  const [stretch, setStretch] = useState('');
  const [unit, setUnit] = useState('€');
  const [parts, setParts] = useState<PartDraft[]>([]);
  const [busy, setBusy] = useState(false);

  const setPartField = (i: number, k: keyof PartDraft, v: string) =>
    setParts(ps => ps.map((p, j) => (j === i ? { ...p, [k]: v } : p)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = parseNum(target);
    if (!title.trim() || !period.trim() || t === null) { toast('Anna otsikko, kausi ja tavoite numerona', 'error'); return; }
    const s = parseNum(stretch);
    const breakdown: GoalBreakdown[] = parts
      .filter(p => p.label.trim() || p.key.trim())
      .map(p => ({ key: p.key.trim() || slugify(p.label), label: p.label.trim() || p.key.trim(), targetValue: parseNum(p.target) ?? 0 }));
    setBusy(true);
    try {
      await brainApi('goals', {
        body: { orgId, goal: { title: title.trim(), period: period.trim(), targetValue: t, stretchValue: s, unit: unit.trim(), breakdown } },
      });
      toast('Tavoite luotu', 'success');
      setOpen(false);
      setTitle(''); setTarget(''); setStretch(''); setParts([]);
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div style={{ marginTop: 12 }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(true)} style={{ minHeight: 44 }}>Luo tavoite</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} aria-label="Uusi tavoite" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14, color: 'var(--t1)' }}>
      <Field label="Otsikko" htmlFor="brain-ng-title">
        <input id="brain-ng-title" className="input" required value={title} onChange={e => setTitle(e.target.value)} placeholder="Esim. Liikevaihto" style={{ minHeight: 44 }} />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
        <Field label="Kausi" htmlFor="brain-ng-period">
          <input id="brain-ng-period" className="input" required value={period} onChange={e => setPeriod(e.target.value)} style={{ minHeight: 44 }} />
        </Field>
        <Field label="Tavoite" htmlFor="brain-ng-target">
          <input id="brain-ng-target" className="input" inputMode="decimal" required value={target} onChange={e => setTarget(e.target.value)} style={{ minHeight: 44 }} />
        </Field>
        <Field label="Venytystavoite (valinnainen)" htmlFor="brain-ng-stretch">
          <input id="brain-ng-stretch" className="input" inputMode="decimal" value={stretch} onChange={e => setStretch(e.target.value)} style={{ minHeight: 44 }} />
        </Field>
        <Field label="Yksikkö" htmlFor="brain-ng-unit">
          <input id="brain-ng-unit" className="input" value={unit} onChange={e => setUnit(e.target.value)} style={{ minHeight: 44 }} />
        </Field>
      </div>

      <fieldset style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '8px 12px 12px', margin: 0 }}>
        <legend style={{ ...brainLabel, padding: '0 4px' }}>Osat (valinnainen)</legend>
        {parts.length === 0 && <div style={{ fontSize: 13, color: 'var(--t3)' }}>Jaa tavoite osiin, jos toteumaa seurataan erikseen, esimerkiksi palvelulinjoittain.</div>}
        {parts.map((p, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr)) auto', gap: 8, alignItems: 'end', marginTop: 8 }}>
            <Field label="Nimi" htmlFor={`brain-ng-pl-${i}`}>
              <input id={`brain-ng-pl-${i}`} className="input" value={p.label} onChange={e => setPartField(i, 'label', e.target.value)} style={{ minHeight: 44 }} />
            </Field>
            <Field label="Avain" htmlFor={`brain-ng-pk-${i}`}>
              <input id={`brain-ng-pk-${i}`} className="input" value={p.key} placeholder={p.label ? slugify(p.label) : ''} onChange={e => setPartField(i, 'key', e.target.value)} style={{ minHeight: 44 }} />
            </Field>
            <Field label="Tavoite" htmlFor={`brain-ng-pt-${i}`}>
              <input id={`brain-ng-pt-${i}`} className="input" inputMode="decimal" value={p.target} onChange={e => setPartField(i, 'target', e.target.value)} style={{ minHeight: 44 }} />
            </Field>
            <button type="button" className="btn btn-ghost btn-sm" aria-label={`Poista osa ${i + 1}`} onClick={() => setParts(ps => ps.filter((_, j) => j !== i))} style={{ minHeight: 44 }}>
              Poista
            </button>
          </div>
        ))}
        <div style={{ marginTop: 10 }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setParts(ps => [...ps, EMPTY_PART])} style={{ minHeight: 44 }}>Lisää osa</button>
        </div>
      </fieldset>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy} style={{ minHeight: 44 }}>{busy ? 'Tallennetaan…' : 'Tallenna tavoite'}</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} style={{ minHeight: 44 }}>Peru</button>
      </div>
    </form>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <label htmlFor={htmlFor} style={{ fontSize: 13, color: 'var(--t2)', fontWeight: 600 }}>{label}</label>
      {children}
    </div>
  );
}

// ── Vahvistettavat kohdat ───────────────────────────────────────

function ReviewBlock({ notes, total, base, resolve }: { notes: BrainNote[]; total: number; base: string; resolve: Resolver }) {
  const [showAll, setShowAll] = useState(false);
  // Rajataan kohtien määrä muistiinpanojen yli: kokonaiset ryhmät, viimeinen ryhmä voi katketa
  const groups: { note: BrainNote; items: string[] }[] = [];
  let left = showAll ? Infinity : REVIEW_LIMIT;
  for (const n of notes) {
    if (left <= 0) break;
    const items = n.reviewItems.slice(0, left);
    groups.push({ note: n, items });
    left -= items.length;
  }
  const shown = groups.reduce((s, g) => s + g.items.length, 0);

  return (
    <section aria-labelledby="brain-home-review">
      <div className="sec-h">
        <span className="t" id="brain-home-review">Vahvistettavat kohdat</span>
        <span className="meta">{total} kohtaa</span>
      </div>
      <div style={brainCard}>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--t2)' }}>
          Nämä ⚠️-kohdat odottavat, että joku tarkistaa ne. Avaa muistiinpano ja korjaa tai vahvista kohta.
        </p>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {groups.map(({ note, items }) => (
            <li key={note.slug}>
              <Link href={noteHref(base, note.slug)} style={{ fontSize: 15, fontWeight: 600, color: 'var(--pri)', textDecoration: 'none' }}>
                {note.title || note.name}
              </Link>
              <span style={{ fontSize: 12, color: 'var(--t3)', marginLeft: 6 }}>({note.reviewItems.length})</span>
              <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {items.map((it, i) => (
                  <li key={i} style={{ borderLeft: '3px solid var(--red)', paddingLeft: 10, fontSize: 14 }}>
                    <span className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Vahvistettava: </span>
                    <InlineMd text={it} resolve={resolve} />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        {total > REVIEW_LIMIT && (
          <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: 'var(--t3)' }}>Näytetään {shown} / {total}</span>
            <button type="button" className="btn btn-secondary btn-sm" aria-expanded={showAll} onClick={() => setShowAll(v => !v)} style={{ minHeight: 44 }}>
              {showAll ? 'Näytä vähemmän' : 'Näytä kaikki'}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

/** Lyhyt teksti: markdown vain jos siinä on linkkejä tai muotoilua (BrainMarkdown on raskaampi). */
function InlineMd({ text, resolve }: { text: string; resolve: Resolver }) {
  if (!/\[\[|\]\(|[*_`=~]/.test(text)) return <>{text}</>;
  return <BrainMarkdown source={text} resolve={resolve} compact />;
}

// ── Koontitaulukot ──────────────────────────────────────────────

function buildTables(views: BrainView[], notes: BrainNote[], sections: BrainSection[]): TableSpec[] {
  const content = notes.filter(n => n.kind !== 'agent_instructions' && n.kind !== 'inbox_entry' && n.kind !== 'proposal');

  if (views.length > 0) {
    return [...views]
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.title.localeCompare(b.title, 'fi'))
      .map(v => {
        const fam = v.sectionSlug ? sectionFamily(sections, v.sectionSlug) : null;
        const filter = Object.entries(v.filter || {});
        const rows = content
          .filter(n => !fam || fam.has(n.sectionSlug))
          .filter(n => filter.every(([k, want]) => valueMatches(propOf(n, k), want)))
          .sort(byTitle);
        return { id: `view-${v.id}`, title: v.title, rows, columns: v.columns || [] };
      })
      .filter(t => t.rows.length > 0);
  }

  // Oletukset ilman määriteltyjä näkymiä: yleinen logiikka osion nimen ja tila-ominaisuuden perusteella
  const sectionsMatching = (needle: string) => {
    const out = new Set<string>();
    for (const s of sections) {
      if (s.slug.toLowerCase().includes(needle) || s.title.toLowerCase().includes(needle)) {
        for (const x of sectionFamily(sections, s.slug)) out.add(x);
      }
    }
    return out;
  };
  const tables: TableSpec[] = [];

  const projSecs = sectionsMatching('projekt');
  const projects = content
    .filter(n => projSecs.has(n.sectionSlug))
    .filter(n => {
      const t = propOf(n, 'tila');
      if (!t) return false;
      const v = normValue(t);
      return v.startsWith('käynnissä') || v.startsWith('aktiivinen') || v.startsWith('kesken');
    })
    .sort(byTitle);
  if (projects.length) tables.push({ id: 'default-projects', title: 'Käynnissä olevat projektit', rows: projects, columns: commonColumns(projects) });

  const custSecs = sectionsMatching('asiak');
  // Osion yleiskuvaus (kind core) ei ole asiakas
  const customers = content.filter(n => custSecs.has(n.sectionSlug) && n.kind !== 'core').sort(byTitle);
  if (customers.length) tables.push({ id: 'default-customers', title: 'Asiakkaat', rows: customers, columns: commonColumns(customers) });

  return tables;
}

function NoteTable({ spec, base, resolve }: { spec: TableSpec; base: string; resolve: Resolver }) {
  const headId = `brain-home-${spec.id}`;
  const cell: React.CSSProperties = { border: '1px solid var(--border)', padding: '8px 10px', verticalAlign: 'top', textAlign: 'left' };
  return (
    <section aria-labelledby={headId}>
      <div className="sec-h">
        <span className="t" id={headId}>{spec.title}</span>
        <span className="meta">{spec.rows.length} riviä</span>
      </div>
      <div tabIndex={0} role="region" aria-label={`${spec.title}, taulukko. Vieritä sivuttain, jos kaikki sarakkeet eivät näy.`}
        style={{ overflowX: 'auto', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 14, minWidth: 360 + spec.columns.length * 120 }}>
          <thead>
            <tr>
              <th scope="col" style={{ ...cell, background: 'var(--card2)', fontWeight: 600 }}>Nimi</th>
              {spec.columns.map(c => (
                <th key={c} scope="col" style={{ ...cell, background: 'var(--card2)', fontWeight: 600, textTransform: 'capitalize' }}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {spec.rows.map(n => (
              <tr key={n.slug}>
                <th scope="row" style={{ ...cell, fontWeight: 600 }}>
                  <Link href={noteHref(base, n.slug)} style={{ color: 'var(--pri)', textDecoration: 'none' }}>{n.title || n.name}</Link>
                  {n.needsReview && <span title="Vahvistettavia kohtia" style={{ color: 'var(--red)', fontSize: 12, marginLeft: 6 }}>⚠ vahvistettavaa</span>}
                </th>
                {spec.columns.map(c => {
                  const v = propOf(n, c);
                  return <td key={c} style={cell}>{v ? <InlineMd text={v} resolve={resolve} /> : <span style={{ color: 'var(--t3)' }}>–</span>}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
