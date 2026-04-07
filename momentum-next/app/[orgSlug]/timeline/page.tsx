'use client';

import { useState } from 'react';
import AppShell from '@/components/AppShell';
import { useOrgData } from '@/lib/firestore';
import { useToast } from '@/lib/toast';

interface TimelineItem { id: number; title: string; startDate: string; endDate: string; assignee: string; status: 'planned' | 'active' | 'done' | 'late'; }
interface TimelinePhase { id: number; name: string; color: string; startDate: string; endDate: string; items: TimelineItem[]; }
interface TimelineData { phases: TimelinePhase[]; }

const statusLabels: Record<string, string> = { planned: 'Suunniteltu', active: 'Käynnissä', done: 'Valmis', late: 'Myöhässä' };
const statusColors: Record<string, string> = { planned: 'var(--pri)', active: 'var(--yellow)', done: 'var(--green)', late: 'var(--red)' };
const phaseColors = ['#056b9f', '#185e5b', '#e45c81', '#f09a52', '#9b7cf6', '#2a8a86'];

export default function TimelinePage() {
  const { toast } = useToast();
  const [data, setData] = useOrgData<TimelineData>('timeline', { phases: [] });
  const [expandedPhase, setExpandedPhase] = useState<number | null>(null);
  const [newPhaseName, setNewPhaseName] = useState('');
  const [newPhaseStart, setNewPhaseStart] = useState('');
  const [newPhaseEnd, setNewPhaseEnd] = useState('');
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemStart, setNewItemStart] = useState('');
  const [newItemEnd, setNewItemEnd] = useState('');
  const [newItemAssignee, setNewItemAssignee] = useState('');
  const [view, setView] = useState<'list' | 'timeline'>('list');

  const addPhase = () => {
    if (!newPhaseName.trim()) return;
    setData(prev => ({
      ...prev, phases: [...prev.phases, {
        id: Date.now(), name: newPhaseName.trim(), color: phaseColors[prev.phases.length % phaseColors.length],
        startDate: newPhaseStart, endDate: newPhaseEnd, items: []
      }]
    }));
    setNewPhaseName(''); setNewPhaseStart(''); setNewPhaseEnd('');
    toast('Vaihe lisätty', 'success');
  };

  const deletePhase = (phaseId: number) => {
    setData(prev => ({ ...prev, phases: prev.phases.filter(p => p.id !== phaseId) }));
    toast('Vaihe poistettu', 'success');
  };

  const addItem = (phaseId: number) => {
    if (!newItemTitle.trim()) return;
    setData(prev => ({
      ...prev, phases: prev.phases.map(p => p.id === phaseId ? {
        ...p, items: [...p.items, { id: Date.now(), title: newItemTitle.trim(), startDate: newItemStart || p.startDate, endDate: newItemEnd || p.endDate, assignee: newItemAssignee, status: 'planned' as const }]
      } : p)
    }));
    setNewItemTitle(''); setNewItemStart(''); setNewItemEnd(''); setNewItemAssignee('');
    toast('Tehtävä lisätty', 'success');
  };

  const updateItemStatus = (phaseId: number, itemId: number, status: TimelineItem['status']) => {
    setData(prev => ({
      ...prev, phases: prev.phases.map(p => p.id === phaseId ? {
        ...p, items: p.items.map(i => i.id === itemId ? { ...i, status } : i)
      } : p)
    }));
  };

  const deleteItem = (phaseId: number, itemId: number) => {
    setData(prev => ({
      ...prev, phases: prev.phases.map(p => p.id === phaseId ? {
        ...p, items: p.items.filter(i => i.id !== itemId)
      } : p)
    }));
  };

  // Timeline visualization helpers
  const allDates = data.phases.flatMap(p => [p.startDate, p.endDate, ...p.items.flatMap(i => [i.startDate, i.endDate])]).filter(Boolean).sort();
  const minDate = allDates[0] || new Date().toISOString().slice(0, 10);
  const maxDate = allDates[allDates.length - 1] || new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
  const totalDays = Math.max(1, (new Date(maxDate).getTime() - new Date(minDate).getTime()) / 86400000);

  const getBarStyle = (start: string, end: string, color: string) => {
    if (!start || !end) return { left: '0%', width: '100%', background: color };
    const s = (new Date(start).getTime() - new Date(minDate).getTime()) / 86400000;
    const e = (new Date(end).getTime() - new Date(minDate).getTime()) / 86400000;
    return { left: (s / totalDays * 100) + '%', width: Math.max(1, ((e - s) / totalDays * 100)) + '%', background: color };
  };

  const totalItems = data.phases.reduce((s, p) => s + p.items.length, 0);
  const doneItems = data.phases.reduce((s, p) => s + p.items.filter(i => i.status === 'done').length, 0);

  return (
    <AppShell title="Aikataulu" subtitle={`${data.phases.length} vaihetta, ${totalItems} tehtävää`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {totalItems > 0 && <span style={{ fontSize: '.85rem', color: 'var(--t2)' }}>{doneItems}/{totalItems} valmis ({totalItems > 0 ? Math.round(doneItems / totalItems * 100) : 0}%)</span>}
        </div>
        <div style={{ display: 'flex', background: 'var(--elev)', borderRadius: 'var(--r)', padding: '2px' }}>
          <button className={`cal-view-btn ${view === 'list' ? 'act' : ''}`} onClick={() => setView('list')}>Lista</button>
          <button className={`cal-view-btn ${view === 'timeline' ? 'act' : ''}`} onClick={() => setView('timeline')}>Aikajana</button>
        </div>
      </div>

      {/* Timeline view */}
      {view === 'timeline' && data.phases.length > 0 && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.5rem', marginBottom: '1.5rem', overflowX: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.68rem', color: 'var(--t3)', marginBottom: '1rem' }}>
            <span>{minDate}</span><span>{maxDate}</span>
          </div>
          {data.phases.map(phase => (
            <div key={phase.id} style={{ marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '.78rem', fontWeight: 700, marginBottom: '.5rem', color: phase.color }}>{phase.name}</div>
              {/* Phase bar */}
              <div style={{ position: 'relative', height: 8, background: 'var(--elev)', borderRadius: 4, marginBottom: '.5rem' }}>
                <div style={{ position: 'absolute', height: '100%', borderRadius: 4, opacity: 0.3, ...getBarStyle(phase.startDate, phase.endDate, phase.color) }} />
              </div>
              {/* Item bars */}
              {phase.items.map(item => (
                <div key={item.id} style={{ position: 'relative', height: 20, marginBottom: '.25rem' }}>
                  <div style={{ position: 'absolute', height: '100%', borderRadius: 3, display: 'flex', alignItems: 'center', paddingLeft: '.4rem', fontSize: '.62rem', fontWeight: 600, color: '#fff', overflow: 'hidden', whiteSpace: 'nowrap', ...getBarStyle(item.startDate, item.endDate, statusColors[item.status] || phase.color) }}>
                    {item.title}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* List view / Phase cards */}
      {data.phases.map(phase => {
        const isExpanded = expandedPhase === phase.id;
        const phaseComplete = phase.items.length > 0 ? Math.round(phase.items.filter(i => i.status === 'done').length / phase.items.length * 100) : 0;
        return (
          <div key={phase.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', marginBottom: '1rem', borderLeft: `3px solid ${phase.color}` }}>
            <div onClick={() => setExpandedPhase(isExpanded ? null : phase.id)} style={{ padding: '1.25rem 1.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{ color: 'var(--t3)', transition: 'transform .2s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0)' }}>{'\u25b6'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '.95rem', fontWeight: 700 }}>{phase.name}</div>
                <div style={{ fontSize: '.72rem', color: 'var(--t3)' }}>
                  {phase.startDate && phase.endDate ? `${phase.startDate} — ${phase.endDate}` : 'Ei aikataulua'} {'\u00b7'} {phase.items.length} tehtävää
                </div>
              </div>
              {phase.items.length > 0 && <span style={{ fontSize: '.75rem', fontWeight: 700, color: phaseComplete === 100 ? 'var(--green)' : 'var(--t2)' }}>{phaseComplete}%</span>}
              <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); deletePhase(phase.id); }} style={{ color: 'var(--t3)', fontSize: '.7rem' }}>{'\u00d7'}</button>
            </div>

            {isExpanded && (
              <div style={{ padding: '0 1.5rem 1.25rem', borderTop: '1px solid var(--border)' }}>
                {phase.items.map(item => {
                  const isLate = item.endDate && new Date(item.endDate) < new Date() && item.status !== 'done';
                  const actualStatus = isLate && item.status !== 'done' ? 'late' : item.status;
                  return (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '.75rem', padding: '.6rem 0', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColors[actualStatus], flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '.85rem', fontWeight: 600 }}>{item.title}</div>
                        <div style={{ fontSize: '.68rem', color: 'var(--t3)' }}>
                          {item.startDate} — {item.endDate} {item.assignee && `\u00b7 ${item.assignee}`}
                        </div>
                      </div>
                      <select className="input" value={actualStatus === 'late' ? item.status : item.status} onChange={e => updateItemStatus(phase.id, item.id, e.target.value as any)}
                        style={{ width: 'auto', fontSize: '.72rem', padding: '.25rem .4rem', color: statusColors[actualStatus] }}>
                        {Object.entries(statusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                      <button className="btn btn-ghost btn-sm" onClick={() => deleteItem(phase.id, item.id)} style={{ color: 'var(--t3)', fontSize: '.65rem' }}>{'\u00d7'}</button>
                    </div>
                  );
                })}
                {/* Add item */}
                <div style={{ display: 'flex', gap: '.5rem', marginTop: '.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input className="input" placeholder="Tehtävä" value={newItemTitle} onChange={e => setNewItemTitle(e.target.value)} style={{ flex: 1, minWidth: 150, fontSize: '.82rem' }} />
                  <input className="input" type="date" placeholder="Alku" value={newItemStart} onChange={e => setNewItemStart(e.target.value)} style={{ width: 130, fontSize: '.82rem' }} />
                  <input className="input" type="date" placeholder="Loppu" value={newItemEnd} onChange={e => setNewItemEnd(e.target.value)} style={{ width: 130, fontSize: '.82rem' }} />
                  <input className="input" placeholder="Vastuuhenkilö" value={newItemAssignee} onChange={e => setNewItemAssignee(e.target.value)} style={{ width: 130, fontSize: '.82rem' }} />
                  <button className="btn btn-primary btn-sm" onClick={() => addItem(phase.id)} disabled={!newItemTitle.trim()}>+</button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Add phase */}
      <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginTop: '1rem', flexWrap: 'wrap' }}>
        <input className="input" placeholder="Uusi vaihe (esim. Esituotanto)" value={newPhaseName} onChange={e => setNewPhaseName(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
        <input className="input" type="date" placeholder="Alku" value={newPhaseStart} onChange={e => setNewPhaseStart(e.target.value)} style={{ width: 140 }} />
        <input className="input" type="date" placeholder="Loppu" value={newPhaseEnd} onChange={e => setNewPhaseEnd(e.target.value)} style={{ width: 140 }} />
        <button className="btn btn-primary" onClick={addPhase} disabled={!newPhaseName.trim()}>Lisää vaihe</button>
      </div>
    </AppShell>
  );
}
