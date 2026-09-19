'use client';

import { useMemo, useState } from 'react';
import { useUserData } from '@/lib/use-user-data';
import { PersonalSettings, newId, weekStart, addDays } from '@/lib/personal-shared';
import { formatLocalDate } from '@/lib/yearwheel-shared';
import {
  ScreenwritingDoc,
  EMPTY_SCREENWRITING,
  WritingProject,
  WritingSession,
  WritingWeekSummary,
  writingWeekSummaries,
  nextProjectColor,
  fmtMinutes,
  WRITING_TREND_WEEKS,
} from '@/lib/screenwriting-shared';
import { useToast } from '@/lib/toast';

const QUICK_MINUTES = [30, 45, 60, 90, 120];

const sectionTitle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 13,
  letterSpacing: '.16em',
  textTransform: 'uppercase',
  color: 'var(--ink2)',
  margin: '0 0 12px',
};

const subtleBtn: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 11,
  letterSpacing: '.16em',
  textTransform: 'uppercase',
  background: 'transparent',
  border: '1px solid var(--ink2)',
  padding: '6px 12px',
  cursor: 'pointer',
  color: 'var(--ink)',
};

const primaryBtn: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 11,
  letterSpacing: '.16em',
  textTransform: 'uppercase',
  background: 'var(--ink)',
  color: 'var(--paper)',
  border: 'none',
  padding: '6px 14px',
  cursor: 'pointer',
};

const ghostBtn: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 11,
  letterSpacing: '.16em',
  textTransform: 'uppercase',
  background: 'transparent',
  color: 'var(--ink2)',
  border: '1px solid var(--rule)',
  padding: '6px 14px',
  cursor: 'pointer',
};

const inputStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--rule)',
  padding: '8px 10px',
  fontSize: 13,
  color: 'var(--ink)',
};

const fieldLabel: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: '.14em',
  textTransform: 'uppercase',
  color: 'var(--ink2)',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

interface DraftSession {
  date: string;
  minutes: number;
  projectId: string;
  note: string;
}

