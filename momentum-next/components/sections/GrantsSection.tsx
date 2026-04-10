'use client';

/*
 * LLFF Apurahavuosikello
 *
 * Korvaa nykyisen Budjetti-välilehden — visualisoi LLFF:n apurahatilanteen,
 * deadlinet, vastuut ja edistymisen 100 000 € vuositavoitteeseen.
 */

import { useState } from 'react';
import { useOrgData } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import {
  Grant,
  GrantStatus,
  GrantProject,
  GrantPriority,
  GrantsSettings,
  STATUS_DEFS,
  PROJECT_DEFS,
  PRIORITY_DEFS,
  LLFF_GRANTS_DEFAULT,
  DEFAULT_GRANTS_SETTINGS,
  parseGrantDeadline,
  daysUntilDeadline,
  getStatusTotals,
  normalizeGrant,
  normalizeGrantsSettings,
  getYearTarget,
} from '@/lib/grants-shared';
import { OrgTeamMember, DEFAULT_LLFF_TEAM_MEMBERS } from '@/lib/team-shared';

type Tab = 'wheel' | 'status' | 'funders' | 'deadlines';

const months = ['Tam', 'Hel', 'Maa', 'Huh', 'Tou', 'Kes', 'Hei', 'Elo', 'Syy', 'Lok', 'Mar', 'Jou'];
const monthsLong = ['Tammikuu', 'Helmikuu', 'Maaliskuu', 'Huhtikuu', 'Toukokuu', 'Kesäkuu', 'Heinäkuu', 'Elokuu', 'Syyskuu', 'Lokakuu', 'Marraskuu', 'Joulukuu'];

