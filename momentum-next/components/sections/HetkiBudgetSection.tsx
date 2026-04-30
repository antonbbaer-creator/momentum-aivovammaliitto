'use client';

import { useMemo, useState } from 'react';
import { useOrgData } from '@/lib/firestore';
import { useToast } from '@/lib/toast';
import { useParams } from 'next/navigation';
import { Expense, makeExpense, expandExpensesByMonth, DEFAULT_EXPENSE_CATEGORIES } from '@/lib/expenses-shared';
import { Invoice, formatEur } from '@/lib/invoices-shared';
import { softDelete, filterActive } from '@/lib/trash';

const MONTHS_SHORT = ['Tam', 'Hel', 'Maa', 'Huh', 'Tou', 'Kes', 'Hei', 'Elo', 'Syy', 'Lok', 'Mar', 'Jou'];
const MONTHS_LONG  = ['Tammikuu', 'Helmikuu', 'Maaliskuu', 'Huhtikuu', 'Toukokuu', 'Kesäkuu', 'Heinäkuu', 'Elokuu', 'Syyskuu', 'Lokakuu', 'Marraskuu', 'Joulukuu'];

export default function HetkiBudgetSection() {
  const orgSlug = (useParams().orgSlug as string) || '';
  const { toast } = useToast();
  const [expenses, setExpenses] = useOrgData<Expense[]>('hetkiExpenses', []);
  const [invoices] = useOrgData<Invoice[]>('invoices', []);

  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const [fDescription, setFDescription] = useState('');
  const [fAmount, setFAmount] = useState('');
  const [fDate, setFDate] = useState(new Date().toISOString().slice(0, 10));
  const [fCategory, setFCategory] = useState('');
  const [fRecurring, setFRecurring] = useState<'' | 'monthly' | 'yearly'>('');
  const [fNotes, setFNotes] = useState('');

  const activeExpenses = useMemo(() => filterActive(expenses), [expenses]);
  const activeInvoices = useMemo(() => filterActive(invoices), [invoices]);

  // Tulot kuukausittain — netto € maksetuista + laskutetuista
  const monthlyIncome = useMemo(() => {
    const arr = new Array(12).fill(0);
    for (const inv of activeInvoices) {
      if (inv.status === 'cancelled' || inv.status === 'planned') continue;
      // Maksettu: paivamaaran mukaan jos paidDate, muuten issueDate
      // Laskutettu: issueDate
      const refDate = inv.status === 'paid' ? (inv.paidDate || inv.issueDate) : inv.issueDate;
      const d = new Date(refDate);
      if (d.getFullYear() === year) arr[d.getMonth()] += inv.amount;
    }
    return arr;
  }, [activeInvoices, year]);

  // Tulossa kuukausittain — planned-laskut issueDaten mukaan (ennuste)
  const monthlyPlanned = useMemo(() => {
    const arr = new Array(12).fill(0);
    for (const inv of activeInvoices) {
      if (inv.status !== 'planned') continue;
      const d = new Date(inv.issueDate);
      if (d.getFullYear() === year) arr[d.getMonth()] += inv.amount;
    }
    return arr;
  }, [activeInvoices, year]);

  const monthlyExpenses = useMemo(() => expandExpensesByMonth(activeExpenses, year), [activeExpenses, year]);

  // Yhteenvedot
  const totalIncome = monthlyIncome.reduce((a, b) => a + b, 0);
  const totalPlanned = monthlyPlanned.reduce((a, b) => a + b, 0);
  const totalExpenses = monthlyExpenses.reduce((a, b) => a + b, 0);
  const ytdProfit = totalIncome - totalExpenses;

  // Vuoden lopun ennuste:
  //  - YTD-tulos (toteuma) + tulossa (planned) - jaljella olevat menot keskiarvolla
  const now = new Date();
  const isCurrentYear = year === now.getFullYear();
  const monthsElapsed = isCurrentYear ? now.getMonth() + 1 : 12; // 1-12
  const remainingMonths = 12 - monthsElapsed;

  // Kuluttu tulot keskiarvo per kuukausi
  const incomeYtd = monthlyIncome.slice(0, monthsElapsed).reduce((a, b) => a + b, 0);
  const expensesYtd = monthlyExpenses.slice(0, monthsElapsed).reduce((a, b) => a + b, 0);
  const expenseRatePerMonth = monthsElapsed > 0 ? expensesYtd / monthsElapsed : 0;

  // Tuleva projektio:
  //   tulot: tulossa-laskut loppuvuodesta + ei-projisoida toteumaa eteenpain
  //   menot: ekstrapoloidaan keskiarvolla loppuvuodelle
  const futureIncome = monthlyPlanned.slice(monthsElapsed).reduce((a, b) => a + b, 0);
  const futureExpenses = expenseRatePerMonth * remainingMonths;
  const projectedProfit = isCurrentYear
    ? ytdProfit + futureIncome - futureExpenses
    : ytdProfit;

  // Vuosivalikoima
  const yearOptions = useMemo(() => {
    const set = new Set<number>([new Date().getFullYear()]);
    for (const e of activeExpenses) set.add(new Date(e.date).getFullYear());
    for (const i of activeInvoices) set.add(new Date(i.issueDate).getFullYear());
    return Array.from(set).sort((a, b) => b - a);
  }, [activeExpenses, activeInvoices]);

  // Lomake
  const resetForm = () => {
    setEditId(null);
    setFDescription(''); setFAmount(''); setFDate(new Date().toISOString().slice(0, 10));
    setFCategory(''); setFRecurring(''); setFNotes('');
  };
  const openNew = () => { resetForm(); setShowForm(true); };
  const openEdit = (e: Expense) => {
    setEditId(e.id);
    setFDescription(e.description);
    setFAmount(String(e.amount));
    setFDate(e.date);
    setFCategory(e.category || '');
    setFRecurring(e.recurring || '');
    setFNotes(e.notes || '');
    setShowForm(true);
  };
  const save = () => {
    const amt = parseFloat(fAmount.replace(',', '.'));
    if (!fDescription.trim() || !isFinite(amt) || amt <= 0) {
      toast('Anna kuvaus ja kelvollinen summa', 'error');
      return;
    }
    const base: Expense = {
      ...(editId ? activeExpenses.find(e => e.id === editId)! : makeExpense()),
      description: fDescription.trim(),
      amount: Math.round(amt * 100) / 100,
      date: fDate,
      category: fCategory || undefined,
      recurring: fRecurring || undefined,
      notes: fNotes.trim() || undefined,
    };
    if (editId) setExpenses(prev => prev.map(e => e.id === editId ? base : e));
    else setExpenses(prev => [base, ...prev]);
    setShowForm(false);
    resetForm();
    toast(editId ? 'Meno päivitetty' : 'Meno lisätty', 'success');
  };
  const remove = (id: string) => {
    if (!confirm('Poistetaanko meno?')) return;
    setExpenses(prev => softDelete(prev, id));
    toast('Meno siirretty roskakoriin', 'success');
  };

  if (orgSlug !== 'hetki-company') {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--t3)' }}>
        Hetki-budjetti on käytössä vain Hetki Company -työtilassa.
      </div>
    );
  }

  // Suurin kuukausilukema y-akselin skaalaukseen
  const maxMonthly = Math.max(
    ...monthlyIncome,
    ...monthlyPlanned,
    ...monthlyExpenses,
    1,
  );

  return (
    <>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <select
          value={year}
          onChange={e => setYear(Number(e.target.value))}
          className="input"
          style={{ fontSize: '.82rem', padding: '.35rem .5rem', width: 'auto' }}
        >
          {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary btn-sm" onClick={openNew}>+ Uusi meno</button>
      </div>

      {/* Yhteenvetokortit */}
      <div className="stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginBottom: '1.25rem' }}>
        <div className="stat">
          <div className="stat-num" style={{ color: '#2dd4a0' }}>{formatEur(totalIncome)}</div>
          <div className="stat-lbl">Tulot {year}</div>
        </div>
        <div className="stat">
          <div className="stat-num" style={{ color: '#e45c81' }}>{formatEur(totalExpenses)}</div>
          <div className="stat-lbl">Menot {year}</div>
        </div>
        <div className="stat">
          <div className="stat-num" style={{ color: ytdProfit >= 0 ? 'var(--t1)' : 'var(--red)' }}>
            {formatEur(ytdProfit)}
          </div>
          <div className="stat-lbl">Tulos toteuma</div>
        </div>
        {isCurrentYear && (
          <div className="stat">
            <div className="stat-num" style={{ color: projectedProfit >= 0 ? 'var(--pri-l)' : 'var(--red)' }}>
              {formatEur(projectedProfit)}
            </div>
            <div className="stat-lbl">Vuoden lopussa (ennuste)</div>
          </div>
        )}
      </div>

      {/* Ennusteen perustelu */}
      {isCurrentYear && remainingMonths > 0 && (
        <div style={{
          background: 'rgba(155,124,246,.06)', border: '1px dashed rgba(155,124,246,.4)',
          borderRadius: 'var(--rl)', padding: '.75rem 1rem', marginBottom: '1.25rem',
          fontSize: '.78rem', color: 'var(--t2)', lineHeight: 1.6,
        }}>
          <strong>Ennuste:</strong> Toteuma {formatEur(ytdProfit)} ({monthsElapsed} kk)
          + tulossa-laskut loppuvuodesta {formatEur(futureIncome)}
          − menot keskiarvolla ({formatEur(expenseRatePerMonth)}/kk × {remainingMonths} kk = {formatEur(futureExpenses)}).
        </div>
      )}

      {/* Kuukausinäkymä */}
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)',
        padding: '1rem 1.25rem', marginBottom: '1.25rem',
      }}>
        <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '.75rem' }}>
          Kuukausinäkymä
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', gap: '.4rem', alignItems: 'end' }}>
          {MONTHS_SHORT.map((mLabel, i) => {
            const inc = monthlyIncome[i];
            const planned = monthlyPlanned[i];
            const exp = monthlyExpenses[i];
            const profit = inc - exp;
            const isCurrentMonth = isCurrentYear && i === now.getMonth();
            const isPast = isCurrentYear && i < now.getMonth();
            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '.2rem', alignItems: 'center' }}>
                {/* Pylväät: tulo (vihreä) + tulossa (sininen) | menot (punainen) */}
                <div style={{ height: 80, display: 'flex', gap: 2, alignItems: 'flex-end', width: '100%' }}>
                  <div style={{
                    flex: 1, display: 'flex', flexDirection: 'column-reverse',
                    height: '100%',
                  }}>
                    {inc > 0 && (
                      <div style={{
                        height: `${(inc / maxMonthly) * 100}%`,
                        background: '#2dd4a0',
                        borderRadius: '2px 2px 0 0',
                      }} title={`Tulot: ${formatEur(inc)}`} />
                    )}
                    {planned > 0 && (
                      <div style={{
                        height: `${(planned / maxMonthly) * 100}%`,
                        background: '#3788b2',
                        opacity: 0.7,
                      }} title={`Tulossa: ${formatEur(planned)}`} />
                    )}
                  </div>
                  <div style={{
                    flex: 1, display: 'flex', flexDirection: 'column-reverse',
                    height: '100%',
                  }}>
                    {exp > 0 && (
                      <div style={{
                        height: `${(exp / maxMonthly) * 100}%`,
                        background: '#e45c81',
                        borderRadius: '2px 2px 0 0',
                      }} title={`Menot: ${formatEur(exp)}`} />
                    )}
                  </div>
                </div>
                <div style={{
                  fontSize: '.62rem',
                  fontWeight: isCurrentMonth ? 700 : 500,
                  color: isCurrentMonth ? 'var(--pri)' : isPast ? 'var(--t2)' : 'var(--t3)',
                }}>{mLabel}</div>
                <div style={{
                  fontSize: '.6rem',
                  color: profit >= 0 ? '#2dd4a0' : 'var(--red)',
                  fontWeight: 600,
                }}>{Math.abs(profit) > 0.5 ? formatEur(profit) : '—'}</div>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: '1rem', marginTop: '.75rem', fontSize: '.66rem', color: 'var(--t3)', flexWrap: 'wrap', justifyContent: 'center' }}>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#2dd4a0', marginRight: 4 }} />Tulot (toteutuneet)</span>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#3788b2', opacity: 0.7, marginRight: 4 }} />Tulossa (laskutus)</span>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#e45c81', marginRight: 4 }} />Menot</span>
        </div>
      </div>

      {/* Tulossa-laskutus huomautus */}
      {totalPlanned > 0 && (
        <div style={{ fontSize: '.78rem', color: 'var(--t3)', marginBottom: '1rem' }}>
          Lisäksi tulossa-laskuja yhteensä <strong style={{ color: 'var(--t2)' }}>{formatEur(totalPlanned)}</strong> jotka eivät ole vielä toteutuneessa tuloksessa.
        </div>
      )}

      {/* Menolista */}
      <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '.5rem' }}>
        Menot {year}
      </div>
      {activeExpenses.filter(e => {
        if (e.recurring) return true; // toistuvat aina mukaan
        return new Date(e.date).getFullYear() === year;
      }).length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--t3)', border: '1px dashed var(--border)', borderRadius: 'var(--rl)', fontSize: '.82rem' }}>
          Ei vielä menoja vuodelta {year}. Lisää ensimmäinen "+ Uusi meno" -napista.
        </div>
      ) : (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', overflow: 'hidden' }}>
          {activeExpenses
            .filter(e => e.recurring || new Date(e.date).getFullYear() === year)
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((e, i) => (
              <div
                key={e.id}
                onClick={() => openEdit(e)}
                style={{
                  padding: '.7rem 1rem',
                  borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '.75rem',
                }}
                onMouseEnter={ev => (ev.currentTarget as HTMLElement).style.background = 'var(--elev)'}
                onMouseLeave={ev => (ev.currentTarget as HTMLElement).style.background = 'transparent'}
              >
                <div style={{ fontSize: '.7rem', color: 'var(--t3)', width: 82, flexShrink: 0 }}>
                  {new Date(e.date).toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' })}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '.86rem', fontWeight: 600, marginBottom: '.1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.description}
                  </div>
                  <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    {e.category && (
                      <span style={{ fontSize: '.6rem', padding: '.08rem .4rem', borderRadius: 9999, background: 'var(--elev)', color: 'var(--t2)', fontWeight: 600 }}>
                        {e.category}
                      </span>
                    )}
                    {e.recurring && (
                      <span style={{ fontSize: '.6rem', padding: '.08rem .4rem', borderRadius: 9999, background: 'rgba(241,180,52,.12)', color: '#f1b434', fontWeight: 700, textTransform: 'uppercase' }}>
                        {e.recurring === 'monthly' ? '↻ Joka kk' : '↻ Joka vuosi'}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: '.92rem', fontWeight: 700, color: '#e45c81', whiteSpace: 'nowrap' }}>
                  −{formatEur(e.amount)}
                </div>
                <button
                  onClick={ev => { ev.stopPropagation(); remove(e.id); }}
                  style={{ background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', fontSize: '.8rem', padding: '.2rem .3rem' }}
                  title="Poista"
                >×</button>
              </div>
            ))}
        </div>
      )}

      {/* Lomake */}
      {showForm && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={() => setShowForm(false)}
        >
          <div
            style={{
              background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: 'var(--rl)', padding: '1.75rem',
              width: 560, maxWidth: '94vw', maxHeight: '92vh', overflowY: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', marginBottom: '1rem' }}>
              {editId ? 'Muokkaa menoa' : 'Uusi meno'}
            </h3>

            <div className="field">
              <label>Kuvaus *</label>
              <input
                className="input"
                value={fDescription}
                onChange={e => setFDescription(e.target.value)}
                autoFocus
                placeholder="Esim. Adobe Creative Cloud"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '.6rem' }}>
              <div className="field">
                <label>Summa (€) *</label>
                <input
                  className="input"
                  value={fAmount}
                  onChange={e => setFAmount(e.target.value)}
                  placeholder="0,00"
                  inputMode="decimal"
                />
              </div>
              <div className="field">
                <label>Päivä</label>
                <input type="date" className="input" value={fDate} onChange={e => setFDate(e.target.value)} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.6rem' }}>
              <div className="field">
                <label>Kategoria</label>
                <select className="input" value={fCategory} onChange={e => setFCategory(e.target.value)}>
                  <option value="">—</option>
                  {DEFAULT_EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Toistuvuus</label>
                <select
                  className="input"
                  value={fRecurring}
                  onChange={e => setFRecurring(e.target.value as '' | 'monthly' | 'yearly')}
                >
                  <option value="">Kertaluonteinen</option>
                  <option value="monthly">Joka kuukausi</option>
                  <option value="yearly">Joka vuosi</option>
                </select>
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
              <button className="btn btn-primary" onClick={save} disabled={!fDescription.trim() || !fAmount}>Tallenna</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
