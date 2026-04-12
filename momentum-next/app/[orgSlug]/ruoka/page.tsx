'use client';

import { useState } from 'react';
import AppShell from '@/components/AppShell';
import { useOrgData } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';

interface FoodItem {
  id: string;
  category: string; // 'alkuruoka', 'paaruoka', 'jalkiruoka', 'juomat', 'kakku', 'muu'
  name: string;
  quantity?: string;
  responsible?: string;
  hankkia: boolean; // pitääkö vielä hankkia
  done: boolean;
  note?: string;
  dietary?: string; // kasvis, gluteeniton, etc.
}

const CATEGORIES: { id: string; label: string; color: string }[] = [
  { id: 'alkuruoka',  label: 'Alkupalat',    color: '#2a8a86' },
  { id: 'paaruoka',   label: 'Pääruoka',     color: '#056b9f' },
  { id: 'jalkiruoka', label: 'Jälkiruoka',   color: '#9b7cf6' },
  { id: 'kakku',      label: 'Kakku',        color: '#e45c81' },
  { id: 'juomat',     label: 'Juomat',       color: '#f1b434' },
  { id: 'muu',        label: 'Muu',          color: '#f09a52' },
];

export default function RuokaPage() {
  const { canEdit } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useOrgData<FoodItem[]>('food', []);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  // Form
  const [fName, setFName] = useState('');
  const [fCategory, setFCategory] = useState('alkuruoka');
  const [fQuantity, setFQuantity] = useState('');
  const [fResponsible, setFResponsible] = useState('');
  const [fHankkia, setFHankkia] = useState(false);
  const [fNote, setFNote] = useState('');
  const [fDietary, setFDietary] = useState('');

  const openNew = (cat?: string) => {
    setEditId(null); setFName(''); setFCategory(cat || 'alkuruoka'); setFQuantity('');
    setFResponsible(''); setFHankkia(true); setFNote(''); setFDietary('');
    setShowForm(true);
  };

  const openEdit = (item: FoodItem) => {
    setEditId(item.id); setFName(item.name); setFCategory(item.category);
    setFQuantity(item.quantity || ''); setFResponsible(item.responsible || '');
    setFHankkia(item.hankkia); setFNote(item.note || ''); setFDietary(item.dietary || '');
    setShowForm(true);
  };

  const save = () => {
    if (!fName.trim()) return;
    const item: FoodItem = {
      id: editId || 'f_' + Date.now(),
      name: fName.trim(), category: fCategory,
      quantity: fQuantity.trim() || undefined,
      responsible: fResponsible.trim() || undefined,
      hankkia: fHankkia, done: false,
      note: fNote.trim() || undefined,
      dietary: fDietary.trim() || undefined,
    };
    if (editId) setItems(prev => prev.map(x => x.id === editId ? { ...x, ...item } : x));
    else setItems(prev => [...prev, item]);
    setShowForm(false);
    toast(editId ? 'Päivitetty' : 'Lisätty', 'success');
  };

  const toggleDone = (id: string) => {
    setItems(prev => prev.map(x => x.id === id ? { ...x, done: !x.done } : x));
  };

  const toggleHankkia = (id: string) => {
    setItems(prev => prev.map(x => x.id === id ? { ...x, hankkia: !x.hankkia } : x));
  };

  const remove = (id: string) => {
    setItems(prev => prev.filter(x => x.id !== id));
    toast('Poistettu', 'success');
  };

  const needToBuy = items.filter(i => i.hankkia && !i.done).length;
  const totalItems = items.length;
  const doneItems = items.filter(i => i.done).length;

  return (
    <AppShell title="Ruoka ja juomat" subtitle={`${totalItems} kohdetta · ${needToBuy} hankittava`}>
      {/* Summary bar */}
      <div style={{ display: 'flex', gap: '.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 120, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '.85rem 1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--pri-l)' }}>{totalItems}</div>
          <div style={{ fontSize: '.68rem', color: 'var(--t3)', fontWeight: 600, textTransform: 'uppercase' }}>Yhteensä</div>
        </div>
        <div style={{ flex: 1, minWidth: 120, background: needToBuy > 0 ? 'rgba(241,180,52,.06)' : 'var(--card)', border: `1px solid ${needToBuy > 0 ? 'rgba(241,180,52,.2)' : 'var(--border)'}`, borderRadius: 'var(--r)', padding: '.85rem 1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--yellow)' }}>{needToBuy}</div>
          <div style={{ fontSize: '.68rem', color: 'var(--t3)', fontWeight: 600, textTransform: 'uppercase' }}>Hankittava</div>
        </div>
        <div style={{ flex: 1, minWidth: 120, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '.85rem 1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--green)' }}>{doneItems}</div>
          <div style={{ fontSize: '.68rem', color: 'var(--t3)', fontWeight: 600, textTransform: 'uppercase' }}>Valmista</div>
        </div>
      </div>

      {/* Add button */}
      {canEdit && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
          <button className="btn btn-primary btn-sm" onClick={() => openNew()}>+ Lisää ruoka/juoma</button>
        </div>
      )}

      {/* Items by category */}
      {CATEGORIES.map(cat => {
        const catItems = items.filter(i => i.category === cat.id);
        if (catItems.length === 0 && !canEdit) return null;
        return (
          <div key={cat.id} style={{ marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.5rem', padding: '0 .25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: cat.color }} />
                <span style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{cat.label}</span>
                <span style={{ fontSize: '.68rem', color: 'var(--t3)' }}>({catItems.length})</span>
              </div>
              {canEdit && <button className="btn btn-ghost btn-sm" onClick={() => openNew(cat.id)} style={{ fontSize: '.65rem' }}>+ Lisää</button>}
            </div>
            {catItems.length === 0 ? (
              <div style={{ padding: '.5rem .75rem', fontSize: '.75rem', color: 'var(--t3)', fontStyle: 'italic' }}>Ei kohteita.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
                {catItems.map(item => (
                  <div key={item.id} style={{
                    display: 'flex', alignItems: 'center', gap: '.65rem',
                    padding: '.6rem .8rem', background: 'var(--card)',
                    border: '1px solid var(--border)', borderRadius: 'var(--r)',
                    borderLeft: `3px solid ${cat.color}`,
                    opacity: item.done ? 0.5 : 1,
                  }}>
                    {canEdit && (
                      <input type="checkbox" checked={item.done} onChange={() => toggleDone(item.id)}
                        style={{ width: 18, height: 18, accentColor: 'var(--green)', flexShrink: 0, cursor: 'pointer' }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '.85rem', fontWeight: 600, textDecoration: item.done ? 'line-through' : 'none' }}>{item.name}</div>
                      <div style={{ fontSize: '.68rem', color: 'var(--t3)', display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginTop: '.1rem' }}>
                        {item.quantity && <span>{item.quantity}</span>}
                        {item.responsible && <span>Vastuussa: {item.responsible}</span>}
                        {item.dietary && <span>({item.dietary})</span>}
                        {item.note && <span>{item.note}</span>}
                      </div>
                    </div>
                    {item.hankkia && !item.done && (
                      <span style={{ fontSize: '.6rem', padding: '.15rem .45rem', borderRadius: 9999, background: 'rgba(241,180,52,.15)', color: 'var(--yellow)', fontWeight: 700, flexShrink: 0, textTransform: 'uppercase' }}>Hankittava</span>
                    )}
                    {canEdit && (
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(item)} style={{ fontSize: '.65rem', padding: '.15rem .35rem' }}>Muokkaa</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Form modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowForm(false)}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '2rem', width: 440, maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', marginBottom: '1.25rem' }}>{editId ? 'Muokkaa' : 'Lisää ruoka/juoma'}</h3>
            <div className="field"><label>Nimi *</label><input className="input" value={fName} onChange={e => setFName(e.target.value)} autoFocus placeholder="Esim. Lohivoileivat" /></div>
            <div className="field">
              <label>Kategoria</label>
              <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap' }}>
                {CATEGORIES.map(c => (
                  <button key={c.id} type="button" onClick={() => setFCategory(c.id)} style={{
                    fontSize: '.72rem', padding: '.35rem .6rem', borderRadius: 9999,
                    background: fCategory === c.id ? c.color : 'var(--elev)',
                    color: fCategory === c.id ? '#fff' : 'var(--t2)',
                    border: `1px solid ${fCategory === c.id ? c.color : 'var(--border)'}`,
                    fontWeight: 600, cursor: 'pointer',
                  }}>{c.label}</button>
                ))}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
              <div className="field"><label>Määrä</label><input className="input" value={fQuantity} onChange={e => setFQuantity(e.target.value)} placeholder="Esim. 30 kpl" /></div>
              <div className="field"><label>Vastuussa</label><input className="input" value={fResponsible} onChange={e => setFResponsible(e.target.value)} placeholder="Kuka hoitaa?" /></div>
            </div>
            <div className="field"><label>Ruokavalio / huomio</label><input className="input" value={fDietary} onChange={e => setFDietary(e.target.value)} placeholder="Esim. gluteeniton vaihtoehto" /></div>
            <div className="field" style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={fHankkia} onChange={e => setFHankkia(e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--yellow)' }} />
                Pitää vielä hankkia
              </label>
            </div>
            <div className="field"><label>Muistiinpano</label><textarea className="input textarea" value={fNote} onChange={e => setFNote(e.target.value)} /></div>
            <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end' }}>
              {editId && <button className="btn btn-ghost btn-sm" onClick={() => { remove(editId); setShowForm(false); }} style={{ color: 'var(--red)', marginRight: 'auto' }}>Poista</button>}
              <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Peruuta</button>
              <button className="btn btn-primary" onClick={save} disabled={!fName.trim()}>Tallenna</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
