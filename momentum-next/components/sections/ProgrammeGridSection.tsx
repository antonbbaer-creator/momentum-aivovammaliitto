'use client';

import { useState } from 'react';
import { useOrgData } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { useIsMobile } from '@/lib/use-mobile';
import {
  FestivalWeek,
  ProgrammeItem,
  LLFF_FESTIVAL_WEEK_2026,
  LLFF_VENUES,
  DEFAULT_PROGRAMME,
  PROGRAMME_COLORS,
  dayLabelsShort,
  daysInFestivalWeek,
} from '@/lib/festival-shared';

export default function ProgrammeGridSection() {
  const { canEdit } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [festivalWeek, setFestivalWeek] = useOrgData<FestivalWeek>('festivalWeek', LLFF_FESTIVAL_WEEK_2026);
  const [programme, setProgramme] = useOrgData<ProgrammeItem[]>('programme', DEFAULT_PROGRAMME);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [prefillDate, setPrefillDate] = useState('');
  const [prefillVenue, setPrefillVenue] = useState('');
  const [showWeekConfig, setShowWeekConfig] = useState(false);

  // Form state
  const [fType, setFType] = useState<ProgrammeItem['type']>('film');
  const [fTitle, setFTitle] = useState('');
  const [fDesc, setFDesc] = useState('');
  const [fDate, setFDate] = useState('');
  const [fStart, setFStart] = useState('');
  const [fEnd, setFEnd] = useState('');
  const [fVenue, setFVenue] = useState('');

  const days = daysInFestivalWeek(festivalWeek);
  // Only show venues that are used on any day, or all festival venues if nothing set
  const activeVenues = festivalWeek.venues.length > 0 ? festivalWeek.venues : LLFF_VENUES;

  const openNew = (date?: string, venue?: string) => {
    setEditId(null); setFType('film'); setFTitle(''); setFDesc('');
    setFDate(date || festivalWeek.startDate);
    setFStart('18:00'); setFEnd('');
    setFVenue(venue || (activeVenues[0] || ''));
    setPrefillDate(date || ''); setPrefillVenue(venue || '');
    setShowForm(true);
  };
  const openEdit = (p: ProgrammeItem) => {
    setEditId(p.id); setFType(p.type); setFTitle(p.title); setFDesc(p.description || '');
    setFDate(p.date); setFStart(p.startTime); setFEnd(p.endTime || '');
    setFVenue(p.venue);
    setShowForm(true);
  };
  const save = () => {
    if (!fTitle.trim() || !fDate || !fStart || !fVenue) return;
    const item: ProgrammeItem = {
      id: editId || 'p_' + Date.now(),
      type: fType, title: fTitle.trim(), description: fDesc.trim() || undefined,
      date: fDate, startTime: fStart, endTime: fEnd || undefined, venue: fVenue,
    };
    if (editId) setProgramme(prev => prev.map(p => p.id === editId ? item : p));
    else setProgramme(prev => [...prev, item]);
    setShowForm(false);
    toast(editId ? 'Tapahtuma päivitetty' : 'Tapahtuma lisätty', 'success');
  };
  const remove = (id: string) => { setProgramme(prev => prev.filter(p => p.id !== id)); toast('Poistettu', 'success'); };

  const itemsFor = (date: string, venue: string) =>
    [...programme].filter(p => p.date === date && p.venue === venue).sort((a, b) => a.startTime.localeCompare(b.startTime));

  const toggleVenueOnDay = (date: string, venue: string) => {
    setFestivalWeek(prev => {
      const dayVenues = prev.venuesByDay[date] || [];
      const next = { ...prev.venuesByDay };
      if (dayVenues.includes(venue)) {
        next[date] = dayVenues.filter(v => v !== venue);
      } else {
        next[date] = [...dayVenues, venue];
      }
      return { ...prev, venuesByDay: next };
    });
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '.5rem' }}>
        <div>
          <div style={{ fontSize: '.92rem', fontWeight: 700 }}>
            Festivaaliviikko {new Date(festivalWeek.startDate).toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' })}–
            {new Date(festivalWeek.endDate).toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric', year: 'numeric' })}
          </div>
          <div style={{ fontSize: '.72rem', color: 'var(--t3)' }}>{programme.length} ohjelmanumeroa · {activeVenues.length} esityspaikkaa</div>
        </div>
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
          {canEdit && <button className="btn btn-ghost btn-sm" onClick={() => setShowWeekConfig(!showWeekConfig)}>{showWeekConfig ? 'Piilota asetukset' : 'Viikon asetukset'}</button>}
          {canEdit && <button className="btn btn-primary btn-sm" onClick={() => openNew()}>+ Uusi tapahtuma</button>}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1rem', flexWrap: 'wrap', fontSize: '.68rem', alignItems: 'center' }}>
        <span style={{ textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600, color: 'var(--t3)' }}>Tyypit:</span>
        {Object.entries(PROGRAMME_COLORS).map(([k, v]) => (
          <span key={k} style={{ fontSize: '.7rem', padding: '.25rem .65rem', borderRadius: 9999, background: v.bg, color: v.color, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '.3rem' }}>
            <span style={{ fontSize: '.88rem', lineHeight: 1 }}>{v.icon}</span>
            {v.label}
          </span>
        ))}
      </div>

      {/* Week config — venues per day */}
      {showWeekConfig && canEdit && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.25rem', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '.78rem', fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', marginBottom: '.75rem' }}>Esityspaikat päivittäin</h3>
          <p style={{ fontSize: '.72rem', color: 'var(--t3)', marginBottom: '.75rem' }}>
            Klikkaa esityspaikkaa päivän alta aktivoidaksesi tai poistaaksesi sen. Ke–To odottavat esityspaikan määrittämistä.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(3, 1fr)' : 'repeat(7, 1fr)', gap: '.5rem' }}>
            {days.map((date, i) => {
              const dayVenues = festivalWeek.venuesByDay[date] || [];
              return (
                <div key={date} style={{ background: 'var(--elev)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '.6rem' }}>
                  <div style={{ fontSize: '.7rem', fontWeight: 700, color: 'var(--t2)', marginBottom: '.4rem' }}>
                    {dayLabelsShort[i]} {new Date(date).getDate()}.{new Date(date).getMonth() + 1}.
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '.25rem' }}>
                    {LLFF_VENUES.map(v => {
                      const active = dayVenues.includes(v);
                      return (
                        <button key={v} onClick={() => toggleVenueOnDay(date, v)} style={{
                          fontSize: '.58rem', padding: '.2rem .35rem', borderRadius: 3,
                          background: active ? 'var(--pri)' : 'transparent',
                          color: active ? '#fff' : 'var(--t3)',
                          border: `1px solid ${active ? 'var(--pri)' : 'var(--border)'}`,
                          cursor: 'pointer', textAlign: 'left', fontWeight: active ? 700 : 500,
                        }}>
                          {v}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Grid: venues (rows) x days (cols) */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', overflow: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '140px repeat(7, minmax(120px, 1fr))', minWidth: 900 }}>
          {/* Day headers */}
          <div style={{ padding: '.75rem .75rem', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)', fontSize: '.65rem', fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase' }}>
            Paikat
          </div>
          {days.map((date, i) => {
            const d = new Date(date);
            const isFri = i === 4, isSat = i === 5, isSun = i === 6;
            const weekend = isFri || isSat || isSun;
            return (
              <div key={date} style={{
                padding: '.6rem .5rem', borderBottom: '1px solid var(--border)', borderRight: i < 6 ? '1px solid var(--border)' : 'none',
                textAlign: 'center', background: weekend ? 'rgba(239,107,107,.03)' : 'transparent',
              }}>
                <div style={{ fontSize: '.68rem', fontWeight: 700, color: weekend ? '#ef6b6b' : 'var(--t2)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                  {dayLabelsShort[i]}
                </div>
                <div style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--t1)', marginTop: '.1rem' }}>
                  {d.getDate()}.{d.getMonth() + 1}.
                </div>
              </div>
            );
          })}

          {/* Venue rows */}
          {activeVenues.map(venue => {
            // Check if this venue has any day slots
            const hasAnyDay = days.some(date => (festivalWeek.venuesByDay[date] || []).includes(venue));
            return (
              <>
                <div key={`${venue}-label`} style={{
                  padding: '.75rem', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)',
                  fontSize: '.72rem', fontWeight: 700, color: 'var(--t1)',
                  display: 'flex', alignItems: 'center',
                }}>
                  {venue}
                </div>
                {days.map((date, i) => {
                  const dayVenues = festivalWeek.venuesByDay[date] || [];
                  const venueActive = dayVenues.includes(venue);
                  const items = itemsFor(date, venue);
                  return (
                    <div key={`${venue}-${date}`} style={{
                      padding: '.4rem',
                      borderBottom: '1px solid var(--border)',
                      borderRight: i < 6 ? '1px solid var(--border)' : 'none',
                      background: venueActive ? 'transparent' : 'rgba(128,128,128,.04)',
                      minHeight: 80,
                      cursor: venueActive && canEdit ? 'pointer' : 'default',
                      display: 'flex', flexDirection: 'column', gap: '.25rem',
                    }}
                    onClick={() => venueActive && canEdit && items.length === 0 && openNew(date, venue)}>
                      {!venueActive && (
                        <div style={{ fontSize: '.58rem', color: 'var(--t3)', textAlign: 'center', opacity: .5, margin: 'auto 0' }}>
                          —
                        </div>
                      )}
                      {venueActive && items.length === 0 && canEdit && (
                        <div style={{ fontSize: '.58rem', color: 'var(--t3)', textAlign: 'center', margin: 'auto 0', opacity: .5 }}>
                          + Lisää
                        </div>
                      )}
                      {items.map(item => {
                        const col = PROGRAMME_COLORS[item.type];
                        return (
                          <div key={item.id} onClick={(e) => { e.stopPropagation(); canEdit && openEdit(item); }} style={{
                            background: col.bg,
                            borderLeft: `3px solid ${col.color}`,
                            padding: '.3rem .4rem', borderRadius: 3,
                            fontSize: '.6rem', cursor: canEdit ? 'pointer' : 'default',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '.25rem', color: col.color, fontWeight: 700 }}>
                              <span style={{ fontSize: '.72rem', lineHeight: 1 }}>{col.icon}</span>
                              <span>{item.startTime}</span>
                            </div>
                            <div style={{ color: 'var(--t1)', fontWeight: 600, marginTop: '.1rem', lineHeight: 1.25 }}>
                              {item.title}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </>
            );
          })}
        </div>
      </div>

      {programme.length === 0 && (
        <div style={{ marginTop: '1rem', fontSize: '.75rem', color: 'var(--t3)', textAlign: 'center' }}>
          Lisää ensimmäiset ohjelmanumerot klikkaamalla tyhjää solua tai "+ Uusi tapahtuma" -nappia.
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowForm(false)}>
          <div style={{ background: 'var(--card)', border: isMobile ? 'none' : '1px solid var(--border)', borderRadius: isMobile ? 0 : 'var(--rl)', padding: isMobile ? '1.25rem' : '2rem', width: isMobile ? '100%' : 480, maxWidth: isMobile ? '100%' : '90vw', height: isMobile ? '100%' : 'auto', maxHeight: isMobile ? '100%' : '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', marginBottom: '1.25rem' }}>{editId ? 'Muokkaa tapahtumaa' : 'Uusi tapahtuma'}</h3>
            <div className="field"><label>Tyyppi</label>
              <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
                {Object.entries(PROGRAMME_COLORS).map(([k, v]) => {
                  const active = fType === k;
                  return (
                    <button key={k} type="button" onClick={() => setFType(k as ProgrammeItem['type'])} style={{
                      fontSize: '.72rem', padding: '.4rem .7rem', borderRadius: 9999,
                      background: active ? v.color : 'var(--elev)',
                      color: active ? '#fff' : 'var(--t2)',
                      border: `1px solid ${active ? v.color : 'var(--border)'}`,
                      fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '.35rem',
                    }}>
                      <span style={{ fontSize: '.88rem' }}>{v.icon}</span>
                      {v.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="field"><label>Otsikko *</label><input className="input" value={fTitle} onChange={e => setFTitle(e.target.value)} autoFocus /></div>
            <div className="field"><label>Kuvaus</label><textarea className="input textarea" value={fDesc} onChange={e => setFDesc(e.target.value)} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: '.75rem' }}>
              <div className="field"><label>Päivä *</label>
                <select className="input" value={fDate} onChange={e => setFDate(e.target.value)}>
                  {days.map((d, i) => (
                    <option key={d} value={d}>{dayLabelsShort[i]} {new Date(d).getDate()}.{new Date(d).getMonth() + 1}.</option>
                  ))}
                </select>
              </div>
              <div className="field"><label>Alkaa *</label><input type="time" className="input" value={fStart} onChange={e => setFStart(e.target.value)} /></div>
              <div className="field"><label>Päättyy</label><input type="time" className="input" value={fEnd} onChange={e => setFEnd(e.target.value)} /></div>
            </div>
            <div className="field"><label>Esityspaikka *</label>
              <select className="input" value={fVenue} onChange={e => setFVenue(e.target.value)}>
                {LLFF_VENUES.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              {editId && <button className="btn btn-ghost btn-sm" onClick={() => { remove(editId); setShowForm(false); }} style={{ color: 'var(--red)', marginRight: 'auto' }}>Poista</button>}
              <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Peruuta</button>
              <button className="btn btn-primary" onClick={save} disabled={!fTitle.trim() || !fDate || !fStart || !fVenue}>Tallenna</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
