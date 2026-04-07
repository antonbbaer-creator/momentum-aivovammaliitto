'use client';

import { useState } from 'react';
import AppShell from '@/components/AppShell';
import { useOrgData } from '@/lib/firestore';

export default function StrategyPage() {
  const [org, setOrg] = useOrgData<any>('org', { name: '', goals: [], auds: [], vals: [], tone: [], strategyText: '' });
  const [editSection, setEditSection] = useState<string | null>(null);
  const [tempText, setTempText] = useState('');
  const [newItem, setNewItem] = useState('');

  const startEdit = (section: string, value: string) => { setEditSection(section); setTempText(value); };
  const saveText = (field: string) => { setOrg((prev: any) => ({ ...prev, [field]: tempText })); setEditSection(null); };

  const addGoal = () => { if (!newItem.trim()) return; setOrg((prev: any) => ({ ...prev, goals: [...(prev.goals || []), { t: newItem.trim(), p: (prev.goals?.length || 0) + 1 }] })); setNewItem(''); };
  const removeGoal = (i: number) => setOrg((prev: any) => ({ ...prev, goals: prev.goals.filter((_: any, j: number) => j !== i) }));
  const addAud = () => { if (!newItem.trim()) return; setOrg((prev: any) => ({ ...prev, auds: [...(prev.auds || []), { n: newItem.trim() }] })); setNewItem(''); };
  const removeAud = (i: number) => setOrg((prev: any) => ({ ...prev, auds: prev.auds.filter((_: any, j: number) => j !== i) }));
  const addVal = () => { if (!newItem.trim()) return; setOrg((prev: any) => ({ ...prev, vals: [...(prev.vals || []), { t: newItem.trim() }] })); setNewItem(''); };
  const removeVal = (i: number) => setOrg((prev: any) => ({ ...prev, vals: prev.vals.filter((_: any, j: number) => j !== i) }));
  const addTone = () => { if (!newItem.trim()) return; setOrg((prev: any) => ({ ...prev, tone: [...(prev.tone || []), newItem.trim()] })); setNewItem(''); };
  const removeTone = (i: number) => setOrg((prev: any) => ({ ...prev, tone: prev.tone.filter((_: any, j: number) => j !== i) }));

  const Section = ({ title, items, field, nameKey, onAdd, onRemove }: { title: string; items: any[]; field: string; nameKey: string; onAdd: () => void; onRemove: (i: number) => void }) => (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', marginBottom: '1.25rem' }}>
      <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.88rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.02em' }}>{title}</h3>
        <span style={{ fontSize: '.72rem', color: 'var(--t3)' }}>{items.length}</span>
      </div>
      <div style={{ padding: '1.25rem 1.5rem' }}>
        {items.map((item: any, i: number) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '.6rem .75rem', background: 'var(--elev)', border: '1px solid var(--border)', borderRadius: 'var(--r)', marginBottom: '.4rem' }}>
            <span style={{ fontSize: '.88rem' }}>{typeof item === 'string' ? item : item[nameKey]}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => onRemove(i)} style={{ color: 'var(--t3)', fontSize: '.7rem' }}>{'\u00d7'}</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: '.5rem', marginTop: '.75rem' }}>
          <input className="input" placeholder={`Lisää ${title.toLowerCase()}...`} value={editSection === field ? newItem : ''} onFocus={() => setEditSection(field)} onChange={e => setNewItem(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') onAdd(); }} style={{ flex: 1 }} />
          <button className="btn btn-primary btn-sm" onClick={onAdd} disabled={!newItem.trim()}>+</button>
        </div>
      </div>
    </div>
  );

  return (
    <AppShell title="Strategia" subtitle={org.slogan || 'Viestinnän strategia'}>
      {/* Strategy text */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', marginBottom: '1.25rem' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.88rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.02em' }}>Viestintästrategia</h3>
          {editSection !== 'strategyText' && <button className="btn btn-ghost btn-sm" onClick={() => startEdit('strategyText', org.strategyText || '')}>Muokkaa</button>}
        </div>
        <div style={{ padding: '1.25rem 1.5rem' }}>
          {editSection === 'strategyText' ? (
            <div>
              <textarea className="input textarea-lg" value={tempText} onChange={e => setTempText(e.target.value)} placeholder="Kuvaile organisaatiosi viestintästrategiaa..." />
              <div style={{ display: 'flex', gap: '.5rem', marginTop: '.75rem' }}>
                <button className="btn btn-primary btn-sm" onClick={() => saveText('strategyText')}>Tallenna</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditSection(null)}>Peruuta</button>
              </div>
            </div>
          ) : (
            <p style={{ color: org.strategyText ? 'var(--t2)' : 'var(--t3)', lineHeight: 1.7, fontSize: '.9rem' }}>
              {org.strategyText || 'Ei vielä strategiakuvausta. Klikkaa "Muokkaa" lisätäksesi.'}
            </p>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
        <Section title="Tavoitteet" items={org.goals || []} field="goals" nameKey="t" onAdd={addGoal} onRemove={removeGoal} />
        <Section title="Kohderyhmät" items={org.auds || []} field="auds" nameKey="n" onAdd={addAud} onRemove={removeAud} />
        <Section title="Brändiarvot" items={org.vals || []} field="vals" nameKey="t" onAdd={addVal} onRemove={removeVal} />
        <Section title="Sävyt" items={org.tone || []} field="tone" nameKey="" onAdd={addTone} onRemove={removeTone} />
      </div>
    </AppShell>
  );
}
