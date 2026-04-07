'use client';

import { useState } from 'react';
import AppShell from '@/components/AppShell';
import { useOrgData } from '@/lib/firestore';
import { useToast } from '@/lib/toast';

interface BudgetItem { id: number; description: string; amount: number; date: string; status: 'planned' | 'spent' | 'invoiced'; }
interface BudgetCategory { id: number; name: string; allocated: number; items: BudgetItem[]; }
interface BudgetData { totalBudget: number; categories: BudgetCategory[]; }

const statusLabels: Record<string, string> = { planned: 'Suunniteltu', spent: 'Maksettu', invoiced: 'Laskutettu' };
const statusColors: Record<string, string> = { planned: 'var(--pri)', spent: 'var(--green)', invoiced: 'var(--yellow)' };

export default function BudgetPage() {
  const { toast } = useToast();
  const [budget, setBudget] = useOrgData<BudgetData>('budget', { totalBudget: 0, categories: [] });
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');
  const [newCatName, setNewCatName] = useState('');
  const [newCatAlloc, setNewCatAlloc] = useState('');
  const [expandedCat, setExpandedCat] = useState<number | null>(null);
  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemAmount, setNewItemAmount] = useState('');
  const [newItemDate, setNewItemDate] = useState('');

  const totalSpent = budget.categories.reduce((s, c) => s + c.items.reduce((s2, i) => s2 + (i.status !== 'planned' ? i.amount : 0), 0), 0);
  const totalPlanned = budget.categories.reduce((s, c) => s + c.items.reduce((s2, i) => s2 + i.amount, 0), 0);
  const remaining = budget.totalBudget - totalSpent;
  const spentPercent = budget.totalBudget > 0 ? Math.round((totalSpent / budget.totalBudget) * 100) : 0;

  const saveTotalBudget = () => {
    setBudget(prev => ({ ...prev, totalBudget: parseFloat(budgetInput) || 0 }));
    setEditingBudget(false);
    toast('Budjetti päivitetty', 'success');
  };

  const addCategory = () => {
    if (!newCatName.trim()) return;
    setBudget(prev => ({ ...prev, categories: [...prev.categories, { id: Date.now(), name: newCatName.trim(), allocated: parseFloat(newCatAlloc) || 0, items: [] }] }));
    setNewCatName(''); setNewCatAlloc('');
    toast('Kategoria lisätty', 'success');
  };

  const deleteCategory = (catId: number) => {
    setBudget(prev => ({ ...prev, categories: prev.categories.filter(c => c.id !== catId) }));
    toast('Kategoria poistettu', 'success');
  };

  const addItem = (catId: number) => {
    if (!newItemDesc.trim() || !newItemAmount) return;
    setBudget(prev => ({
      ...prev, categories: prev.categories.map(c => c.id === catId ? {
        ...c, items: [...c.items, { id: Date.now(), description: newItemDesc.trim(), amount: parseFloat(newItemAmount) || 0, date: newItemDate || new Date().toISOString().slice(0, 10), status: 'planned' as const }]
      } : c)
    }));
    setNewItemDesc(''); setNewItemAmount(''); setNewItemDate('');
    toast('Kulu lisätty', 'success');
  };

  const updateItemStatus = (catId: number, itemId: number, status: 'planned' | 'spent' | 'invoiced') => {
    setBudget(prev => ({
      ...prev, categories: prev.categories.map(c => c.id === catId ? {
        ...c, items: c.items.map(i => i.id === itemId ? { ...i, status } : i)
      } : c)
    }));
  };

  const deleteItem = (catId: number, itemId: number) => {
    setBudget(prev => ({
      ...prev, categories: prev.categories.map(c => c.id === catId ? {
        ...c, items: c.items.filter(i => i.id !== itemId)
      } : c)
    }));
  };

  return (
    <AppShell title="Budjetti" subtitle={budget.totalBudget > 0 ? `${totalSpent.toLocaleString()} \u20ac / ${budget.totalBudget.toLocaleString()} \u20ac` : 'Aseta budjetti'}>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="stat" onClick={() => { setBudgetInput(String(budget.totalBudget)); setEditingBudget(true); }} style={{ cursor: 'pointer' }}>
          <div className="stat-num">{budget.totalBudget.toLocaleString()} {'\u20ac'}</div>
          <div className="stat-lbl">Kokonaisbudjetti</div>
        </div>
        <div className="stat">
          <div className="stat-num" style={{ color: 'var(--green)' }}>{totalSpent.toLocaleString()} {'\u20ac'}</div>
          <div className="stat-lbl">Käytetty</div>
        </div>
        <div className="stat">
          <div className="stat-num" style={{ color: remaining < 0 ? 'var(--red)' : 'var(--t1)' }}>{remaining.toLocaleString()} {'\u20ac'}</div>
          <div className="stat-lbl">Jäljellä</div>
        </div>
        <div className="stat">
          <div className="stat-num">{spentPercent}%</div>
          <div className="stat-lbl">Käyttöaste</div>
        </div>
      </div>

      {/* Budget bar */}
      {budget.totalBudget > 0 && (
        <div style={{ height: 8, background: 'var(--elev)', borderRadius: 4, marginBottom: '1.5rem', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: Math.min(spentPercent, 100) + '%', background: spentPercent > 90 ? 'var(--red)' : spentPercent > 70 ? 'var(--yellow)' : 'var(--green)', borderRadius: 4, transition: 'width .5s' }} />
        </div>
      )}

      {/* Edit total budget modal */}
      {editingBudget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setEditingBudget(false)}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '2rem', width: 360 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: '1rem' }}>Kokonaisbudjetti</h3>
            <input className="input" type="number" value={budgetInput} onChange={e => setBudgetInput(e.target.value)} placeholder="Esim. 50000" autoFocus style={{ marginBottom: '1rem' }} />
            <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setEditingBudget(false)}>Peruuta</button>
              <button className="btn btn-primary" onClick={saveTotalBudget}>Tallenna</button>
            </div>
          </div>
        </div>
      )}

      {/* Categories */}
      {budget.categories.map(cat => {
        const catSpent = cat.items.reduce((s, i) => s + (i.status !== 'planned' ? i.amount : 0), 0);
        const catTotal = cat.items.reduce((s, i) => s + i.amount, 0);
        const catPercent = cat.allocated > 0 ? Math.round((catSpent / cat.allocated) * 100) : 0;
        const isExpanded = expandedCat === cat.id;

        return (
          <div key={cat.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', marginBottom: '1rem' }}>
            <div onClick={() => setExpandedCat(isExpanded ? null : cat.id)} style={{ padding: '1.25rem 1.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{ color: 'var(--t3)', transition: 'transform .2s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0)' }}>{'\u25b6'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '.95rem', fontWeight: 700 }}>{cat.name}</div>
                <div style={{ fontSize: '.72rem', color: 'var(--t3)' }}>{cat.items.length} kulua {'\u00b7'} {catSpent.toLocaleString()} / {cat.allocated.toLocaleString()} {'\u20ac'}</div>
              </div>
              {cat.allocated > 0 && (
                <div style={{ width: 100, height: 6, background: 'var(--elev)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: Math.min(catPercent, 100) + '%', background: catPercent > 90 ? 'var(--red)' : 'var(--green)', borderRadius: 3 }} />
                </div>
              )}
              <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); deleteCategory(cat.id); }} style={{ color: 'var(--t3)', fontSize: '.7rem' }}>{'\u00d7'}</button>
            </div>

            {isExpanded && (
              <div style={{ padding: '0 1.5rem 1.25rem', borderTop: '1px solid var(--border)' }}>
                {cat.items.map(item => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '.75rem', padding: '.6rem 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '.85rem', fontWeight: 600 }}>{item.description}</div>
                      <div style={{ fontSize: '.68rem', color: 'var(--t3)' }}>{item.date}</div>
                    </div>
                    <div style={{ fontSize: '.88rem', fontWeight: 700 }}>{item.amount.toLocaleString()} {'\u20ac'}</div>
                    <select className="input" value={item.status} onChange={e => updateItemStatus(cat.id, item.id, e.target.value as any)} style={{ width: 'auto', fontSize: '.72rem', padding: '.25rem .4rem', color: statusColors[item.status] }}>
                      {Object.entries(statusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <button className="btn btn-ghost btn-sm" onClick={() => deleteItem(cat.id, item.id)} style={{ color: 'var(--t3)', fontSize: '.65rem' }}>{'\u00d7'}</button>
                  </div>
                ))}
                {/* Add item */}
                <div style={{ display: 'flex', gap: '.5rem', marginTop: '.75rem', alignItems: 'center' }}>
                  <input className="input" placeholder="Kuvaus" value={newItemDesc} onChange={e => setNewItemDesc(e.target.value)} style={{ flex: 1, fontSize: '.82rem' }} />
                  <input className="input" type="number" placeholder="Summa" value={newItemAmount} onChange={e => setNewItemAmount(e.target.value)} style={{ width: 100, fontSize: '.82rem' }} />
                  <input className="input" type="date" value={newItemDate} onChange={e => setNewItemDate(e.target.value)} style={{ width: 140, fontSize: '.82rem' }} />
                  <button className="btn btn-primary btn-sm" onClick={() => addItem(cat.id)} disabled={!newItemDesc.trim() || !newItemAmount}>+</button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Add category */}
      <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginTop: '1rem' }}>
        <input className="input" placeholder="Uusi kategoria (esim. Markkinointi)" value={newCatName} onChange={e => setNewCatName(e.target.value)} style={{ flex: 1 }} />
        <input className="input" type="number" placeholder="Budjetti" value={newCatAlloc} onChange={e => setNewCatAlloc(e.target.value)} style={{ width: 120 }} />
        <button className="btn btn-primary" onClick={addCategory} disabled={!newCatName.trim()}>Lisää kategoria</button>
      </div>
    </AppShell>
  );
}
