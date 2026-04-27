'use client';

import { useState, useMemo, useEffect } from 'react';
import { useParams } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { useOrgData } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { useIsMobile } from '@/lib/use-mobile';
import { softDelete, filterActive } from '@/lib/trash';
import { getOrgTeamMembers } from '@/lib/org-defaults';
import { OrgTeamMember, uniqueMembersByName } from '@/lib/team-shared';
import {
  BudgetEntry, BudgetCategory, BudgetSettings,
  DEFAULT_BUDGET_SETTINGS,
  calculateSplit, summarizeByCategory, totalForYear, fmtEur,
} from '@/lib/budjetti-shared';
import { IHAA_BUDGET_CATEGORIES, IHAA_BUDGET_SETTINGS } from '@/lib/ihaa-defaults';
import BudgetPlanSection from '@/components/sections/BudgetPlanSection';

// Koodi-defaultit orgSlugin perusteella. Jos Firestoressa on data, se voittaa.
function defaultCategoriesForOrg(orgSlug: string): BudgetCategory[] {
  if (orgSlug === 'ihaa') return IHAA_BUDGET_CATEGORIES;
  return [];
}
function defaultSettingsForOrg(orgSlug: string): BudgetSettings {
  if (orgSlug === 'ihaa') return IHAA_BUDGET_SETTINGS;
  return DEFAULT_BUDGET_SETTINGS;
}

