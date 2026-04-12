'use client';

import { useState } from 'react';
import AppShell from '@/components/AppShell';
import { useOrgData } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';

interface ProgramItem {
  id: string;
  time: string;      // "15:00"
  endTime?: string;   // "16:30"
  title: string;
  description?: string;
  responsible?: string;
  category: 'valmistelu' | 'ohjelma' | 'ruoka' | 'musiikki' | 'puhe' | 'muu';
  note?: string;
}

const CATEGORIES: { id: string; label: string; color: string }[] = [
  { id: 'valmistelu', label: 'Valmistelu',  color: '#f09a52' },
  { id: 'ohjelma',    label: 'Ohjelma',     color: '#056b9f' },
  { id: 'ruoka',      label: 'Ruoka/tarjoilu', color: '#2a8a86' },
  { id: 'musiikki',   label: 'Musiikki',    color: '#9b7cf6' },
  { id: 'puhe',       label: 'Puhe/malja',  color: '#e45c81' },
  { id: 'muu',        label: 'Muu',         color: '#6366f1' },
];

const catMap = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

// Time slots from 10:00 to 24:00
const HOURS = Array.from({ length: 15 }, (_, i) => i + 10); // 10-24

export default function OhjelmaPage() {
  const { canEdit } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useOrgData<ProgramItem[]>('program', []);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  // Form
  const [fTime, setFTime] = useState('15:00');
  const [fEndTime, setFEndTime] = useState('');
  const [fTitle, setFTitle] = useState('');
  const [fDesc, setFDesc] = useState('');
  const [fResponsible, setFResponsible] = useState('');
  const [fCategory, setFCategory] = useState<ProgramItem['category']>('ohjelma');
  const [fNote, setFNote] = useState('');

  const openNew = (hour?: number) => {
    setEditId(null); setFTime(hour !== undefined ? `${hour}:00` : '15:00'); setFEndTime('');
    setFTitle(''); setFDesc(''); setFResponsible(''); setFCategory('ohjelma'); setFNote('');
    setShowForm(true);
  };

  const openEdit = (item: ProgramItem) => {
    setEditId(item.id); setFTime(item.time); setFEndTime(item.endTime || '');
    setFTitle(item.title); setFDesc(item.description || '');
    setFResponsible(item.responsible || ''); setFCategory(item.category); setFNote(item.note || '');
    setShowForm(true);
  };

  const save = () => {
    if (!fTitle.trim() || !fTime) return;
    const item: ProgramItem = {
      id: editId || 'prog_' + Date.now(),
      time: fTime, endTime: fEndTime || undefined,
      title: fTitle.trim(), description: fDesc.trim() || undefined,
      responsible: fResponsible.trim() || undefined,
      category: fCategory, note: fNote.trim() || undefined,
    };
    if (editId) setItems(prev => prev.map(x => x.id === editId ? { ...x, ...item } : x));
    else setItems(prev => [...prev, item]);
    setShowForm(false);
    toast(editId ? 'Päivitetty' : 'Lisätty', 'success');
  };

  const remove = (id: string) => {
    setItems(prev => prev.filter(x => x.id !== id));
    toast('Poistettu', 'success');
  };

  // Sort by time
  const sorted = [...items].sort((a, b) => a.time.localeCompare(b.time));

  // Group items by phase
  const preparationItems = sorted.filter(i => {
    const h = parseInt(i.time.split(':')[0]);
    return h < 15;
  });
  const partyItems = sorted.filter(i => {
    const h = parseInt(i.time.split(':')[0]);
    return h >= 15;
  });

  return (
    <AppShell title="Ohjelma" subtitle="Lauantai 25.4.2026 · Tyttöjen talo, Kallio">
      {canEdit && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.25rem' }}>
          <button className="btn btn-primary btn-sm" onClick={() => openNew()}>+ Lisää ohjelmanumero</button>
        </div>
      )}

      {/* Category legend */}
      <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        {CATEGORIES.map(c => (
          <span key={c.id} style={{
            fontSize: '.65rem', padding: '.2rem .5rem', borderRadius: 9999,
            background: `${c.color}18`, color: c.color, fontWeight: 700,
          }}>{c.label}</span>
        ))}
      </div>

      {/* Info banner */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(5,107,159,.06), rgba(24,94,91,.04))',
        border: '1px solid rgba(5,107,159,.15)', borderRadius: 'var(--rl)',
        padding: '1rem 1.25rem', marginBottom: '1.5rem',
        display: 'flex', gap: '1.5rem', flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ fontSize: '.6rem', color: 'var(--t3)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.05em' }}>Valmistelu</div>
          <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--pri-l)' }}>10:00 - 15:00</div>
        </div>
        <div>
          <div style={{ fontSize: '.6rem', color: 'var(--t3)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.05em' }}>Juhlat</div>
          <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--green)' }}>15:00 - 24:00</div>
        </div>
        <div>
          <div style={{ fontSize: '.6rem', color: 'var(--t3)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.05em' }}>Paikka</div>
          <div style={{ fontSize: '.85rem', fontWeight: 600, color: 'var(--t1)' }}>Tyttöjen talo, Hämeentie 13 A</div>
        </div>
        <div>
          <div style={{ fontSize: '.6rem', color: 'var(--t3)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.05em' }}>Ohjelmanumeroita</div>
          <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--t1)' }}>{items.length}</div>
        </div>
      </div>

      {items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--t3)' }}>
          <p style={{ fontSize: '.92rem', marginBottom: '.5rem' }}>Ei ohjelmanumeroita vielä.</p>
          <p style={{ fontSize: '.75rem' }}>Lisää ensimmäinen ohjelmanumero ylhäältä. Voit merkitä valmistelut (10-15) ja itse juhlan ohjelman (15-24).</p>
        </div>
      ) : (
        <>
          {/* Preparation phase */}
          {preparationItems.length > 0 && (
            <div style={{ marginBottom: '1.75rem' }}>
              <div style={{
                fontSize: '.72rem', fontWeight: 700, color: '#f09a52', textTransform: 'uppercase',
                letterSpacing: '.05em', marginBottom: '.75rem', padding: '0 .25rem',
                display: 'flex', alignItems: 'center', gap: '.5rem',
              }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f09a52' }} />
                Valmistelu (10:00 - 15:00)
              </div>
              {renderTimeline(preparationItems)}
            </div>
          )}

          {/* Party phase */}
          {partyItems.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{
                fontSize: '.72rem', fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase',
                letterSpacing: '.05em', marginBottom: '.75rem', padding: '0 .25rem',
                display: 'flex', alignItems: 'center', gap: '.5rem',
              }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)' }} />
                Juhlat (15:00 - 24:00)
              </div>
              {renderTimeline(partyItems)}
            </div>
          )}
        </>
      )}

      {/* Form modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowForm(false)}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '2rem', width: 480, maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', marginBottom: '1.25rem' }}>{editId ? 'Muokkaa' : 'Lisää ohjelmanumero'}</h3>
            <div className="field"><label>Otsikko *</label><input className="input" value={fTitle} onChange={e => setFTitle(e.target.value)} autoFocus placeholder="Esim. Vieraiden vastaanotto" /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
              <div className="field"><label>Alkaa *</label><input className="input" type="time" value={fTime} onChange={e => setFTime(e.target.value)} /></div>
              <div className="field"><label>Paattyy</label><input className="input" type="time" value={fEndTime} onChange={e => setFEndTime(e.target.value)} /></div>
            </div>
            <div className="field">
              <label>Tyyppi</label>
              <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap' }}>
                {CATEGORIES.map(c => (
                  <button key={c.id} type="button" onClick={() => setFCategory(c.id as ProgramItem['category'])} style={{
                    fontSize: '.72rem', padding: '.35rem .6rem', borderRadius: 9999,
                    background: fCategory === c.id ? c.color : 'var(--elev)',
                    color: fCategory === c.id ? '#fff' : 'var(--t2)',
                    border: `1px solid ${fCategory === c.id ? c.color : 'var(--border)'}`,
                    fontWeight: 600, cursor: 'pointer',
                  }}>{c.label}</button>
                ))}
              </div>
            </div>
            <div className="field"><label>Kuvaus</label><textarea className="input textarea" value={fDesc} onChange={e => setFDesc(e.target.value)} placeholder="Mitä tapahtuu?" /></div>
            <div className="field"><label>Vastuussa</label><input className="input" value={fResponsible} onChange={e => setFResponsible(e.target.value)} placeholder="Kuka hoitaa?" /></div>
            <div className="field"><label>Muistiinpano</label><textarea className="input textarea" value={fNote} onChange={e => setFNote(e.target.value)} /></div>
            <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end' }}>
              {editId && <button className="btn btn-ghost btn-sm" onClick={() => { remove(editId); setShowForm(false); }} style={{ color: 'var(--red)', marginRight: 'auto' }}>Poista</button>}
              <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Peruuta</button>
              <button className="btn btn-primary" onClick={save} disabled={!fTitle.trim() || !fTime}>Tallenna</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );

  function renderTimeline(timelineItems: ProgramItem[]) {
    return (
      <div style={{ position: 'relative', paddingLeft: '2.5rem' }}>
        {/* Vertical line */}
        <div style={{ position: 'absolute', left: '1rem', top: 0, bottom: 0, width: 2, background: 'var(--border)' }} />

        {timelineItems.map((item, i) => {
          const cat = catMap[item.category] || catMap.muu;
          return (
            <div key={item.id} style={{ position: 'relative', marginBottom: '.75rem' }}>
              {/* Timeline dot */}
              <div style={{
                position: 'absolute', left: '-1.85rem', top: '.75rem',
                width: 14, height: 14, borderRadius: '50%',
                background: cat.color, border: '2px solid var(--bg)',
                zIndex: 1,
              }} />

              <div style={{
                background: 'var(--card)', border: '1px solid var(--border)',
                borderLeft: `3px solid ${cat.color}`,
                borderRadius: 'var(--r)', padding: '.85rem 1rem',
                cursor: canEdit ? 'pointer' : 'default',
              }} onClick={() => canEdit && openEdit(item)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.25rem' }}>
                  <span style={{ fontSize: '1rem', fontWeight: 800, color: cat.color, fontFamily: 'var(--font-display)', letterSpacing: '.02em' }}>
                    {item.time}
                  </span>
                  {item.endTime && (
                    <span style={{ fontSize: '.75rem', color: 'var(--t3)' }}>- {item.endTime}</span>
                  )}
                  <span style={{
                    fontSize: '.58rem', padding: '.1rem .4rem', borderRadius: 9999,
                    background: `${cat.color}18`, color: cat.color, fontWeight: 700,
                  }}>{cat.label}</span>
                </div>
                <div style={{ fontSize: '.92rem', fontWeight: 700, marginBottom: '.15rem' }}>{item.title}</div>
                {item.description && (
                  <div style={{ fontSize: '.78rem', color: 'var(--t2)', lineHeight: 1.5, marginBottom: '.2rem' }}>{item.description}</div>
                )}
                <div style={{ fontSize: '.68rem', color: 'var(--t3)', display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                  {item.responsible && <span style={{ fontWeight: 600 }}>{item.responsible}</span>}
                  {item.note && <span>{item.note}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }
}
