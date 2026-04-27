'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useOrgData } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import {
  BudgetPlan, BudgetPlanRow, BudgetPlanComment,
  EMPTY_BUDGET_PLAN, sumRows, fmtEur,
} from '@/lib/budget-plan-shared';
import { LLFF_BUDGET_PLAN_2026 } from '@/lib/llff-budget-plan-defaults';

const defaultsForOrg = (orgSlug: string): BudgetPlan => {
  if (orgSlug === 'llff') return LLFF_BUDGET_PLAN_2026;
  return EMPTY_BUDGET_PLAN;
};

const newId = () => 'bp_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

export default function BudgetPlanSection() {
  const params = useParams();
  const orgSlug = (params.orgSlug as string) || '';
  const { user, canEdit } = useAuth();
  const [plan, setPlan] = useOrgData<BudgetPlan>('budgetPlan', defaultsForOrg(orgSlug));
  const [openCommentsFor, setOpenCommentsFor] = useState<string | null>(null);
  const [draftComment, setDraftComment] = useState('');

  const incomeRows = useMemo(() => (plan.income || []).filter(r => !r.deletedAt), [plan.income]);
  const expenseRows = useMemo(() => (plan.expenses || []).filter(r => !r.deletedAt), [plan.expenses]);
  const incomeSum = useMemo(() => sumRows(incomeRows), [incomeRows]);
  const expenseSum = useMemo(() => sumRows(expenseRows), [expenseRows]);
  const gap = incomeSum.total - expenseSum.total;

  type Kind = 'income' | 'expenses';

  const updateRow = (kind: Kind, id: string, patch: Partial<BudgetPlanRow>) => {
    setPlan(p => ({
      ...p,
      [kind]: (p[kind] || []).map(r => r.id === id ? { ...r, ...patch } : r),
    }));
  };

  const addRow = (kind: Kind) => {
    const row: BudgetPlanRow = { id: newId(), name: '', amount: 0 };
    setPlan(p => ({ ...p, [kind]: [...(p[kind] || []), row] }));
  };

  const removeRow = (kind: Kind, id: string) => {
    if (!confirm('Poista rivi?')) return;
    setPlan(p => ({
      ...p,
      [kind]: (p[kind] || []).map(r => r.id === id ? { ...r, deletedAt: Date.now() } : r),
    }));
  };

  const addComment = (kind: Kind, rowId: string) => {
    const text = draftComment.trim();
    if (!text) return;
    const c: BudgetPlanComment = {
      id: 'c_' + Date.now().toString(36),
      author: user?.displayName || user?.email || 'Tuntematon',
      text,
      createdAt: Date.now(),
    };
    setPlan(p => ({
      ...p,
      [kind]: (p[kind] || []).map(r => r.id === rowId ? { ...r, comments: [...(r.comments || []), c] } : r),
    }));
    setDraftComment('');
  };

  const removeComment = (kind: Kind, rowId: string, commentId: string) => {
    setPlan(p => ({
      ...p,
      [kind]: (p[kind] || []).map(r => r.id === rowId
        ? { ...r, comments: (r.comments || []).filter(c => c.id !== commentId) }
        : r),
    }));
  };

  const renderRow = (row: BudgetPlanRow, kind: Kind) => {
    const open = openCommentsFor === row.id;
    const commentCount = (row.comments || []).length;
    const total = (row.amount || 0) + (row.vat || 0);
    return (
      <div key={row.id} style={{ borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', padding: '.6rem .75rem' }}>
          <input
            value={row.name}
            onChange={e => updateRow(kind, row.id, { name: e.target.value })}
            disabled={!canEdit}
            placeholder={kind === 'income' ? 'Tulonlähde' : 'Menon kuvaus'}
            style={{ flex: 2, minWidth: 0, background: 'transparent', border: 'none', fontSize: '.85rem', color: 'var(--t1)', padding: '.25rem 0' }}
          />
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            value={row.amount || ''}
            onChange={e => updateRow(kind, row.id, { amount: parseFloat(e.target.value.replace(',', '.')) || 0 })}
            disabled={!canEdit}
            placeholder="Netto"
            style={{ width: 90, textAlign: 'right', background: 'var(--elev)', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontSize: '.78rem', padding: '.25rem .4rem', color: 'var(--t1)' }}
          />
          {kind === 'expenses' && (
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={row.vat || ''}
              onChange={e => updateRow(kind, row.id, { vat: parseFloat(e.target.value.replace(',', '.')) || undefined })}
              disabled={!canEdit}
              placeholder="ALV €"
              style={{ width: 70, textAlign: 'right', background: 'var(--elev)', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontSize: '.78rem', padding: '.25rem .4rem', color: 'var(--t2)' }}
            />
          )}
          <span style={{ width: 90, textAlign: 'right', fontSize: '.85rem', fontWeight: 600, color: 'var(--t1)' }}>
            {fmtEur(total)}
          </span>
          <button
            onClick={() => { setOpenCommentsFor(open ? null : row.id); setDraftComment(''); }}
            style={{
              fontSize: '.7rem', padding: '.2rem .5rem', borderRadius: 'var(--r)',
              background: commentCount > 0 ? 'rgba(155,124,246,.15)' : 'var(--elev)',
              border: '1px solid var(--border)', color: commentCount > 0 ? '#9b7cf6' : 'var(--t3)',
              cursor: 'pointer', fontWeight: 600, flexShrink: 0,
            }}
            title={`${commentCount} kommenttia`}
          >
            {commentCount > 0 ? `${commentCount} 💬` : '+ kommentti'}
          </button>
          {canEdit && (
            <button
              onClick={() => removeRow(kind, row.id)}
              style={{ background: 'transparent', border: 'none', color: 'var(--red)', fontSize: '.85rem', cursor: 'pointer', padding: '.2rem .35rem', flexShrink: 0 }}
              title="Poista rivi"
            >
              ×
            </button>
          )}
        </div>
        {open && (
          <div style={{ padding: '.5rem 1rem .75rem 1rem', background: 'var(--elev)', borderTop: '1px solid var(--border)' }}>
            {(row.comments || []).map(c => (
              <div key={c.id} style={{ fontSize: '.75rem', marginBottom: '.4rem', display: 'flex', gap: '.5rem' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: 'var(--t1)' }}>{c.author}
                    <span style={{ marginLeft: '.5rem', fontWeight: 400, color: 'var(--t3)', fontSize: '.7rem' }}>
                      {new Date(c.createdAt).toLocaleString('fi-FI', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div style={{ color: 'var(--t2)', whiteSpace: 'pre-wrap' }}>{c.text}</div>
                </div>
                {canEdit && (
                  <button
                    onClick={() => removeComment(kind, row.id, c.id)}
                    style={{ background: 'transparent', border: 'none', color: 'var(--t3)', cursor: 'pointer', fontSize: '.7rem' }}
                    title="Poista kommentti"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            {canEdit && (
              <div style={{ display: 'flex', gap: '.4rem', marginTop: '.4rem' }}>
                <input
                  value={draftComment}
                  onChange={e => setDraftComment(e.target.value)}
                  placeholder="Kirjoita kommentti..."
                  onKeyDown={e => { if (e.key === 'Enter') addComment(kind, row.id); }}
                  style={{ flex: 1, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontSize: '.78rem', padding: '.3rem .5rem', color: 'var(--t1)' }}
                />
                <button
                  className="btn btn-primary btn-sm"
                  disabled={!draftComment.trim()}
                  onClick={() => addComment(kind, row.id)}
                  style={{ fontSize: '.7rem' }}
                >
                  Lisää
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Selitys */}
      <div style={{
        background: 'var(--elev)', border: '1px solid var(--border)',
        borderRadius: 'var(--rl)', padding: '.75rem 1rem',
        fontSize: '.78rem', lineHeight: 1.55, color: 'var(--t2)',
      }}>
        Budjetissa listataan <b style={{ color: 'var(--t1)' }}>Kino Lapinlahti ry:lle</b> maksettavat
        apurahat ja muut tulot sekä festivaalin kulut. Osa apurahoista on
        myönnetty suoraan työryhmän jäsenille henkilökohtaisina työskentelyapurahoina,
        eivätkä ne näy Kino Lapinlahti ry:n budjetissa.
      </div>

      {/* Yhteenveto */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '.5rem' }}>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '.85rem 1rem' }}>
          <div style={{ fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--t3)', fontWeight: 700 }}>Tulot</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 600, color: 'var(--t1)', marginTop: '.2rem' }}>{fmtEur(incomeSum.total)}</div>
        </div>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '.85rem 1rem' }}>
          <div style={{ fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--t3)', fontWeight: 700 }}>Menot</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 600, color: 'var(--t1)', marginTop: '.2rem' }}>{fmtEur(expenseSum.total)}</div>
          <div style={{ fontSize: '.7rem', color: 'var(--t3)', marginTop: '.15rem' }}>netto {fmtEur(expenseSum.net)} · ALV {fmtEur(expenseSum.vat)}</div>
        </div>
        <div style={{ background: gap < 0 ? 'rgba(239,107,107,.08)' : 'rgba(34,197,94,.08)', border: '1px solid ' + (gap < 0 ? 'rgba(239,107,107,.3)' : 'rgba(34,197,94,.3)'), borderRadius: 'var(--rl)', padding: '.85rem 1rem' }}>
          <div style={{ fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--t3)', fontWeight: 700 }}>{gap < 0 ? 'Vajaus' : 'Ylijäämä'}</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 600, color: gap < 0 ? '#ef6b6b' : '#22c55e', marginTop: '.2rem' }}>{fmtEur(Math.abs(gap))}</div>
          <div style={{ fontSize: '.7rem', color: 'var(--t3)', marginTop: '.15rem' }}>
            {gap < 0 ? 'tarvitaan toteuttamiseen' : 'puskuri'}
          </div>
        </div>
      </div>

      {/* Tulot */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', overflow: 'hidden' }}>
        <div style={{ padding: '.6rem .9rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(34,197,94,.06)' }}>
          <div style={{ fontSize: '.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: '#22c55e' }}>
            Tulot ({incomeRows.length})
          </div>
          <span style={{ fontSize: '.85rem', fontWeight: 600, color: 'var(--t1)' }}>{fmtEur(incomeSum.total)}</span>
        </div>
        {incomeRows.map(r => renderRow(r, 'income'))}
        {canEdit && (
          <div style={{ padding: '.5rem .75rem', borderTop: '1px solid var(--border)' }}>
            <button onClick={() => addRow('income')} className="btn btn-ghost btn-sm" style={{ fontSize: '.75rem', color: '#22c55e' }}>
              + Lisää tulonlähde
            </button>
          </div>
        )}
      </div>

      {/* Menot */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', overflow: 'hidden' }}>
        <div style={{ padding: '.6rem .9rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(239,107,107,.06)' }}>
          <div style={{ fontSize: '.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: '#ef6b6b' }}>
            Menot ({expenseRows.length})
          </div>
          <span style={{ fontSize: '.85rem', fontWeight: 600, color: 'var(--t1)' }}>{fmtEur(expenseSum.total)}</span>
        </div>
        {expenseRows.map(r => renderRow(r, 'expenses'))}
        {canEdit && (
          <div style={{ padding: '.5rem .75rem', borderTop: '1px solid var(--border)' }}>
            <button onClick={() => addRow('expenses')} className="btn btn-ghost btn-sm" style={{ fontSize: '.75rem', color: '#ef6b6b' }}>
              + Lisää meno
            </button>
          </div>
        )}
      </div>

    </div>
  );
}