export default function BudjettiPage() {
  const params = useParams();
  const orgSlug = (params.orgSlug as string) || '';
  const { user, canEdit } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  // Koodi-defaultit org-spesifeille budjettikategorioille ja asetuksille.
  // useOrgData kytkee niihin kun Firestoressa ei ole vielä arvoa.
  const catDefaults = useMemo(() => defaultCategoriesForOrg(orgSlug), [orgSlug]);
  const settingsDefaults = useMemo(() => defaultSettingsForOrg(orgSlug), [orgSlug]);

  const [entries, setEntries] = useOrgData<BudgetEntry[]>('budgetEntries', []);
  const [categories, setCategories] = useOrgData<BudgetCategory[]>('budgetCategories', catDefaults);
  const [settings, setSettings] = useOrgData<BudgetSettings>('budgetSettings', settingsDefaults);
  const [membersRaw] = useOrgData<OrgTeamMember[]>('orgTeamMembers', getOrgTeamMembers(orgSlug));
  const members = useMemo(() => uniqueMembersByName(membersRaw), [membersRaw]);

  const [year, setYear] = useState<number>(settings.defaultYear || new Date().getFullYear());
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterPaidBy, setFilterPaidBy] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'plan' | 'actual'>('plan');

  // Sync year picker with org's default
  useEffect(() => {
    if (settings.defaultYear && year !== settings.defaultYear && year === new Date().getFullYear()) {
      setYear(settings.defaultYear);
    }
  }, [settings.defaultYear]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Form state ──
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [fDate, setFDate] = useState(new Date().toISOString().slice(0, 10));
  const [fDesc, setFDesc] = useState('');
  const [fAmount, setFAmount] = useState('');
  const [fCategory, setFCategory] = useState('');
  const [fPaidBy, setFPaidBy] = useState('');
  const [fVendor, setFVendor] = useState('');
  const [fInvoice, setFInvoice] = useState('');
  const [fVat, setFVat] = useState('');
  const [fNotes, setFNotes] = useState('');

  const openNew = () => {
    setEditId(null);
    setFDate(new Date().toISOString().slice(0, 10));
    setFDesc('');
    setFAmount('');
    setFCategory('');
    setFPaidBy('');
    setFVendor('');
    setFInvoice('');
    setFVat('');
    setFNotes('');
    setShowForm(true);
  };

  const openEdit = (e: BudgetEntry) => {
    setEditId(e.id);
    setFDate(e.date);
    setFDesc(e.description);
    setFAmount(String(e.amount));
    setFCategory(e.category || '');
    setFPaidBy(e.paidBy || '');
    setFVendor(e.vendor || '');
    setFInvoice(e.invoiceNumber || '');
    setFVat(e.vat != null ? String(e.vat) : '');
    setFNotes(e.notes || '');
    setShowForm(true);
  };

  const save = () => {
    const amt = parseFloat(fAmount.replace(',', '.'));
    if (!fDesc.trim() || !isFinite(amt) || amt <= 0) {
      toast('Anna kuvaus ja kelvollinen summa', 'error');
      return;
    }
    const now = Date.now();
    const base: BudgetEntry = {
      id: editId || 'be_' + now + '_' + Math.random().toString(36).slice(2, 6),
      date: fDate,
      description: fDesc.trim(),
      amount: Math.round(amt * 100) / 100,
      category: fCategory || undefined,
      paidBy: fPaidBy || undefined,
      vendor: fVendor.trim() || undefined,
      invoiceNumber: fInvoice.trim() || undefined,
      vat: fVat ? parseFloat(fVat.replace(',', '.')) : undefined,
      notes: fNotes.trim() || undefined,
      createdAt: editId ? entries.find(e => e.id === editId)?.createdAt ?? now : now,
      createdBy: user?.uid,
    };
    if (editId) setEntries(prev => prev.map(e => e.id === editId ? base : e));
    else setEntries(prev => [base, ...prev]);
    setShowForm(false);
    toast(editId ? 'Merkintä päivitetty' : 'Merkintä lisätty', 'success');
  };

  const remove = (id: string) => {
    if (!confirm('Poistetaanko merkintä?')) return;
    setEntries(prev => softDelete(prev, id));
    toast('Siirretty roskakoriin', 'success');
  };

  // ── Category management ──
  const [showCatForm, setShowCatForm] = useState(false);
  const [catName, setCatName] = useState('');
  const [catColor, setCatColor] = useState('#9b7cf6');
  const [catTarget, setCatTarget] = useState('');

  const addCategory = () => {
    if (!catName.trim()) return;
    const cat: BudgetCategory = {
      id: 'cat_' + Date.now(),
      name: catName.trim(),
      color: catColor,
      target: catTarget ? parseFloat(catTarget.replace(',', '.')) : undefined,
      year: catTarget ? year : undefined,
    };
    setCategories(prev => [...prev, cat]);
    setCatName(''); setCatTarget(''); setShowCatForm(false);
    toast('Kategoria lisätty', 'success');
  };

  const removeCategory = (id: string) => {
    if (!confirm('Poistetaanko kategoria? Merkinnät säilyvät mutta niiden kategoria tyhjenee.')) return;
    setCategories(prev => softDelete(prev, id));
    setEntries(prev => prev.map(e => e.category === id ? { ...e, category: undefined } : e));
  };

  // ── Settings ──
  const toggleSplit = () => {
    setSettings({ ...settings, showSplit: !settings.showSplit });
  };

  // ── Derived ──
  const activeEntries = useMemo(() => filterActive(entries), [entries]);
  const activeCategories = useMemo(() => categories.filter(c => !c.deletedAt), [categories]);

  const yearEntries = useMemo(
    () => activeEntries.filter(e => new Date(e.date).getFullYear() === year),
    [activeEntries, year]
  );

  const filtered = useMemo(() => {
    let list = yearEntries;
    if (filterCategory !== 'all') list = list.filter(e => (e.category || '') === (filterCategory === '__none' ? '' : filterCategory));
    if (filterPaidBy !== 'all') list = list.filter(e => (e.paidBy || '') === filterPaidBy);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(e =>
        e.description.toLowerCase().includes(q) ||
        (e.vendor || '').toLowerCase().includes(q) ||
        (e.notes || '').toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  }, [yearEntries, filterCategory, filterPaidBy, search]);

  const totals = useMemo(() => totalForYear(activeEntries, year), [activeEntries, year]);

  const catSummary = useMemo(
    () => summarizeByCategory(activeEntries, activeCategories, year),
    [activeEntries, activeCategories, year]
  );

  const splitPeople = useMemo(() => {
    if (!settings.showSplit) return [];
    if (settings.splitMembers?.length) return settings.splitMembers;
    return members.map(m => m.name);
  }, [settings.showSplit, settings.splitMembers, members]);

  const split = useMemo(
    () => settings.showSplit ? calculateSplit(yearEntries, splitPeople) : null,
    [settings.showSplit, yearEntries, splitPeople]
  );

  const years = useMemo(() => {
    const ys = new Set<number>([new Date().getFullYear(), settings.defaultYear || new Date().getFullYear()]);
    for (const e of activeEntries) ys.add(new Date(e.date).getFullYear());
    return Array.from(ys).sort((a, b) => b - a);
  }, [activeEntries, settings.defaultYear]);

  const paidByOptions = useMemo(() => {
    const s = new Set<string>();
    for (const e of activeEntries) if (e.paidBy) s.add(e.paidBy);
    for (const m of members) s.add(m.name);
    return Array.from(s).sort();
  }, [activeEntries, members]);

  const categoryName = (id?: string) => {
    if (!id) return '';
    const c = activeCategories.find(c => c.id === id);
    return c?.name || id;
  };
  const categoryColor = (id?: string) => {
    const c = activeCategories.find(c => c.id === id);
    return c?.color || 'var(--t3)';
  };

  return (
    <AppShell title="Budjetti" subtitle={view === 'plan' ? 'Suunniteltu budjetti' : `${fmtEur(totals.expenses)} kuluja — ${totals.count} merkintää (${year})`}>
      {/* View tabs */}
      <div style={{ display: 'flex', gap: '.35rem', marginBottom: '1rem', background: 'var(--elev)', borderRadius: 'var(--r)', padding: '3px', width: 'fit-content' }}>
        <button className={`cal-view-btn ${view === 'plan' ? 'act' : ''}`} onClick={() => setView('plan')}>
          Suunnitelma
        </button>
        <button className={`cal-view-btn ${view === 'actual' ? 'act' : ''}`} onClick={() => setView('actual')}>
          Toteuma
        </button>
      </div>

      {view === 'plan' ? (
        <BudgetPlanSection />
      ) : (
      <>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'center' }}>
        <select
          value={year}
          onChange={e => setYear(Number(e.target.value))}
          className="input"
          style={{ fontSize: '.82rem', padding: '.35rem .5rem', width: 'auto' }}
        >
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        {canEdit && (
          <>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem', fontSize: '.72rem', color: 'var(--t2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={!!settings.showSplit} onChange={toggleSplit} />
              Jaetut kulut
            </label>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowCatForm(v => !v)}>
              {showCatForm ? 'Sulje kategoriat' : 'Kategoriat'}
            </button>
            <button className="btn btn-primary btn-sm" onClick={openNew}>+ Uusi kulu</button>
          </>
        )}
      </div>

      {/* Summary cards */}
      <div className="stats" style={{ gridTemplateColumns: settings.showSplit ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)', marginBottom: '1.25rem' }}>
        <div className="stat">
          <div className="stat-num">{fmtEur(totals.expenses)}</div>
          <div className="stat-lbl">Kulut {year}</div>
        </div>
        <div className="stat">
          <div className="stat-num">{totals.count}</div>
          <div className="stat-lbl">Merkintää</div>
        </div>
        {settings.showSplit && splitPeople.length > 0 && split && (
          <div className="stat">
            <div className="stat-num">{fmtEur(split.perPersonShare)}</div>
            <div className="stat-lbl">/ henkilö</div>
          </div>
        )}
      </div>

      {/* Split view — jaetut kulut */}
      {settings.showSplit && split && splitPeople.length > 0 && (
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)',
          padding: '1rem 1.25rem', marginBottom: '1.25rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '.5rem', marginBottom: '.75rem' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.9rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>
              Jaetut kulut
            </h3>
            <span style={{ fontSize: '.72rem', color: 'var(--t3)' }}>
              {fmtEur(split.total)} yhteensä · {fmtEur(split.perPersonShare)} / henkilö
            </span>
          </div>

          {/* Per-person balances */}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${isMobile ? 1 : Math.min(split.rows.length, 4)}, 1fr)`, gap: '.5rem', marginBottom: '.75rem' }}>
            {split.rows.map(r => {
              const bal = r.balance;
              const bg = bal > 0.005 ? 'rgba(45,212,160,.08)' : bal < -0.005 ? 'rgba(239,107,107,.08)' : 'var(--elev)';
              const fg = bal > 0.005 ? 'var(--green)' : bal < -0.005 ? 'var(--red)' : 'var(--t3)';
              return (
                <div key={r.name} style={{
                  background: bg, border: '1px solid var(--border)',
                  borderRadius: 'var(--r)', padding: '.6rem .8rem',
                }}>
                  <div style={{ fontSize: '.78rem', fontWeight: 700, marginBottom: '.15rem' }}>{r.name}</div>
                  <div style={{ fontSize: '.68rem', color: 'var(--t3)' }}>
                    Maksoi {fmtEur(r.paid)}
                  </div>
                  <div style={{ fontSize: '.82rem', fontWeight: 700, color: fg, marginTop: '.2rem' }}>
                    {bal > 0.005 ? '+' : ''}{fmtEur(bal)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Transfers */}
          {split.transfers.length > 0 ? (
            <div>
              <div style={{ fontSize: '.65rem', fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '.35rem' }}>
                Tasaus
              </div>
              {split.transfers.map((t, i) => (
                <div key={i} style={{ fontSize: '.82rem', padding: '.3rem 0', color: 'var(--t1)' }}>
                  <strong>{t.from}</strong> maksaa <strong>{t.to}</strong>:lle <strong style={{ color: 'var(--pri-l)' }}>{fmtEur(t.amount)}</strong>
                </div>
              ))}
            </div>
          ) : split.total > 0 ? (
            <div style={{ fontSize: '.78rem', color: 'var(--green)', fontStyle: 'italic' }}>
              Saldot ovat tasan — kaikki maksoivat omansa.
            </div>
          ) : null}
        </div>
      )}

      {/* Categories editor */}
      {showCatForm && canEdit && (
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)',
          padding: '1rem 1.25rem', marginBottom: '1.25rem',
        }}>
          <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '.5rem' }}>
            Kategoriat
          </div>
          <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginBottom: '.75rem' }}>
            {activeCategories.map(c => (
              <span key={c.id} style={{
                display: 'inline-flex', alignItems: 'center', gap: '.3rem',
                fontSize: '.72rem', padding: '.25rem .55rem', borderRadius: 9999,
                background: c.color + '22', color: c.color, fontWeight: 600,
                border: `1px solid ${c.color}44`,
              }}>
                {c.name}
                {c.target && <span style={{ fontSize: '.65rem', opacity: 0.7 }}>{fmtEur(c.target)}</span>}
                <button onClick={() => removeCategory(c.id)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '.78rem', padding: 0, lineHeight: 1 }}>×</button>
              </span>
            ))}
            {activeCategories.length === 0 && <span style={{ fontSize: '.72rem', color: 'var(--t3)', fontStyle: 'italic' }}>Ei kategorioita.</span>}
          </div>
          <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              className="input"
              placeholder="Nimi (esim. Moottori)"
              value={catName}
              onChange={e => setCatName(e.target.value)}
              style={{ flex: '1 1 180px', fontSize: '.78rem' }}
            />
            <input
              type="color"
              value={catColor}
              onChange={e => setCatColor(e.target.value)}
              style={{ width: 34, height: 34, border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 2, background: 'var(--elev)' }}
            />
            <input
              className="input"
              placeholder="Tavoite €/v"
              value={catTarget}
              onChange={e => setCatTarget(e.target.value)}
              style={{ width: 110, fontSize: '.78rem' }}
            />
            <button className="btn btn-primary btn-sm" onClick={addCategory} disabled={!catName.trim()} style={{ fontSize: '.72rem' }}>
              + Lisää
            </button>
          </div>
        </div>
      )}

      {/* Category summary bars */}
      {catSummary.length > 0 && (
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)',
          padding: '1rem 1.25rem', marginBottom: '1.25rem',
        }}>
          <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '.6rem' }}>
            Kulut kategorioittain
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
            {catSummary.sort((a, b) => b.spent - a.spent).map(c => (
              <div key={c.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '.2rem' }}>
                  <span style={{ fontSize: '.78rem', fontWeight: 600, color: c.color }}>{c.name}</span>
                  <span style={{ fontSize: '.72rem', color: 'var(--t2)' }}>
                    {fmtEur(c.spent)}{c.target ? ` / ${fmtEur(c.target)}` : ''}
                  </span>
                </div>
                <div style={{ height: 6, background: 'var(--elev)', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
                  <div style={{
                    position: 'absolute', top: 0, left: 0, bottom: 0,
                    width: c.target ? `${Math.min((c.progress || 0) * 100, 100)}%` : `${Math.min((c.spent / Math.max(...catSummary.map(x => x.spent), 1)) * 100, 100)}%`,
                    background: c.color,
                    opacity: c.target && (c.progress || 0) > 1 ? 1 : 0.85,
                  }} />
                  {c.target && (c.progress || 0) > 1 && (
                    <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 3, background: 'var(--red)' }} />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      {(activeEntries.length > 0 || search) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem', alignItems: 'center', marginBottom: '1rem' }}>
          <input
            placeholder="Hae…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex: '1 1 180px', fontSize: '.78rem', padding: '.3rem .55rem', background: 'var(--elev)', border: '1px solid var(--border)', borderRadius: 'var(--r)', color: 'var(--t1)', outline: 'none' }}
          />
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            style={{ fontSize: '.72rem', padding: '.3rem .4rem', background: 'var(--elev)', border: '1px solid var(--border)', borderRadius: 'var(--r)', color: 'var(--t1)' }}
          >
            <option value="all">Kaikki kategoriat</option>
            {activeCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value="__none">Ei kategoriaa</option>
          </select>
          {paidByOptions.length > 0 && (
            <select
              value={filterPaidBy}
              onChange={e => setFilterPaidBy(e.target.value)}
              style={{ fontSize: '.72rem', padding: '.3rem .4rem', background: 'var(--elev)', border: '1px solid var(--border)', borderRadius: 'var(--r)', color: 'var(--t1)' }}
            >
              <option value="all">Kaikki maksajat</option>
              {paidByOptions.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
          {(filterCategory !== 'all' || filterPaidBy !== 'all' || search) && (
            <button
              onClick={() => { setFilterCategory('all'); setFilterPaidBy('all'); setSearch(''); }}
              style={{ fontSize: '.7rem', padding: '.3rem .55rem', background: 'transparent', border: 'none', color: 'var(--t3)', cursor: 'pointer' }}
            >
              Tyhjennä
            </button>
          )}
        </div>
      )}

      {/* Entries list */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--t3)', border: '1px dashed var(--border)', borderRadius: 'var(--rl)' }}>
          {activeEntries.length === 0 ? (
            <>
              <p style={{ fontSize: '.95rem', color: 'var(--t2)', marginBottom: '.5rem', fontWeight: 600 }}>Ei vielä merkintöjä.</p>
              <p style={{ fontSize: '.78rem', maxWidth: 400, margin: '0 auto', lineHeight: 1.6 }}>
                Lisää ensimmäinen "+ Uusi kulu" -napista. Merkitse kuka maksoi, jos haluat että jakolaskelma toimii.
              </p>
            </>
          ) : (
            <p style={{ fontSize: '.82rem' }}>Ei merkintöjä valituilla suodattimilla tässä vuodessa.</p>
          )}
        </div>
      ) : (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', overflow: 'hidden' }}>
          {filtered.map((e, i) => {
            return (
              <div
                key={e.id}
                onClick={() => canEdit && openEdit(e)}
                style={{
                  padding: '.7rem 1rem',
                  borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                  cursor: canEdit ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', gap: '.75rem',
                }}
                onMouseEnter={ev => { if (canEdit) (ev.currentTarget as HTMLElement).style.background = 'var(--elev)'; }}
                onMouseLeave={ev => { if (canEdit) (ev.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <div style={{ fontSize: '.7rem', color: 'var(--t3)', width: 82, flexShrink: 0 }}>
                  {new Date(e.date).toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' })}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '.86rem', fontWeight: 600, marginBottom: '.1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.description}
                    {e.vendor && <span style={{ fontSize: '.7rem', color: 'var(--t3)', marginLeft: '.5rem', fontWeight: 400 }}>· {e.vendor}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: '.35rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    {e.category && (
                      <span style={{
                        fontSize: '.6rem', padding: '.08rem .4rem', borderRadius: 9999,
                        background: categoryColor(e.category) + '22', color: categoryColor(e.category),
                        fontWeight: 600,
                      }}>
                        {categoryName(e.category)}
                      </span>
                    )}
                    {e.paidBy && (
                      <span style={{ fontSize: '.65rem', color: 'var(--t3)' }}>
                        maksoi {e.paidBy}
                      </span>
                    )}
                    {e.invoiceNumber && (
                      <span style={{ fontSize: '.6rem', color: 'var(--t3)' }}>#{e.invoiceNumber}</span>
                    )}
                  </div>
                </div>
                <div style={{
                  fontSize: '.92rem', fontWeight: 700,
                  color: 'var(--t1)',
                  whiteSpace: 'nowrap',
                }}>
                  {fmtEur(e.amount)}
                </div>
                {canEdit && (
                  <button
                    onClick={ev => { ev.stopPropagation(); remove(e.id); }}
                    style={{ background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', fontSize: '.8rem', padding: '.2rem .3rem' }}
                    title="Poista"
                  >×</button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowForm(false)}
        >
          <div
            style={{
              background: 'var(--card)',
              border: isMobile ? 'none' : '1px solid var(--border)',
              borderRadius: isMobile ? 0 : 'var(--rl)',
              padding: isMobile ? '1.25rem' : '1.75rem',
              width: isMobile ? '100%' : 560,
              maxWidth: isMobile ? '100%' : '92vw',
              maxHeight: isMobile ? '100%' : '92vh',
              height: isMobile ? '100%' : 'auto',
              overflowY: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', marginBottom: '1rem' }}>
              {editId ? 'Muokkaa merkintää' : 'Uusi merkintä'}
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: '.6rem' }}>
              <div className="field">
                <label>Kuvaus *</label>
                <input className="input" value={fDesc} onChange={e => setFDesc(e.target.value)} autoFocus placeholder="Esim. Pohjamaali 2 L" />
              </div>
              <div className="field">
                <label>Summa (€) *</label>
                <input className="input" value={fAmount} onChange={e => setFAmount(e.target.value)} placeholder="0,00" inputMode="decimal" />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr', gap: '.6rem' }}>
              <div className="field">
                <label>Päivä</label>
                <input type="date" className="input" value={fDate} onChange={e => setFDate(e.target.value)} />
              </div>
              <div className="field">
                <label>Kategoria</label>
                <select className="input" value={fCategory} onChange={e => setFCategory(e.target.value)}>
                  <option value="">—</option>
                  {activeCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Maksoi</label>
                <select className="input" value={fPaidBy} onChange={e => setFPaidBy(e.target.value)}>
                  <option value="">—</option>
                  {members.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: '.6rem' }}>
              <div className="field">
                <label>Toimittaja</label>
                <input className="input" value={fVendor} onChange={e => setFVendor(e.target.value)} placeholder="Esim. Motonet" />
              </div>
              <div className="field">
                <label>Laskun numero</label>
                <input className="input" value={fInvoice} onChange={e => setFInvoice(e.target.value)} />
              </div>
              <div className="field">
                <label>ALV-%</label>
                <input className="input" value={fVat} onChange={e => setFVat(e.target.value)} placeholder="25,5" inputMode="decimal" />
              </div>
            </div>

            <div className="field">
              <label>Muistiinpano</label>
              <textarea className="input textarea" value={fNotes} onChange={e => setFNotes(e.target.value)} rows={3} />
            </div>

            <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              {editId && (
                <button className="btn btn-ghost btn-sm" onClick={() => { remove(editId); setShowForm(false); }} style={{ color: 'var(--red)', marginRight: 'auto' }}>
                  Poista
                </button>
              )}
              <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Peruuta</button>
              <button className="btn btn-primary" onClick={save} disabled={!fDesc.trim() || !fAmount}>Tallenna</button>
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </AppShell>
  );
}
