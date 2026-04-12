'use client';

import { useState } from 'react';
import { useOrgData } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { useIsMobile } from '@/lib/use-mobile';
import { Workshop, DEFAULT_WORKSHOPS, LLFF_VENUES, PROGRAMME_COLORS } from '@/lib/festival-shared';

export default function WorkshopsSection() {
  const { canEdit } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [workshops, setWorkshops] = useOrgData<Workshop[]>('workshops', DEFAULT_WORKSHOPS);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const [fTitle, setFTitle] = useState('');
  const [fLeader, setFLeader] = useState('');
  const [fDesc, setFDesc] = useState('');
  const [fCapacity, setFCapacity] = useState('');
  const [fDays, setFDays] = useState('');
  const [fDate, setFDate] = useState('');
  const [fTime, setFTime] = useState('');
  const [fVenue, setFVenue] = useState('');

  const openNew = () => {
    setEditId(null); setFTitle(''); setFLeader(''); setFDesc(''); setFCapacity(''); setFDays('');
    setFDate(''); setFTime(''); setFVenue(''); setShowForm(true);
  };
  const openEdit = (w: Workshop) => {
    setEditId(w.id); setFTitle(w.title); setFLeader(w.leader); setFDesc(w.description);
    setFCapacity(String(w.capacity || '')); setFDays(String(w.days || ''));
    setFDate(w.scheduledDate || ''); setFTime(w.scheduledTime || '');
    setFVenue(w.venue || ''); setShowForm(true);
  };
  const save = () => {
    if (!fTitle.trim() || !fLeader.trim()) return;
    const workshop: Workshop = {
      id: editId || 'w_' + Date.now(),
      title: fTitle.trim(), leader: fLeader.trim(), description: fDesc.trim(),
      capacity: fCapacity ? parseInt(fCapacity) : undefined,
      days: fDays ? parseInt(fDays) : undefined,
      scheduledDate: fDate || undefined,
      scheduledTime: fTime || undefined,
      venue: fVenue || undefined,
    };
    if (editId) setWorkshops(prev => prev.map(w => w.id === editId ? workshop : w));
    else setWorkshops(prev => [...prev, workshop]);
    setShowForm(false);
    toast(editId ? 'Työpaja päivitetty' : 'Työpaja lisätty', 'success');
  };
  const remove = (id: string) => { setWorkshops(prev => prev.filter(w => w.id !== id)); toast('Poistettu', 'success'); };

  const col = PROGRAMME_COLORS.workshop;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '.5rem' }}>
        <div style={{ fontSize: '.78rem', color: 'var(--t3)' }}>{workshops.length} työpaja{workshops.length === 1 ? '' : 'a'}</div>
        {canEdit && <button className="btn btn-primary btn-sm" onClick={openNew}>+ Lisää työpaja</button>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
        {workshops.map(w => (
          <div key={w.id} style={{
            background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)',
            padding: '1rem 1.25rem', display: 'flex', alignItems: 'flex-start', gap: '1rem',
            borderLeft: `4px solid ${col.color}`,
          }}>
            <div style={{
              width: 42, height: 42, borderRadius: '50%',
              background: col.bg, color: col.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.1rem', flexShrink: 0,
            }}>{col.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '.95rem', fontWeight: 700 }}>{w.title}</div>
              <div style={{ fontSize: '.78rem', color: 'var(--t2)' }}>Ohjaaja: {w.leader}</div>
              {w.description && <div style={{ fontSize: '.75rem', color: 'var(--t3)', marginTop: '.35rem', lineHeight: 1.5 }}>{w.description}</div>}
              <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginTop: '.5rem', alignItems: 'center' }}>
                {w.capacity && <span style={{ fontSize: '.62rem', padding: '.1rem .4rem', borderRadius: 9999, background: 'var(--elev)', color: 'var(--t3)', fontWeight: 600 }}>{w.capacity} paikkaa</span>}
                {w.days && <span style={{ fontSize: '.62rem', padding: '.1rem .4rem', borderRadius: 9999, background: 'var(--elev)', color: 'var(--t3)', fontWeight: 600 }}>{w.days} päivää</span>}
                {w.scheduledDate && <span style={{ fontSize: '.7rem', color: col.color, fontWeight: 600 }}>{new Date(w.scheduledDate).toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' })}.{w.scheduledTime && ` ${w.scheduledTime}`}</span>}
                {w.venue && <span style={{ fontSize: '.7rem', color: 'var(--t2)' }}>{'·'} {w.venue}</span>}
              </div>
            </div>
            {canEdit && (
              <div style={{ display: 'flex', gap: '.3rem', flexShrink: 0 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => openEdit(w)}>Muokkaa</button>
                <button className="btn btn-ghost btn-sm" onClick={() => remove(w.id)} style={{ color: 'var(--red)' }}>{'×'}</button>
              </div>
            )}
          </div>
        ))}
        {workshops.length === 0 && <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--t3)' }}>Ei työpajoja. Lisää ensimmäinen ylhäältä.</div>}
      </div>

      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowForm(false)}>
          <div style={{ background: 'var(--card)', border: isMobile ? 'none' : '1px solid var(--border)', borderRadius: isMobile ? 0 : 'var(--rl)', padding: isMobile ? '1.25rem' : '2rem', width: isMobile ? '100%' : 480, maxWidth: isMobile ? '100%' : '90vw', height: isMobile ? '100%' : 'auto', maxHeight: isMobile ? '100%' : '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', marginBottom: '1.25rem' }}>{editId ? 'Muokkaa työpajaa' : 'Lisää työpaja'}</h3>
            <div className="field"><label>Työpajan nimi *</label><input className="input" value={fTitle} onChange={e => setFTitle(e.target.value)} autoFocus /></div>
            <div className="field"><label>Ohjaaja *</label><input className="input" value={fLeader} onChange={e => setFLeader(e.target.value)} /></div>
            <div className="field"><label>Kuvaus</label><textarea className="input textarea" value={fDesc} onChange={e => setFDesc(e.target.value)} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '.75rem' }}>
              <div className="field"><label>Osallistujapaikkoja</label><input type="number" className="input" value={fCapacity} onChange={e => setFCapacity(e.target.value)} /></div>
              <div className="field"><label>Kesto (päivää)</label><input type="number" className="input" value={fDays} onChange={e => setFDays(e.target.value)} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '.75rem' }}>
              <div className="field"><label>Alkupäivä</label><input type="date" className="input" value={fDate} onChange={e => setFDate(e.target.value)} /></div>
              <div className="field"><label>Alkamisaika</label><input type="time" className="input" value={fTime} onChange={e => setFTime(e.target.value)} /></div>
            </div>
            <div className="field"><label>Esityspaikka</label>
              <select className="input" value={fVenue} onChange={e => setFVenue(e.target.value)}>
                <option value="">Ei paikkaa</option>
                {LLFF_VENUES.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end' }}>
              {editId && <button className="btn btn-ghost btn-sm" onClick={() => { remove(editId); setShowForm(false); }} style={{ color: 'var(--red)', marginRight: 'auto' }}>Poista</button>}
              <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Peruuta</button>
              <button className="btn btn-primary" onClick={save} disabled={!fTitle.trim() || !fLeader.trim()}>Tallenna</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
