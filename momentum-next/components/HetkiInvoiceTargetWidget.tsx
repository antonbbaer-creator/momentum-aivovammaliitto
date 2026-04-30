'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useOrgData } from '@/lib/firestore';
import { Invoice, formatEur, INVOICE_STATUS_META } from '@/lib/invoices-shared';

// Etusivun widget Hetki Companylle: nayttaa vuoden laskutustavoitteen
// edistymisen samalla logiikalla kuin /laskutus-sivu.
// Naytetaan vain jos org === 'hetki-company'.
export default function HetkiInvoiceTargetWidget() {
  const orgSlug = (useParams().orgSlug as string) || '';
  const [invoices] = useOrgData<Invoice[]>('invoices', []);
  const [targets] = useOrgData<Record<string, number>>('hetkiInvoiceTargets', { '2026': 60000 });

  const year = new Date().getFullYear();
  const target = targets[String(year)] ?? 0;

  const sums = useMemo(() => {
    let paid = 0, invoiced = 0, planned = 0;
    for (const inv of invoices) {
      if (inv.deletedAt) continue;
      if (new Date(inv.issueDate).getFullYear() !== year) continue;
      if (inv.status === 'paid') paid += inv.amount;
      else if (inv.status === 'invoiced') invoiced += inv.amount;
      else if (inv.status === 'planned') planned += inv.amount;
    }
    return { paid, invoiced, planned };
  }, [invoices, year]);

  if (orgSlug !== 'hetki-company') return null;

  const realized = sums.paid + sums.invoiced;
  const committed = realized + sums.planned;
  const realizedPct = target > 0 ? Math.min((realized / target) * 100, 100) : 0;
  const committedPct = target > 0 ? Math.min((committed / target) * 100, 100) : 0;
  const remaining = Math.max(target - committed, 0);

  return (
    <Link
      href={`/${orgSlug}/laskutus`}
      style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
    >
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 'var(--rl)', padding: '1rem 1.25rem',
        cursor: 'pointer', transition: 'border-color .15s',
      }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--pri)')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '.5rem', flexWrap: 'wrap', gap: '.5rem' }}>
          <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
            Laskutustavoite {year}
          </div>
          <span style={{ fontSize: '.66rem', color: 'var(--t3)' }}>Avaa laskutus →</span>
        </div>
        {target > 0 ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '.4rem', fontSize: '.85rem', flexWrap: 'wrap', gap: '.4rem' }}>
              <span>
                <strong style={{ fontSize: '1.4rem' }}>{formatEur(realized)}</strong>
                <span style={{ color: 'var(--t3)', marginLeft: '.4rem' }}>/ {formatEur(target)}</span>
              </span>
              <span style={{ color: '#2dd4a0', fontWeight: 700, fontSize: '1rem' }}>
                {realizedPct.toFixed(0)} %
              </span>
            </div>
            <div style={{ height: 14, background: 'var(--elev)', borderRadius: 7, overflow: 'hidden', position: 'relative' }}>
              {/* Sovittu — vaaleampana taustalla */}
              <div style={{
                position: 'absolute', top: 0, left: 0, bottom: 0,
                width: `${committedPct}%`,
                background: INVOICE_STATUS_META.planned.color,
                opacity: 0.4,
              }} />
              {/* Toteutunut — paalla */}
              <div style={{
                position: 'absolute', top: 0, left: 0, bottom: 0,
                width: `${realizedPct}%`,
                background: '#2dd4a0',
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '.4rem', fontSize: '.72rem', color: 'var(--t3)', flexWrap: 'wrap', gap: '.5rem' }}>
              <span>
                Sovittu: <strong style={{ color: 'var(--t2)' }}>{formatEur(committed)}</strong> ({committedPct.toFixed(0)} %)
              </span>
              <span>
                Puuttuu: <strong style={{ color: remaining > 0 ? 'var(--red)' : '#2dd4a0' }}>
                  {formatEur(remaining)}
                </strong>
              </span>
            </div>
          </>
        ) : (
          <div style={{ fontSize: '.82rem', color: 'var(--t3)' }}>
            Ei tavoitetta vuodelle {year}. Aseta tavoite Laskutus-sivulla.
          </div>
        )}
      </div>
    </Link>
  );
}
