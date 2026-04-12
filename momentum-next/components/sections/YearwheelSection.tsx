'use client';

import { useState } from 'react';
import { useOrgData } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import {
  YearPhase,
  YearTask,
  categoryColors,
  categoryOrder,
  TEAMS,
  months,
  monthsLong,
  // defaultLlffYearwheel removed — now via org-defaults
  normalizePhase,
  phaseStartDate,
  phaseEndDate,
} from '@/lib/yearwheel-shared';
import { useParams } from 'next/navigation';
import { OrgTeam } from '@/lib/team-shared';
import { getOrgTeams, getOrgYearwheel } from '@/lib/org-defaults';

// Minimal project shape for phase-linked project listing
interface ProjectLite {
  id: number;
  t: string;
  deadline: string;
  st: string;
  archived?: boolean;
  teamId?: string;
  phaseId?: string;
}

interface Props {
  // If the parent hub manages state, it can pass phases/setPhases.
  // Otherwise the section reads its own via useOrgData.
  phases?: YearPhase[];
  setPhases?: (v: YearPhase[] | ((prev: YearPhase[]) => YearPhase[])) => void;
}

export default function YearwheelSection({ phases: propPhases, setPhases: propSet }: Props) {
  const { canEdit } = useAuth();
  const { toast } = useToast();
  const orgSlug = (useParams().orgSlug as string) || '';
  const [ownRaw, ownSet] = useOrgData<YearPhase[]>('yearwheel', getOrgYearwheel(orgSlug));
  const [projects] = useOrgData<ProjectLite[]>('projects', []);
  const [orgTeams] = useOrgData<OrgTeam[]>('orgTeams', getOrgTeams(orgSlug));
  const rawPhases = propPhases ?? ownRaw;
  const setPhases = propSet ?? ownSet;

  // Normalize phases (ensure team field exists)
  const phases: YearPhase[] = rawPhases.map(normalizePhase);

  const [selectedPhase, setSelectedPhase] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formStart, setFormStart] = useState('1');
  const [formEnd, setFormEnd] = useState('2');
  const [formCategory, setFormCategory] = useState<YearPhase['category']>('planning');
  const [formTeam, setFormTeam] = useState<string>('viestinta');
  const [formColor, setFormColor] = useState('#056b9f');
  const [formIsFestival, setFormIsFestival] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const filteredPhases = teamFilter === 'all' ? phases : phases.filter(p => p.team === teamFilter);

  const year = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  // Festival countdown
  const weeksToFestival = (() => {
    const fest = phases.find(p => p.isFestival);
    if (!fest) return null;
    const now = new Date();
    let target = phaseStartDate(fest, year);
    if (target.getTime() < now.getTime() - 7 * 86400000) {
      target = phaseStartDate(fest, year + 1);
    }
    const diffMs = target.getTime() - now.getTime();
    const weeks = Math.ceil(diffMs / (7 * 86400000));
    const days = Math.ceil(diffMs / 86400000);
    return { weeks, days, target, name: fest.name };
  })();

  // Form helpers
  const openNew = () => {
    setEditId(null); setFormName(''); setFormDesc(''); setFormStart('1'); setFormEnd('2');
    setFormCategory('planning'); setFormTeam('viestinta'); setFormColor('#056b9f'); setFormIsFestival(false);
    setShowForm(true);
  };
  const openEdit = (p: YearPhase) => {
    setEditId(p.id); setFormName(p.name); setFormDesc(p.desc);
    setFormStart(String(p.startMonth)); setFormEnd(String(p.endMonth));
    setFormCategory(p.category); setFormTeam(p.team); setFormColor(p.color);
    setFormIsFestival(!!p.isFestival);
    setShowForm(true);
  };
  const savePhase = () => {
    if (!formName.trim()) return;
    const phase: YearPhase = {
      id: editId || 'yw_' + Date.now(),
      name: formName.trim(), desc: formDesc.trim(),
      startMonth: parseInt(formStart), endMonth: parseInt(formEnd),
      category: formCategory, team: formTeam, color: formColor, icon: '◇',
      isFestival: formIsFestival,
      tasks: editId ? (phases.find(p => p.id === editId)?.tasks || []) : [],
    };
    setPhases(prev => {
      const normalized = prev.map(normalizePhase);
      const next = formIsFestival ? normalized.map(p => p.id !== phase.id ? { ...p, isFestival: false } : p) : [...normalized];
      if (editId) return next.map(p => p.id === editId ? phase : p);
      return [...next, phase];
    });
    setShowForm(false);
    toast(editId ? 'Vaihe päivitetty' : 'Vaihe lisätty', 'success');
  };
  const removePhase = (id: string) => {
    setPhases(prev => prev.map(normalizePhase).filter(p => p.id !== id));
    if (selectedPhase === id) setSelectedPhase(null);
    toast('Vaihe poistettu', 'success');
  };
  const toggleTask = (phaseId: string, taskId: string) => {
    setPhases(prev => prev.map(normalizePhase).map(p => p.id === phaseId ? {
      ...p, tasks: p.tasks.map(t => t.id === taskId ? { ...t, done: !t.done } : t)
    } : p));
  };
  const addTaskToPhase = (phaseId: string, text: string, month: number, owner?: string) => {
    if (!text.trim()) return;
    setPhases(prev => prev.map(normalizePhase).map(p => p.id === phaseId ? {
      ...p, tasks: [...p.tasks, { id: 'task_' + Date.now(), text: text.trim(), month, done: false, owner: owner?.trim() || undefined }]
    } : p));
  };
  const removeTask = (phaseId: string, taskId: string) => {
    setPhases(prev => prev.map(normalizePhase).map(p => p.id === phaseId ? {
      ...p, tasks: p.tasks.filter(t => t.id !== taskId)
    } : p));
  };
  const updateTask = (phaseId: string, taskId: string, patch: Partial<YearTask>) => {
    setPhases(prev => prev.map(normalizePhase).map(p => p.id === phaseId ? {
      ...p, tasks: p.tasks.map(t => t.id === taskId ? { ...t, ...patch } : t)
    } : p));
  };

  // --- Wheel math ---
  const wheelSize = 520;
  const centerX = wheelSize / 2;
  const centerY = wheelSize / 2;
  const outerR = 235;
  const innerR = 95;
  const monthAngle = (m: number) => (m - 1) * 30 - 90;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const arcPath = (startM: number, endM: number, rOuter: number, rInner: number) => {
    const startA = toRad(monthAngle(startM));
    const endA = toRad(monthAngle(endM + 1));
    const x1 = centerX + rOuter * Math.cos(startA);
    const y1 = centerY + rOuter * Math.sin(startA);
    const x2 = centerX + rOuter * Math.cos(endA);
    const y2 = centerY + rOuter * Math.sin(endA);
    const x3 = centerX + rInner * Math.cos(endA);
    const y3 = centerY + rInner * Math.sin(endA);
    const x4 = centerX + rInner * Math.cos(startA);
    const y4 = centerY + rInner * Math.sin(startA);
    const largeArc = endM - startM >= 5 ? 1 : 0;
    return `M ${x1} ${y1} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${rInner} ${rInner} 0 ${largeArc} 0 ${x4} ${y4} Z`;
  };

  // Categorized ring layout — each category gets its own concentric ring
  const ringWidth = (outerR - innerR) / categoryOrder.length;
  const rings = categoryOrder.map((cat, i) => {
    const catPhases = filteredPhases.filter(p => p.category === cat);
    const ringOuter = outerR - i * ringWidth;
    const ringInner = ringOuter - ringWidth + 2;
    // Sub-layer packing within this category's ring
    const sorted = [...catPhases].sort((a, b) => a.startMonth - b.startMonth);
    const sublayers: YearPhase[][] = [];
    for (const p of sorted) {
      let placed = false;
      for (const sl of sublayers) {
        if (sl.every(ep => p.startMonth > ep.endMonth || p.endMonth < ep.startMonth)) {
          sl.push(p); placed = true; break;
        }
      }
      if (!placed) sublayers.push([p]);
    }
    return { cat, outerR: ringOuter, innerR: ringInner, sublayers };
  });

  // Numbered phase index for the side legend (stable by category order then startMonth)
  const numberedPhases = categoryOrder.flatMap(cat =>
    [...filteredPhases].filter(p => p.category === cat).sort((a, b) => a.startMonth - b.startMonth)
  );
  const phaseNumber = (id: string) => numberedPhases.findIndex(p => p.id === id) + 1;

  const selected = selectedPhase ? phases.find(p => p.id === selectedPhase) : null;

  // =============================== DETAIL VIEW ===============================
  if (selected) {
    const selectedTeam = TEAMS[selected.team];
    const selectedCat = categoryColors[selected.category];
    return (
      <>
        <button className="btn btn-ghost" onClick={() => setSelectedPhase(null)} style={{ marginBottom: '1rem' }}>{'←'} Takaisin vuosikelloon</button>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.5rem', marginBottom: '1.25rem', borderLeft: `6px solid ${selected.color}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '.75rem' }}>
            <div>
              <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginBottom: '.35rem', flexWrap: 'wrap' }}>
                {selectedTeam && (
                  <span style={{ fontSize: '.65rem', padding: '.2rem .6rem', borderRadius: 9999, background: selectedTeam.color, color: '#fff', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>{selectedTeam.icon} {selectedTeam.label}</span>
                )}
                <span style={{ fontSize: '.65rem', padding: '.2rem .6rem', borderRadius: 9999, background: selectedCat.bg, color: selectedCat.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>{selectedCat.icon} {selectedCat.label}</span>
                {selected.isFestival && (
                  <span style={{ fontSize: '.65rem', padding: '.15rem .5rem', borderRadius: 9999, background: 'rgba(239,107,107,.15)', color: '#ef6b6b', fontWeight: 700 }}>{'★'} FESTIVAALIVIIKKO</span>
                )}
              </div>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 800 }}>{selected.name}</h2>
              <div style={{ fontSize: '.75rem', color: 'var(--t3)', marginTop: '.2rem' }}>
                {monthsLong[selected.startMonth - 1]}{selected.startMonth !== selected.endMonth && ` – ${monthsLong[selected.endMonth - 1]}`}
              </div>
            </div>
            {canEdit && (
              <div style={{ display: 'flex', gap: '.4rem' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => openEdit(selected)}>Muokkaa</button>
                <button className="btn btn-ghost btn-sm" onClick={() => removePhase(selected.id)} style={{ color: 'var(--red)' }}>Poista</button>
              </div>
            )}
          </div>
          <p style={{ fontSize: '.88rem', color: 'var(--t2)', lineHeight: 1.7 }}>{selected.desc}</p>
          {canEdit && (
            <div style={{ display: 'flex', gap: '.35rem', marginTop: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '.68rem', color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600, marginRight: '.25rem' }}>Siirrä:</span>
              <button className="btn btn-ghost btn-sm" onClick={() => selected.startMonth > 1 && setPhases(prev => prev.map(normalizePhase).map(p => p.id === selected.id ? { ...p, startMonth: p.startMonth - 1, endMonth: p.endMonth - 1 } : p))} disabled={selected.startMonth <= 1}>{'←'} Kuukausi taakse</button>
              <button className="btn btn-ghost btn-sm" onClick={() => selected.endMonth < 12 && setPhases(prev => prev.map(normalizePhase).map(p => p.id === selected.id ? { ...p, startMonth: p.startMonth + 1, endMonth: p.endMonth + 1 } : p))} disabled={selected.endMonth >= 12}>Kuukausi eteen {'→'}</button>
              <span style={{ fontSize: '.68rem', color: 'var(--t3)', margin: '0 .25rem 0 .5rem' }}>|</span>
              <span style={{ fontSize: '.68rem', color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600, marginRight: '.25rem' }}>Kesto:</span>
              <button className="btn btn-ghost btn-sm" onClick={() => selected.endMonth > selected.startMonth && setPhases(prev => prev.map(normalizePhase).map(p => p.id === selected.id ? { ...p, endMonth: p.endMonth - 1 } : p))} disabled={selected.endMonth <= selected.startMonth}>{'−'} Lyhennä</button>
              <button className="btn btn-ghost btn-sm" onClick={() => selected.endMonth < 12 && setPhases(prev => prev.map(normalizePhase).map(p => p.id === selected.id ? { ...p, endMonth: p.endMonth + 1 } : p))} disabled={selected.endMonth >= 12}>+ Pidennä</button>
            </div>
          )}
        </div>

        {/* Linked projects from teams */}
        {(() => {
          const linkedProjects = projects.filter(p => p.phaseId === selected.id && !p.archived);
          if (linkedProjects.length === 0) return null;
          return (
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.5rem', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.75rem' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.88rem', fontWeight: 500, textTransform: 'uppercase' }}>Linkitetyt projektit</h3>
                <span style={{ fontSize: '.7rem', color: 'var(--t3)' }}>{linkedProjects.length} projektia tiimeistä</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
                {linkedProjects.map(p => {
                  const team = p.teamId ? orgTeams.find(t => t.id === p.teamId) : null;
                  const dlDiff = p.deadline ? Math.ceil((new Date(p.deadline).getTime() - Date.now()) / 86400000) : null;
                  return (
                    <div key={p.id} style={{
                      display: 'flex', alignItems: 'center', gap: '.6rem',
                      padding: '.55rem .75rem', background: 'var(--elev)',
                      border: '1px solid var(--border)',
                      borderLeft: team ? `3px solid ${team.color}` : undefined,
                      borderRadius: 'var(--r)',
                    }}>
                      {team && (
                        <span style={{ fontSize: '.58rem', padding: '.1rem .4rem', borderRadius: 9999, background: `${team.color}20`, color: team.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                          {team.icon} {team.name}
                        </span>
                      )}
                      <span style={{ flex: 1, fontSize: '.8rem', fontWeight: 600 }}>{p.t}</span>
                      <span style={{ fontSize: '.65rem', color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                        {p.st === 'active' ? 'Työstössä' : p.st === 'idea' ? 'Idea' : 'Valmis'}
                      </span>
                      {p.deadline && dlDiff !== null && (
                        <span style={{
                          fontSize: '.62rem', padding: '.12rem .4rem', borderRadius: 9999, fontWeight: 700,
                          background: dlDiff < 0 ? 'rgba(239,68,68,.12)' : dlDiff < 14 ? 'rgba(245,197,66,.12)' : 'rgba(45,212,160,.1)',
                          color: dlDiff < 0 ? 'var(--red)' : dlDiff < 14 ? 'var(--yellow)' : 'var(--green)',
                        }}>
                          {dlDiff < 0 ? 'Myöhässä' : `${dlDiff} pv`}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Tasks */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', alignItems: 'center' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.88rem', fontWeight: 500, textTransform: 'uppercase' }}>Tehtävät vaiheessa</h3>
            <span style={{ fontSize: '.72rem', color: 'var(--t3)' }}>{selected.tasks.filter(t => t.done).length} / {selected.tasks.length} valmis</span>
          </div>
          {selected.tasks.length === 0 && <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--t3)', fontSize: '.82rem' }}>Ei tehtäviä. Lisää ensimmäinen alapuolella.</div>}
          {selected.tasks.map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '.75rem', padding: '.75rem', background: 'var(--elev)', border: '1px solid var(--border)', borderRadius: 'var(--r)', marginBottom: '.4rem' }}>
              <input type="checkbox" checked={t.done} onChange={() => toggleTask(selected.id, t.id)} style={{ width: 18, height: 18, cursor: canEdit ? 'pointer' : 'default', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                {canEdit ? (
                  <input
                    className="input"
                    defaultValue={t.text}
                    onBlur={e => { if (e.target.value.trim() && e.target.value !== t.text) updateTask(selected.id, t.id, { text: e.target.value.trim() }); }}
                    style={{ fontSize: '.85rem', fontWeight: 600, background: 'transparent', border: 'none', padding: 0, width: '100%', textDecoration: t.done ? 'line-through' : 'none', color: t.done ? 'var(--t3)' : 'var(--t1)' }}
                  />
                ) : (
                  <div style={{ fontSize: '.85rem', fontWeight: 600, textDecoration: t.done ? 'line-through' : 'none', color: t.done ? 'var(--t3)' : 'var(--t1)' }}>{t.text}</div>
                )}
                <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginTop: '.2rem' }}>
                  {canEdit ? (
                    <>
                      <select value={t.month} onChange={e => updateTask(selected.id, t.id, { month: parseInt(e.target.value) })} style={{ fontSize: '.68rem', background: 'transparent', border: '1px solid var(--border)', borderRadius: 4, padding: '.1rem .3rem', color: 'var(--t2)' }}>
                        {Array.from({ length: selected.endMonth - selected.startMonth + 1 }, (_, i) => selected.startMonth + i).map(m => (
                          <option key={m} value={m}>{monthsLong[m - 1]}</option>
                        ))}
                      </select>
                      <input className="input" defaultValue={t.owner || ''} placeholder="Vastuuhenkilö" onBlur={e => updateTask(selected.id, t.id, { owner: e.target.value.trim() || undefined })} style={{ fontSize: '.68rem', padding: '.1rem .3rem', height: 'auto', minHeight: 0, color: 'var(--t2)', maxWidth: 180 }} />
                    </>
                  ) : (
                    <span style={{ fontSize: '.68rem', color: 'var(--t3)' }}>{monthsLong[t.month - 1]}{t.owner && ` · ${t.owner}`}</span>
                  )}
                </div>
              </div>
              {canEdit && <button onClick={() => removeTask(selected.id, t.id)} style={{ background: 'transparent', border: 'none', color: 'var(--t3)', cursor: 'pointer', fontSize: '1rem', padding: '.25rem .4rem' }}>{'×'}</button>}
            </div>
          ))}
          {canEdit && (
            <form onSubmit={e => {
              e.preventDefault();
              const f = e.target as any;
              addTaskToPhase(selected.id, f.taskInput.value, parseInt(f.taskMonth.value), f.taskOwner.value);
              f.taskInput.value = ''; f.taskOwner.value = '';
            }} style={{ display: 'flex', gap: '.4rem', marginTop: '.75rem', flexWrap: 'wrap' }}>
              <input name="taskInput" className="input" placeholder="Lisää tehtävä..." style={{ flex: '2 1 180px' }} />
              <input name="taskOwner" className="input" placeholder="Vastuuhenkilö" style={{ flex: '1 1 120px' }} />
              <select name="taskMonth" className="input" defaultValue={String(selected.startMonth)} style={{ width: 'auto' }}>
                {Array.from({ length: selected.endMonth - selected.startMonth + 1 }, (_, i) => selected.startMonth + i).map(m => (
                  <option key={m} value={m}>{monthsLong[m - 1]}</option>
                ))}
              </select>
              <button type="submit" className="btn btn-primary btn-sm">+ Lisää</button>
            </form>
          )}
        </div>

        {renderEditModal()}
      </>
    );
  }

  // =============================== MAIN VIEW ===============================
  return (
    <>
      {/* Festival countdown card */}
      {weeksToFestival && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.25rem',
          background: 'linear-gradient(135deg, rgba(239,107,107,.12), rgba(228,92,129,.08))',
          border: '1px solid rgba(239,107,107,.3)', borderRadius: 'var(--rl)',
          marginBottom: '1.25rem',
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'rgba(239,107,107,.15)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            fontSize: '1.5rem', color: '#ef6b6b', fontWeight: 800,
          }}>{'★'}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '.7rem', color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600 }}>
              {weeksToFestival.name}
            </div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--t1)', lineHeight: 1.2, marginTop: '.15rem' }}>
              {weeksToFestival.weeks > 0
                ? <>Festivaaliin <span style={{ color: '#ef6b6b' }}>{weeksToFestival.weeks}</span> viikkoa</>
                : weeksToFestival.days >= 0
                  ? <>Festivaali alkaa <span style={{ color: '#ef6b6b' }}>{weeksToFestival.days}</span> päivän kuluttua</>
                  : <>Festivaali käynnissä nyt</>}
            </div>
            <div style={{ fontSize: '.75rem', color: 'var(--t3)', marginTop: '.15rem' }}>
              Alkaa {weeksToFestival.target.toLocaleDateString('fi-FI', { day: 'numeric', month: 'long', year: 'numeric' })} · {weeksToFestival.days} päivää
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '.75rem' }}>
        <div style={{ fontSize: '.78rem', color: 'var(--t3)' }}>{filteredPhases.length} / {phases.length} vaihetta{teamFilter !== 'all' && ` · ${TEAMS[teamFilter]?.label}`}</div>
        {canEdit && <button className="btn btn-primary btn-sm" onClick={openNew}>+ Lisää vaihe</button>}
      </div>

      {/* Team filter */}
      <div style={{ display: 'flex', gap: '.4rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <button onClick={() => setTeamFilter('all')} style={{
          fontSize: '.72rem', padding: '.4rem .75rem', borderRadius: 9999,
          background: teamFilter === 'all' ? 'var(--t1)' : 'var(--elev)',
          color: teamFilter === 'all' ? 'var(--bg)' : 'var(--t2)',
          border: '1px solid var(--border)', fontWeight: 600, cursor: 'pointer',
        }}>Kaikki tiimit ({phases.length})</button>
        {Object.entries(TEAMS).map(([k, t]) => {
          const count = phases.filter(p => p.team === k).length;
          if (count === 0) return null;
          const active = teamFilter === k;
          return (
            <button key={k} onClick={() => setTeamFilter(k)} style={{
              fontSize: '.72rem', padding: '.4rem .75rem', borderRadius: 9999,
              background: active ? t.color : 'var(--elev)',
              color: active ? '#fff' : 'var(--t2)',
              border: `1px solid ${active ? t.color : 'var(--border)'}`,
              fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '.35rem',
            }}>
              <span style={{ fontSize: '.85rem', lineHeight: 1 }}>{t.icon}</span>
              {t.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Category legend with icons */}
      <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1.5rem', flexWrap: 'wrap', fontSize: '.68rem', color: 'var(--t3)', alignItems: 'center' }}>
        <span style={{ textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600 }}>Kategoriat:</span>
        {categoryOrder.map(cat => {
          const v = categoryColors[cat];
          return (
            <span key={cat} style={{ fontSize: '.72rem', padding: '.25rem .7rem', borderRadius: 9999, background: v.bg, color: v.color, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '.3rem' }}>
              <span style={{ fontSize: '.9rem', lineHeight: 1 }}>{v.icon}</span>
              {v.label}
            </span>
          );
        })}
        <span style={{ marginLeft: '.5rem', opacity: .7 }}>Ulompi rengas = Suunnittelu, keskimmäiset = Tuotanto/Toteutus, sisärengas = Reflektio</span>
      </div>

      {/* Wheel + side legend layout */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(280px, 360px)', gap: '1.25rem', alignItems: 'start' }} className="yearwheel-grid">
        {/* === WHEEL === */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)' }}>
          <svg width={wheelSize} height={wheelSize} style={{ maxWidth: '100%', height: 'auto' }}>
            {/* Month divider lines */}
            {Array.from({ length: 12 }).map((_, i) => {
              const a = toRad(monthAngle(i + 1));
              return (
                <line key={i} x1={centerX + innerR * Math.cos(a)} y1={centerY + innerR * Math.sin(a)}
                  x2={centerX + outerR * Math.cos(a)} y2={centerY + outerR * Math.sin(a)}
                  stroke="var(--border)" strokeWidth="1" />
              );
            })}
            {/* Month labels */}
            {months.map((m, i) => {
              const a = toRad(monthAngle(i + 1) + 15);
              const r = outerR + 22;
              const isCurrent = i + 1 === currentMonth;
              return (
                <text key={m} x={centerX + r * Math.cos(a)} y={centerY + r * Math.sin(a)}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize="11" fontWeight={isCurrent ? 700 : 500}
                  fill={isCurrent ? 'var(--pri-l)' : 'var(--t2)'}
                  fontFamily="var(--font-display)" letterSpacing=".05em">
                  {m.toUpperCase()}
                </text>
              );
            })}

            {/* Phases as categorized concentric rings */}
            {rings.map(ring => {
              const ringGap = (ring.outerR - ring.innerR) / Math.max(ring.sublayers.length, 1);
              return ring.sublayers.map((sublayer, slIdx) => {
                const slOuter = ring.outerR - slIdx * ringGap;
                const slInner = slOuter - ringGap + 1;
                return sublayer.map(phase => {
                  const idx = phaseNumber(phase.id);
                  const isSelected = selectedPhase === phase.id;
                  const isHovered = hoveredId === phase.id;
                  const dimmed = hoveredId !== null && !isHovered;
                  const opacity = isSelected || isHovered ? 1 : dimmed ? 0.3 : 0.82;
                  const midM = (phase.startMonth + phase.endMonth) / 2 + 0.5;
                  const labelA = toRad(monthAngle(midM));
                  const labelR = (slOuter + slInner) / 2;
                  const lx = centerX + labelR * Math.cos(labelA);
                  const ly = centerY + labelR * Math.sin(labelA);
                  return (
                    <g key={phase.id} style={{ cursor: 'pointer' }}
                       onClick={() => setSelectedPhase(phase.id)}
                       onMouseEnter={() => setHoveredId(phase.id)}
                       onMouseLeave={() => setHoveredId(null)}>
                      <path d={arcPath(phase.startMonth, phase.endMonth, slOuter, slInner)}
                        fill={phase.color} opacity={opacity}
                        stroke="var(--bg)" strokeWidth="2"
                        style={{ transition: 'opacity .2s' }} />
                      {/* Phase number in arc center */}
                      <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
                        fontSize="13" fontWeight="800" fill="#fff" pointerEvents="none"
                        style={{ textShadow: '0 1px 2px rgba(0,0,0,.4)' }}>
                        {idx}
                      </text>
                    </g>
                  );
                });
              });
            })}

            {/* Current month indicator */}
            {(() => {
              const a = toRad(monthAngle(currentMonth) + 15);
              const r1 = innerR - 5;
              const r2 = outerR + 5;
              return (
                <line x1={centerX + r1 * Math.cos(a)} y1={centerY + r1 * Math.sin(a)}
                  x2={centerX + r2 * Math.cos(a)} y2={centerY + r2 * Math.sin(a)}
                  stroke="var(--pri-l)" strokeWidth="2" strokeDasharray="4,2" />
              );
            })()}

            {/* Center with countdown */}
            <circle cx={centerX} cy={centerY} r={innerR} fill="var(--bg)" stroke="var(--border)" strokeWidth="1" />
            {weeksToFestival ? (
              <>
                <text x={centerX} y={centerY - 34} textAnchor="middle" fontSize="10" fill="var(--t3)" fontFamily="var(--font-display)" letterSpacing=".12em">FESTIVAALIIN</text>
                <text x={centerX} y={centerY} textAnchor="middle" fontSize="48" fontWeight="800" fill="#ef6b6b" fontFamily="var(--font-display)">
                  {weeksToFestival.weeks > 0 ? weeksToFestival.weeks : (weeksToFestival.days >= 0 ? weeksToFestival.days : 0)}
                </text>
                <text x={centerX} y={centerY + 22} textAnchor="middle" fontSize="11" fill="var(--t2)" fontFamily="var(--font-display)" letterSpacing=".1em">
                  {weeksToFestival.weeks > 0 ? 'VIIKKOA' : weeksToFestival.days >= 0 ? 'PÄIVÄÄ' : 'KÄYNNISSÄ'}
                </text>
                <text x={centerX} y={centerY + 44} textAnchor="middle" fontSize="9" fill="var(--t3)">
                  {filteredPhases.length} vaihetta
                </text>
              </>
            ) : (
              <>
                <text x={centerX} y={centerY - 14} textAnchor="middle" fontSize="11" fill="var(--t3)" fontFamily="var(--font-display)" letterSpacing=".1em">VUOSIKELLO</text>
                <text x={centerX} y={centerY + 8} textAnchor="middle" fontSize="28" fontWeight="700" fill="var(--t1)" fontFamily="var(--font-display)">{year}</text>
                <text x={centerX} y={centerY + 28} textAnchor="middle" fontSize="10" fill="var(--t3)">{filteredPhases.length} vaihetta</text>
              </>
            )}
          </svg>
        </div>

        {/* === SIDE LEGEND === */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1rem', maxHeight: 540, overflowY: 'auto' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--t3)', marginBottom: '.75rem' }}>
            Vaiheet
          </div>
          {categoryOrder.map(cat => {
            const catPhases = numberedPhases.filter(p => p.category === cat);
            if (catPhases.length === 0) return null;
            const catDef = categoryColors[cat];
            return (
              <div key={cat} style={{ marginBottom: '1rem' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '.4rem',
                  padding: '.35rem .5rem', borderRadius: 'var(--r)',
                  background: catDef.bg, color: catDef.color,
                  fontSize: '.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em',
                  marginBottom: '.35rem',
                }}>
                  <span style={{ fontSize: '.9rem', lineHeight: 1 }}>{catDef.icon}</span>
                  {catDef.label}
                </div>
                {catPhases.map(phase => {
                  const idx = phaseNumber(phase.id);
                  const progress = phase.tasks.length > 0 ? Math.round(phase.tasks.filter(t => t.done).length / phase.tasks.length * 100) : 0;
                  const team = TEAMS[phase.team];
                  const isHovered = hoveredId === phase.id;
                  return (
                    <div key={phase.id}
                      onClick={() => setSelectedPhase(phase.id)}
                      onMouseEnter={() => setHoveredId(phase.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: '.5rem',
                        padding: '.55rem .55rem', marginBottom: '.25rem',
                        background: isHovered ? 'var(--elev)' : 'transparent',
                        border: '1px solid', borderColor: isHovered ? phase.color : 'transparent',
                        borderLeft: `3px solid ${phase.color}`,
                        borderRadius: 'var(--r)', cursor: 'pointer',
                        transition: 'all .15s',
                      }}>
                      <div style={{
                        width: 22, height: 22, borderRadius: '50%',
                        background: phase.color, color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '.72rem', fontWeight: 800, flexShrink: 0,
                      }}>{idx}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--t1)', lineHeight: 1.25 }}>
                          {phase.name}
                          {phase.isFestival && <span style={{ marginLeft: '.3rem', color: '#ef6b6b' }}>{'★'}</span>}
                        </div>
                        <div style={{ fontSize: '.64rem', color: 'var(--t3)', marginTop: '.15rem', display: 'flex', gap: '.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                          <span>{monthsLong[phase.startMonth - 1]}{phase.startMonth !== phase.endMonth && ` – ${monthsLong[phase.endMonth - 1]}`}</span>
                          {team && <span style={{ color: team.color, fontWeight: 600 }}>· {team.label}</span>}
                        </div>
                        {phase.tasks.length > 0 && (
                          <div style={{ marginTop: '.35rem', display: 'flex', alignItems: 'center', gap: '.35rem' }}>
                            <div style={{ flex: 1, height: 3, background: 'var(--bg)', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ width: `${progress}%`, height: '100%', background: phase.color }} />
                            </div>
                            <span style={{ fontSize: '.6rem', color: 'var(--t3)' }}>{phase.tasks.filter(t => t.done).length}/{phase.tasks.length}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
          {numberedPhases.length === 0 && (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--t3)', fontSize: '.8rem' }}>
              Ei vaiheita valitulle tiimille.
            </div>
          )}
        </div>
      </div>

      {renderEditModal()}

      <style jsx>{`
        @media (max-width: 900px) {
          .yearwheel-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </>
  );

  // --- Edit modal renderer ---
  function renderEditModal() {
    if (!showForm) return null;
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowForm(false)}>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '2rem', width: 520, maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', marginBottom: '1.25rem' }}>{editId ? 'Muokkaa vaihetta' : 'Lisää vaihe'}</h3>
          <div className="field"><label>Nimi *</label><input className="input" value={formName} onChange={e => setFormName(e.target.value)} autoFocus /></div>
          <div className="field"><label>Kuvaus</label><textarea className="input textarea" value={formDesc} onChange={e => setFormDesc(e.target.value)} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
            <div className="field"><label>Alkukuukausi</label>
              <select className="input" value={formStart} onChange={e => setFormStart(e.target.value)}>
                {monthsLong.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div className="field"><label>Loppukuukausi</label>
              <select className="input" value={formEnd} onChange={e => setFormEnd(e.target.value)}>
                {monthsLong.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
            </div>
          </div>
          <div className="field"><label>Tiimi / vastuu</label>
            <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
              {Object.entries(TEAMS).map(([k, t]) => {
                const active = formTeam === k;
                return (
                  <button key={k} type="button" onClick={() => { setFormTeam(k); if (!editId) setFormColor(t.color); }}
                    style={{
                      fontSize: '.72rem', padding: '.4rem .7rem', borderRadius: 9999,
                      background: active ? t.color : 'var(--elev)',
                      color: active ? '#fff' : 'var(--t2)',
                      border: `1px solid ${active ? t.color : 'var(--border)'}`,
                      fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '.35rem',
                    }}>
                    <span style={{ fontSize: '.85rem', lineHeight: 1 }}>{t.icon}</span>
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="field"><label>Kategoria</label>
            <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
              {categoryOrder.map(k => {
                const v = categoryColors[k];
                const active = formCategory === k;
                return (
                  <button key={k} type="button" onClick={() => setFormCategory(k)} style={{
                    fontSize: '.72rem', padding: '.4rem .7rem', borderRadius: 9999,
                    background: active ? v.color : 'var(--elev)',
                    color: active ? '#fff' : 'var(--t2)',
                    border: `1px solid ${active ? v.color : 'var(--border)'}`,
                    fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '.35rem',
                  }}>
                    <span style={{ fontSize: '.92rem', lineHeight: 1 }}>{v.icon}</span>
                    {v.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="field"><label>Väri</label>
            <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
              {['#056b9f', '#185e5b', '#e45c81', '#f1b434', '#f09a52', '#9b7cf6', '#2a8a86', '#ef6b6b', '#6b48c4', '#3788b2'].map(c => (
                <div key={c} onClick={() => setFormColor(c)} style={{
                  width: 32, height: 32, borderRadius: 'var(--r)', background: c, cursor: 'pointer',
                  border: formColor === c ? '2px solid #fff' : '2px solid transparent',
                  boxShadow: formColor === c ? '0 0 0 2px var(--pri)' : 'none',
                }} />
              ))}
            </div>
          </div>
          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={formIsFestival} onChange={e => setFormIsFestival(e.target.checked)} style={{ width: 16, height: 16 }} />
              <span>Tämä on festivaaliviikko (käytetään viikkolaskurissa)</span>
            </label>
          </div>
          <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
            {editId && <button className="btn btn-ghost btn-sm" onClick={() => { removePhase(editId); setShowForm(false); }} style={{ color: 'var(--red)', marginRight: 'auto' }}>Poista</button>}
            <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Peruuta</button>
            <button className="btn btn-primary" onClick={savePhase} disabled={!formName.trim()}>Tallenna</button>
          </div>
        </div>
      </div>
    );
  }
}
