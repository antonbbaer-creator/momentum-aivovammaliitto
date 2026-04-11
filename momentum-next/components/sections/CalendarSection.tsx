'use client';

import { useState, useRef } from 'react';
import { useOrgData } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import {
  YearPhase,
  TEAMS,
  categoryColors,
  monthsLong,
  normalizePhase,
  phaseStartDate,
  phaseEndDate,
  phaseWithDates,
  defaultLlffYearwheel,
} from '@/lib/yearwheel-shared';
import { OrgTeam, DEFAULT_LLFF_TEAMS } from '@/lib/team-shared';
import {
  CommsPlan,
  DEFAULT_LLFF_2026_PLAN,
  MONTHS_FI,
  normalizeCommsPlan,
  monthCoverageStatus,
  unifiedChannels,
} from '@/lib/comms-plan-shared';

interface CalEvent {
  id: number;
  t: string;
  ch: string;
  date: string;
  st: string;
  pubId?: string; // set by editor publish flow → links back to Publication
  kind?: string;  // 'publication' when created via editor
}

// Minimal Project shape for deadline rendering (avoid circular dep on ProjectsSection)
interface ProjectLite {
  id: number;
  t: string;
  deadline: string;
  archived?: boolean;
  teamId?: string;
}

// Minimal Publication shape (mirrors PublicationsSection)
interface PubLite {
  id: string;
  title: string;
  date: string | null;
  status: string;
  channels?: string[];
  category?: string;
}

interface Props {
  // Optional shared state (from hub)
  phases?: YearPhase[];
  setPhases?: (v: YearPhase[] | ((prev: YearPhase[]) => YearPhase[])) => void;
  events?: CalEvent[];
  setEvents?: (v: CalEvent[] | ((prev: CalEvent[]) => CalEvent[])) => void;
  // 'viestinta' = näytä vain viestintätiimin projektit + julkaisut. 'full' = kaikki (default).
  mode?: 'full' | 'viestinta';
  // Callback when a linked publication is clicked — used by Viestintä-hub to open the detail view.
  onOpenPublication?: (publicationId: string) => void;
  // Callback to switch to Plan tab (viestintä-mode: empty-month warning -> "Avaa suunnitelma")
  onOpenPlan?: () => void;
}

// Viestintätiimin ID — vastaa DEFAULT_LLFF_TEAMS:n id:tä
const VIESTINTA_TEAM_ID = 'viestinta';

const weekdays = ['Ma', 'Ti', 'Ke', 'To', 'Pe', 'La', 'Su'];
const statusColors: Record<string, string> = {
  suunniteltu: 'var(--pri)',
  valmis: 'var(--green)',
  julkaistu: 'var(--green-l)',
  peruttu: 'var(--red)',
};

