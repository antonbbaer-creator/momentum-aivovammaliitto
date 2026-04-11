'use client';

/*
 * Viestintäsuunnitelma — Viestintä-hubin ensimmäinen näkymä.
 * Pohjautuu 2026-strategiaan: missio, 3 strategista siirtoa, KPI:t, kampanjat, vuosikellon vaiheet.
 *
 * Välilehdet:
 *  1. Yleiskuva  — missio, strategiset siirrot, KPI:t, yleisöjakauma, brändipilarit
 *  2. Kampanjat  — 12 strategian mukaista kampanjaa (CAMPAIGN_01..12) + 7 vuosikellon vaihetta
 *  3. Rytmi      — Muokattava kuukausitavoite + kanavamatriisi
 *  4. Arkisto    — 2025 oppimäärä (Arttu:n kalenteri + muistio + parannusehdotukset)
 */

import { useMemo, useState } from 'react';
import { useOrgData } from '@/lib/firestore';
import {
  CommsPlan,
  CommsMonthTarget,
  Campaign,
  DEFAULT_LLFF_2026_PLAN,
  LLFF_2025_REFERENCE,
  LLFF_2025_NOTES,
  LLFF_2025_IMPROVEMENTS,
  MONTHS_FI,
  normalizeCommsPlan,
  monthCoverageStatus,
  intensityColor,
} from '@/lib/comms-plan-shared';
import { OrgTeam, OrgTeamMember, DEFAULT_LLFF_TEAMS, DEFAULT_LLFF_TEAM_MEMBERS } from '@/lib/team-shared';

interface PubLite { id: string; title: string; date: string | null; status: string; }

interface Props {
  onOpenCalendar?: () => void;
  onOpenQueue?: () => void;
}

type PlanTab = 'overview' | 'campaigns' | 'rhythm' | 'archive';

