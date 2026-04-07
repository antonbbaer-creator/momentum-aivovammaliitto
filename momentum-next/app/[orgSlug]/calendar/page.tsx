'use client';

import { useState } from 'react';
import AppShell from '@/components/AppShell';
import { useOrgData } from '@/lib/firestore';

interface CalEvent { id: number; t: string; ch: string; date: string; st: string; }

const months = ['Tammikuu','Helmikuu','Maaliskuu','Huhtikuu','Toukokuu','Kesäkuu','Heinäkuu','Elokuu','Syyskuu','Lokakuu','Marraskuu','Joulukuu'];
const weekdays = ['Ma','Ti','Ke','To','Pe','La','Su'];

export default function CalendarPage() {
  const [events, setEvents] = useOrgData<CalEvent[]>('events', []);
  const [org] = useOrgData<any>('org', { channels: [] });
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
  const startOffset = (firstDay === 0 ? 6 : firstDay - 1);

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const getEventsForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return events.filter(e => e.date === dateStr);
  };

  const openNew = (day?: number) => {
    setEditId(null); setFormTitle(''); setFormCh(''); setFormSt('suunniteltu');
    setFormDate(day ? `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : '');
    setShowForm(true);
  };
  const openEdit = (ev: CalEvent) => { setEditId(ev.id); setFormTitle(ev.t); setFormDate(ev.date); setFormCh(ev.ch); setFormSt(ev.st || 'suunniteltu'); setShowForm(true); };

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

  const statusColors: Record<string, string> = { suunniteltu: 'var(--pri)', valmis: 'var(--green)', julkaistu: 'var(--green-l)', peruttu: 'var(--red)' };

  return (
    <AppShell title="Kalenteri" subtitle={`${events.length} tapahtumaa`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
          <button className="btn btn-ghost" onClick={prevMonth}>{'\u2190'}</button>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 500, minWidth: 180, textAlign: 'center' }}>{months[month]} {year}</h2>
          <button className="btn btn-ghost" onClick={nextMonth}>{'\u2192'}</button>
        </div>
        <div style={{ display: 'flex', gap: '.5rem' }}>
          <div style={{ display: 'flex', background: 'var(--elev)', borderRadius: 'var(--r)', padding: '2px' }}>
            <button className={`cal-view-btn ${view === 'month' ? 'act' : ''}`} onClick={() => setView('month')}>Kuukausi</button>
            <button className={`cal-view-btn ${view === 'list' ? 'act' : ''}`} onClick={() => setView('list')}>Lista</button>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => openNew()}>+ Lisää</button>
        </div>
      </div>

      {view === 'month' && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)' }}>
            {weekdays.map(d => <div key={d} style={{ padding: '.6rem', textAlign: 'center', fontSize: '.72rem', fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase' }}>{d}</div>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {Array.from({ length: startOffset }, (_, i) => <div key={`e${i}`} style={{ minHeight: 90, padding: '.5rem', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)' }} />)}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const dayEvents = getEventsForDay(day);
              const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();
              return (
                <div key={day} onClick={() => openNew(day)} style={{ minHeight: 90, padding: '.4rem', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)', cursor: 'pointer', background: isToday ? 'rgba(5,107,159,.04)' : 'transparent' }}>
                  <div style={{ fontSize: '.75rem', fontWeight: isToday ? 700 : 500, color: isToday ? 'var(--pri-l)' : 'var(--t2)', marginBottom: '.25rem' }}>{day}</div>
                  {dayEvents.slice(0, 3).map(ev => (
                    <div key={ev.id} onClick={e => { e.stopPropagation(); openEdit(ev); }} style={{
                      fontSize: '.62rem', padding: '.15rem .3rem', borderRadius: 3, marginBottom: '2px',
                      background: `${statusColors[ev.st] || 'var(--pri)'}20`, color: statusColors[ev.st] || 'var(--pri)',
                      fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{ev.t}</div>
                  ))}
                  {dayEvents.length > 3 && <div style={{ fontSize: '.58rem', color: 'var(--t3)' }}>+{dayEvents.length - 3}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view === 'list' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
          {events.sort((a, b) => a.date.localeCompare(b.date)).map(ev => (
            <div key={ev.id} onClick={() => openEdit(ev)} style={{
              display: 'flex', alignItems: 'center', gap: '1rem', padding: '.85rem 1.25rem',
              background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--r)', cursor: 'pointer',
            }}>
              <div style={{ width: 4, height: 32, borderRadius: 2, background: statusColors[ev.st] || 'var(--pri)', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '.88rem', fontWeight: 600 }}>{ev.t}</div>
                <div style={{ fontSize: '.72rem', color: 'var(--t3)' }}>{ev.date} {ev.ch && `\u00b7 ${ev.ch}`}</div>
              </div>
              <span style={{ fontSize: '.68rem', padding: '.2rem .5rem', borderRadius: 9999, background: `${statusColors[ev.st] || 'var(--pri)'}15`, color: statusColors[ev.st] || 'var(--pri)', fontWeight: 600 }}>{ev.st}</span>
              <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); deleteEvent(ev.id); }} style={{ color: 'var(--red)', fontSize: '.7rem' }}>{'\u00d7'}</button>
            </div>
          ))}
          {events.length === 0 && <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--t3)' }}>Ei tapahtumia. Lisää ensimmäinen ylhäältä.</div>}
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
                {(org.channels || []).map((ch: any) => <option key={ch.name} value={ch.name}>{ch.name}</option>)}
              </select>
            </div>
            <div className="field"><label>Tila</label>
              <select className="input" value={formSt} onChange={e => setFormSt(e.target.value)}>
                <option value="suunniteltu">Suunniteltu</option><option value="valmis">Valmis</option><option value="julkaistu">Julkaistu</option><option value="peruttu">Peruttu</option>
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
    </AppShell>
  );
}