export default function CalendarSection({ phases: propPhases, setPhases: propSetPhases, events: propEvents, setEvents: propSetEvents, mode = 'full', onOpenPublication, onOpenPlan }: Props) {
  const { canEdit } = useAuth();
  const { toast } = useToast();
  const [ownEvents, ownSetEvents] = useOrgData<CalEvent[]>('events', []);
  const [ownRawPhases, ownSetPhases] = useOrgData<YearPhase[]>('yearwheel', defaultLlffYearwheel);
  const [org] = useOrgData<any>('org', { channels: [] });
  const [projects] = useOrgData<ProjectLite[]>('projects', []);
  const [orgTeams] = useOrgData<OrgTeam[]>('orgTeams', DEFAULT_LLFF_TEAMS);
  const [publications] = useOrgData<PubLite[]>('publications', []);
  const [rawCommsPlan] = useOrgData<CommsPlan>('commsPlan', DEFAULT_LLFF_2026_PLAN);
  const commsPlan = normalizeCommsPlan(rawCommsPlan);
  const isViestinta = mode === 'viestinta';

  const rawPhases = propPhases ?? ownRawPhases;
  const setPhases = propSetPhases ?? ownSetPhases;
  const events = propEvents ?? ownEvents;
  const setEvents = propSetEvents ?? ownSetEvents;

  const phases: YearPhase[] = rawPhases.map(normalizePhase);

  const [view, setView] = useState<'month' | 'list'>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formCh, setFormCh] = useState('');
  const [formSt, setFormSt] = useState('suunniteltu');

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = firstDay === 0 ? 6 : firstDay - 1;

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const today = () => setCurrentDate(new Date());

  const getEventsForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    // Viestintä-tilassa: vain julkaisut (kind === 'publication'). Muuten kaikki.
    return events.filter(e => {
      if (e.date !== dateStr) return false;
      if (isViestinta && e.kind !== 'publication') return false;
      return true;
    });
  };

  const getProjectDeadlinesForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return projects.filter(p => {
      if (p.deadline !== dateStr) return false;
      if (p.archived) return false;
      if (isViestinta && p.teamId !== VIESTINTA_TEAM_ID) return false;
      return true;
    });
  };

  // Viestintä-tilassa lisänäkymä: julkaisut jotka eivät tule events-listasta (esim. luotu PublicationsSectionista suoraan)
  const getOrphanPublicationsForDay = (day: number) => {
    if (!isViestinta) return [] as PubLite[];
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    // Kerää pub-id:t joille on jo event
    const linkedIds = new Set((events || []).filter(e => e.kind === 'publication' && e.pubId).map(e => e.pubId));
    return (publications || []).filter(p =>
      p.date === dateStr &&
      (p.status === 'ready' || p.status === 'draft') &&
      !linkedIds.has(p.id)
    );
  };

  const getTeamColor = (teamId?: string): string => {
    if (!teamId) return 'var(--pri)';
    return orgTeams.find(t => t.id === teamId)?.color || 'var(--pri)';
  };

  const openNew = (day?: number) => {
    setEditId(null); setFormTitle(''); setFormCh(''); setFormSt('suunniteltu');
    setFormDate(day ? `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : '');
    setShowForm(true);
  };
  const openEdit = (ev: CalEvent) => {
    // If this event is linked to a Publication and we have a handler, open the publication detail view instead
    if (ev.kind === 'publication' && ev.pubId && onOpenPublication) {
      onOpenPublication(ev.pubId);
      return;
    }
    setEditId(ev.id); setFormTitle(ev.t); setFormDate(ev.date); setFormCh(ev.ch); setFormSt(ev.st || 'suunniteltu');
    setShowForm(true);
  };
  const saveEvent = () => {
    if (!formTitle.trim() || !formDate) return;
    if (editId) {
      setEvents(prev => prev.map(e => e.id === editId ? { ...e, t: formTitle.trim(), date: formDate, ch: formCh, st: formSt } : e));
    } else {
      setEvents(prev => [...prev, { id: Date.now(), t: formTitle.trim(), date: formDate, ch: formCh, st: formSt }]);
    }
    setShowForm(false);
  };
  const deleteEvent = (id: number) => setEvents(prev => prev.filter(e => e.id !== id));

  // --- Phase bar drag state ---
  type DragMode = 'move' | 'resize-start' | 'resize-end';
  interface DragState {
    phaseId: string;
    mode: DragMode;
    startX: number;
    origStart: Date;
    origEnd: Date;
    dayPx: number;
    previewStart: Date;
    previewEnd: Date;
  }
  const [dragState, setDragState] = useState<DragState | null>(null);
  const phaseLaneRef = useRef<HTMLDivElement>(null);

  // Phases that overlap this month (any part of startDate..endDate intersects current month)
  const monthFirst = new Date(year, month, 1);
  const monthLast = new Date(year, month + 1, 0);
  const phasesThisMonth = phases.filter(p => {
    const ps = phaseStartDate(p, year);
    const pe = phaseEndDate(p, year);
    return ps <= monthLast && pe >= monthFirst;
  });

  // Pack phases into rows so overlapping phases stack
  const laneRows: YearPhase[][] = [];
  for (const p of [...phasesThisMonth].sort((a, b) => phaseStartDate(a, year).getTime() - phaseStartDate(b, year).getTime())) {
    let placed = false;
    for (const row of laneRows) {
      if (row.every(rp => {
        const rps = phaseStartDate(rp, year);
        const rpe = phaseEndDate(rp, year);
        const pps = phaseStartDate(p, year);
        const ppe = phaseEndDate(p, year);
        return pps > rpe || ppe < rps;
      })) {
        row.push(p); placed = true; break;
      }
    }
    if (!placed) laneRows.push([p]);
  }

  const dayWidthPct = 100 / daysInMonth;

  // During drag, use preview dates for the dragged phase
  const getDisplayDates = (p: YearPhase): { start: Date; end: Date } => {
    if (dragState && dragState.phaseId === p.id) {
      return { start: dragState.previewStart, end: dragState.previewEnd };
    }
    return { start: phaseStartDate(p, year), end: phaseEndDate(p, year) };
  };

  const onPointerDown = (e: React.PointerEvent, p: YearPhase, mode: DragMode) => {
    if (!canEdit) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const laneRect = phaseLaneRef.current!.getBoundingClientRect();
    const dayPx = laneRect.width / daysInMonth;
    setDragState({
      phaseId: p.id,
      mode,
      startX: e.clientX,
      origStart: phaseStartDate(p, year),
      origEnd: phaseEndDate(p, year),
      dayPx,
      previewStart: phaseStartDate(p, year),
      previewEnd: phaseEndDate(p, year),
    });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragState) return;
    const deltaX = e.clientX - dragState.startX;
    const deltaDays = Math.round(deltaX / dragState.dayPx);
    const msPerDay = 86400000;
    let newStart = dragState.origStart;
    let newEnd = dragState.origEnd;
    if (dragState.mode === 'move') {
      newStart = new Date(dragState.origStart.getTime() + deltaDays * msPerDay);
      newEnd = new Date(dragState.origEnd.getTime() + deltaDays * msPerDay);
    } else if (dragState.mode === 'resize-start') {
      newStart = new Date(dragState.origStart.getTime() + deltaDays * msPerDay);
      if (newStart.getTime() >= newEnd.getTime()) newStart = new Date(newEnd.getTime() - msPerDay);
    } else if (dragState.mode === 'resize-end') {
      newEnd = new Date(dragState.origEnd.getTime() + deltaDays * msPerDay);
      if (newEnd.getTime() <= newStart.getTime()) newEnd = new Date(newStart.getTime() + msPerDay);
    }
    setDragState({ ...dragState, previewStart: newStart, previewEnd: newEnd });
  };

  const onPointerUp = () => {
    if (!dragState) return;
    const p = phases.find(pp => pp.id === dragState.phaseId);
    if (p) {
      setPhases(prev => prev.map(normalizePhase).map(pp => pp.id === dragState.phaseId ? phaseWithDates(pp, dragState.previewStart, dragState.previewEnd) : pp));
      toast('Vaihe päivitetty', 'success');
    }
    setDragState(null);
  };

  return (
    <>
      {/* Month navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '.75rem' }}>
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
          <button className="btn btn-ghost" onClick={prevMonth}>{'←'}</button>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 500, minWidth: 180, textAlign: 'center' }}>
            {monthsLong[month]} {year}
          </h2>
          <button className="btn btn-ghost" onClick={nextMonth}>{'→'}</button>
          <button className="btn btn-ghost btn-sm" onClick={today} style={{ marginLeft: '.5rem' }}>Tänään</button>
        </div>
        <div style={{ display: 'flex', gap: '.5rem' }}>
          <div style={{ display: 'flex', background: 'var(--elev)', borderRadius: 'var(--r)', padding: '2px' }}>
            <button className={`cal-view-btn ${view === 'month' ? 'act' : ''}`} onClick={() => setView('month')}>Kuukausi</button>
            <button className={`cal-view-btn ${view === 'list' ? 'act' : ''}`} onClick={() => setView('list')}>Lista</button>
          </div>
          {canEdit && !isViestinta && <button className="btn btn-primary btn-sm" onClick={() => openNew()}>+ Tapahtuma</button>}
        </div>
      </div>
      {isViestinta && (
        <div style={{
          marginBottom: '1rem', padding: '.6rem .85rem',
          background: 'var(--elev)', border: '1px solid var(--border)',
          borderRadius: 'var(--r)',
          fontSize: '.72rem', color: 'var(--t2)',
          display: 'flex', gap: '.5rem', alignItems: 'center',
        }}>
          <span style={{ color: 'var(--pri-l)', fontWeight: 700 }}>▶</span>
          <span>Viestinnän kalenteri — vain viestintätiimin projektit ja julkaisut. Luo uusi julkaisu Editori-välilehdeltä.</span>
        </div>
      )}
      {/* Viestintä-mode: empty-month / under-target warnings — tämä tai seuraava kuukausi */}
      {isViestinta && (() => {
        const m1 = month + 1;
        const m2 = m1 === 12 ? 1 : m1 + 1;
        const y2 = m1 === 12 ? year + 1 : year;
        const cov1 = monthCoverageStatus(commsPlan, publications, year, m1);
        const cov2 = monthCoverageStatus(commsPlan, publications, y2, m2);
        const warnings = [
          { cov: cov1, label: `Tämä kuu (${MONTHS_FI[m1 - 1]} ${year})` },
          { cov: cov2, label: `Seuraava kuu (${MONTHS_FI[m2 - 1]} ${y2})` },
        ].filter(w => w.cov.status === 'empty' || w.cov.status === 'under');
        if (warnings.length === 0) return null;
        return (
          <div style={{
            marginBottom: '1rem', padding: '.85rem 1rem',
            background: 'rgba(228,92,129,.08)',
            border: '1px solid rgba(228,92,129,.4)',
            borderRadius: 'var(--rl)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.55rem' }}>
              <span style={{ color: '#e45c81', fontWeight: 700, fontSize: '.85rem' }}>!</span>
              <strong style={{ fontSize: '.82rem', color: 'var(--t1)' }}>Viestintää ei ole suunniteltu riittävästi</strong>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.35rem', marginBottom: '.65rem' }}>
              {warnings.map((w, i) => (
                <div key={i} style={{ fontSize: '.74rem', color: 'var(--t2)', lineHeight: 1.5 }}>
                  <strong style={{ color: '#e45c81' }}>{w.label}:</strong> {w.cov.message}
                  {w.cov.target && w.cov.target.postsMax > 0 && (
                    <span style={{ color: 'var(--t3)', fontStyle: 'italic' }}> · {w.cov.target.focus}</span>
                  )}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
              {onOpenPlan && (
                <button className="btn btn-primary btn-sm" onClick={onOpenPlan}>
                  Avaa suunnitelma
                </button>
              )}
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
              >
                → Siirry seuraavaan kuuhun
              </button>
            </div>
          </div>
        );
      })()}

      {view === 'month' && (
        <>
          {/* === PHASE BAR LANE === */}
          {!isViestinta && phasesThisMonth.length > 0 && (
            <div style={{ marginBottom: '.75rem', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '.75rem' }}>
              <div style={{ fontSize: '.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--t3)', marginBottom: '.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Vuosikellon vaiheet tässä kuussa</span>
                {canEdit && <span style={{ opacity: .7, textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>Raahaa palkkia siirtääksesi · reunoista muuttaaksesi kestoa</span>}
              </div>
              {/* Day number header */}
              <div style={{ position: 'relative', height: 16, marginBottom: '.25rem' }}>
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();
                  return (
                    <div key={day} style={{
                      position: 'absolute', left: `${i * dayWidthPct}%`, width: `${dayWidthPct}%`,
                      textAlign: 'center', fontSize: '.55rem', color: isToday ? 'var(--pri-l)' : 'var(--t3)',
                      fontWeight: isToday ? 700 : 400,
                    }}>{day}</div>
                  );
                })}
              </div>
              <div
                ref={phaseLaneRef}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                style={{
                  position: 'relative',
                  background: 'var(--elev)', border: '1px solid var(--border)', borderRadius: 'var(--r)',
                  padding: 4, userSelect: 'none',
                }}>
                {/* Today vertical line */}
                {(() => {
                  const now = new Date();
                  if (now.getFullYear() !== year || now.getMonth() !== month) return null;
                  const todayLeft = ((now.getDate() - 1) * dayWidthPct) + dayWidthPct / 2;
                  return (
                    <div style={{
                      position: 'absolute', top: 0, bottom: 0,
                      left: `${todayLeft}%`, width: 2,
                      background: 'var(--pri-l)', opacity: .5,
                      pointerEvents: 'none', zIndex: 1,
                    }} />
                  );
                })()}
                {laneRows.map((row, rowIdx) => (
                  <div key={rowIdx} style={{ position: 'relative', height: 28, marginBottom: rowIdx < laneRows.length - 1 ? 4 : 0 }}>
                    {row.map(p => {
                      const { start, end } = getDisplayDates(p);
                      // Clamp to current month
                      const clampedStart = start < monthFirst ? monthFirst : start;
                      const clampedEnd = end > monthLast ? monthLast : end;
                      const startDay = clampedStart.getDate();
                      const endDay = clampedEnd.getDate();
                      const left = (startDay - 1) * dayWidthPct;
                      const width = (endDay - startDay + 1) * dayWidthPct;
                      const continuesLeft = start < monthFirst;
                      const continuesRight = end > monthLast;
                      const isDragging = dragState?.phaseId === p.id;
                      const team = TEAMS[p.team];
                      const cat = categoryColors[p.category];
                      return (
                        <div
                          key={p.id}
                          style={{
                            position: 'absolute', top: 0, bottom: 0,
                            left: `${left}%`, width: `${width}%`,
                            background: p.color,
                            borderRadius: 4,
                            borderTopLeftRadius: continuesLeft ? 0 : 4,
                            borderBottomLeftRadius: continuesLeft ? 0 : 4,
                            borderTopRightRadius: continuesRight ? 0 : 4,
                            borderBottomRightRadius: continuesRight ? 0 : 4,
                            display: 'flex', alignItems: 'center',
                            padding: '0 .4rem',
                            cursor: isDragging ? 'grabbing' : 'grab',
                            boxShadow: isDragging ? '0 4px 14px rgba(0,0,0,.3)' : 'none',
                            opacity: isDragging ? .92 : 1,
                            transition: isDragging ? 'none' : 'box-shadow .15s',
                            zIndex: isDragging ? 10 : 2,
                            userSelect: 'none',
                          }}
                          onPointerDown={e => {
                            // Middle = move, unless we detect an edge
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            const relX = e.clientX - rect.left;
                            const edge = 8;
                            if (!continuesLeft && relX < edge) onPointerDown(e, p, 'resize-start');
                            else if (!continuesRight && relX > rect.width - edge) onPointerDown(e, p, 'resize-end');
                            else onPointerDown(e, p, 'move');
                          }}
                        >
                          {continuesLeft && <span style={{ color: '#fff', fontSize: '.65rem', marginRight: 2 }}>{'←'}</span>}
                          {!continuesLeft && canEdit && (
                            <div style={{
                              position: 'absolute', left: 0, top: 0, bottom: 0, width: 6,
                              cursor: 'ew-resize',
                            }} onPointerDown={e => { e.stopPropagation(); onPointerDown(e, p, 'resize-start'); }} />
                          )}
                          <div style={{ flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', color: '#fff', fontSize: '.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '.3rem', pointerEvents: 'none' }}>
                            <span style={{ fontSize: '.82rem' }}>{cat.icon}</span>
                            <span>{p.name}</span>
                            {p.isFestival && <span style={{ marginLeft: '.15rem' }}>{'★'}</span>}
                          </div>
                          {!continuesRight && canEdit && (
                            <div style={{
                              position: 'absolute', right: 0, top: 0, bottom: 0, width: 6,
                              cursor: 'ew-resize',
                            }} onPointerDown={e => { e.stopPropagation(); onPointerDown(e, p, 'resize-end'); }} />
                          )}
                          {continuesRight && <span style={{ color: '#fff', fontSize: '.65rem', marginLeft: 2 }}>{'→'}</span>}
                        </div>
                      );
                    })}
                  </div>
                ))}
                {/* Drag preview text */}
                {dragState && (() => {
                  const p = phases.find(pp => pp.id === dragState.phaseId);
                  if (!p) return null;
                  const fmt = (d: Date) => `${d.getDate()}.${d.getMonth() + 1}.`;
                  return (
                    <div style={{
                      position: 'absolute', top: -22, right: 4,
                      background: 'var(--t1)', color: 'var(--bg)',
                      fontSize: '.62rem', fontWeight: 700,
                      padding: '.15rem .4rem', borderRadius: 4,
                      pointerEvents: 'none',
                    }}>
                      {fmt(dragState.previewStart)} – {fmt(dragState.previewEnd)}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* === MONTH GRID === */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)' }}>
              {weekdays.map(d => (
                <div key={d} style={{ padding: '.6rem', textAlign: 'center', fontSize: '.72rem', fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase' }}>{d}</div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
              {Array.from({ length: startOffset }, (_, i) => (
                <div key={`e${i}`} style={{ minHeight: 90, padding: '.5rem', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)' }} />
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1;
                const dayEvents = getEventsForDay(day);
                const dayDeadlines = getProjectDeadlinesForDay(day);
                const dayOrphanPubs = getOrphanPublicationsForDay(day);
                const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();
                const totalItems = dayEvents.length + dayDeadlines.length + dayOrphanPubs.length;
                return (
                  <div key={day} onClick={() => canEdit && openNew(day)} style={{
                    minHeight: 90, padding: '.4rem',
                    borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)',
                    cursor: canEdit ? 'pointer' : 'default',
                    background: isToday ? 'rgba(5,107,159,.04)' : 'transparent',
                    position: 'relative',
                  }}>
                    <div style={{ fontSize: '.75rem', fontWeight: isToday ? 700 : 500, color: isToday ? 'var(--pri-l)' : 'var(--t2)', marginBottom: '.25rem' }}>{day}</div>
                    {/* Project deadlines first, colored by team */}
                    {dayDeadlines.slice(0, 2).map(proj => {
                      const color = getTeamColor(proj.teamId);
                      return (
                        <div key={`proj-${proj.id}`} title={`Projekti-deadline: ${proj.t}`} style={{
                          fontSize: '.62rem', padding: '.15rem .3rem', borderRadius: 3, marginBottom: '2px',
                          background: `${color}18`,
                          color: color,
                          fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          borderLeft: `2px solid ${color}`,
                        }}>
                          {'●'} {proj.t}
                        </div>
                      );
                    })}
                    {/* Calendar events */}
                    {dayEvents.slice(0, Math.max(0, 3 - dayDeadlines.length)).map(ev => (
                      <div key={ev.id} onClick={e => { e.stopPropagation(); openEdit(ev); }} title={ev.kind === 'publication' ? `Julkaisu: ${ev.t}` : ev.t} style={{
                        fontSize: '.62rem', padding: '.15rem .3rem', borderRadius: 3, marginBottom: '2px',
                        background: `${statusColors[ev.st] || 'var(--pri)'}20`,
                        color: statusColors[ev.st] || 'var(--pri)',
                        fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        borderLeft: ev.kind === 'publication' ? `2px solid ${statusColors[ev.st] || 'var(--pri)'}` : undefined,
                      }}>
                        {ev.kind === 'publication' ? '▶ ' : ''}{ev.t}
                      </div>
                    ))}
                    {/* Orphan publications (no linked event) */}
                    {dayOrphanPubs.slice(0, Math.max(0, 3 - dayDeadlines.length - dayEvents.length)).map(pub => {
                      const color = pub.status === 'ready' ? statusColors.valmis : statusColors.suunniteltu;
                      return (
                        <div
                          key={`pub-${pub.id}`}
                          title={`Julkaisu: ${pub.title}`}
                          onClick={e => { e.stopPropagation(); if (onOpenPublication) onOpenPublication(pub.id); }}
                          style={{
                            fontSize: '.62rem', padding: '.15rem .3rem', borderRadius: 3, marginBottom: '2px',
                            background: `${color}20`,
                            color,
                            fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            borderLeft: `2px solid ${color}`,
                            cursor: onOpenPublication ? 'pointer' : 'default',
                          }}>
                          ▶ {pub.title}
                        </div>
                      );
                    })}
                    {totalItems > 3 && <div style={{ fontSize: '.58rem', color: 'var(--t3)' }}>+{totalItems - 3}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {view === 'list' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
          {[...events]
            .filter(e => !isViestinta || e.kind === 'publication')
            .sort((a, b) => a.date.localeCompare(b.date)).map(ev => (
            <div key={ev.id} onClick={() => openEdit(ev)} style={{
              display: 'flex', alignItems: 'center', gap: '1rem', padding: '.85rem 1.25rem',
              background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--r)', cursor: 'pointer',
            }}>
              <div style={{ width: 4, height: 32, borderRadius: 2, background: statusColors[ev.st] || 'var(--pri)', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '.88rem', fontWeight: 600 }}>{ev.t}</div>
                <div style={{ fontSize: '.72rem', color: 'var(--t3)' }}>{ev.date} {ev.ch && `· ${ev.ch}`}</div>
              </div>
              <span style={{ fontSize: '.68rem', padding: '.2rem .5rem', borderRadius: 9999, background: `${statusColors[ev.st] || 'var(--pri)'}15`, color: statusColors[ev.st] || 'var(--pri)', fontWeight: 600 }}>{ev.st}</span>
              {canEdit && <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); deleteEvent(ev.id); }} style={{ color: 'var(--red)', fontSize: '.7rem' }}>{'×'}</button>}
            </div>
          ))}
          {events.length === 0 && <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--t3)' }}>Ei tapahtumia.</div>}
        </div>
      )}

      {/* Event form modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowForm(false)}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '2rem', width: 420, maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', marginBottom: '1.25rem' }}>{editId ? 'Muokkaa tapahtumaa' : 'Uusi tapahtuma'}</h3>
            <div className="field"><label>Otsikko *</label><input className="input" value={formTitle} onChange={e => setFormTitle(e.target.value)} autoFocus /></div>
            <div className="field"><label>Päivämäärä *</label><input type="date" className="input" value={formDate} onChange={e => setFormDate(e.target.value)} /></div>
            <div className="field"><label>Kanava</label>
              <select className="input" value={formCh} onChange={e => setFormCh(e.target.value)}>
                <option value="">Ei kanavaa</option>
                {unifiedChannels(commsPlan, org.channels).map(ch => (
                  <option key={ch.name} value={ch.name}>{ch.name}</option>
                ))}
              </select>
            </div>
            <div className="field"><label>Tila</label>
              <select className="input" value={formSt} onChange={e => setFormSt(e.target.value)}>
                <option value="suunniteltu">Suunniteltu</option>
                <option value="valmis">Valmis</option>
                <option value="julkaistu">Julkaistu</option>
                <option value="peruttu">Peruttu</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end' }}>
              {editId && <button className="btn btn-ghost btn-sm" onClick={() => { deleteEvent(editId); setShowForm(false); }} style={{ color: 'var(--red)', marginRight: 'auto' }}>Poista</button>}
              <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Peruuta</button>
              <button className="btn btn-primary" onClick={saveEvent} disabled={!formTitle.trim() || !formDate}>Tallenna</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