export default function ScreenwritingSection() {
  const [doc, setDoc] = useUserData<ScreenwritingDoc>('screenwriting', EMPTY_SCREENWRITING);
  const [settings] = useUserData<PersonalSettings>('settings', { weekStart: 'mon', dayStart: '06:00', dayEnd: '23:00' });
  const { toast } = useToast();

  const weekStartDay = settings?.weekStart || 'mon';
  const today = useMemo(() => new Date(), []);
  const todayIso = formatLocalDate(today);

  const projects = useMemo(() => doc.projects || [], [doc.projects]);
  const sessions = useMemo(() => doc.sessions || [], [doc.sessions]);
  const activeProjects = useMemo(() => projects.filter(p => !p.archived), [projects]);
  const archivedProjects = useMemo(() => projects.filter(p => p.archived), [projects]);

  const [draft, setDraft] = useState<DraftSession>({ date: todayIso, minutes: 60, projectId: '', note: '' });
  const [newProjectName, setNewProjectName] = useState('');
  const [addingProject, setAddingProject] = useState(false);
  const [managingProjects, setManagingProjects] = useState(false);

  const summaries = useMemo(
    () => writingWeekSummaries(sessions, today, WRITING_TREND_WEEKS, weekStartDay),
    [sessions, today, weekStartDay],
  );
  const curWeek = summaries[summaries.length - 1];
  const prevWeek = summaries[summaries.length - 2];

  const avg12 = useMemo(() => {
    if (summaries.length === 0) return 0;
    return summaries.reduce((s, w) => s + w.total, 0) / summaries.length;
  }, [summaries]);

  const projectById = (id: string): WritingProject | undefined => projects.find(p => p.id === id);
  const projectName = (id: string): string => projectById(id)?.name || 'Poistettu projekti';
  const projectColor = (id: string): string => projectById(id)?.color || 'var(--ink3)';

  const curWeekStart = weekStart(today, weekStartDay);
  const curWeekSessions = useMemo(() => {
    const startIso = formatLocalDate(curWeekStart);
    const endIso = formatLocalDate(addDays(curWeekStart, 7));
    return sessions
      .filter(s => s.date >= startIso && s.date < endIso)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  }, [sessions, curWeekStart]);

  const addProject = (): string | null => {
    const name = newProjectName.trim();
    if (!name) return null;
    const p: WritingProject = {
      id: newId(),
      name,
      color: nextProjectColor(projects),
      createdAt: Date.now(),
    };
    setDoc(prev => ({ ...prev, projects: [...(prev.projects || []), p] }));
    setNewProjectName('');
    setAddingProject(false);
    return p.id;
  };

  const logSession = () => {
    let projectId = draft.projectId;
    if (!projectId && addingProject) {
      projectId = addProject() || '';
    }
    if (!projectId) {
      toast('Valitse projekti ensin', 'info');
      return;
    }
    const minutes = Math.max(1, Math.round(draft.minutes || 0));
    const s: WritingSession = {
      id: newId(),
      date: draft.date || todayIso,
      minutes,
      projectId,
      note: draft.note.trim() || undefined,
      createdAt: Date.now(),
    };
    setDoc(prev => ({ ...prev, sessions: [...(prev.sessions || []), s] }));
    setDraft(d => ({ ...d, note: '' }));
    toast(`Kirjattu: ${fmtMinutes(minutes)} — ${projectName(projectId)}`, 'success');
  };

  const removeSession = (id: string) => {
    setDoc(prev => ({ ...prev, sessions: (prev.sessions || []).filter(s => s.id !== id) }));
  };

  const renameProject = (id: string, name: string) => {
    setDoc(prev => ({
      ...prev,
      projects: (prev.projects || []).map(p => p.id === id ? { ...p, name } : p),
    }));
  };

  const setProjectArchived = (id: string, archived: boolean) => {
    setDoc(prev => ({
      ...prev,
      projects: (prev.projects || []).map(p => p.id === id ? { ...p, archived: archived || undefined } : p),
    }));
    if (draft.projectId === id && archived) setDraft(d => ({ ...d, projectId: '' }));
  };

  const removeProject = (id: string) => {
    setDoc(prev => ({
      ...prev,
      projects: (prev.projects || []).filter(p => p.id !== id),
      sessions: (prev.sessions || []).filter(s => s.projectId !== id),
    }));
    if (draft.projectId === id) setDraft(d => ({ ...d, projectId: '' }));
  };

  const setWeeklyTarget = (raw: string) => {
    const num = parseFloat(raw.replace(',', '.'));
    setDoc(prev => ({ ...prev, weeklyTargetH: raw === '' || isNaN(num) || num <= 0 ? undefined : num }));
  };

  const target = doc.weeklyTargetH;
  const delta = prevWeek ? curWeek.total - prevWeek.total : 0;

  // Tämän viikon projektikohtaiset rivit, eniten ensin
  const curRows = useMemo(() => {
    return Object.entries(curWeek?.perProject || {})
      .sort(([, a], [, b]) => b - a)
      .map(([id, hours]) => ({ id, hours }));
  }, [curWeek]);
  const curRowMax = Math.max(1, ...curRows.map(r => r.hours), target || 0);

  return (
    <div style={{ padding: '0 36px 60px', display: 'flex', flexDirection: 'column', gap: 32 }}>

      {/* Kirjaa sessio */}
      <section>
        <h2 style={sectionTitle}>Kirjaa kirjoitussessio</h2>
        <div style={{ border: '1px solid var(--rule)', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={fieldLabel}>
              Päivä
              <input
                type="date"
                value={draft.date}
                max={todayIso}
                onChange={e => setDraft(d => ({ ...d, date: e.target.value }))}
                style={inputStyle}
              />
            </label>
            <label style={fieldLabel}>
              Projekti
              <select
                value={addingProject ? '__new__' : draft.projectId}
                onChange={e => {
                  if (e.target.value === '__new__') {
                    setAddingProject(true);
                  } else {
                    setAddingProject(false);
                    setDraft(d => ({ ...d, projectId: e.target.value }));
                  }
                }}
                style={{ ...inputStyle, minWidth: 180 }}
              >
                <option value="">— valitse —</option>
                {activeProjects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
                <option value="__new__">+ Uusi projekti</option>
              </select>
            </label>
            {addingProject && (
              <label style={fieldLabel}>
                Uuden projektin nimi
                <input
                  autoFocus
                  value={newProjectName}
                  onChange={e => setNewProjectName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      const id = addProject();
                      if (id) setDraft(d => ({ ...d, projectId: id }));
                    }
                  }}
                  placeholder="esim. Pitkä elokuva, luonnos 2"
                  style={{ ...inputStyle, minWidth: 220 }}
                />
              </label>
            )}
            <label style={fieldLabel}>
              Kesto (min)
              <input
                type="number"
                min={1}
                step={5}
                value={draft.minutes}
                onChange={e => setDraft(d => ({ ...d, minutes: parseInt(e.target.value, 10) || 0 }))}
                style={{ ...inputStyle, width: 90 }}
              />
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              {QUICK_MINUTES.map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setDraft(d => ({ ...d, minutes: m }))}
                  style={{
                    ...ghostBtn,
                    padding: '6px 10px',
                    letterSpacing: '.06em',
                    borderColor: draft.minutes === m ? 'var(--ink)' : 'var(--rule)',
                    color: draft.minutes === m ? 'var(--ink)' : 'var(--ink2)',
                  }}
                >
                  {fmtMinutes(m)}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <input
              value={draft.note}
              onChange={e => setDraft(d => ({ ...d, note: e.target.value }))}
              placeholder="Muistiinpano (valinnainen — esim. kohtaus, sivut, fiilis)"
              style={{ ...inputStyle, flex: 1, minWidth: 260 }}
            />
            <button onClick={logSession} style={primaryBtn}>Kirjaa sessio</button>
          </div>
        </div>
      </section>

      {/* Tämä viikko */}
      <section>
        <h2 style={sectionTitle}>Tämä viikko</h2>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div style={{ minWidth: 150, padding: '10px 12px', borderLeft: '3px solid var(--pri)', background: 'var(--paper-l)' }}>
            <div style={{ fontSize: 11, color: 'var(--ink2)' }}>Kirjoitettu</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontVariantNumeric: 'tabular-nums', fontSize: 22, color: 'var(--ink)' }}>
                {curWeek.total.toFixed(1)} h
              </span>
              {prevWeek && Math.abs(delta) >= 0.05 && (
                <span style={{ fontFamily: 'var(--font-display)', fontVariantNumeric: 'tabular-nums', fontSize: 11, color: delta > 0 ? 'var(--green, #185e5b)' : 'var(--red, #c14545)' }}>
                  {delta > 0 ? '+' : '−'}{Math.abs(delta).toFixed(1)} h vs viime vk
                </span>
              )}
            </div>
          </div>
          <div style={{ minWidth: 120, padding: '10px 12px', borderLeft: '3px solid var(--ink2)', background: 'var(--paper-l)' }}>
            <div style={{ fontSize: 11, color: 'var(--ink2)' }}>Sessioita</div>
            <div style={{ fontFamily: 'var(--font-display)', fontVariantNumeric: 'tabular-nums', fontSize: 22, color: 'var(--ink)' }}>
              {curWeek.sessionCount}
            </div>
          </div>
          <div style={{ minWidth: 120, padding: '10px 12px', borderLeft: '3px solid var(--ink3)', background: 'var(--paper-l)' }}>
            <div style={{ fontSize: 11, color: 'var(--ink2)' }}>Keskiarvo {WRITING_TREND_WEEKS} vk</div>
            <div style={{ fontFamily: 'var(--font-display)', fontVariantNumeric: 'tabular-nums', fontSize: 22, color: 'var(--ink)' }}>
              {avg12.toFixed(1)} h
            </div>
          </div>
          <div style={{ minWidth: 150, padding: '10px 12px', borderLeft: `3px solid ${target ? 'var(--green, #185e5b)' : 'var(--rule)'}`, background: 'var(--paper-l)' }}>
            <div style={{ fontSize: 11, color: 'var(--ink2)' }}>Tavoite h / vk</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <input
                type="number"
                min={0}
                step={0.5}
                value={target ?? ''}
                placeholder="—"
                onChange={e => setWeeklyTarget(e.target.value)}
                style={{ ...inputStyle, width: 70, fontFamily: 'var(--font-display)', fontSize: 18, padding: '2px 6px', border: '1px solid var(--rule)' }}
              />
              {target ? (
                <span style={{ fontFamily: 'var(--font-display)', fontVariantNumeric: 'tabular-nums', fontSize: 11, color: curWeek.total >= target ? 'var(--green, #185e5b)' : 'var(--ink3)' }}>
                  {Math.min(100, Math.round((curWeek.total / target) * 100))} %
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Tavoitepalkki */}
        {target ? (
          <div style={{ marginBottom: 16 }}>
            <div style={{ height: 10, background: 'var(--paper-d, var(--rule))', position: 'relative' }}>
              <div style={{
                position: 'absolute', inset: 0,
                width: `${Math.min(100, (curWeek.total / target) * 100)}%`,
                background: curWeek.total >= target ? 'var(--green, #185e5b)' : 'var(--pri)',
                transition: 'width .2s',
              }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4 }}>
              {curWeek.total >= target
                ? 'Viikkotavoite täynnä'
                : `${(target - curWeek.total).toFixed(1)} h tavoitteeseen`}
            </div>
          </div>
        ) : null}

        {/* Projektikohtaiset rivit */}
        {curRows.length === 0 ? (
          <div style={{ color: 'var(--ink3)', fontSize: 13, fontStyle: 'italic' }}>
            Ei kirjauksia tällä viikolla. Kirjaa ensimmäinen sessio yltä.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {curRows.map(r => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 10, height: 10, background: projectColor(r.id), flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: 'var(--ink)' }}>{projectName(r.id)}</span>
                <div style={{ width: 200, height: 8, background: 'var(--paper-d, var(--rule))', position: 'relative' }}>
                  <div style={{ position: 'absolute', inset: 0, width: `${(r.hours / curRowMax) * 100}%`, background: projectColor(r.id) }} />
                </div>
                <span style={{ width: 70, textAlign: 'right', fontFamily: 'var(--font-display)', fontVariantNumeric: 'tabular-nums', fontSize: 12, fontWeight: 500, color: 'var(--ink)' }}>
                  {r.hours.toFixed(1)} h
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Trendi */}
      <section>
        <h2 style={sectionTitle}>Trendi · {WRITING_TREND_WEEKS} viikkoa</h2>
        <div style={{ border: '1px solid var(--rule)', padding: 16 }}>
          <WritingLineChart
            weeks={summaries}
            projects={activeProjects}
            target={target}
            projectColor={projectColor}
            projectName={projectName}
          />
        </div>
      </section>

      {/* Viikon kirjaukset */}
      <section>
        <h2 style={sectionTitle}>Tämän viikon kirjaukset ({curWeekSessions.length})</h2>
        {curWeekSessions.length === 0 ? (
          <div style={{ color: 'var(--ink3)', fontSize: 13, fontStyle: 'italic' }}>Ei kirjauksia vielä.</div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {curWeekSessions.map(s => {
              const d = new Date(`${s.date}T12:00`);
              const dayName = ['su', 'ma', 'ti', 'ke', 'to', 'pe', 'la'][d.getDay()];
              return (
                <li key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--rule)' }}>
                  <span style={{ width: 10, height: 10, background: projectColor(s.projectId), flexShrink: 0 }} />
                  <span style={{ width: 78, fontSize: 12, color: 'var(--ink2)', fontVariantNumeric: 'tabular-nums' }}>
                    {dayName} {d.getDate()}.{d.getMonth() + 1}.
                  </span>
                  <span style={{ width: 90, fontFamily: 'var(--font-display)', fontVariantNumeric: 'tabular-nums', fontSize: 13, color: 'var(--ink)' }}>
                    {fmtMinutes(s.minutes)}
                  </span>
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--ink)' }}>
                    {projectName(s.projectId)}
                    {s.note && <span style={{ color: 'var(--ink3)', fontStyle: 'italic' }}> — {s.note}</span>}
                  </span>
                  <button
                    onClick={() => removeSession(s.id)}
                    aria-label="Poista kirjaus"
                    title="Poista kirjaus"
                    style={{ background: 'transparent', border: 'none', color: 'var(--ink3)', cursor: 'pointer', fontSize: 14 }}
                  >×</button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Projektit */}
      <section>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={sectionTitle}>Projektit ({activeProjects.length})</h2>
          <button onClick={() => setManagingProjects(m => !m)} style={subtleBtn}>
            {managingProjects ? 'Valmis' : 'Hallitse'}
          </button>
        </div>
        {projects.length === 0 ? (
          <div style={{ color: 'var(--ink3)', fontSize: 13, fontStyle: 'italic' }}>
            Ei projekteja vielä. Lisää ensimmäinen kirjaamalla sessio ja valitsemalla &quot;+ Uusi projekti&quot;.
          </div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {activeProjects.map(p => {
              const totalMin = sessions.filter(s => s.projectId === p.id).reduce((sum, s) => sum + s.minutes, 0);
              return (
                <li key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--rule)' }}>
                  <span style={{ width: 10, height: 10, background: p.color, flexShrink: 0 }} />
                  {managingProjects ? (
                    <input
                      value={p.name}
                      onChange={e => renameProject(p.id, e.target.value)}
                      style={{ ...inputStyle, flex: 1, padding: '4px 8px' }}
                    />
                  ) : (
                    <span style={{ flex: 1, color: 'var(--ink)' }}>{p.name}</span>
                  )}
                  <span style={{ fontSize: 11, color: 'var(--ink3)', letterSpacing: '.1em', textTransform: 'uppercase' }}>
                    yhteensä {fmtMinutes(totalMin)}
                  </span>
                  {managingProjects && (
                    <button onClick={() => setProjectArchived(p.id, true)} style={ghostBtn}>Arkistoi</button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {managingProjects && archivedProjects.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: 6 }}>
              Arkistoidut
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {archivedProjects.map(p => (
                <li key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--rule)', color: 'var(--ink3)' }}>
                  <span style={{ width: 10, height: 10, background: p.color, opacity: 0.4, flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{p.name}</span>
                  <button onClick={() => setProjectArchived(p.id, false)} style={ghostBtn}>Palauta</button>
                  <button
                    onClick={() => {
                      if (window.confirm(`Poistetaanko projekti "${p.name}" ja sen kaikki kirjaukset?`)) {
                        removeProject(p.id);
                      }
                    }}
                    aria-label="Poista projekti"
                    style={{ background: 'transparent', border: 'none', color: 'var(--ink3)', cursor: 'pointer', fontSize: 14 }}
                  >×</button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}

/** Viivakaavio viikkotunneista — sama tyyli kuin viikkokalenterin trendeissä. */
function WritingLineChart({
  weeks, projects, target, projectColor, projectName, width = 720, height = 260,
}: {
  weeks: WritingWeekSummary[];
  projects: WritingProject[];
  target?: number;
  projectColor: (id: string) => string;
  projectName: (id: string) => string;
  width?: number;
  height?: number;
}) {
  const [hovered, setHovered] = useState<{ id: string; weekIdx: number } | null>(null);
  const padL = 36, padR = 14, padT = 12, padB = 28;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const TOTAL_KEY = '__total__';

  // Projektit joilla on dataa ikkunassa, käytetyin ensin
  const totals: Record<string, number> = {};
  for (const w of weeks) for (const [k, v] of Object.entries(w.perProject)) totals[k] = (totals[k] || 0) + (v || 0);
  const projIds = projects.map(p => p.id).filter(id => (totals[id] || 0) > 0)
    .sort((a, b) => (totals[b] || 0) - (totals[a] || 0));

  const series: Array<{ id: string; label: string; color: string; values: number[]; dashed?: boolean }> = [
    {
      id: TOTAL_KEY,
      label: 'Yhteensä',
      color: 'var(--ink)',
      values: weeks.map(w => w.total),
    },
    ...projIds.map(id => ({
      id,
      label: projectName(id),
      color: projectColor(id),
      values: weeks.map(w => w.perProject[id] || 0),
    })),
  ];

  let maxVal = target || 0;
  for (const s of series) for (const v of s.values) maxVal = Math.max(maxVal, v);
  if (maxVal === 0) maxVal = 5;
  const yMax = Math.max(2, Math.ceil(maxVal / 2) * 2);

  const xPos = (wi: number) => padL + (weeks.length === 1 ? innerW / 2 : (innerW * wi) / (weeks.length - 1));
  const yPos = (val: number) => padT + innerH - (val / yMax) * innerH;
  const buildPath = (vals: number[]) =>
    vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${xPos(i).toFixed(1)},${yPos(v).toFixed(1)}`).join(' ');

  const yTicks = [0, yMax * 0.25, yMax * 0.5, yMax * 0.75, yMax];

  const hoveredSeries = hovered ? series.find(s => s.id === hovered.id) : null;
  const hoveredVal = hoveredSeries && hovered ? hoveredSeries.values[hovered.weekIdx] : null;
  const hoveredWeek = hovered ? weeks[hovered.weekIdx] : null;

  const hasData = series.some(s => s.values.some(v => v > 0));
  if (!hasData) {
    return <div style={{ fontSize: 12, color: 'var(--ink3)', fontStyle: 'italic' }}>Ei dataa vielä — trendi piirtyy, kun kirjauksia kertyy.</div>;
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ minHeight: 18, marginBottom: 4, fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.02em', display: 'flex', alignItems: 'center', gap: 8 }}>
        {hoveredSeries && hoveredWeek && hoveredVal !== null ? (
          <>
            <span style={{ display: 'inline-block', width: 10, height: 10, background: hoveredSeries.color }} />
            <span style={{ color: hoveredSeries.color, fontWeight: 600 }}>{hoveredSeries.label}</span>
            <span style={{ color: 'var(--ink3)' }}>·</span>
            <span style={{ color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{hoveredVal.toFixed(1)} h</span>
            <span style={{ color: 'var(--ink3)' }}>·</span>
            <span style={{ color: 'var(--ink2)' }}>vko {hoveredWeek.weekLabel}</span>
          </>
        ) : (
          <span style={{ color: 'var(--ink3)', fontStyle: 'italic' }}>Vie hiiri viivan päälle</span>
        )}
      </div>
      <svg
        width="100%"
        viewBox={`0 0 ${width} ${height}`}
        style={{ display: 'block', maxWidth: width }}
        onMouseLeave={() => setHovered(null)}
      >
        {yTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={padL} x2={padL + innerW}
              y1={yPos(t)} y2={yPos(t)}
              stroke="var(--rule)" strokeDasharray={i === 0 ? undefined : '2,3'}
            />
            <text x={padL - 6} y={yPos(t) + 3} fontSize={9} textAnchor="end" fill="var(--ink3)">
              {t.toFixed(0)}
            </text>
          </g>
        ))}
        {weeks.map((w, wi) => (
          <text
            key={wi}
            x={xPos(wi)}
            y={padT + innerH + 14}
            fontSize={9}
            textAnchor="middle"
            fill={wi === weeks.length - 1 ? 'var(--ink)' : 'var(--ink3)'}
            fontWeight={wi === weeks.length - 1 ? 600 : 400}
          >
            {w.weekLabel}
          </text>
        ))}
        {/* Viikkotavoite vaakaviivana */}
        {target && target <= yMax ? (
          <g>
            <line
              x1={padL} x2={padL + innerW}
              y1={yPos(target)} y2={yPos(target)}
              stroke="var(--green, #185e5b)" strokeDasharray="6,4" strokeWidth={1.5} opacity={0.7}
            />
            <text x={padL + innerW} y={yPos(target) - 4} fontSize={9} textAnchor="end" fill="var(--green, #185e5b)">
              tavoite {target} h
            </text>
          </g>
        ) : null}
        {series.map(s => {
          const isHovered = hovered?.id === s.id;
          const isAnyHovered = hovered !== null;
          const isTotal = s.id === TOTAL_KEY;
          return (
            <g key={`hit-${s.id}`}>
              <path
                d={buildPath(s.values)}
                fill="none"
                stroke="transparent"
                strokeWidth={14}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHovered({ id: s.id, weekIdx: weeks.length - 1 })}
              />
              <path
                d={buildPath(s.values)}
                fill="none"
                stroke={s.color}
                strokeWidth={isHovered ? 3 : isTotal ? 2.5 : 2}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={isAnyHovered && !isHovered ? 0.18 : isTotal ? 0.95 : 0.85}
                style={{ pointerEvents: 'none', transition: 'opacity .12s, stroke-width .12s' }}
              />
              {s.values.map((v, i) => (
                <circle
                  key={i}
                  cx={xPos(i)}
                  cy={yPos(v)}
                  r={isHovered ? 4 : 2.5}
                  fill={s.color}
                  opacity={isAnyHovered && !isHovered ? 0.18 : 1}
                  style={{ cursor: 'pointer', transition: 'opacity .12s' }}
                  onMouseEnter={() => setHovered({ id: s.id, weekIdx: i })}
                >
                  <title>{s.label} vko {weeks[i].weekLabel}: {v.toFixed(1)} h</title>
                </circle>
              ))}
            </g>
          );
        })}
        {hovered && (
          <line
            x1={xPos(hovered.weekIdx)}
            x2={xPos(hovered.weekIdx)}
            y1={padT}
            y2={padT + innerH}
            stroke="var(--ink3)"
            strokeDasharray="2,3"
            strokeWidth={1}
            opacity={0.4}
            pointerEvents="none"
          />
        )}
      </svg>
      {/* Selite */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 8 }}>
        {series.map(s => (
          <span key={s.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--ink2)', fontFamily: 'var(--font-display)' }}>
            <span style={{ width: 10, height: 10, background: s.color, display: 'inline-block' }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
