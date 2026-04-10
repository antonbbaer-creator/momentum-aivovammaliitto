'use client';

import { useState } from 'react';
import { useOrgData } from '@/lib/firestore';
import {
  YearPhase,
  categoryColors,
  categoryOrder,
  TEAMS,
  months,
  monthsLong,
  defaultLlffYearwheel,
  normalizePhase,
} from '@/lib/yearwheel-shared';

interface Props {
  phases?: YearPhase[];
  setPhases?: (v: YearPhase[] | ((prev: YearPhase[]) => YearPhase[])) => void;
}

export default function PhaseTimelineSection({ phases: propPhases, setPhases: propSet }: Props) {
  const [ownRaw] = useOrgData<YearPhase[]>('yearwheel', defaultLlffYearwheel);
  const rawPhases = propPhases ?? ownRaw;
  const phases: YearPhase[] = rawPhases.map(normalizePhase);
  const [teamFilter, setTeamFilter] = useState<string>('all');

  const filteredPhases = teamFilter === 'all' ? phases : phases.filter(p => p.team === teamFilter);
  const currentMonth = new Date().getMonth() + 1;

  // Group by category
  const grouped = categoryOrder.map(cat => ({
    cat,
    phases: [...filteredPhases].filter(p => p.category === cat).sort((a, b) => a.startMonth - b.startMonth),
  }));

  return (
    <>
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

      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.5rem', overflowX: 'auto' }}>
        {/* Month headers */}
        <div style={{ display: 'grid', gridTemplateColumns: '200px repeat(12, 1fr)', gap: 0, marginBottom: '.5rem', minWidth: 920 }}>
          <div />
          {months.map((m, i) => {
            const isCurrent = i + 1 === currentMonth;
            return (
              <div key={m} style={{
                padding: '.5rem .25rem', textAlign: 'center',
                fontSize: '.68rem', fontWeight: isCurrent ? 700 : 500,
                color: isCurrent ? 'var(--pri-l)' : 'var(--t3)',
                fontFamily: 'var(--font-display)', letterSpacing: '.05em',
                borderBottom: '1px solid var(--border)',
                borderLeft: i === 0 ? '1px solid var(--border)' : 'none',
                borderRight: '1px solid var(--border)',
                background: isCurrent ? 'rgba(5,107,159,.05)' : 'transparent',
              }}>{m.toUpperCase()}</div>
            );
          })}
        </div>

        {/* Grouped by category */}
        {grouped.map(g => {
          if (g.phases.length === 0) return null;
          const catDef = categoryColors[g.cat];
          return (
            <div key={g.cat} style={{ marginBottom: '1.25rem' }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '.4rem',
                padding: '.3rem .6rem', borderRadius: 'var(--r)',
                background: catDef.bg, color: catDef.color,
                fontSize: '.68rem', fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '.05em',
                marginBottom: '.5rem',
              }}>
                <span style={{ fontSize: '.92rem', lineHeight: 1 }}>{catDef.icon}</span>
                {catDef.label} ({g.phases.length})
              </div>
              {g.phases.map(phase => {
                const span = phase.endMonth - phase.startMonth + 1;
                const progress = phase.tasks.length > 0 ? Math.round(phase.tasks.filter(t => t.done).length / phase.tasks.length * 100) : 0;
                const team = TEAMS[phase.team];
                return (
                  <div key={phase.id} style={{ display: 'grid', gridTemplateColumns: '200px repeat(12, 1fr)', gap: 0, marginBottom: '.4rem', minWidth: 920 }}>
                    <div style={{ padding: '.5rem .5rem', fontSize: '.75rem', fontWeight: 600, color: 'var(--t2)', display: 'flex', alignItems: 'center', gap: '.4rem' }}>
                      <div style={{ width: 4, height: 20, background: phase.color, borderRadius: 2, flexShrink: 0 }} />
                      <div style={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '.75rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {phase.name}
                          {phase.isFestival && <span style={{ marginLeft: '.25rem', color: '#ef6b6b' }}>{'★'}</span>}
                        </div>
                        {team && <div style={{ fontSize: '.6rem', color: team.color, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>{team.label}</div>}
                      </div>
                    </div>
                    {Array.from({ length: 12 }).map((_, i) => {
                      const monthNum = i + 1;
                      const inPhase = monthNum >= phase.startMonth && monthNum <= phase.endMonth;
                      const isStart = monthNum === phase.startMonth;
                      const isEnd = monthNum === phase.endMonth;
                      const isCurrent = monthNum === currentMonth;
                      return (
                        <div key={i} style={{
                          padding: '.5rem .15rem', display: 'flex', alignItems: 'center',
                          background: isCurrent ? 'rgba(5,107,159,.05)' : 'transparent',
                          borderRight: '1px solid var(--border)',
                          borderLeft: i === 0 ? '1px solid var(--border)' : 'none',
                        }}>
                          {inPhase && (
                            <div style={{
                              height: 26, width: '100%', background: phase.color,
                              borderTopLeftRadius: isStart ? 4 : 0, borderBottomLeftRadius: isStart ? 4 : 0,
                              borderTopRightRadius: isEnd ? 4 : 0, borderBottomRightRadius: isEnd ? 4 : 0,
                              marginLeft: isStart ? 0 : -1, marginRight: isEnd ? 0 : -1,
                              position: 'relative',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '.6rem', color: '#fff', fontWeight: 700,
                            }}>
                              {isStart && span >= 2 && `${progress}%`}
                              {progress > 0 && (
                                <div style={{ position: 'absolute', bottom: 0, left: 0, height: 3, width: `${progress}%`, background: 'rgba(255,255,255,.5)', borderRadius: 2 }} />
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })}

        {filteredPhases.length === 0 && <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--t3)' }}>Ei vaiheita valitulle tiimille.</div>}
      </div>
    </>
  );
}