const fmtEur = (n: number): string => {
  if (n === 0) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k €`;
  return `${n} €`;
};
const fmtEurFull = (n: number): string => n.toLocaleString('fi-FI') + ' €';

export default function GrantsSection() {
  const { canEdit } = useAuth();
  const { toast } = useToast();
  const [rawGrants, setGrants] = useOrgData<Grant[]>('llff_grants', LLFF_GRANTS_DEFAULT);
  const [rawSettings, setSettings] = useOrgData<GrantsSettings>('llff_grants_settings', DEFAULT_GRANTS_SETTINGS);
  const [members] = useOrgData<OrgTeamMember[]>('orgTeamMembers', DEFAULT_LLFF_TEAM_MEMBERS);

  // Normalize for backward compat with old saves
  const grants = rawGrants.map(normalizeGrant);
  const settings = normalizeGrantsSettings(rawSettings);

  const [tab, setTab] = useState<Tab>('wheel');
  const [selectedYear, setSelectedYear] = useState<number>(settings.defaultYear || 2026);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  // Form state
  const [fYear, setFYear] = useState<number>(2026);
  const [fFunder, setFFunder] = useState('');
  const [fName, setFName] = useState('');
  const [fAmount, setFAmount] = useState('');
  const [fAmountText, setFAmountText] = useState('');
  const [fStatus, setFStatus] = useState<GrantStatus>('planning');
  const [fProject, setFProject] = useState<GrantProject>('festival');
  const [fPriority, setFPriority] = useState<GrantPriority>('high');
  const [fDeadline, setFDeadline] = useState('');
  const [fDeadlineText, setFDeadlineText] = useState('');
  const [fDecision, setFDecision] = useState('');
  const [fResponsible, setFResponsible] = useState('');
  const [fUrl, setFUrl] = useState('');
  const [fNotes, setFNotes] = useState('');

  // Filter grants by selected year
  const yearGrants = grants.filter(g => g.year === selectedYear);
  const totals = getStatusTotals(yearGrants);
  const confirmedAmount = totals.confirmed;
  const appliedAmount = totals.applied;
  const planningAmount = totals.planning;
  const realisticTotal = confirmedAmount + appliedAmount;       // varmistunut + odottaa
  const potentialTotal = confirmedAmount + appliedAmount + planningAmount;
  const target = getYearTarget(settings, selectedYear);
  const progressPct = Math.min(100, Math.round((confirmedAmount / target) * 100));
  const progressRealisticPct = Math.min(100, Math.round((realisticTotal / target) * 100));

  // Available years derived from grants list (always include 2026 + 2027)
  const availableYears = Array.from(new Set([2026, 2027, ...grants.map(g => g.year)])).sort();

  const setYearTarget = (y: number, amount: number) => {
    setSettings({
      ...settings,
      yearTargets: { ...settings.yearTargets, [String(y)]: amount },
    });
  };

  // Upcoming deadlines (next 60 days, status = planning or applied)
  const upcoming = [...yearGrants]
    .filter(g => {
      if (g.status === 'rejected') return false;
      const days = daysUntilDeadline(g);
      return days !== null && days >= 0 && days <= 60;
    })
    .sort((a, b) => {
      const da = daysUntilDeadline(a) ?? 999;
      const db = daysUntilDeadline(b) ?? 999;
      return da - db;
    });

  // ========== HELPERS ==========
  const openNew = () => {
    setEditId(null);
    setFYear(selectedYear);
    setFFunder(''); setFName(''); setFAmount(''); setFAmountText('');
    setFStatus('planning'); setFProject('festival'); setFPriority('high');
    setFDeadline(''); setFDeadlineText(''); setFDecision('');
    setFResponsible(''); setFUrl(''); setFNotes('');
    setShowForm(true);
  };

  const openEdit = (g: Grant) => {
    setEditId(g.id);
    setFYear(g.year);
    setFFunder(g.funder); setFName(g.grantName);
    setFAmount(String(g.amount || '')); setFAmountText(g.amountText || '');
    setFStatus(g.status); setFProject(g.project); setFPriority(g.priority);
    setFDeadline(g.deadline || ''); setFDeadlineText(g.deadlineText || '');
    setFDecision(g.decisionDate || '');
    setFResponsible(g.responsibleId || '');
    setFUrl(g.url || ''); setFNotes(g.notes || '');
    setShowForm(true);
  };

  const saveGrant = () => {
    if (!fFunder.trim() || !fName.trim()) return;
    const g: Grant = {
      id: editId || 'g_' + Date.now(),
      year: fYear || selectedYear,
      funder: fFunder.trim(),
      grantName: fName.trim(),
      amount: parseInt(fAmount) || 0,
      amountText: fAmountText.trim() || undefined,
      status: fStatus,
      project: fProject,
      priority: fPriority,
      deadline: fDeadline || undefined,
      deadlineText: fDeadlineText.trim() || undefined,
      decisionDate: fDecision.trim() || undefined,
      responsibleId: fResponsible || undefined,
      url: fUrl.trim() || undefined,
      notes: fNotes.trim() || undefined,
    };
    if (editId) setGrants(prev => prev.map(x => x.id === editId ? g : x));
    else setGrants(prev => [...prev, g]);
    setShowForm(false);
    toast(editId ? 'Apuraha päivitetty' : 'Apuraha lisätty', 'success');
  };

  const removeGrant = (id: string) => {
    setGrants(prev => prev.filter(g => g.id !== id));
    if (selectedId === id) setSelectedId(null);
    toast('Apuraha poistettu', 'success');
  };

  const updateStatus = (id: string, status: GrantStatus) => {
    setGrants(prev => prev.map(g => g.id === id ? { ...g, status } : g));
  };

  const memberName = (id?: string): string => members.find(m => m.id === id)?.name || '—';

  // =============================================================================
  // STATS BANNER (always visible)
  // =============================================================================
  const renderStatsBanner = () => (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)',
      padding: '1.25rem 1.5rem', marginBottom: '1.25rem',
    }}>
      {/* Year tabs */}
      <div style={{ display: 'flex', gap: '.4rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {availableYears.map(y => {
          const yc = grants.filter(g => g.year === y).length;
          const active = selectedYear === y;
          return (
            <button
              key={y}
              onClick={() => setSelectedYear(y)}
              style={{
                fontSize: '.78rem', padding: '.45rem .9rem', borderRadius: 9999,
                background: active ? 'var(--pri)' : 'var(--elev)',
                color: active ? '#fff' : 'var(--t2)',
                border: '1px solid', borderColor: active ? 'var(--pri)' : 'var(--border)',
                fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '.4rem',
              }}
            >
              {y} <span style={{ fontSize: '.62rem', opacity: .7, fontWeight: 500 }}>({yc})</span>
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
        <div>
          <div style={{ fontSize: '.65rem', color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600, marginBottom: '.2rem' }}>
            Vuositavoite {selectedYear}
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, lineHeight: 1.1 }}>
            {fmtEurFull(confirmedAmount)} <span style={{ fontSize: '.85rem', color: 'var(--t3)', fontWeight: 500 }}> / {fmtEurFull(target)}</span>
          </div>
          <div style={{ fontSize: '.78rem', color: 'var(--t2)', marginTop: '.2rem' }}>
            {progressPct}% varmistunut · {progressRealisticPct}% kun haetut tulevat
          </div>
        </div>
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {canEdit && (
            <input
              type="number"
              value={target}
              onChange={e => setYearTarget(selectedYear, parseInt(e.target.value) || 100000)}
              className="input"
              style={{ width: 100, fontSize: '.78rem', textAlign: 'right' }}
              title={`Vuositavoite ${selectedYear} (€)`}
            />
          )}
          {canEdit && <button className="btn btn-primary btn-sm" onClick={openNew}>+ Apuraha</button>}
        </div>
      </div>

      {/* Progress bar — confirmed (solid) over realistic (faded) */}
      <div style={{ position: 'relative', height: 10, background: 'var(--bg)', borderRadius: 6, overflow: 'hidden', marginBottom: '.75rem' }}>
        {/* Realistic (confirmed + applied) — translucent green */}
        <div style={{
          position: 'absolute', top: 0, left: 0, height: '100%',
          width: `${progressRealisticPct}%`,
          background: 'rgba(34,197,94,.3)',
          borderRadius: 6,
        }} />
        {/* Confirmed — solid green */}
        <div style={{
          position: 'absolute', top: 0, left: 0, height: '100%',
          width: `${progressPct}%`,
          background: '#22c55e',
          borderRadius: 6,
        }} />
        {/* Target marker */}
        <div style={{
          position: 'absolute', top: -2, bottom: -2,
          left: '100%', width: 2, marginLeft: -1,
          background: 'var(--t1)',
        }} />
      </div>

      {/* Status totals */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '.6rem' }}>
        {(['confirmed', 'applied', 'planning', 'rejected'] as GrantStatus[]).map(st => {
          const def = STATUS_DEFS[st];
          const sum = totals[st];
          const count = yearGrants.filter(g => g.status === st).length;
          return (
            <div key={st} style={{
              background: def.bg, border: `1px solid ${def.color}33`,
              borderLeft: `3px solid ${def.color}`,
              borderRadius: 'var(--r)', padding: '.6rem .8rem',
            }}>
              <div style={{ fontSize: '.62rem', color: def.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', display: 'flex', alignItems: 'center', gap: '.35rem' }}>
                <span>{def.icon}</span>
                {def.label} ({count})
              </div>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--t1)', marginTop: '.15rem' }}>
                {fmtEur(sum)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Upcoming deadlines */}
      {upcoming.length > 0 && (
        <div style={{ marginTop: '1rem', paddingTop: '.85rem', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: '.65rem', color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600, marginBottom: '.5rem' }}>
            Seuraavat deadlinet ({upcoming.length} alle 60 päivän päässä)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
            {upcoming.slice(0, 4).map(g => {
              const days = daysUntilDeadline(g) ?? 0;
              const urgent = days <= 7;
              const warn = days <= 30;
              const color = urgent ? 'var(--red)' : warn ? 'var(--yellow)' : 'var(--green)';
              return (
                <div key={g.id} onClick={() => setSelectedId(g.id)} style={{
                  display: 'flex', alignItems: 'center', gap: '.6rem',
                  padding: '.45rem .65rem',
                  background: 'var(--elev)',
                  border: '1px solid var(--border)', borderLeft: `3px solid ${color}`,
                  borderRadius: 'var(--r)', cursor: 'pointer',
                }}>
                  <span style={{ fontSize: '.62rem', padding: '.15rem .45rem', borderRadius: 9999, background: `${color}20`, color, fontWeight: 700, minWidth: 50, textAlign: 'center' }}>
                    {days === 0 ? 'Tänään' : days === 1 ? 'Huomenna' : `${days} pv`}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '.78rem', fontWeight: 600, color: 'var(--t1)' }}>{g.funder}</div>
                    <div style={{ fontSize: '.65rem', color: 'var(--t3)' }}>{g.grantName} · {g.deadlineText}</div>
                  </div>
                  <span style={{ fontSize: '.7rem', fontWeight: 700, color: 'var(--t2)' }}>
                    {g.amount > 0 ? fmtEur(g.amount) : (g.amountText || '—')}
                  </span>
                </div>
              );
            })}
            {upcoming.length > 4 && (
              <div style={{ fontSize: '.7rem', color: 'var(--t3)', textAlign: 'center', padding: '.2rem' }}>
                + {upcoming.length - 4} muuta — katso "Hakuajat"-tabista
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  // =============================================================================
  // VUOSIKELLO TAB — visual circle with deadline pins
  // =============================================================================
  const renderWheel = () => {
    const wheelSize = 540;
    const cx = wheelSize / 2;
    const cy = wheelSize / 2;
    const outerR = 230;
    const innerR = 110;
    const monthAngle = (m: number) => (m - 1) * 30 - 90;
    const toRad = (deg: number) => (deg * Math.PI) / 180;

    // Group grants with dated deadlines by month (year-suodatettu)
    const datedGrants = yearGrants.filter(g => g.deadline && g.status !== 'rejected');
    // For each grant, calculate angle on the wheel based on day-of-year
    const wheelGrants = datedGrants.map(g => {
      const d = parseGrantDeadline(g.deadline)!;
      const month = d.getMonth() + 1;
      const day = d.getDate();
      const daysInMonth = new Date(d.getFullYear(), month, 0).getDate();
      // Angle: month + (day/daysInMonth) of 30°
      const angleDeg = monthAngle(month) + (day / daysInMonth) * 30;
      return { grant: g, angleDeg };
    });

    // Layer pins so they don't overlap — distribute across 3 rings
    const ringRadii = [outerR - 30, outerR - 70, outerR - 110];

    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(280px, 360px)', gap: '1.25rem', alignItems: 'start' }} className="grants-grid">
        {/* WHEEL */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1rem', display: 'flex', justifyContent: 'center' }}>
          <svg width={wheelSize} height={wheelSize} style={{ maxWidth: '100%', height: 'auto' }}>
            {/* Outer ring */}
            <circle cx={cx} cy={cy} r={outerR} fill="none" stroke="var(--border)" strokeWidth="1" />
            <circle cx={cx} cy={cy} r={innerR} fill="var(--bg)" stroke="var(--border)" strokeWidth="1" />

            {/* Month dividers */}
            {Array.from({ length: 12 }).map((_, i) => {
              const a = toRad(monthAngle(i + 1));
              return (
                <line key={i}
                  x1={cx + innerR * Math.cos(a)} y1={cy + innerR * Math.sin(a)}
                  x2={cx + outerR * Math.cos(a)} y2={cy + outerR * Math.sin(a)}
                  stroke="var(--border)" strokeWidth="1" />
              );
            })}

            {/* Month labels */}
            {months.map((m, i) => {
              const a = toRad(monthAngle(i + 1) + 15);
              const r = outerR + 22;
              return (
                <text key={m}
                  x={cx + r * Math.cos(a)} y={cy + r * Math.sin(a)}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize="11" fontWeight="500" fill="var(--t2)"
                  fontFamily='"DM Sans", system-ui'>
                  {m.toUpperCase()}
                </text>
              );
            })}

            {/* Grant pins */}
            {wheelGrants.map((wg, idx) => {
              const ringIdx = idx % 3;
              const r = ringRadii[ringIdx];
              const a = toRad(wg.angleDeg);
              const x = cx + r * Math.cos(a);
              const y = cy + r * Math.sin(a);
              const def = STATUS_DEFS[wg.grant.status];
              const isSelected = selectedId === wg.grant.id;
              return (
                <g key={wg.grant.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedId(wg.grant.id)}>
                  <circle cx={x} cy={y} r={isSelected ? 10 : 7}
                    fill={def.color} stroke="var(--bg)" strokeWidth="2"
                    opacity={isSelected ? 1 : 0.85} />
                  {wg.grant.amount > 0 && (
                    <text x={x} y={y} textAnchor="middle" dominantBaseline="middle"
                      fontSize="7" fontWeight="800" fill="#fff" pointerEvents="none">
                      {Math.round(wg.grant.amount / 1000)}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Today marker */}
            {(() => {
              const now = new Date();
              if (now.getFullYear() !== selectedYear) return null;
              const month = now.getMonth() + 1;
              const day = now.getDate();
              const daysInMonth = new Date(now.getFullYear(), month, 0).getDate();
              const angleDeg = monthAngle(month) + (day / daysInMonth) * 30;
              const a = toRad(angleDeg);
              return (
                <line
                  x1={cx + innerR * Math.cos(a)} y1={cy + innerR * Math.sin(a)}
                  x2={cx + (outerR + 5) * Math.cos(a)} y2={cy + (outerR + 5) * Math.sin(a)}
                  stroke="var(--pri-l)" strokeWidth="2" strokeDasharray="4,2" />
              );
            })()}

            {/* Center text */}
            <text x={cx} y={cy - 10} textAnchor="middle" fontSize="11" fill="var(--t3)" fontFamily='"DM Sans", system-ui' letterSpacing=".1em">
              APURAHAT
            </text>
            <text x={cx} y={cy + 14} textAnchor="middle" fontSize="28" fontWeight="800" fill="var(--t1)" fontFamily='"DM Sans", system-ui'>
              {selectedYear}
            </text>
            <text x={cx} y={cy + 36} textAnchor="middle" fontSize="10" fill="var(--t3)">
              {wheelGrants.length} hakua
            </text>
          </svg>
        </div>

        {/* SIDE LEGEND — grants sorted by month */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1rem', maxHeight: 540, overflowY: 'auto' }}>
          <div style={{ fontSize: '.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--t3)', marginBottom: '.75rem' }}>
            Hakuaikataulu {selectedYear}
          </div>
          {[...wheelGrants].sort((a, b) => a.angleDeg - b.angleDeg).map((wg, idx) => {
            const g = wg.grant;
            const def = STATUS_DEFS[g.status];
            const proj = PROJECT_DEFS[g.project];
            const days = daysUntilDeadline(g);
            const past = days !== null && days < 0;
            const isSelected = selectedId === g.id;
            return (
              <div key={g.id} onClick={() => setSelectedId(g.id)} style={{
                display: 'flex', alignItems: 'flex-start', gap: '.5rem',
                padding: '.5rem',
                marginBottom: '.25rem',
                background: isSelected ? 'var(--elev)' : 'transparent',
                border: '1px solid', borderColor: isSelected ? def.color : 'transparent',
                borderLeft: `3px solid ${def.color}`,
                borderRadius: 'var(--r)', cursor: 'pointer',
                opacity: past ? .5 : 1,
              }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: def.color, color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '.62rem', fontWeight: 800, flexShrink: 0,
                }}>{idx + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '.76rem', fontWeight: 700, color: 'var(--t1)', lineHeight: 1.25 }}>
                    {g.funder}
                  </div>
                  <div style={{ fontSize: '.64rem', color: 'var(--t3)', marginTop: '.1rem' }}>
                    {g.grantName}
                  </div>
                  <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap', alignItems: 'center', marginTop: '.25rem' }}>
                    <span style={{ fontSize: '.6rem', color: def.color, fontWeight: 700 }}>{g.deadlineText}</span>
                    <span style={{ fontSize: '.55rem', padding: '.05rem .3rem', borderRadius: 9999, background: `${proj.color}22`, color: proj.color, fontWeight: 700 }}>{proj.label}</span>
                    {g.amount > 0 && <span style={{ fontSize: '.6rem', fontWeight: 700, color: 'var(--t2)' }}>{fmtEur(g.amount)}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <style jsx>{`
          @media (max-width: 900px) {
            .grants-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>
      </div>
    );
  };

  // =============================================================================
  // STATUS TAB — kanban board (varmistunut/haettu/haetaan/hylätty)
  // =============================================================================
  const renderStatus = () => {
    const cols: GrantStatus[] = ['confirmed', 'applied', 'planning', 'rejected'];
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '.75rem' }} className="grants-status-grid">
        {cols.map(st => {
          const def = STATUS_DEFS[st];
          const colGrants = yearGrants.filter(g => g.status === st).sort((a, b) => (b.amount || 0) - (a.amount || 0));
          const colSum = totals[st];
          return (
            <div key={st} style={{
              background: 'var(--card)', border: '1px solid var(--border)',
              borderTop: `3px solid ${def.color}`,
              borderRadius: 'var(--rl)', minHeight: 300,
              display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ padding: '.85rem 1rem', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '.7rem', fontWeight: 700, color: def.color, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                    {def.icon} {def.label}
                  </div>
                  <span style={{ fontSize: '.62rem', color: 'var(--t3)' }}>{colGrants.length}</span>
                </div>
                <div style={{ fontSize: '.95rem', fontWeight: 800, color: 'var(--t1)', marginTop: '.15rem' }}>
                  {fmtEur(colSum)}
                </div>
              </div>
              <div style={{ padding: '.6rem', display: 'flex', flexDirection: 'column', gap: '.4rem', flex: 1, overflowY: 'auto', maxHeight: 600 }}>
                {colGrants.map(g => {
                  const proj = PROJECT_DEFS[g.project];
                  const days = daysUntilDeadline(g);
                  return (
                    <div key={g.id} onClick={() => setSelectedId(g.id)} style={{
                      background: 'var(--elev)', border: '1px solid var(--border)',
                      borderLeft: `3px solid ${proj.color}`,
                      borderRadius: 'var(--r)', padding: '.55rem .65rem',
                      cursor: 'pointer',
                    }}>
                      <div style={{ fontSize: '.74rem', fontWeight: 700, color: 'var(--t1)', lineHeight: 1.2 }}>
                        {g.funder}
                      </div>
                      <div style={{ fontSize: '.62rem', color: 'var(--t3)', marginTop: '.1rem' }}>
                        {g.grantName}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '.4rem' }}>
                        <span style={{ fontSize: '.62rem', padding: '.1rem .35rem', borderRadius: 9999, background: `${proj.color}22`, color: proj.color, fontWeight: 700 }}>{proj.label}</span>
                        <span style={{ fontSize: '.7rem', fontWeight: 800, color: 'var(--t2)' }}>
                          {g.amount > 0 ? fmtEur(g.amount) : (g.amountText || '—')}
                        </span>
                      </div>
                      {days !== null && days >= 0 && days <= 60 && st !== 'confirmed' && (
                        <div style={{ fontSize: '.58rem', color: days <= 7 ? 'var(--red)' : days <= 30 ? 'var(--yellow)' : 'var(--green)', fontWeight: 700, marginTop: '.2rem' }}>
                          DL {days === 0 ? 'tänään' : `${days} pv`}
                        </div>
                      )}
                    </div>
                  );
                })}
                {colGrants.length === 0 && <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--t3)', fontSize: '.7rem' }}>—</div>}
              </div>
            </div>
          );
        })}
        <style jsx>{`
          @media (max-width: 1000px) {
            .grants-status-grid { grid-template-columns: 1fr 1fr !important; }
          }
          @media (max-width: 600px) {
            .grants-status-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>
      </div>
    );
  };

  // =============================================================================
  // FUNDERS TAB — grouped by project
  // =============================================================================
  const renderFunders = () => {
    const groups: GrantProject[] = ['festival', 'workshops', 'both'];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {groups.map(g => {
          const def = PROJECT_DEFS[g];
          const items = yearGrants.filter(x => x.project === g).sort((a, b) => a.funder.localeCompare(b.funder));
          if (items.length === 0) return null;
          const sum = items.reduce((a, b) => a + (b.amount || 0), 0);
          return (
            <div key={g} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1rem 1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.75rem', borderBottom: '1px solid var(--border)', paddingBottom: '.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                  <span style={{ fontSize: '1.1rem', color: def.color }}>{def.icon}</span>
                  <h3 style={{ fontSize: '.92rem', fontWeight: 700, color: def.color, textTransform: 'uppercase', letterSpacing: '.04em' }}>{def.label}</h3>
                  <span style={{ fontSize: '.65rem', color: 'var(--t3)' }}>· {items.length} apurahaa</span>
                </div>
                <span style={{ fontSize: '.92rem', fontWeight: 800, color: 'var(--t1)' }}>{fmtEur(sum)}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '.5rem' }}>
                {items.map(item => {
                  const sd = STATUS_DEFS[item.status];
                  return (
                    <div key={item.id} onClick={() => setSelectedId(item.id)} style={{
                      background: 'var(--elev)', border: '1px solid var(--border)',
                      borderLeft: `3px solid ${sd.color}`,
                      borderRadius: 'var(--r)', padding: '.6rem .75rem',
                      cursor: 'pointer',
                    }}>
                      <div style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--t1)' }}>{item.funder}</div>
                      <div style={{ fontSize: '.65rem', color: 'var(--t3)', marginTop: '.1rem' }}>{item.grantName}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '.35rem' }}>
                        <span style={{ fontSize: '.58rem', padding: '.1rem .35rem', borderRadius: 9999, background: sd.bg, color: sd.color, fontWeight: 700 }}>{sd.label}</span>
                        <span style={{ fontSize: '.7rem', fontWeight: 700, color: 'var(--t2)' }}>{item.amount > 0 ? fmtEur(item.amount) : (item.amountText || '—')}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // =============================================================================
  // DEADLINES TAB — sortable timeline list
  // =============================================================================
  const renderDeadlines = () => {
    const sorted = [...yearGrants].sort((a, b) => {
      const da = parseGrantDeadline(a.deadline)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const db = parseGrantDeadline(b.deadline)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return da - db;
    });
    let lastMonth = -1;
    return (
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.25rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
          {sorted.map(g => {
            const d = parseGrantDeadline(g.deadline);
            const month = d ? d.getMonth() : -1;
            const showMonthHeader = month !== lastMonth && d;
            if (showMonthHeader) lastMonth = month;
            const days = daysUntilDeadline(g);
            const sd = STATUS_DEFS[g.status];
            const proj = PROJECT_DEFS[g.project];
            const prio = PRIORITY_DEFS[g.priority];
            const past = days !== null && days < 0;
            return (
              <div key={g.id}>
                {showMonthHeader && (
                  <div style={{ fontSize: '.62rem', color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700, marginTop: '.75rem', marginBottom: '.35rem', paddingBottom: '.25rem', borderBottom: '1px solid var(--border)' }}>
                    {monthsLong[month]} {selectedYear}
                  </div>
                )}
                {!d && lastMonth !== -2 && (() => { lastMonth = -2; return (
                  <div style={{ fontSize: '.62rem', color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700, marginTop: '.75rem', marginBottom: '.35rem', paddingBottom: '.25rem', borderBottom: '1px solid var(--border)' }}>
                    Jatkuvat haut / muut
                  </div>
                ); })()}
                <div onClick={() => setSelectedId(g.id)} style={{
                  display: 'flex', alignItems: 'center', gap: '.75rem',
                  padding: '.65rem .85rem',
                  background: 'var(--elev)',
                  border: '1px solid var(--border)',
                  borderLeft: `3px solid ${sd.color}`,
                  borderRadius: 'var(--r)',
                  cursor: 'pointer',
                  opacity: past ? .55 : 1,
                }}>
                  {/* Date column */}
                  <div style={{ minWidth: 80, fontSize: '.7rem', fontWeight: 700, color: 'var(--t1)' }}>
                    {g.deadlineText || '—'}
                  </div>
                  {/* Funder + grant */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '.85rem', fontWeight: 700, color: 'var(--t1)' }}>{g.funder}</div>
                    <div style={{ fontSize: '.68rem', color: 'var(--t3)', marginTop: '.1rem' }}>{g.grantName}</div>
                  </div>
                  {/* Project badge */}
                  <span style={{ fontSize: '.58rem', padding: '.12rem .45rem', borderRadius: 9999, background: `${proj.color}22`, color: proj.color, fontWeight: 700 }}>{proj.label}</span>
                  {/* Priority */}
                  <span style={{ fontSize: '.58rem', padding: '.12rem .45rem', borderRadius: 9999, background: `${prio.color}18`, color: prio.color, fontWeight: 700 }}>{prio.label}</span>
                  {/* Amount */}
                  <div style={{ minWidth: 80, textAlign: 'right', fontSize: '.78rem', fontWeight: 800, color: 'var(--t1)' }}>
                    {g.amount > 0 ? fmtEur(g.amount) : (g.amountText || '—')}
                  </div>
                  {/* Status */}
                  <span style={{ fontSize: '.58rem', padding: '.12rem .45rem', borderRadius: 9999, background: sd.bg, color: sd.color, fontWeight: 700, minWidth: 70, textAlign: 'center' }}>{sd.label}</span>
                  {/* Days countdown if upcoming */}
                  {days !== null && days >= 0 && (
                    <span style={{ fontSize: '.58rem', padding: '.12rem .45rem', borderRadius: 9999, fontWeight: 700, background: days <= 7 ? 'rgba(239,107,107,.15)' : days <= 30 ? 'rgba(245,197,66,.15)' : 'rgba(45,212,160,.1)', color: days <= 7 ? 'var(--red)' : days <= 30 ? 'var(--yellow)' : 'var(--green)' }}>
                      {days === 0 ? 'TÄNÄÄN' : `${days} pv`}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // =============================================================================
  // SELECTED GRANT DETAIL MODAL
  // =============================================================================
  const selected = selectedId ? grants.find(g => g.id === selectedId) : null;
  const renderDetail = () => {
    if (!selected) return null;
    const sd = STATUS_DEFS[selected.status];
    const proj = PROJECT_DEFS[selected.project];
    const prio = PRIORITY_DEFS[selected.priority];
    const days = daysUntilDeadline(selected);
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setSelectedId(null)}>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.75rem', width: 560, maxWidth: '92vw', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
          <button className="btn btn-ghost" onClick={() => setSelectedId(null)} style={{ marginBottom: '.75rem', fontSize: '.7rem' }}>← Sulje</button>

          <div style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginBottom: '.5rem' }}>
              <span style={{ fontSize: '.6rem', padding: '.18rem .55rem', borderRadius: 9999, background: sd.color, color: '#fff', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>{sd.icon} {sd.label}</span>
              <span style={{ fontSize: '.6rem', padding: '.18rem .55rem', borderRadius: 9999, background: proj.color, color: '#fff', fontWeight: 700 }}>{proj.icon} {proj.label}</span>
              <span style={{ fontSize: '.6rem', padding: '.18rem .55rem', borderRadius: 9999, background: prio.color, color: '#fff', fontWeight: 700 }}>{prio.label}</span>
            </div>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--t1)' }}>{selected.funder}</h2>
            <div style={{ fontSize: '.85rem', color: 'var(--t2)', marginTop: '.15rem' }}>{selected.grantName}</div>
          </div>

          {/* Details grid */}
          <div style={{ background: 'var(--elev)', borderRadius: 'var(--r)', padding: '1rem', marginBottom: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
              <div>
                <div style={{ fontSize: '.6rem', color: 'var(--t3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>Summa</div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--t1)', marginTop: '.15rem' }}>
                  {selected.amount > 0 ? fmtEurFull(selected.amount) : (selected.amountText || '—')}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '.6rem', color: 'var(--t3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>Hakuaika</div>
                <div style={{ fontSize: '.85rem', fontWeight: 700, color: 'var(--t1)', marginTop: '.15rem' }}>
                  {selected.deadlineText || '—'}
                </div>
                {days !== null && days >= 0 && (
                  <div style={{ fontSize: '.62rem', fontWeight: 700, color: days <= 7 ? 'var(--red)' : days <= 30 ? 'var(--yellow)' : 'var(--green)', marginTop: '.1rem' }}>
                    {days === 0 ? 'Tänään!' : `${days} päivää jäljellä`}
                  </div>
                )}
              </div>
              {selected.decisionDate && (
                <div>
                  <div style={{ fontSize: '.6rem', color: 'var(--t3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>Päätös</div>
                  <div style={{ fontSize: '.78rem', color: 'var(--t1)', marginTop: '.15rem' }}>{selected.decisionDate}</div>
                </div>
              )}
              <div>
                <div style={{ fontSize: '.6rem', color: 'var(--t3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>Vastuuhenkilö</div>
                {canEdit ? (
                  <select
                    value={selected.responsibleId || ''}
                    onChange={e => setGrants(prev => prev.map(g => g.id === selected.id ? { ...g, responsibleId: e.target.value || undefined } : g))}
                    className="input"
                    style={{ marginTop: '.15rem', fontSize: '.78rem', width: '100%' }}
                  >
                    <option value="">Ei vastuuhenkilöä</option>
                    {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                ) : (
                  <div style={{ fontSize: '.78rem', color: 'var(--t1)', marginTop: '.15rem' }}>{memberName(selected.responsibleId)}</div>
                )}
              </div>
            </div>
          </div>

          {/* Status quick-change */}
          {canEdit && (
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '.62rem', color: 'var(--t3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '.4rem' }}>Vaihda status</div>
              <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap' }}>
                {(['confirmed', 'applied', 'planning', 'rejected'] as GrantStatus[]).map(st => {
                  const def = STATUS_DEFS[st];
                  const active = selected.status === st;
                  return (
                    <button key={st} onClick={() => updateStatus(selected.id, st)}
                      style={{
                        fontSize: '.68rem', padding: '.4rem .7rem', borderRadius: 9999,
                        background: active ? def.color : 'var(--elev)',
                        color: active ? '#fff' : 'var(--t2)',
                        border: `1px solid ${active ? def.color : 'var(--border)'}`,
                        fontWeight: 600, cursor: 'pointer',
                      }}>
                      {def.icon} {def.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {selected.notes && (
            <div style={{ background: 'var(--elev)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '.75rem 1rem', marginBottom: '1rem' }}>
              <div style={{ fontSize: '.6rem', color: 'var(--t3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '.25rem' }}>Huomiot</div>
              <div style={{ fontSize: '.78rem', color: 'var(--t2)', lineHeight: 1.5 }}>{selected.notes}</div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
            {selected.url && (
              <a href={selected.url} target="_blank" rel="noopener" className="btn btn-secondary btn-sm" style={{ textDecoration: 'none' }}>
                Avaa rahoittajan sivu ↗
              </a>
            )}
            {canEdit && <button className="btn btn-ghost btn-sm" onClick={() => { openEdit(selected); setSelectedId(null); }}>Muokkaa</button>}
            {canEdit && <button className="btn btn-ghost btn-sm" onClick={() => { removeGrant(selected.id); }} style={{ color: 'var(--red)', marginLeft: 'auto' }}>Poista</button>}
          </div>
        </div>
      </div>
    );
  };

  // =============================================================================
  // EDIT FORM MODAL
  // =============================================================================
  const renderForm = () => {
    if (!showForm) return null;
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowForm(false)}>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.75rem', width: 560, maxWidth: '92vw', maxHeight: '92vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', marginBottom: '1.25rem' }}>{editId ? 'Muokkaa apurahaa' : 'Lisää apuraha'}</h3>

          <div className="field">
            <label>Vuosi</label>
            <div style={{ display: 'flex', gap: '.3rem' }}>
              {availableYears.map(y => (
                <button key={y} type="button" onClick={() => setFYear(y)}
                  style={{
                    fontSize: '.75rem', padding: '.4rem .9rem', borderRadius: 9999,
                    background: fYear === y ? 'var(--pri)' : 'var(--elev)',
                    color: fYear === y ? '#fff' : 'var(--t2)',
                    border: '1px solid', borderColor: fYear === y ? 'var(--pri)' : 'var(--border)',
                    fontWeight: 700, cursor: 'pointer',
                  }}>
                  {y}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
            <div className="field"><label>Rahoittaja *</label><input className="input" value={fFunder} onChange={e => setFFunder(e.target.value)} placeholder="Esim. Koneen Säätiö" autoFocus /></div>
            <div className="field"><label>Apurahan nimi *</label><input className="input" value={fName} onChange={e => setFName(e.target.value)} placeholder="Esim. Toiminta-apuraha" /></div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
            <div className="field"><label>Summa (€)</label><input type="number" className="input" value={fAmount} onChange={e => setFAmount(e.target.value)} placeholder="50000" /></div>
            <div className="field"><label>Summa-teksti</label><input className="input" value={fAmountText} onChange={e => setFAmountText(e.target.value)} placeholder="Esim. 5–50k €" /></div>
          </div>

          <div className="field">
            <label>Status</label>
            <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap' }}>
              {(['confirmed', 'applied', 'planning', 'rejected'] as GrantStatus[]).map(st => {
                const def = STATUS_DEFS[st];
                const active = fStatus === st;
                return (
                  <button key={st} type="button" onClick={() => setFStatus(st)}
                    style={{
                      fontSize: '.7rem', padding: '.4rem .7rem', borderRadius: 9999,
                      background: active ? def.color : 'var(--elev)',
                      color: active ? '#fff' : 'var(--t2)',
                      border: `1px solid ${active ? def.color : 'var(--border)'}`,
                      fontWeight: 600, cursor: 'pointer',
                    }}>
                    {def.icon} {def.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="field">
            <label>Hanke</label>
            <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap' }}>
              {(['festival', 'workshops', 'both'] as GrantProject[]).map(p => {
                const def = PROJECT_DEFS[p];
                const active = fProject === p;
                return (
                  <button key={p} type="button" onClick={() => setFProject(p)}
                    style={{
                      fontSize: '.7rem', padding: '.4rem .7rem', borderRadius: 9999,
                      background: active ? def.color : 'var(--elev)',
                      color: active ? '#fff' : 'var(--t2)',
                      border: `1px solid ${active ? def.color : 'var(--border)'}`,
                      fontWeight: 600, cursor: 'pointer',
                    }}>
                    {def.icon} {def.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="field">
            <label>Prioriteetti</label>
            <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap' }}>
              {(['critical', 'high', 'medium', 'international', 'backup', 'existing'] as GrantPriority[]).map(p => {
                const def = PRIORITY_DEFS[p];
                const active = fPriority === p;
                return (
                  <button key={p} type="button" onClick={() => setFPriority(p)}
                    style={{
                      fontSize: '.66rem', padding: '.35rem .6rem', borderRadius: 9999,
                      background: active ? def.color : 'var(--elev)',
                      color: active ? '#fff' : 'var(--t2)',
                      border: `1px solid ${active ? def.color : 'var(--border)'}`,
                      fontWeight: 600, cursor: 'pointer',
                    }}>
                    {def.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
            <div className="field"><label>Deadline (päivä)</label><input type="date" className="input" value={fDeadline} onChange={e => setFDeadline(e.target.value)} /></div>
            <div className="field"><label>Deadline-teksti</label><input className="input" value={fDeadlineText} onChange={e => setFDeadlineText(e.target.value)} placeholder="Esim. 31.1.2026 klo 16" /></div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
            <div className="field"><label>Päätöspäivä</label><input className="input" value={fDecision} onChange={e => setFDecision(e.target.value)} placeholder="Esim. Toukokuu 2026" /></div>
            <div className="field">
              <label>Vastuuhenkilö</label>
              <select className="input" value={fResponsible} onChange={e => setFResponsible(e.target.value)}>
                <option value="">Ei vastuuhenkilöä</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          </div>

          <div className="field"><label>Linkki</label><input className="input" value={fUrl} onChange={e => setFUrl(e.target.value)} placeholder="https://..." /></div>
          <div className="field"><label>Huomiot</label><textarea className="input textarea" value={fNotes} onChange={e => setFNotes(e.target.value)} /></div>

          <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
            {editId && <button className="btn btn-ghost btn-sm" onClick={() => { removeGrant(editId); setShowForm(false); }} style={{ color: 'var(--red)', marginRight: 'auto' }}>Poista</button>}
            <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Peruuta</button>
            <button className="btn btn-primary" onClick={saveGrant} disabled={!fFunder.trim() || !fName.trim()}>Tallenna</button>
          </div>
        </div>
      </div>
    );
  };

  // =============================================================================
  // MAIN RENDER
  // =============================================================================
  return (
    <>
      {renderStatsBanner()}

      {/* Tab switcher */}
      <div style={{ display: 'flex', background: 'var(--elev)', borderRadius: 'var(--r)', padding: '3px', marginBottom: '1.25rem', width: 'fit-content', flexWrap: 'wrap' }}>
        <button className={`cal-view-btn ${tab === 'wheel' ? 'act' : ''}`} onClick={() => setTab('wheel')}>Vuosikello</button>
        <button className={`cal-view-btn ${tab === 'status' ? 'act' : ''}`} onClick={() => setTab('status')}>Hakemukset</button>
        <button className={`cal-view-btn ${tab === 'funders' ? 'act' : ''}`} onClick={() => setTab('funders')}>Rahoittajat</button>
        <button className={`cal-view-btn ${tab === 'deadlines' ? 'act' : ''}`} onClick={() => setTab('deadlines')}>Hakuajat</button>
      </div>

      {tab === 'wheel' && renderWheel()}
      {tab === 'status' && renderStatus()}
      {tab === 'funders' && renderFunders()}
      {tab === 'deadlines' && renderDeadlines()}

      {renderDetail()}
      {renderForm()}
    </>
  );
}
