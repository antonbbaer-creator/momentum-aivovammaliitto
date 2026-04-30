'use client';

import { useMemo, useState } from 'react';
import { useOrgData } from '@/lib/firestore';
import { useToast } from '@/lib/toast';
import { useParams } from 'next/navigation';
import {
  Invoice, InvoiceStatus, INVOICE_STATUS_META, INVOICE_STATUS_ORDER,
  makeInvoice, isOverdue, formatEur, DEFAULT_VAT_RATE,
} from '@/lib/invoices-shared';
import type { Client } from '@/lib/clients-shared';
import { softDelete, filterActive } from '@/lib/trash';

type StatusFilter = 'all' | InvoiceStatus | 'overdue';

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'Kaikki' },
  { id: 'planned', label: 'Tulossa' },
  { id: 'invoiced', label: 'Laskutettu' },
  { id: 'overdue', label: 'Myöhässä' },
  { id: 'paid', label: 'Maksettu' },
  { id: 'cancelled', label: 'Peruutettu' },
];

export default function InvoicingSection() {
  const orgSlug = (useParams().orgSlug as string) || '';
  const { toast } = useToast();
  const [invoices, setInvoices] = useOrgData<Invoice[]>('invoices', []);
  const [clients] = useOrgData<Client[]>('clients', []);

  const [filter, setFilter] = useState<StatusFilter>('all');
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  // Lomake-tilat
  const [fClient, setFClient] = useState('');
  const [fDescription, setFDescription] = useState('');
  const [fAmount, setFAmount] = useState('');
  const [fVat, setFVat] = useState(String(DEFAULT_VAT_RATE));
  const [fStatus, setFStatus] = useState<InvoiceStatus>('planned');
  const [fIssueDate, setFIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [fDueDate, setFDueDate] = useState('');
  const [fPaidDate, setFPaidDate] = useState('');
  const [fInvoiceNumber, setFInvoiceNumber] = useState('');
  const [fNotes, setFNotes] = useState('');

  const activeInvoices = useMemo(() => filterActive(invoices), [invoices]);

  // Asiakaslista lomakkeen pudotusvalikkoon
  const knownClients = useMemo(() => {
    const set = new Set<string>();
    for (const c of clients) if (!c.deletedAt) set.add(c.name.trim());
    for (const i of activeInvoices) if (i.clientName) set.add(i.clientName.trim());
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fi'));
  }, [clients, activeInvoices]);

  // Vuosivalikoiman valinnat (perustuvat olemassa oleviin laskuihin + nykyinen)
  const yearOptions = useMemo(() => {
    const set = new Set<number>([new Date().getFullYear()]);
    for (const i of activeInvoices) {
      if (i.issueDate) set.add(new Date(i.issueDate).getFullYear());
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [activeInvoices]);

  // Suodatettu vuoteen
  const yearInvoices = useMemo(
    () => activeInvoices.filter(i => new Date(i.issueDate).getFullYear() === year),
    [activeInvoices, year]
  );

  // Yhteenvedot (netto €)
  const totals = useMemo(() => {
    let planned = 0, invoiced = 0, paid = 0, overdueAmt = 0;
    for (const i of yearInvoices) {
      if (i.status === 'planned') planned += i.amount;
      else if (i.status === 'invoiced') {
        invoiced += i.amount;
        if (isOverdue(i)) overdueAmt += i.amount;
      } else if (i.status === 'paid') paid += i.amount;
    }
    return {
      planned, invoiced, paid, overdueAmt,
      pipeline: planned + invoiced,    // tulossa + laskutettu (odottaa)
      total: planned + invoiced + paid, // koko vuoden potentiaali
    };
  }, [yearInvoices]);

  // Asiakaskohtainen yhteenveto (vuoden sisältä, netto €)
  const byClient = useMemo(() => {
    const map = new Map<string, { name: string; planned: number; invoiced: number; paid: number; total: number; count: number }>();
    for (const i of yearInvoices) {
      const key = (i.clientName || '').trim() || '(Ei asiakasta)';
      const cur = map.get(key) || { name: key, planned: 0, invoiced: 0, paid: 0, total: 0, count: 0 };
      if (i.status === 'planned') cur.planned += i.amount;
      else if (i.status === 'invoiced') cur.invoiced += i.amount;
      else if (i.status === 'paid') cur.paid += i.amount;
      if (i.status !== 'cancelled') {
        cur.total += i.amount;
        cur.count += 1;
      }
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [yearInvoices]);

  const maxClientTotal = byClient.length > 0 ? Math.max(...byClient.map(c => c.total)) : 1;

  // Suodatetut laskut näytettäväksi
  const displayInvoices = useMemo(() => {
    let list = yearInvoices;
    if (filter === 'overdue') {
      list = list.filter(i => i.status === 'invoiced' && isOverdue(i));
    } else if (filter !== 'all') {
      list = list.filter(i => i.status === filter);
    }
    return [...list].sort((a, b) => b.issueDate.localeCompare(a.issueDate));
  }, [yearInvoices, filter]);

  const counts = useMemo(() => ({
    all: yearInvoices.length,
    planned: yearInvoices.filter(i => i.status === 'planned').length,
    invoiced: yearInvoices.filter(i => i.status === 'invoiced').length,
    overdue: yearInvoices.filter(i => i.status === 'invoiced' && isOverdue(i)).length,
    paid: yearInvoices.filter(i => i.status === 'paid').length,
    cancelled: yearInvoices.filter(i => i.status === 'cancelled').length,
  }), [yearInvoices]);

  const resetForm = () => {
    setEditId(null);
    setFClient(''); setFDescription(''); setFAmount('');
    setFVat(String(DEFAULT_VAT_RATE));
    setFStatus('planned');
    setFIssueDate(new Date().toISOString().slice(0, 10));
    setFDueDate(''); setFPaidDate(''); setFInvoiceNumber(''); setFNotes('');
  };

  const openNew = () => { resetForm(); setShowForm(true); };

  const openEdit = (inv: Invoice) => {
    setEditId(inv.id);
    setFClient(inv.clientName || '');
    setFDescription(inv.description || '');
    setFAmount(String(inv.amount || ''));
    setFVat(String(inv.vatRate ?? DEFAULT_VAT_RATE));
    setFStatus(inv.status);
    setFIssueDate(inv.issueDate || new Date().toISOString().slice(0, 10));
    setFDueDate(inv.dueDate || '');
    setFPaidDate(inv.paidDate || '');
    setFInvoiceNumber(inv.invoiceNumber || '');
    setFNotes(inv.notes || '');
    setShowForm(true);
  };

  const save = () => {
    const amt = parseFloat(fAmount.replace(',', '.'));
    if (!fDescription.trim() || !isFinite(amt) || amt <= 0) {
      toast('Anna kuvaus ja kelvollinen summa', 'error');
      return;
    }
    const vat = parseFloat(fVat.replace(',', '.')) || 0;

    if (editId) {
      setInvoices(prev => prev.map(i => i.id === editId ? {
        ...i,
        clientName: fClient.trim(),
        description: fDescription.trim(),
        amount: Math.round(amt * 100) / 100,
        vatRate: vat,
        status: fStatus,
        issueDate: fIssueDate,
        dueDate: fDueDate || undefined,
        paidDate: fPaidDate || undefined,
        invoiceNumber: fInvoiceNumber.trim() || undefined,
        notes: fNotes.trim() || undefined,
      } : i));
      toast('Lasku päivitetty', 'success');
    } else {
      const inv = makeInvoice(fClient, {
        description: fDescription.trim(),
        amount: Math.round(amt * 100) / 100,
        vatRate: vat,
        status: fStatus,
        issueDate: fIssueDate,
        dueDate: fDueDate || undefined,
        paidDate: fPaidDate || undefined,
        invoiceNumber: fInvoiceNumber.trim() || undefined,
        notes: fNotes.trim() || undefined,
      });
      setInvoices(prev => [inv, ...prev]);
      toast('Lasku lisätty', 'success');
    }
    setShowForm(false);
    resetForm();
  };

  const remove = (id: string) => {
    if (!confirm('Poistetaanko lasku?')) return;
    setInvoices(prev => softDelete(prev, id));
    toast('Lasku siirretty roskakoriin', 'success');
  };

  const setStatusQuick = (inv: Invoice, status: InvoiceStatus) => {
    const patch: Partial<Invoice> = { status };
    if (status === 'paid' && !inv.paidDate) patch.paidDate = new Date().toISOString().slice(0, 10);
    setInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, ...patch } : i));
  };

  if (orgSlug !== 'hetki-company') {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--t3)' }}>
        Laskutus-moduuli on käytössä vain Hetki Company -työtilassa.
      </div>
    );
  }

  return (
    <>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}>
        <select
          value={year}
          onChange={e => setYear(Number(e.target.value))}
          className="input"
          style={{ fontSize: '.82rem', padding: '.35rem .5rem', width: 'auto' }}
        >
          {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary btn-sm" onClick={openNew}>+ Uusi lasku</button>
      </div>

      {/* Yhteenvetokortit */}
      <div className="stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginBottom: '1.25rem' }}>
        <div className="stat">
          <div className="stat-num">{formatEur(totals.paid)}</div>
          <div className="stat-lbl">Maksettu {year}</div>
        </div>
        <div className="stat">
          <div className="stat-num">{formatEur(totals.invoiced)}</div>
          <div className="stat-lbl">Laskutettu (odottaa)</div>
        </div>
        <div className="stat">
          <div className="stat-num">{formatEur(totals.planned)}</div>
          <div className="stat-lbl">Tulossa</div>
        </div>
        {totals.overdueAmt > 0 && (
          <div className="stat" style={{ borderColor: 'var(--red)' }}>
            <div className="stat-num" style={{ color: 'var(--red)' }}>{formatEur(totals.overdueAmt)}</div>
            <div className="stat-lbl">Myöhässä</div>
          </div>
        )}
      </div>

      {/* Asiakaskohtainen tuotto */}
      {byClient.length > 0 && (
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)',
          padding: '1rem 1.25rem', marginBottom: '1.25rem',
        }}>
          <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '.75rem' }}>
            Asiakkaiden tuotto {year}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.65rem' }}>
            {byClient.map(c => (
              <div key={c.name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '.25rem', flexWrap: 'wrap', gap: '.5rem' }}>
                  <span style={{ fontSize: '.85rem', fontWeight: 600 }}>{c.name}</span>
                  <span style={{ fontSize: '.75rem', color: 'var(--t2)' }}>
                    {formatEur(c.total)} <span style={{ color: 'var(--t3)' }}>· {c.count} lasku{c.count === 1 ? '' : 'a'}</span>
                  </span>
                </div>
                {/* Stack-bar: maksettu / laskutettu / tulossa */}
                <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: 'var(--elev)', width: `${(c.total / maxClientTotal) * 100}%`, minWidth: 12 }}>
                  {c.paid > 0 && <div style={{ width: `${(c.paid / c.total) * 100}%`, background: INVOICE_STATUS_META.paid.color }} title={`Maksettu: ${formatEur(c.paid)}`} />}
                  {c.invoiced > 0 && <div style={{ width: `${(c.invoiced / c.total) * 100}%`, background: INVOICE_STATUS_META.invoiced.color }} title={`Laskutettu: ${formatEur(c.invoiced)}`} />}
                  {c.planned > 0 && <div style={{ width: `${(c.planned / c.total) * 100}%`, background: INVOICE_STATUS_META.planned.color }} title={`Tulossa: ${formatEur(c.planned)}`} />}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '.75rem', fontSize: '.66rem', color: 'var(--t3)', flexWrap: 'wrap' }}>
            <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: INVOICE_STATUS_META.paid.color, marginRight: 4 }} />Maksettu</span>
            <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: INVOICE_STATUS_META.invoiced.color, marginRight: 4 }} />Laskutettu</span>
            <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: INVOICE_STATUS_META.planned.color, marginRight: 4 }} />Tulossa</span>
          </div>
        </div>
      )}

      {/* Suodatinpainikkeet */}
      <div style={{ display: 'flex', gap: '.4rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {STATUS_FILTERS.map(f => {
          const isActive = filter === f.id;
          const count = counts[f.id];
          if (count === 0 && f.id !== 'all') return null;
          let color: string | undefined;
          if (f.id === 'overdue') color = 'var(--red)';
          else if (f.id !== 'all') color = INVOICE_STATUS_META[f.id as InvoiceStatus]?.color;
          return (
            <button key={f.id} onClick={() => setFilter(f.id)} style={{
              fontSize: '.74rem', padding: '.4rem .75rem', borderRadius: 9999,
              background: isActive ? (color || 'var(--t1)') : 'var(--elev)',
              color: isActive ? '#fff' : 'var(--t2)',
              border: `1px solid ${isActive ? (color || 'var(--t1)') : 'var(--border)'}`,
              fontWeight: 600, cursor: 'pointer',
            }}>{f.label} ({count})</button>
          );
        })}
      </div>

      {/* Laskuluettelo */}
      {displayInvoices.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--t3)', border: '1px dashed var(--border)', borderRadius: 'var(--rl)' }}>
          {yearInvoices.length === 0 ? (
            <>
              <p style={{ fontSize: '.95rem', color: 'var(--t2)', marginBottom: '.5rem', fontWeight: 600 }}>Ei vielä laskuja vuodelta {year}.</p>
              <p style={{ fontSize: '.78rem', maxWidth: 400, margin: '0 auto', lineHeight: 1.6 }}>
                Lisää ensimmäinen "+ Uusi lasku" -napista. Voit merkitä laskun tulossa olevaksi vaikka et olisi vielä lähettänyt sitä.
              </p>
            </>
          ) : (
            <p style={{ fontSize: '.82rem' }}>Ei tähän suodattimeen sopivia laskuja.</p>
          )}
        </div>
      ) : (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', overflow: 'hidden' }}>
          {displayInvoices.map((inv, i) => {
            const meta = INVOICE_STATUS_META[inv.status];
            const overdue = isOverdue(inv);
            return (
              <div
                key={inv.id}
                onClick={() => openEdit(inv)}
                style={{
                  padding: '.75rem 1rem',
                  borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                  borderLeft: `3px solid ${overdue ? 'var(--red)' : meta.color}`,
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '.75rem',
                }}
                onMouseEnter={ev => (ev.currentTarget as HTMLElement).style.background = 'var(--elev)'}
                onMouseLeave={ev => (ev.currentTarget as HTMLElement).style.background = 'transparent'}
              >
                <div style={{ fontSize: '.7rem', color: 'var(--t3)', width: 82, flexShrink: 0 }}>
                  {new Date(inv.issueDate).toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' })}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '.86rem', fontWeight: 600, marginBottom: '.15rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {inv.description || '(Ei kuvausta)'}
                    {inv.clientName && <span style={{ fontSize: '.7rem', color: 'var(--t3)', marginLeft: '.5rem', fontWeight: 400 }}>· {inv.clientName}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: '.6rem', padding: '.1rem .45rem', borderRadius: 9999,
                      background: meta.bg, color: meta.color,
                      fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em',
                    }}>{meta.label}</span>
                    {overdue && (
                      <span style={{ fontSize: '.6rem', padding: '.1rem .45rem', borderRadius: 9999, background: 'rgba(239,107,107,.12)', color: 'var(--red)', fontWeight: 700, textTransform: 'uppercase' }}>
                        Myöhässä
                      </span>
                    )}
                    {inv.invoiceNumber && (
                      <span style={{ fontSize: '.6rem', color: 'var(--t3)' }}>#{inv.invoiceNumber}</span>
                    )}
                    {inv.dueDate && inv.status === 'invoiced' && (
                      <span style={{ fontSize: '.65rem', color: 'var(--t3)' }}>
                        eräpäivä {new Date(inv.dueDate).toLocaleDateString('fi-FI')}
                      </span>
                    )}
                  </div>
                </div>
                <select
                  value={inv.status}
                  onClick={ev => ev.stopPropagation()}
                  onChange={ev => setStatusQuick(inv, ev.target.value as InvoiceStatus)}
                  className="input"
                  style={{ fontSize: '.7rem', padding: '.25rem .35rem', width: 'auto', maxWidth: 130, background: 'var(--elev)' }}
                  title="Vaihda tila"
                >
                  {INVOICE_STATUS_ORDER.map(s => (
                    <option key={s} value={s}>{INVOICE_STATUS_META[s].label}</option>
                  ))}
                </select>
                <div style={{ fontSize: '.92rem', fontWeight: 700, color: 'var(--t1)', whiteSpace: 'nowrap', minWidth: 70, textAlign: 'right' }}>
                  {formatEur(inv.amount)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lomake-modaali */}
      {showForm && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={() => setShowForm(false)}
        >
          <div
            style={{
              background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: 'var(--rl)', padding: '1.75rem',
              width: 600, maxWidth: '94vw', maxHeight: '92vh', overflowY: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', marginBottom: '1rem' }}>
              {editId ? 'Muokkaa laskua' : 'Uusi lasku'}
            </h3>

            <div className="field">
              <label>Asiakas *</label>
              <select className="input" value={fClient} onChange={e => setFClient(e.target.value)}>
                <option value="">Valitse asiakas…</option>
                {knownClients.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="field">
              <label>Kuvaus *</label>
              <input
                className="input"
                value={fDescription}
                onChange={e => setFDescription(e.target.value)}
                placeholder="Esim. Brändivideo - Operaatio Arktis"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '.6rem' }}>
              <div className="field">
                <label>Summa (€, netto) *</label>
                <input
                  className="input"
                  value={fAmount}
                  onChange={e => setFAmount(e.target.value)}
                  placeholder="0,00"
                  inputMode="decimal"
                />
              </div>
              <div className="field">
                <label>ALV-%</label>
                <input className="input" value={fVat} onChange={e => setFVat(e.target.value)} inputMode="decimal" />
              </div>
            </div>

            <div className="field">
              <label>Tila</label>
              <select className="input" value={fStatus} onChange={e => setFStatus(e.target.value as InvoiceStatus)}>
                {INVOICE_STATUS_ORDER.map(s => (
                  <option key={s} value={s}>{INVOICE_STATUS_META[s].label}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '.6rem' }}>
              <div className="field">
                <label>Laskutuspäivä</label>
                <input type="date" className="input" value={fIssueDate} onChange={e => setFIssueDate(e.target.value)} />
              </div>
              <div className="field">
                <label>Eräpäivä</label>
                <input type="date" className="input" value={fDueDate} onChange={e => setFDueDate(e.target.value)} />
              </div>
              <div className="field">
                <label>Maksettu</label>
                <input type="date" className="input" value={fPaidDate} onChange={e => setFPaidDate(e.target.value)} />
              </div>
            </div>

            <div className="field">
              <label>Laskunumero</label>
              <input
                className="input"
                value={fInvoiceNumber}
                onChange={e => setFInvoiceNumber(e.target.value)}
                placeholder="esim. 2026-001"
              />
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
              <button className="btn btn-primary" onClick={save} disabled={!fClient || !fDescription.trim() || !fAmount}>Tallenna</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
