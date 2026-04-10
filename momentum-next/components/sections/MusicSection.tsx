'use client';

import { useState } from 'react';
import { useOrgData } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { MusicAct, DEFAULT_MUSIC, LLFF_VENUES, PROGRAMME_COLORS } from '@/lib/festival-shared';

export default function MusicSection() {
  const { canEdit } = useAuth();
  const { toast } = useToast();
  const [acts, setActs] = useOrgData<MusicAct[]>('music', DEFAULT_MUSIC);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const [fArtist, setFArtist] = useState('');
  const [fTitle, setFTitle] = useState('');
  const [fDesc, setFDesc] = useState('');
  const [fGenre, setFGenre] = useState('');
  const [fDate, setFDate] = useState('');
  const [fTime, setFTime] = useState('');
  const [fVenue, setFVenue] = useState('');

  const openNew = () => {
    setEditId(null); setFArtist(''); setFTitle(''); setFDesc(''); setFGenre('');
    setFDate(''); setFTime(''); setFVenue(''); setShowForm(true);
  };
  const openEdit = (a: MusicAct) => {
    setEditId(a.id); setFArtist(a.artist); setFTitle(a.title); setFDesc(a.description);
    setFGenre(a.genre || ''); setFDate(a.scheduledDate || ''); setFTime(a.scheduledTime || '');
    setFVenue(a.venue || ''); setShowForm(true);
  };
  const save = () => {
    if (!fArtist.trim() || !fTitle.trim()) return;
    const act: MusicAct = {
      id: editId || 'm_' + Date.now(),
      artist: fArtist.trim(), title: fTitle.trim(), description: fDesc.trim(),
      genre: fGenre.trim() || undefined,
      scheduledDate: fDate || undefined,
      scheduledTime: fTime || undefined,
      venue: fVenue || undefined,
    };
    if (editId) setActs(prev => prev.map(a => a.id === editId ? act : a));
    else setActs(prev => [...prev, act]);
    setShowForm(false);
    toast(editId ? 'Esiintyjä päivitetty' : 'Esiintyjä lisätty', 'success');
  };
  const remove = (id: string) => { setActs(prev => prev.filter(a => a.id !== id)); toast('Poistettu', 'success'); };

  const col = PROGRAMME_COLORS.music;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '.5rem' }}>
        <div style={{ fontSize: '.78rem', color: 'var(--t3)' }}>{acts.length} esiintyjää / kokoonpanoa</div>
        {canEdit && <button className="btn btn-primary btn-sm" onClick={openNew}>+ Lisää musiikkiesitys</button>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
        {acts.map(a => (
          <div key={a.id} style={{
            background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)',
            padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem',
            borderLeft: `4px solid ${col.color}`,
          }}>
            <div style={{
              width: 42, height: 42, borderRadius: '50%',
              background: col.bg, color: col.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.2rem', flexShrink: 0,
            }}>{col.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '.95rem', fontWeight: 700 }}>{a.artist}</div>
              <div style={{ fontSize: '.82rem', color: 'var(--t2)', fontStyle: 'italic' }}>{a.title}</div>
              {a.description && <div style={{ fontSize: '.75rem', color: 'var(--t3)', marginTop: '.25rem' }}>{a.description}</div>}
              <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginTop: '.35rem', alignItems: 'center' }}>
                {a.genre && <span style={{ fontSize: '.62rem', padding: '.1rem .4rem', borderRadius: 9999, background: 'var(--elev)', color: 'var(--t3)', fontWeight: 600 }}>{a.genre}</span>}
                {a.scheduledDate && <span style={{ fontSize: '.7rem', color: col.color, fontWeight: 600 }}>{new Date(a.scheduledDate).toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' })}.{a.scheduledTime && ` ${a.scheduledTime}`}</span>}
                {a.venue && <span style={{ fontSize: '.7rem', color: 'var(--t2)' }}>{'·'} {a.venue}</span>}
              </div>
            </div>
            {canEdit && (
              <div style={{ display: 'flex', gap: '.3rem', flexShrink: 0 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => openEdit(a)}>Muokkaa</button>
                <button className="btn btn-ghost btn-sm" onClick={() => remove(a.id)} style={{ color: 'var(--red)' }}>{'×'}</button>
              </div>
            )}
          </div>
        ))}
        {acts.length === 0 && <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--t3)' }}>Ei musiikkiesityksiä. Lisää ensimmäinen ylhäältä.</div>}
      </div>

      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowForm(false)}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '2rem', width: 480, maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', marginBottom: '1.25rem' }}>{editId ? 'Muokkaa esiintyjää' : 'Lisää musiikkiesitys'}</h3>
            <div className="field"><label>Esiintyjä / kokoonpano *</label><input className="input" value={fArtist} onChange={e => setFArtist(e.target.value)} autoFocus /></div>
            <div className="field"><label>Esityksen nimi *</label><input className="input" value={fTitle} onChange={e => setFTitle(e.target.value)} /></div>
            <div className="field"><label>Kuvaus</label><textarea className="input textarea" value={fDesc} onChange={e => setFDesc(e.target.value)} /></div>
            <div className="field"><label>Genre</label><input className="input" value={fGenre} onChange={e => setFGenre(e.target.value)} placeholder="Jazz, ambient, folk..." /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
              <div className="field"><label>Päivämäärä</label><input type="date" className="input" value={fDate} onChange={e => setFDate(e.target.value)} /></div>
              <div className="field"><label>Aika</label><input type="time" className="input" value={fTime} onChange={e => setFTime(e.target.value)} /></div>
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
              <button className="btn btn-primary" onClick={save} disabled={!fArtist.trim() || !fTitle.trim()}>Tallenna</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
