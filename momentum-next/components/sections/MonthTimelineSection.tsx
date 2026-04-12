'use client';

import { useState } from 'react';
import {
  YearPhase,
  categoryColors,
  categoryOrder,
  parseLocalDate,
  phaseStartDate,
  phaseEndDate,
} from '@/lib/yearwheel-shared';

interface Props {
  phases: YearPhase[];
  setPhases: (v: YearPhase[] | ((prev: YearPhase[]) => YearPhase[])) => void;
}

// Generate day columns for a date range
function getDays(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  const d = new Date(start);
  while (d <= end) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

const DAY_NAMES = ['su', 'ma', 'ti', 'ke', 'to', 'pe', 'la'];

export default function MonthTimelineSection({ phases, setPhases }: Props) {
  const [expandedPhase, setExpandedPhase] = useState<string | null>(null);

  // Determine date range from phases (with padding)
  const year = 2026;
  let rangeStart = new Date(year, 3, 12); // April 12
  let rangeEnd = new Date(year, 4, 2);     // May 2

  // Extend range if phases go beyond
  phases.forEach(p => {
    const ps = phaseStartDate(p, year);
    const pe = phaseEndDate(p, year);
    if (ps < rangeStart) rangeStart = ps;
    if (pe > rangeEnd) rangeEnd = pe;
  });

  const days = getDays(rangeStart, rangeEnd);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Group days by week number
  const weeks: { weekNum: number; days: Date[] }[] = [];
  let currentWeek: Date[] = [];
  let currentWeekNum = -1;
  days.forEach(d => {
    const wn = getWeekNumber(d);
    if (wn !== currentWeekNum) {
      if (currentWeek.length > 0) weeks.push({ weekNum: currentWeekNum, days: currentWeek });
      currentWeek = [d];
      currentWeekNum = wn;
    } else {
      currentWeek.push(d);
    }
  });
  if (currentWeek.length > 0) weeks.push({ weekNum: currentWeekNum, days: currentWeek });

  const toggleTask = (phaseId: string, taskId: string) => {
    setPhases(prev => prev.map(p =>
      p.id === phaseId
        ? { ...p, tasks: p.tasks.map(t => t.id === taskId ? { ...t, done: !t.done } : t) }
        : p
    ));
  };

  // Sort phases by start date
  const sorted = [...phases].sort((a, b) => {
    const aStart = phaseStartDate(a, year).getTime();
    const bStart = phaseStartDate(b, year).getTime();
    return aStart - bStart;
  });

  return (
    <div>
      {/* Today indicator */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(5,107,159,.06), rgba(45,212,160,.04))',
        border: '1px solid rgba(5,107,159,.15)', borderRadius: 'var(--rl)',
        padding: '.85rem 1.25rem', marginBottom: '1.25rem',
        display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: '.6rem', color: 'var(--t3)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.05em' }}>Tänään</div>
          <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--pri-l)' }}>{formatFinnishDate(today)}</div>
        </div>
        <div>
          <div style={{ fontSize: '.6rem', color: 'var(--t3)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.05em' }}>Juhlapäivään</div>
          <div style={{ fontSize: '1rem', fontWeight: 800, color: '#ef6b6b' }}>
            {Math.max(0, Math.ceil((new Date(2026, 3, 25).getTime() - today.getTime()) / 86400000))} päivää
          </div>
        </div>
        <div>
          <div style={{ fontSize: '.6rem', color: 'var(--t3)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.05em' }}>Vaiheita</div>
          <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--t1)' }}>{phases.length}</div>
        </div>
        <div>
          <div style={{ fontSize: '.6rem', color: 'var(--t3)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.05em' }}>Tehtäviä</div>
          <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--t1)' }}>
            {phases.reduce((s, p) => s + p.tasks.filter(t => t.done).length, 0)}/{phases.reduce((s, p) => s + p.tasks.length, 0)}
          </div>
        </div>
      </div>

      {/* Gantt-style timeline */}
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)',
        padding: '1.25rem', overflowX: 'auto',
      }}>
        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: `180px repeat(${days.length}, minmax(32px, 1fr))`, gap: 0, marginBottom: '.25rem', minWidth: 180 + days.length * 32 }}>
          <div />
          {days.map((d, i) => {
            const isToday = d.getTime() === today.getTime();
            const isPartyDay = d.getDate() === 25 && d.getMonth() === 3;
            const isSunday = d.getDay() === 0;
            const isMonday = d.getDay() === 1;
            return (
              <div key={i} style={{
                padding: '.25rem .1rem', textAlign: 'center',
                borderRight: isSunday ? '2px solid var(--border)' : '1px solid var(--border)',
                borderLeft: i === 0 ? '1px solid var(--border)' : 'none',
                background: isToday ? 'rgba(5,107,159,.1)' : isPartyDay ? 'rgba(239,107,107,.08)' : 'transparent',
              }}>
                <div style={{
                  fontSize: '.55rem', fontWeight: 600,
                  color: isToday ? 'var(--pri-l)' : isPartyDay ? '#ef6b6b' : isSunday ? 'var(--red)' : 'var(--t3)',
                  textTransform: 'uppercase',
                }}>{DAY_NAMES[d.getDay()]}</div>
                <div style={{
                  fontSize: '.72rem', fontWeight: isToday || isPartyDay ? 800 : 600,
                  color: isToday ? 'var(--pri-l)' : isPartyDay ? '#ef6b6b' : 'var(--t2)',
                }}>{d.getDate()}</div>
                {d.getMonth() !== days[Math.max(0, i - 1)]?.getMonth() && (
                  <div style={{ fontSize: '.5rem', color: 'var(--t3)', fontWeight: 700 }}>
                    {d.getMonth() === 3 ? 'HUH' : 'TOU'}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Phase bars */}
        {sorted.map(phase => {
          const pStart = phaseStartDate(phase, year);
          const pEnd = phaseEndDate(phase, year);
          const catDef = categoryColors[phase.category];
          const progress = phase.tasks.length > 0
            ? Math.round(phase.tasks.filter(t => t.done).length / phase.tasks.length * 100)
            : 0;
          const isExpanded = expandedPhase === phase.id;

          return (
            <div key={phase.id}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `180px repeat(${days.length}, minmax(32px, 1fr))`,
                  gap: 0, marginBottom: '.15rem',
                  minWidth: 180 + days.length * 32,
                  cursor: 'pointer',
                }}
                onClick={() => setExpandedPhase(isExpanded ? null : phase.id)}
              >
                {/* Phase label */}
                <div style={{
                  padding: '.5rem .4rem', display: 'flex', alignItems: 'center', gap: '.35rem',
                }}>
                  <div style={{ width: 4, height: 28, background: phase.color, borderRadius: 2, flexShrink: 0 }} />
                  <div style={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '.72rem', fontWeight: 700, overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--t1)',
                    }}>
                      {phase.isFestival && <span style={{ color: '#ef6b6b', marginRight: '.2rem' }}>{'★'}</span>}
                      {phase.name}
                    </div>
                    <div style={{ fontSize: '.58rem', color: catDef.color, fontWeight: 600, textTransform: 'uppercase' }}>
                      {catDef.label} · {progress}%
                    </div>
                  </div>
                </div>

                {/* Day cells */}
                {days.map((d, i) => {
                  const dayTime = d.getTime();
                  const inPhase = dayTime >= pStart.getTime() && dayTime <= pEnd.getTime();
                  const isFirst = dayTime === pStart.getTime();
                  const isLast = dayTime === pEnd.getTime();
                  const isToday = dayTime === today.getTime();
                  const isPartyDay = d.getDate() === 25 && d.getMonth() === 3;
                  const isSunday = d.getDay() === 0;

                  return (
                    <div key={i} style={{
                      padding: '.5rem .05rem', display: 'flex', alignItems: 'center',
                      background: isToday ? 'rgba(5,107,159,.06)' : isPartyDay ? 'rgba(239,107,107,.04)' : 'transparent',
                      borderRight: isSunday ? '2px solid var(--border)' : '1px solid var(--border)',
                      borderLeft: i === 0 ? '1px solid var(--border)' : 'none',
                    }}>
                      {inPhase && (
                        <div style={{
                          height: 22, width: '100%', background: phase.color,
                          borderTopLeftRadius: isFirst ? 4 : 0, borderBottomLeftRadius: isFirst ? 4 : 0,
                          borderTopRightRadius: isLast ? 4 : 0, borderBottomRightRadius: isLast ? 4 : 0,
                          marginLeft: isFirst ? 2 : -1, marginRight: isLast ? 2 : -1,
                          position: 'relative',
                        }}>
                          {progress > 0 && (
                            <div style={{
                              position: 'absolute', bottom: 0, left: 0, height: 3,
                              width: `${progress}%`, background: 'rgba(255,255,255,.5)', borderRadius: 2,
                            }} />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Expanded task list */}
              {isExpanded && (
                <div style={{
                  marginLeft: 180, marginBottom: '.75rem', padding: '.75rem 1rem',
                  background: `${phase.color}08`, border: `1px solid ${phase.color}25`,
                  borderRadius: 'var(--r)',
                }}>
                  <div style={{ fontSize: '.72rem', color: 'var(--t2)', marginBottom: '.5rem', lineHeight: 1.5 }}>
                    {phase.desc}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
                    {phase.tasks.map(task => (
                      <div key={task.id} style={{
                        display: 'flex', alignItems: 'center', gap: '.5rem',
                        fontSize: '.75rem',
                      }}>
                        <input
                          type="checkbox"
                          checked={task.done}
                          onChange={() => toggleTask(phase.id, task.id)}
                          style={{ width: 15, height: 15, accentColor: phase.color, cursor: 'pointer', flexShrink: 0 }}
                        />
                        <span style={{
                          textDecoration: task.done ? 'line-through' : 'none',
                          color: task.done ? 'var(--t3)' : 'var(--t1)',
                          flex: 1,
                        }}>{task.text}</span>
                        {task.owner && (
                          <span style={{ fontSize: '.62rem', color: 'var(--t3)', fontWeight: 600, flexShrink: 0 }}>{task.owner}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {sorted.length === 0 && (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--t3)', fontSize: '.85rem' }}>
            Ei aikatauluvaiheita vielä.
          </div>
        )}
      </div>
    </div>
  );
}

function getWeekNumber(d: Date): number {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const week1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

function formatFinnishDate(d: Date): string {
  const days = ['su', 'ma', 'ti', 'ke', 'to', 'pe', 'la'];
  const months = ['tammikuuta', 'helmikuuta', 'maaliskuuta', 'huhtikuuta', 'toukokuuta', 'kesäkuuta',
    'heinäkuuta', 'elokuuta', 'syyskuuta', 'lokakuuta', 'marraskuuta', 'joulukuuta'];
  return `${days[d.getDay()]} ${d.getDate()}. ${months[d.getMonth()]} ${d.getFullYear()}`;
}