export default function CommsPlanSection({ onOpenCalendar, onOpenQueue }: Props) {
  const [rawPlan, setPlan] = useOrgData<CommsPlan>('commsPlan', DEFAULT_LLFF_2026_PLAN);
  const [orgTeams] = useOrgData<OrgTeam[]>('orgTeams', DEFAULT_LLFF_TEAMS);
  const [teamMembers] = useOrgData<OrgTeamMember[]>('orgTeamMembers', DEFAULT_LLFF_TEAM_MEMBERS);
  const [publications] = useOrgData<PubLite[]>('publications', []);

  const plan = useMemo(() => normalizeCommsPlan(rawPlan), [rawPlan]);
  const [tab, setTab] = useState<PlanTab>('overview');

  const responsible = teamMembers.find(m => m.id === plan.responsibleMemberId);
  const responsibleTeam = orgTeams.find(t => t.id === plan.responsibleTeamId);

  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth() + 1;
  const nextMonth = thisMonth === 12 ? 1 : thisMonth + 1;
  const nextYear = thisMonth === 12 ? thisYear + 1 : thisYear;

  const thisCoverage = monthCoverageStatus(plan, publications, thisYear, thisMonth);
  const nextCoverage = monthCoverageStatus(plan, publications, nextYear, nextMonth);

  const visualDL = new Date(plan.visualIdentityDeadline);
  const visualDaysLeft = Math.ceil((visualDL.getTime() - now.getTime()) / 86400000);
  const activeFrom = new Date(plan.activeFrom);
  const activeDaysLeft = Math.ceil((activeFrom.getTime() - now.getTime()) / 86400000);

  // Festival countdown
  const festivalStart = new Date(plan.year, 7, 20); // 20.8.
  const festDaysLeft = Math.ceil((festivalStart.getTime() - now.getTime()) / 86400000);

  return (
    <>
      {/* === HERO === */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(228,92,129,.12) 0%, rgba(155,124,246,.08) 100%)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--rl)',
        padding: '1.35rem 1.75rem 1.15rem',
        marginBottom: '1rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.4rem' }}>
          <span style={{ color: '#e45c81', fontSize: '.72rem', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>▶ VIESTINTÄSUUNNITELMA</span>
          <span style={{ color: 'var(--t3)', fontSize: '.7rem' }}>· Päivitetty {new Date(plan.updatedAt || Date.now()).toLocaleDateString('fi-FI')}</span>
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.55rem', fontWeight: 500, margin: '0 0 .35rem 0' }}>
          {plan.festivalName}
        </h1>
        <div style={{ fontSize: '.82rem', color: 'var(--t2)', marginBottom: '.75rem' }}>
          Festivaali {plan.festivalDates} {festDaysLeft > 0 && <span style={{ color: '#e45c81', fontWeight: 600 }}>· {festDaysLeft} pv jäljellä</span>}
        </div>
        <p style={{ fontSize: '.88rem', lineHeight: 1.6, color: 'var(--t1)', margin: '0 0 .9rem 0', maxWidth: 880, fontStyle: 'italic' }}>
          {plan.mission}
        </p>

        {/* Meta-rivi — vastuu + (ehdolliset) deadlinet pienesti */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '.65rem', flexWrap: 'wrap',
          paddingTop: '.7rem',
          borderTop: '1px solid rgba(228,92,129,.18)',
          fontSize: '.72rem', color: 'var(--t2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
            <div style={{
              width: 22, height: 22, borderRadius: '50%',
              background: responsibleTeam?.color || '#e45c81',
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: '.68rem',
            }}>
              {responsible?.avatar || 'L'}
            </div>
            <span>
              Vastuussa <strong style={{ color: 'var(--t1)' }}>{responsible?.name || 'Lasse'}</strong>
              {' '}<span style={{ color: 'var(--t3)' }}>/ {responsibleTeam?.name || 'Viestinnän Tiimi'}</span>
            </span>
          </div>

          {activeDaysLeft >= 0 && (
            <>
              <span style={{ color: 'var(--t3)' }}>·</span>
              <span>
                Aktiivinen viestintä {activeFrom.toLocaleDateString('fi-FI', { day: 'numeric', month: 'long' })}
                {activeDaysLeft > 0 && (
                  <span style={{ color: 'var(--pri-l)', fontWeight: 600 }}> ({activeDaysLeft} pv)</span>
                )}
                {activeDaysLeft === 0 && (
                  <span style={{ color: 'var(--green)', fontWeight: 600 }}> (tänään)</span>
                )}
              </span>
            </>
          )}

          {visualDaysLeft >= 0 && (
            <>
              <span style={{ color: 'var(--t3)' }}>·</span>
              <span>
                Visuaalinen ilme {visualDL.toLocaleDateString('fi-FI', { day: 'numeric', month: 'long' })}
                {visualDaysLeft > 0 && (
                  <span style={{
                    color: visualDaysLeft < 14 ? '#e45c81' : 'var(--pri-l)',
                    fontWeight: 600,
                  }}> ({visualDaysLeft} pv)</span>
                )}
                {visualDaysLeft === 0 && (
                  <span style={{ color: '#e45c81', fontWeight: 600 }}> (tänään)</span>
                )}
              </span>
            </>
          )}
        </div>
      </div>

      {/* === KUUKAUSIKATTAVUUS — tämä ja seuraava === */}
      <div style={{ marginBottom: '1.25rem' }}>
        <div style={{ fontSize: '.7rem', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: '.6rem' }}>
          KUUKAUSIMUISTUTUS
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '.75rem' }}>
          {[thisCoverage, nextCoverage].map((cov, idx) => {
            const monthLabel = MONTHS_FI[(idx === 0 ? thisMonth : nextMonth) - 1];
            const yearLabel = idx === 0 ? thisYear : nextYear;
            const bg =
              cov.status === 'empty' ? 'rgba(239,68,68,.08)' :
              cov.status === 'under' ? 'rgba(245,197,66,.1)' :
              cov.status === 'ok'    ? 'rgba(45,212,160,.08)' :
                                       'var(--elev)';
            const borderCol =
              cov.status === 'empty' ? 'rgba(239,68,68,.5)' :
              cov.status === 'under' ? 'rgba(245,197,66,.5)' :
              cov.status === 'ok'    ? 'rgba(45,212,160,.5)' :
                                       'var(--border)';
            const fg =
              cov.status === 'empty' ? 'var(--red)' :
              cov.status === 'under' ? 'var(--yellow)' :
              cov.status === 'ok'    ? 'var(--green)' :
                                       'var(--t3)';
            const icon = cov.status === 'empty' ? '!' : cov.status === 'under' ? '⚠' : cov.status === 'ok' ? '✓' : '◌';
            return (
              <div key={idx} style={{
                background: bg, border: `1px solid ${borderCol}`,
                borderRadius: 'var(--rl)', padding: '1rem 1.15rem',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.35rem' }}>
                  <div style={{ fontSize: '.95rem', fontWeight: 600 }}>
                    {idx === 0 ? 'Tämä kuu' : 'Seuraava kuu'} — {monthLabel} {yearLabel}
                  </div>
                  <span style={{ color: fg, fontWeight: 700, fontSize: '1rem' }}>{icon}</span>
                </div>
                <div style={{ fontSize: '.78rem', color: 'var(--t2)', marginBottom: '.6rem' }}>
                  {cov.message}
                </div>
                {cov.target && cov.target.postsMax > 0 && (
                  <div style={{ fontSize: '.7rem', color: 'var(--t3)', fontStyle: 'italic', marginBottom: '.6rem' }}>
                    {cov.target.focus}
                  </div>
                )}
                {(cov.status === 'empty' || cov.status === 'under') && (
                  <div style={{ display: 'flex', gap: '.4rem' }}>
                    <button className="btn btn-primary btn-sm" onClick={onOpenQueue}>
                      + Suunnittele julkaisuja
                    </button>
                    {onOpenCalendar && (
                      <button className="btn btn-ghost btn-sm" onClick={onOpenCalendar}>
                        Avaa kalenteri
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* === TAB SWITCHER === */}
      <div style={{
        display: 'flex', gap: '.25rem',
        background: 'var(--elev)', borderRadius: 'var(--r)', padding: '3px',
        marginBottom: '1rem', flexWrap: 'wrap',
      }}>
        {([
          { id: 'overview',  label: 'Yleiskuva',  icon: '◉' },
          { id: 'campaigns', label: 'Kampanjat',  icon: '★' },
          { id: 'rhythm',    label: 'Rytmi',      icon: '▶' },
          { id: 'archive',   label: 'Arkisto',    icon: '◇' },
        ] as const).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`cal-view-btn ${tab === t.id ? 'act' : ''}`}
            style={{ flex: '1 1 auto', minWidth: 110 }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview'  && <OverviewTab plan={plan} />}
      {tab === 'campaigns' && <CampaignsTab plan={plan} />}
      {tab === 'rhythm'    && <RhythmTab plan={plan} publications={publications} onSave={setPlan} />}
      {tab === 'archive'   && <ArchiveTab teamMembers={teamMembers} />}
    </>
  );
}

// ============================================================
// TAB 1: Yleiskuva — missio, strategiset siirrot, KPI:t, yleisö, pilarit
// ============================================================
function OverviewTab({ plan }: { plan: CommsPlan }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* === KOLME STRATEGISTA SIIRTOA === */}
      <div>
        <div style={{ fontSize: '.7rem', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: '.6rem' }}>
          KOLME STRATEGISTA SIIRTOA {plan.year}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '.85rem' }}>
          {plan.strategicMoves.map(move => (
            <div key={move.id} className="card" style={{
              padding: '1.1rem 1.25rem',
              borderLeft: `3px solid ${move.color}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.55rem', marginBottom: '.5rem' }}>
                <span style={{
                  width: 26, height: 26, borderRadius: '50%',
                  background: `${move.color}22`, color: move.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '.85rem', fontWeight: 700,
                }}>{move.order}</span>
                <span style={{ color: move.color, fontSize: '1rem' }}>{move.icon}</span>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 500, margin: 0 }}>
                  {move.title}
                </h3>
              </div>
              <div style={{ fontSize: '.82rem', color: 'var(--t1)', fontWeight: 500, marginBottom: '.4rem', lineHeight: 1.45 }}>
                {move.tagline}
              </div>
              <div style={{ fontSize: '.74rem', color: 'var(--t2)', lineHeight: 1.55 }}>
                {move.description}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* === KPI:T === */}
      <div className="card" style={{ padding: '1.1rem 1.25rem' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 500, margin: '0 0 .25rem 0' }}>
          Mittarit {plan.year}
        </h3>
        <div style={{ fontSize: '.72rem', color: 'var(--t3)', marginBottom: '.85rem', lineHeight: 1.5 }}>
          Kaikki mittarit säilyvät koko vuoden — eivät vanhene kuukausittain.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '.55rem' }}>
          {plan.kpis.map(kpi => (
            <div key={kpi.id} style={{
              background: 'var(--elev)', border: '1px solid var(--border)',
              borderRadius: 'var(--r)', padding: '.75rem .9rem',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '.25rem' }}>
                <span style={{ fontSize: '.6rem', fontWeight: 700, color: 'var(--pri-l)', letterSpacing: '.05em' }}>{kpi.id}</span>
                <span style={{ fontSize: '.9rem', fontWeight: 700, fontFamily: 'var(--font-display)', color: '#e45c81' }}>
                  {kpi.target}
                </span>
              </div>
              <div style={{ fontSize: '.8rem', fontWeight: 600, marginBottom: '.25rem' }}>{kpi.label}</div>
              {kpi.baseline && (
                <div style={{ fontSize: '.65rem', color: 'var(--t3)', marginBottom: '.3rem' }}>{kpi.baseline}</div>
              )}
              <div style={{ fontSize: '.68rem', color: 'var(--t2)', lineHeight: 1.45 }}>{kpi.measurement}</div>
            </div>
          ))}
        </div>
      </div>

      {/* === KOHDERYHMÄT === */}
      <div className="card" style={{ padding: '1.1rem 1.25rem' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 500, margin: '0 0 .85rem 0' }}>
          Kohderyhmät {plan.year}
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
          {plan.audienceMix.map(seg => (
            <div key={seg.id} style={{
              display: 'grid', gridTemplateColumns: '1fr 3fr',
              gap: '.9rem', alignItems: 'start',
              padding: '.65rem .8rem',
              background: 'var(--elev)', border: '1px solid var(--border)', borderRadius: 'var(--r)',
            }}>
              <div style={{ fontSize: '.84rem', fontWeight: 600, lineHeight: 1.35 }}>{seg.label}</div>
              <div style={{ fontSize: '.72rem', color: 'var(--t2)', lineHeight: 1.55 }}>{seg.description}</div>
            </div>
          ))}
        </div>
      </div>

      {/* === BRÄNDIPILARIT === */}
      <div className="card" style={{ padding: '1.1rem 1.25rem' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 500, margin: '0 0 .75rem 0' }}>
          Brändipilarit
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '.6rem' }}>
          {plan.brandPillars.map((p, i) => (
            <div key={p.id} style={{
              background: 'var(--elev)', border: '1px solid var(--border)',
              borderRadius: 'var(--r)', padding: '.8rem .95rem',
            }}>
              <div style={{ fontSize: '.6rem', fontWeight: 700, color: 'var(--pri-l)', letterSpacing: '.06em' }}>
                PILARI {i + 1}
              </div>
              <div style={{ fontSize: '.88rem', fontWeight: 600, marginTop: '.2rem' }}>{p.title}</div>
              <div style={{ fontSize: '.68rem', fontStyle: 'italic', color: 'var(--t3)', marginBottom: '.35rem' }}>{p.subtitle}</div>
              <div style={{ fontSize: '.72rem', color: 'var(--t2)', lineHeight: 1.5 }}>{p.description}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// TAB 2: Kampanjat — 12 kampanjaa ryhmiteltynä vuosikellon vaiheisiin
// ============================================================
function CampaignsTab({ plan }: { plan: CommsPlan }) {
  const [openPhase, setOpenPhase] = useState<string | null>('phase-3');

  const campaignTypeColor: Record<string, string> = {
    'brand-awareness':    '#9b7cf6',
    'recruitment':        '#3788b2',
    'launch':             '#e45c81',
    'program-reveal':     '#2a8a86',
    'partnership':        '#f59e0b',
    'audience-expansion': '#e45c81',
    'brand-storytelling': '#9b7cf6',
    'conversion':         '#ef4444',
    'live-coverage':      '#e45c81',
    'post-event':         'var(--t3)',
    'cross-festival':     '#3788b2',
  };
  const campaignTypeLabel: Record<string, string> = {
    'brand-awareness':    'Brändi',
    'recruitment':        'Rekrytointi',
    'launch':             'Julkistus',
    'program-reveal':     'Ohjelmapaljastus',
    'partnership':        'Kumppanuus',
    'audience-expansion': 'Yleisölaajennus',
    'brand-storytelling': 'Tarinankerronta',
    'conversion':         'Konversio',
    'live-coverage':      'Live-coverage',
    'post-event':         'Jälkitapahtuma',
    'cross-festival':     'Cross-festival',
  };

  const campaignsByPhase = (phaseId: string): Campaign[] =>
    plan.campaigns.filter(c => c.phaseId === phaseId).sort((a, b) => a.order - b.order);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
      <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '.5rem' }}>
        <div style={{ fontSize: '.85rem', color: 'var(--t2)', lineHeight: 1.55 }}>
          12 kampanjaa on ryhmitelty vuosikellon 7 vaiheeseen. Jokainen on Hetki Momentumiin vietävä projekti
          ennalta määritellyllä sisältötyypillä, yleisöllä, kanavilla ja sävyllä.
        </div>
      </div>

      {plan.phases.map(phase => {
        const phaseCampaigns = campaignsByPhase(phase.id);
        const isOpen = openPhase === phase.id;
        return (
          <div key={phase.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <button
              onClick={() => setOpenPhase(isOpen ? null : phase.id)}
              style={{
                width: '100%', textAlign: 'left',
                background: 'transparent', border: 'none', cursor: 'pointer',
                padding: '1rem 1.25rem', color: 'var(--t1)',
                display: 'flex', alignItems: 'center', gap: '.85rem',
              }}
            >
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: 'rgba(228,92,129,.12)', color: '#e45c81',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: '.85rem',
              }}>
                {phase.order}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: '.5rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '.95rem', fontWeight: 600 }}>{phase.title}</span>
                  <span style={{ fontSize: '.68rem', color: 'var(--t3)' }}>· {phase.months}</span>
                  <span style={{ fontSize: '.62rem', color: 'var(--pri-l)', fontWeight: 600 }}>
                    {phaseCampaigns.length} kampanjaa
                  </span>
                </div>
                <div style={{ fontSize: '.72rem', color: 'var(--t2)', marginTop: '.25rem', lineHeight: 1.5 }}>
                  {phase.focus}
                </div>
              </div>
              <span style={{ color: 'var(--t3)', fontSize: '1rem' }}>{isOpen ? '−' : '+'}</span>
            </button>

            {isOpen && (
              <div style={{ borderTop: '1px solid var(--border)', padding: '.75rem 1.25rem 1.15rem' }}>
                <div style={{ fontSize: '.68rem', color: 'var(--t3)', marginBottom: '.7rem', fontStyle: 'italic' }}>
                  Kanavarytmi: {phase.channels}
                </div>
                {phaseCampaigns.length === 0 ? (
                  <div style={{ fontSize: '.72rem', color: 'var(--t3)', padding: '.4rem 0' }}>Ei kampanjoita tässä vaiheessa.</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '.6rem' }}>
                    {phaseCampaigns.map(c => {
                      const color = campaignTypeColor[c.type] || 'var(--pri-l)';
                      return (
                        <div key={c.id} style={{
                          background: 'var(--elev)', border: '1px solid var(--border)',
                          borderLeft: `3px solid ${color}`,
                          borderRadius: 'var(--r)', padding: '.75rem .9rem',
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '.25rem', gap: '.4rem' }}>
                            <span style={{ fontSize: '.58rem', fontWeight: 700, color: 'var(--t3)', letterSpacing: '.05em' }}>{c.id}</span>
                            <span style={{
                              fontSize: '.56rem', fontWeight: 700, letterSpacing: '.05em',
                              textTransform: 'uppercase', color: color,
                              background: `${color}18`, padding: '.15rem .4rem', borderRadius: 3,
                            }}>
                              {campaignTypeLabel[c.type] || c.type}
                            </span>
                          </div>
                          <div style={{ fontSize: '.85rem', fontWeight: 600, marginBottom: '.4rem' }}>{c.title}</div>
                          <div style={{ fontSize: '.68rem', color: 'var(--t2)', lineHeight: 1.5, marginBottom: '.35rem' }}>
                            <strong style={{ color: 'var(--t3)' }}>Yleisö:</strong> {c.audience}
                          </div>
                          <div style={{ fontSize: '.66rem', color: 'var(--t2)', marginBottom: '.3rem' }}>
                            <strong style={{ color: 'var(--t3)' }}>Kanavat:</strong> {c.channels.join(' · ')}
                          </div>
                          <div style={{ fontSize: '.66rem', color: 'var(--t2)', marginBottom: '.3rem' }}>
                            <strong style={{ color: 'var(--t3)' }}>Formaatit:</strong> {c.formats.join(', ')}
                          </div>
                          <div style={{ fontSize: '.66rem', color: 'var(--t2)', fontStyle: 'italic', marginBottom: c.note ? '.3rem' : 0 }}>
                            <strong style={{ color: 'var(--t3)', fontStyle: 'normal' }}>Sävy:</strong> {c.tone}
                          </div>
                          {c.cta && (
                            <div style={{ fontSize: '.64rem', color: '#e45c81', marginTop: '.3rem', fontWeight: 600 }}>
                              CTA: {c.cta}
                            </div>
                          )}
                          {c.note && (
                            <div style={{
                              fontSize: '.64rem', color: 'var(--t3)', fontStyle: 'italic',
                              marginTop: '.35rem', paddingTop: '.35rem',
                              borderTop: '1px dashed var(--border)',
                            }}>
                              {c.note}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// TAB 3: Rytmi — muokattava kuukausitavoite + kanavamatriisi
// ============================================================
function RhythmTab({
  plan, publications, onSave,
}: {
  plan: CommsPlan;
  publications: PubLite[];
  onSave: (next: CommsPlan) => void;
}) {
  const [editMode, setEditMode] = useState(false);
  const [drafts, setDrafts] = useState<CommsMonthTarget[]>(plan.monthTargets);

  const startEdit = () => {
    setDrafts(plan.monthTargets.map(m => ({ ...m })));
    setEditMode(true);
  };
  const cancel = () => {
    setDrafts(plan.monthTargets);
    setEditMode(false);
  };
  const save = () => {
    onSave({ ...plan, monthTargets: drafts, updatedAt: Date.now() });
    setEditMode(false);
  };
  const updateDraft = (month: number, patch: Partial<CommsMonthTarget>) => {
    setDrafts(prev => prev.map(d => d.month === month ? { ...d, ...patch } : d));
  };

  const year = plan.year;
  const viewTargets = editMode ? drafts : plan.monthTargets;
  const maxPosts = Math.max(40, ...viewTargets.map(t => t.postsMax));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* === KUUKAUSITAVOITE === */}
      <div className="card" style={{ padding: '1.25rem 1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '.25rem', gap: '.5rem', flexWrap: 'wrap' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 500, margin: 0 }}>
            Kuukausittainen julkaisutavoite {year}
          </h3>
          <div style={{ display: 'flex', gap: '.35rem' }}>
            {editMode ? (
              <>
                <button className="btn btn-ghost btn-sm" onClick={cancel}>Peruuta</button>
                <button className="btn btn-primary btn-sm" onClick={save}>Tallenna</button>
              </>
            ) : (
              <button className="btn btn-ghost btn-sm" onClick={startEdit}>⚙ Muokkaa tavoitteita</button>
            )}
          </div>
        </div>
        <div style={{ fontSize: '.72rem', color: 'var(--t3)', marginBottom: '1rem' }}>
          {editMode
            ? 'Säädä minimi/maksimi -lukuja. Muutokset tallentuvat koko organisaatiolle.'
            : 'Harmaa palkki = tavoite. Värillinen = jo suunniteltu kalenterissa.'}
        </div>

        {/* Pylväsdiagrammi */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '.4rem' }}>
          {viewTargets.map(mt => {
            const cov = monthCoverageStatus(plan, publications, year, mt.month);
            const color = intensityColor(mt.intensity);
            const maxHeight = 160;
            const targetHeight = (mt.postsMax / maxPosts) * maxHeight;
            const scheduledHeight = (cov.scheduled / maxPosts) * maxHeight;
            return (
              <div key={mt.month} title={`${MONTHS_FI[mt.month - 1]}: ${mt.focus}`} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
              }}>
                <div style={{
                  position: 'relative', width: '100%', height: maxHeight,
                  background: 'var(--elev)', border: '1px solid var(--border)',
                  borderRadius: 'var(--r)', display: 'flex', alignItems: 'flex-end',
                  justifyContent: 'center', overflow: 'hidden',
                }}>
                  <div style={{
                    position: 'absolute', bottom: 0, left: 4, right: 4,
                    height: Math.max(targetHeight, 2),
                    background: color, opacity: .25, borderRadius: 4,
                  }} />
                  <div style={{
                    position: 'absolute', bottom: 0, left: 10, right: 10,
                    height: Math.max(scheduledHeight, 2),
                    background: color, borderRadius: 4,
                  }} />
                  <div style={{
                    position: 'absolute', top: 4, left: 0, right: 0,
                    textAlign: 'center', fontSize: '.6rem', color: 'var(--t3)', fontWeight: 600,
                  }}>
                    {cov.scheduled}/{mt.postsMax}
                  </div>
                </div>
                <div style={{ fontSize: '.62rem', color: 'var(--t2)', marginTop: '.3rem', fontWeight: 500 }}>
                  {MONTHS_FI[mt.month - 1].slice(0, 3)}
                </div>
              </div>
            );
          })}
        </div>

        {/* Kuukausikortit — editable tai read-only */}
        <div style={{ marginTop: '1.25rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '.5rem' }}>
          {viewTargets.map(mt => {
            const cov = monthCoverageStatus(plan, publications, year, mt.month);
            return (
              <div key={mt.month} style={{
                background: 'var(--elev)', border: '1px solid var(--border)',
                borderRadius: 'var(--r)', padding: '.7rem .85rem',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.35rem', gap: '.5rem' }}>
                  <strong style={{ fontSize: '.78rem' }}>{MONTHS_FI[mt.month - 1]}</strong>
                  {!editMode && (
                    <span style={{
                      fontSize: '.62rem', fontWeight: 600,
                      color: cov.status === 'ok' ? 'var(--green)' : cov.status === 'under' ? 'var(--yellow)' : cov.status === 'empty' ? 'var(--red)' : 'var(--t3)',
                    }}>
                      {cov.scheduled} / {mt.postsMin}-{mt.postsMax}
                    </span>
                  )}
                </div>

                {editMode ? (
                  <div style={{ display: 'flex', gap: '.35rem', alignItems: 'center', marginBottom: '.4rem' }}>
                    <label style={{ fontSize: '.6rem', color: 'var(--t3)' }}>Min</label>
                    <input
                      type="number" min={0} max={99}
                      value={mt.postsMin}
                      onChange={e => updateDraft(mt.month, { postsMin: Math.max(0, parseInt(e.target.value) || 0) })}
                      style={{
                        width: 46, padding: '.2rem .3rem', fontSize: '.72rem',
                        background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 4,
                        color: 'var(--t1)',
                      }}
                    />
                    <label style={{ fontSize: '.6rem', color: 'var(--t3)' }}>Max</label>
                    <input
                      type="number" min={0} max={99}
                      value={mt.postsMax}
                      onChange={e => updateDraft(mt.month, { postsMax: Math.max(0, parseInt(e.target.value) || 0) })}
                      style={{
                        width: 46, padding: '.2rem .3rem', fontSize: '.72rem',
                        background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 4,
                        color: 'var(--t1)',
                      }}
                    />
                  </div>
                ) : null}

                {editMode ? (
                  <select
                    value={mt.intensity}
                    onChange={e => updateDraft(mt.month, { intensity: e.target.value as CommsMonthTarget['intensity'] })}
                    style={{
                      fontSize: '.66rem', padding: '.2rem .3rem', marginBottom: '.35rem',
                      background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 4,
                      color: 'var(--t1)', width: '100%',
                    }}
                  >
                    <option value="low">matala</option>
                    <option value="medium">keskitaso</option>
                    <option value="high">korkea</option>
                    <option value="peak">huippu</option>
                  </select>
                ) : null}

                <div style={{ fontSize: '.66rem', color: 'var(--t2)', lineHeight: 1.4 }}>{mt.focus}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* === KANAVAMATRIISI === */}
      <div className="card" style={{ padding: '1.1rem 1.25rem' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 500, margin: '0 0 .25rem 0' }}>
          Kanavamatriisi
        </h3>
        <div style={{ fontSize: '.72rem', color: 'var(--t3)', marginBottom: '.85rem' }}>
          10 kanavaa, kukin oma funktio ja frekvenssi. Uudet 2026: TikTok-painotus ja Uutiskirje.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
          {plan.channelMatrix.map(row => (
            <div key={row.id} style={{
              background: 'var(--elev)',
              border: row.isNew2026 ? '1px solid rgba(228,92,129,.5)' : '1px solid var(--border)',
              borderRadius: 'var(--r)', padding: '.65rem .85rem',
              display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 1fr 1fr',
              gap: '.55rem', alignItems: 'center',
            }}>
              <div>
                <div style={{ display: 'flex', gap: '.35rem', alignItems: 'center' }}>
                  <strong style={{ fontSize: '.78rem' }}>{row.name}</strong>
                  {row.isNew2026 && (
                    <span style={{
                      fontSize: '.55rem', fontWeight: 700, color: '#e45c81',
                      background: 'rgba(228,92,129,.12)', padding: '.1rem .3rem', borderRadius: 3,
                      letterSpacing: '.05em', textTransform: 'uppercase',
                    }}>Uusi 2026</span>
                  )}
                </div>
              </div>
              <div style={{ fontSize: '.68rem', color: 'var(--t2)', lineHeight: 1.4 }}>{row.function}</div>
              <div style={{ fontSize: '.66rem', color: 'var(--pri-l)', fontWeight: 600 }}>{row.frequency}</div>
              <div style={{ fontSize: '.66rem', color: 'var(--t3)' }}>{row.primaryAudience}</div>
              <div style={{ fontSize: '.64rem', color: 'var(--t3)', fontStyle: 'italic' }}>{row.responsible}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// TAB 4: Arkisto — 2025 oppimäärä (Arttu)
// ============================================================
function ArchiveTab({ teamMembers }: { teamMembers: OrgTeamMember[] }) {
  const [section, setSection] = useState<'notes' | 'calendar' | 'improvements'>('notes');
  const [openWeek, setOpenWeek] = useState<number | null>(23);

  const statusMeta: Record<string, { label: string; color: string; bg: string }> = {
    applied: { label: 'Sovellettu 2026',  color: 'var(--green)', bg: 'rgba(45,212,160,.1)' },
    planned: { label: 'Suunnitelmissa',   color: 'var(--pri-l)', bg: 'rgba(5,107,159,.1)' },
    backlog: { label: 'Backlog',          color: 'var(--t3)',    bg: 'var(--elev)' },
  };
  const priorityMeta: Record<string, { label: string; color: string }> = {
    high:   { label: 'Korkea',   color: '#e45c81' },
    medium: { label: 'Normaali', color: 'var(--pri-l)' },
    low:    { label: 'Matala',   color: 'var(--t3)' },
  };

  return (
    <div>
      <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1rem' }}>
        <div style={{ fontSize: '.72rem', color: 'var(--t3)', marginBottom: '.6rem', fontStyle: 'italic' }}>
          Arkisto — edellisen vuoden oppimäärä. Pysyy tallessa tulevaisuuden viestinnän vastaaville.
        </div>
        <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
          {([
            { id: 'notes',        label: 'Arttu:n muistio' },
            { id: 'calendar',     label: '2025 viikkokalenteri' },
            { id: 'improvements', label: 'Parannusehdotukset' },
          ] as const).map(s => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={`cal-view-btn ${section === s.id ? 'act' : ''}`}
              style={{ minWidth: 140 }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {section === 'notes' && (
        <div className="card" style={{ padding: '1.25rem 1.5rem' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 500, margin: '0 0 .75rem 0' }}>
            2025 viestinnän vastaava: {LLFF_2025_NOTES.author}
          </h3>
          <div style={{ fontSize: '.76rem', color: 'var(--t2)', lineHeight: 1.6, marginBottom: '.85rem' }}>
            <strong>Tiimi:</strong> {LLFF_2025_NOTES.teamComposition}
          </div>
          <div style={{ fontSize: '.76rem', color: 'var(--t2)', lineHeight: 1.6, marginBottom: '.85rem' }}>
            <strong>Kokonaistyömäärä:</strong> {LLFF_2025_NOTES.totalHours}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.5rem', marginBottom: '.85rem' }}>
            {LLFF_2025_NOTES.monthlyLoad.map(m => (
              <div key={m.period} style={{
                background: 'var(--elev)', border: '1px solid var(--border)',
                borderRadius: 'var(--r)', padding: '.65rem .8rem',
              }}>
                <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--pri-l)' }}>{m.period}</div>
                <div style={{ fontSize: '.68rem', color: 'var(--t3)', marginTop: '.15rem', marginBottom: '.3rem' }}>{m.hours}</div>
                <div style={{ fontSize: '.7rem', color: 'var(--t2)', lineHeight: 1.45 }}>{m.focus}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: '.72rem', color: 'var(--t3)', fontStyle: 'italic', lineHeight: 1.55 }}>
            {LLFF_2025_NOTES.leadershipNote}
          </div>
          <div style={{ fontSize: '.72rem', color: 'var(--t3)', fontStyle: 'italic', lineHeight: 1.55, marginTop: '.5rem' }}>
            "{LLFF_2025_NOTES.closingThoughts}"
          </div>
          <div style={{ fontSize: '.68rem', color: 'var(--t3)', marginTop: '.7rem' }}>
            Kysy matalalla kynnyksellä: {LLFF_2025_NOTES.email}
          </div>
        </div>
      )}

      {section === 'calendar' && (
        <div className="card" style={{ padding: '1.25rem 1.5rem' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 500, margin: '0 0 .5rem 0' }}>
            2025 julkaisukalenteri viikoittain
          </h3>
          <div style={{ fontSize: '.72rem', color: 'var(--t3)', marginBottom: '.75rem' }}>
            Purettu Arttu:n PDF-kalenterista. Hard launch viikko 23 (ke 4.6.2025). Festivaali viikko 34.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
            {LLFF_2025_REFERENCE.map(w => (
              <div key={w.week} style={{
                background: 'var(--elev)', border: '1px solid var(--border)',
                borderRadius: 'var(--r)', overflow: 'hidden',
              }}>
                <button
                  onClick={() => setOpenWeek(openWeek === w.week ? null : w.week)}
                  style={{
                    width: '100%', textAlign: 'left', padding: '.7rem .9rem',
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem',
                    color: 'var(--t1)',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
                    <span style={{
                      fontSize: '.7rem', fontWeight: 700, color: 'var(--pri-l)',
                      background: 'var(--card)', padding: '.15rem .5rem', borderRadius: 4,
                      minWidth: 48, textAlign: 'center',
                    }}>Vko {w.week}</span>
                    <span style={{ fontSize: '.78rem' }}>{w.dateRange}</span>
                    <span style={{ fontSize: '.68rem', color: 'var(--t3)' }}>· {w.posts.length} julkaisua</span>
                  </div>
                  <span style={{ color: 'var(--t3)', fontSize: '.8rem' }}>{openWeek === w.week ? '−' : '+'}</span>
                </button>
                {openWeek === w.week && (
                  <div style={{ padding: '.25rem .9rem .85rem', borderTop: '1px solid var(--border)' }}>
                    {w.note && (
                      <div style={{ fontSize: '.72rem', color: 'var(--t3)', fontStyle: 'italic', margin: '.5rem 0' }}>{w.note}</div>
                    )}
                    {w.posts.length === 0 ? (
                      <div style={{ fontSize: '.72rem', color: 'var(--t3)', padding: '.5rem 0' }}>Ei julkaisuja.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '.35rem', marginTop: '.5rem' }}>
                        {w.posts.map((p, i) => (
                          <div key={i} style={{
                            display: 'flex', gap: '.6rem', alignItems: 'flex-start',
                            padding: '.4rem .55rem',
                            background: 'var(--card)', borderRadius: 4, fontSize: '.74rem',
                          }}>
                            <span style={{ fontWeight: 700, color: 'var(--pri-l)', minWidth: 22 }}>{p.weekday}</span>
                            <span style={{ flex: 1, lineHeight: 1.4 }}>
                              {p.content}
                              {p.notes && <span style={{ color: 'var(--t3)', fontStyle: 'italic' }}> — {p.notes}</span>}
                            </span>
                            <span style={{ fontSize: '.62rem', color: 'var(--t3)' }}>{p.platforms.join(' · ')}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {section === 'improvements' && (
        <div className="card" style={{ padding: '1.25rem 1.5rem' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 500, margin: '0 0 .5rem 0' }}>
            Parannusehdotukset — Arttu:lta 2026:lle
          </h3>
          <div style={{ fontSize: '.72rem', color: 'var(--t3)', marginBottom: '1rem', lineHeight: 1.5 }}>
            Edellisen vuoden viestinnän vastaavan opit. "Korkea" -prioriteetit on sovellettu jo 2026-suunnitelmaan.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '.75rem' }}>
            {LLFF_2025_IMPROVEMENTS.map(imp => {
              const st = statusMeta[imp.status];
              const pr = priorityMeta[imp.priority];
              const owner = teamMembers.find(m => m.id === imp.owner);
              return (
                <div key={imp.id} style={{
                  background: 'var(--elev)', border: '1px solid var(--border)',
                  borderRadius: 'var(--r)', padding: '.9rem 1.05rem',
                }}>
                  <div style={{ display: 'flex', gap: '.4rem', marginBottom: '.5rem', flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: '.6rem', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase',
                      color: st.color, background: st.bg,
                      padding: '.2rem .5rem', borderRadius: 4,
                    }}>{st.label}</span>
                    <span style={{
                      fontSize: '.6rem', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase',
                      color: pr.color,
                    }}>{pr.label}</span>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: '.9rem', marginBottom: '.4rem' }}>{imp.title}</div>
                  <div style={{ fontSize: '.75rem', color: 'var(--t2)', lineHeight: 1.55, marginBottom: owner ? '.5rem' : 0 }}>
                    {imp.description}
                  </div>
                  {owner && (
                    <div style={{ fontSize: '.68rem', color: 'var(--t3)' }}>
                      Vastuu: <strong style={{ color: 'var(--t2)' }}>{owner.name}</strong>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
