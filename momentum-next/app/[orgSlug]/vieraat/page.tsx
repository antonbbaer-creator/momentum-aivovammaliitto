'use client';

import { useState } from 'react';
import AppShell from '@/components/AppShell';
import { useOrgData } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';

interface Guest {
  id: string;
  name: string;
  group: string; // e.g. 'perhe', 'ystavat', 'sukulaiset'
  status: 'kutsuttu' | 'saapuu' | 'ei_paase' | 'odottaa';
  dietary?: string;
  note?: string;
  plusOne?: boolean;
  plusOneName?: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  odottaa:   { label: 'Odottaa',   color: 'var(--yellow)', bg: 'rgba(245,197,66,.12)' },
  kutsuttu:  { label: 'Kutsuttu',  color: 'var(--pri-l)',  bg: 'rgba(5,107,159,.1)' },
  saapuu:    { label: 'Saapuu',    color: 'var(--green)',   bg: 'rgba(45,212,160,.1)' },
  ei_paase:  { label: 'Ei paase',  color: 'var(--red)',     bg: 'rgba(239,68,68,.1)' },
};

const DEFAULT_GROUPS = ['Perhe', 'Sukulaiset', 'Ystavat', 'Tyokaverit', 'Naapurit'];

export default function VieraatPage() {
  const { canEdit } = useAuth();
  const { toast } = useToast();
  const [guests, setGuests] = useOrgData<Guest[]>('guests', []);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [filterGroup, setFilterGroup] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');

  // Form state
  const [gName, setGName] = useState('');
  const [gGroup, setGGroup] = useState('Perhe');
  const [gStatus, setGStatus] = useState<Guest['status']>('odottaa');
  const [gDietary, setGDietary] = useState('');
  const [gNote, setGNote] = useState('');
  const [gPlusOne, setGPlusOne] = useState(false);
  const [gPlusOneName, setGPlusOneName] = useState('');

  const groups = [...new Set([...DEFAULT_GROUPS, ...guests.map(g => g.group)])].filter(Boolean);

  const openNew = () => {
    setEditId(null); setGName(''); setGGroup('Perhe'); setGStatus('odottaa');
    setGDietary(''); setGNote(''); setGPlusOne(false); setGPlusOneName('');
    setShowForm(true);
  };

  const openEdit = (g: Guest) => {
    setEditId(g.id); setGName(g.name); setGGroup(g.group); setGStatus(g.status);
    setGDietary(g.dietary || ''); setGNote(g.note || '');
    setGPlusOne(g.plusOne || false); setGPlusOneName(g.plusOneName || '');
    setShowForm(true);
  };

  const save = () => {
    if (!gName.trim()) return;
    const guest: Guest = {
      id: editId || 'g_' + Date.now(),
      name: gName.trim(), group: gGroup, status: gStatus,
      dietary: gDietary.trim() || undefined,
      note: gNote.trim() || undefined,
      plusOne: gPlusOne || undefined,
      plusOneName: gPlusOne ? gPlusOneName.trim() || undefined : undefined,
    };
    if (editId) setGuests(prev => prev.map(x => x.id === editId ? guest : x));
    else setGuests(prev => [...prev, guest]);
    setShowForm(false);
    toast(editId ? 'Vieras paivitetty' : 'Vieras lisatty', 'success');
  };

  const remove = (id: string) => {
    setGuests(prev => prev.filter(x => x.id !== id));
    toast('Vieras poistettu', 'success');
  };

  const setStatus = (id: string, status: Guest['status']) => {
    setGuests(prev => prev.map(x => x.id === id ? { ...x, status } : x));
  };

  // Filtered guests
  const filtered = guests.filter(g => {
    if (filterGroup && g.group !== filterGroup) return false;
    if (filterStatus && g.status !== filterStatus) return false;
    return true;
  });

  // Stats
  const attending = guests.filter(g => g.status === 'saapuu').length;
  const plusOnes = guests.filter(g => g.status === 'saapuu' && g.plusOne).length;
  const totalHeadcount = attending + plusOnes;
  const waiting = guests.filter(g => g.status === 'odottaa' || g.status === 'kutsuttu').length;

  return (
    <AppShell title="Vieraslista" subtitle={`${guests.length} vierasta · ${totalHeadcount} saapuu`}>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '.75rem', marginBottom: '1.5rem' }}>
        {Object.entries(STATUS_LABELS).map(([key, s]) => {
          const count = guests.filter(g => g.status === key).length;
          return (
            <div key={key} onClick={() => setFilterStatus(filterStatus === key ? '' : key)} style={{
              background: filterStatus === key ? s.bg : 'var(--card)',
              border: `1px solid ${filterStatus === key ? s.color : 'var(--border)'}`,
              borderRadius: 'var(--r)', padding: '.85rem 1rem', cursor: 'pointer', textAlign: 'center',
            }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: s.color }}>{count}</div>
              <div style={{ fontSize: '.68rem', color: 'var(--t3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>{s.label}</div>
            </div>
          );
        })}
      </div>

      {/* Filters + add */}
      <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="input" value={filterGroup} onChange={e => setFilterGroup(e.target.value)} style={{ width: 'auto', fontSize: '.78rem' }}>
          <option value="">Kaikki ryhmat</option>
          {groups.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        {(filterGroup || filterStatus) && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setFilterGroup(''); setFilterStatus(''); }}>Tyhjenna</button>
        )}
        <div style={{ flex: 1 }} />
        {canEdit && <button className="btn btn-primary btn-sm" onClick={openNew}>+ Lisaa vieras</button>}
      </div>

      {/* Guest list by group */}
      {(() => {
        const grouped = groups.filter(g => filtered.some(x => x.group === g));
        if (filtered.length === 0) return (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--t3)' }}>
            <p style={{ fontSize: '.92rem', marginBottom: '.5rem' }}>Ei vieraita viela.</p>
            <p style={{ fontSize: '.75rem' }}>Lisaa ensimmainen vieras ylhaalta.</p>
          </div>
        );
        return grouped.map(group => (
          <div key={group} style={{ marginBottom: '1.25rem' }}>
            <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '.5rem', padding: '0 .25rem' }}>
              {group} ({filtered.filter(g => g.group === group).length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
              {filtered.filter(g => g.group === group).map(g => {
                const s = STATUS_LABELS[g.status];
                return (
                  <div key={g.id} style={{
                    display: 'flex', alignItems: 'center', gap: '.75rem',
                    padding: '.7rem .85rem', background: 'var(--card)',
                    border: '1px solid var(--border)', borderRadius: 'var(--r)',
                    borderLeft: `3px solid ${s.color}`,
                  }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: '50%',
                      background: s.bg, color: s.color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '.85rem', fontWeight: 800, flexShrink: 0,
                    }}>{g.name[0]}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '.88rem', fontWeight: 600 }}>{g.name}</div>
                      <div style={{ fontSize: '.68rem', color: 'var(--t3)', display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginTop: '.1rem' }}>
                        {g.plusOne && <span>+1{g.plusOneName ? ` (${g.plusOneName})` : ''}</span>}
                        {g.dietary && <span>Ruokavalio: {g.dietary}</span>}
                        {g.note && <span>{g.note}</span>}
                      </div>
                    </div>
                    {canEdit && (
                      <div style={{ display: 'flex', gap: '.25rem', alignItems: 'center' }}>
                        <select className="input" value={g.status} onChange={e => setStatus(g.id, e.target.value as Guest['status'])}
                          style={{ width: 'auto', fontSize: '.72rem', padding: '.25rem .4rem', background: s.bg, color: s.color, fontWeight: 700, border: `1px solid ${s.color}40` }}>
                          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(g)} style={{ fontSize: '.65rem', padding: '.2rem .4rem' }}>Muokkaa</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ));
      })()}

      {/* Guest form modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowForm(false)}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '2rem', width: 440, maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', marginBottom: '1.25rem' }}>{editId ? 'Muokkaa vierasta' : 'Lisaa vieras'}</h3>
            <div className="field"><label>Nimi *</label><input className="input" value={gName} onChange={e => setGName(e.target.value)} autoFocus /></div>
            <div className="field">
              <label>Ryhma</label>
              <select className="input" value={gGroup} onChange={e => setGGroup(e.target.value)}>
                {groups.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Tila</label>
              <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <button key={k} type="button" onClick={() => setGStatus(k as Guest['status'])} style={{
                    fontSize: '.72rem', padding: '.35rem .65rem', borderRadius: 9999,
                    background: gStatus === k ? v.bg : 'var(--elev)',
                    color: gStatus === k ? v.color : 'var(--t2)',
                    border: `1px solid ${gStatus === k ? v.color : 'var(--border)'}`,
                    fontWeight: 600, cursor: 'pointer',
                  }}>{v.label}</button>
                ))}
              </div>
            </div>
            <div className="field"><label>Ruokavalio / allergiat</label><input className="input" value={gDietary} onChange={e => setGDietary(e.target.value)} placeholder="Esim. kasvis, gluteeniton" /></div>
            <div className="field" style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={gPlusOne} onChange={e => setGPlusOne(e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--pri)' }} />
                +1 (avecin kanssa)
              </label>
            </div>
            {gPlusOne && (
              <div className="field"><label>Avecin nimi</label><input className="input" value={gPlusOneName} onChange={e => setGPlusOneName(e.target.value)} /></div>
            )}
            <div className="field"><label>Muistiinpano</label><textarea className="input textarea" value={gNote} onChange={e => setGNote(e.target.value)} /></div>
            <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end' }}>
              {editId && <button className="btn btn-ghost btn-sm" onClick={() => { remove(editId); setShowForm(false); }} style={{ color: 'var(--red)', marginRight: 'auto' }}>Poista</button>}
              <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Peruuta</button>
              <button className="btn btn-primary" onClick={save} disabled={!gName.trim()}>Tallenna</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
