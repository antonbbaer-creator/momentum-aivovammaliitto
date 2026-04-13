'use client';

import { useState } from 'react';
import AppShell from '@/components/AppShell';
import { useOrgData } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { doc, setDoc, collection } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useIsMobile } from '@/lib/use-mobile';
import { useParams } from 'next/navigation';
import Link from 'next/link';

const Q_COLORS = ['#056b9f', '#185e5b', '#f1b434', '#e45c81'];
const MONTH_NAMES = ['', 'Tammikuu', 'Helmikuu', 'Maaliskuu', 'Huhtikuu', 'Toukokuu', 'Kesäkuu', 'Heinäkuu', 'Elokuu', 'Syyskuu', 'Lokakuu', 'Marraskuu', 'Joulukuu'];

export default function StrategyPage() {
  const { user, activeOrg, canEdit } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const orgSlug = (useParams().orgSlug as string) || '';
  const [org, setOrg] = useOrgData<any>('org', {});
  const [teamData] = useOrgData<any[]>('teamMembers', []);
  const [tab, setTab] = useState<'plan' | 'strategy'>('plan');
  const [editSection, setEditSection] = useState<string | null>(null);
  const [tempText, setTempText] = useState('');
  const [submitText, setSubmitText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const currentQ = Math.ceil((new Date().getMonth() + 1) / 3);
  const [activeQ, setActiveQ] = useState(currentQ);

  const startEdit = (section: string, value: string) => { setEditSection(section); setTempText(value); };
  const saveText = (field: string) => { setOrg((prev: any) => ({ ...prev, [field]: tempText })); setEditSection(null); toast('Tallennettu', 'success'); };
  const saveNested = (parent: string, field: string) => { setOrg((prev: any) => ({ ...prev, [parent]: { ...prev[parent], [field]: tempText } })); setEditSection(null); toast('Tallennettu', 'success'); };

  const handleStrategySubmit = async () => {
    if (!submitText.trim()) return;
    setSubmitting(true);
    try {
      await setDoc(doc(collection(db, 'strategySubmissions')), {
        orgId: activeOrg, orgName: org.name || '', submittedBy: user?.uid,
        submitterName: user?.displayName || '', submitterEmail: user?.email || '',
        text: submitText.trim(), submittedAt: new Date().toISOString(), status: 'pending',
      });
      setOrg((prev: any) => ({ ...prev, strategyText: submitText.trim() }));
      setSubmitted(true); setSubmitText('');
      toast('Strategia lähetetty Momentum-tiimille!', 'success');
    } catch (e) { toast('Virhe lähetyksessä', 'error'); }
    finally { setSubmitting(false); }
  };

  const orgStrategy = org.orgStrategy || {};
  const coreRoles = org.commsCoreRoles || org.contentPillars || [];
  const currentCtx = org.currentContext || {};
  const channels = org.channels || [];
  const quarterlyThemes = org.quarterlyThemes || [];
  const quarterlyCalendar = org.quarterlyCalendar || [];
  const channelProfiles = org.channelProfiles || [];
  const auds = org.auds || [];

  // Editable text block
  const EditableBlock = ({ label, color, sectionKey, value, parentKey }: { label: string; color: string; sectionKey: string; value: string; parentKey?: string }) => (
    <div>
      <h3 style={{ fontSize: '.65rem', fontWeight: 600, color, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '.5rem' }}>{label}</h3>
      {editSection === sectionKey ? (
        <div>
          <textarea className="input textarea" value={tempText} onChange={e => setTempText(e.target.value)} style={{ minHeight: 80 }} />
          <div style={{ display: 'flex', gap: '.5rem', marginTop: '.5rem' }}>
            <button className="btn btn-primary btn-sm" onClick={() => parentKey ? saveNested(parentKey, sectionKey.split('.')[1] || sectionKey) : saveText(sectionKey)}>Tallenna</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditSection(null)}>Peruuta</button>
          </div>
        </div>
      ) : (
        <p style={{ color: value ? 'var(--t1)' : 'var(--t3)', fontSize: '.92rem', lineHeight: 1.8, cursor: canEdit ? 'pointer' : 'default' }}
          onClick={() => canEdit && startEdit(sectionKey, value || '')}>{value || 'Klikkaa lisataksesi...'}</p>
      )}
    </div>
  );

  return (
    <AppShell title="Strategia" subtitle={org.name || ''}>

      {/* Tab switcher — viestintasuunnitelma first */}
      <div style={{ display: 'flex', background: 'var(--elev)', borderRadius: 'var(--r)', padding: '3px', marginBottom: '1.5rem', width: 'fit-content' }}>
        <button className={`cal-view-btn ${tab === 'plan' ? 'act' : ''}`} onClick={() => setTab('plan')}>Viestintasuunnitelma</button>
        <button className={`cal-view-btn ${tab === 'strategy' ? 'act' : ''}`} onClick={() => setTab('strategy')}>Strategia</button>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          TAB 1: VIESTINTASUUNNITELMA
          ═══════════════════════════════════════════════════════════ */}
      {tab === 'plan' && (
        <>
          {/* ── Kvartaaliteemat aikajana ── */}
          {quarterlyThemes.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr 1fr', gap: isMobile ? '.5rem' : '.75rem' }}>
                {quarterlyThemes.map((t: any, i: number) => {
                  const isActive = activeQ === t.q;
                  const isCurrent = currentQ === t.q;
                  const color = Q_COLORS[i];
                  return (
                    <button key={i} onClick={() => setActiveQ(t.q)} style={{
                      background: isActive ? `${color}15` : 'var(--card)',
                      border: `1.5px solid ${isActive ? color : 'var(--border)'}`,
                      borderRadius: 'var(--rl)', padding: isMobile ? '.75rem' : '1.25rem', cursor: 'pointer',
                      textAlign: 'left', transition: 'all .15s ease', position: 'relative', overflow: 'hidden',
                    }}>
                      {isCurrent && <div style={{ position: 'absolute', top: 0, right: 0, background: color, color: '#fff', fontSize: '.5rem', fontWeight: 700, padding: '.15rem .4rem', borderBottomLeftRadius: 6, fontFamily: 'var(--font-display)', letterSpacing: '.04em' }}>NYT</div>}
                      <div style={{ fontSize: '.65rem', fontWeight: 700, color, fontFamily: 'var(--font-display)', letterSpacing: '.04em', marginBottom: '.35rem' }}>Q{t.q} / {t.months}</div>
                      <div style={{ fontSize: isMobile ? '.78rem' : '.85rem', fontWeight: 700, color: isActive ? 'var(--t1)' : 'var(--t2)', lineHeight: 1.35, marginBottom: '.35rem' }}>{t.name}</div>
                      <div style={{ fontSize: '.65rem', color: 'var(--t3)', lineHeight: 1.5 }}>Aivoitus {t.aivoitus}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Valitun kvartaalin kuukausisuunnitelma ── */}
          {(() => {
            const qCal = quarterlyCalendar.find((q: any) => q.q === activeQ);
            const qTheme = quarterlyThemes.find((t: any) => t.q === activeQ);
            if (!qCal && !qTheme) return null;
            return (
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', marginBottom: '1.5rem', overflow: 'hidden' }}>
                {/* Kvartaalin kuvaus */}
                {qTheme && (
                  <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', background: `${Q_COLORS[activeQ - 1]}06` }}>
                    <div style={{ fontSize: '.72rem', fontWeight: 600, color: Q_COLORS[activeQ - 1], textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '.35rem' }}>Q{activeQ} Teema</div>
                    <div style={{ fontSize: '.88rem', color: 'var(--t2)', lineHeight: 1.7 }}>{qTheme.focus}</div>
                  </div>
                )}
                {/* Kuukausisuunnitelma */}
                {qCal?.months?.map((m: any, mi: number) => (
                  <div key={mi} style={{ padding: '1.25rem 1.5rem', borderBottom: mi < qCal.months.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginBottom: '.6rem' }}>
                      <div style={{ width: 36, height: 36, borderRadius: 'var(--r)', background: `${Q_COLORS[activeQ - 1]}12`, color: Q_COLORS[activeQ - 1], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.7rem', fontWeight: 700, fontFamily: 'var(--font-display)', flexShrink: 0 }}>
                        {MONTH_NAMES[m.m]?.slice(0, 3)?.toUpperCase()}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '.82rem', fontWeight: 600, marginBottom: '.15rem' }}>{MONTH_NAMES[m.m]}</div>
                        <div style={{ fontSize: '.72rem', color: 'var(--t3)' }}>{m.aud}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: '.82rem', color: 'var(--t2)', lineHeight: 1.7, paddingLeft: isMobile ? 0 : '3rem' }}>{m.content}</div>
                    {m.channels?.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.25rem', marginTop: '.4rem', paddingLeft: isMobile ? 0 : '3rem' }}>
                        {m.channels.map((ch: string, j: number) => {
                          const channel = channels.find((c: any) => c.name === ch);
                          return <span key={j} style={{ fontSize: '.58rem', padding: '.15rem .4rem', borderRadius: 9999, background: `${channel?.color || '#666'}15`, color: channel?.color || 'var(--t3)', fontWeight: 600 }}>{ch}</span>;
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })()}

          {/* ── Kanavaprofiiilit gridina ── */}
          {channelProfiles.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '.72rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--t3)', marginBottom: '1rem' }}>Kanavat</h2>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: '.75rem' }}>
                {channelProfiles.map((cp: any, i: number) => {
                  const ch = channels.find((c: any) => c.name === cp.ch);
                  const responsible = teamData.filter(m => (m.channels || []).includes(cp.ch));
                  const color = ch?.color || 'var(--pri)';
                  const channelSlug = ch?.slug;
                  const card = (
                    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', overflow: 'hidden', cursor: channelSlug ? 'pointer' : 'default', transition: 'border-color .15s' }}>
                      <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                          <span style={{ width: 28, height: 28, borderRadius: 'var(--r)', background: `${color}18`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.6rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>{ch?.ic || ''}</span>
                          <div>
                            <div style={{ fontSize: '.85rem', fontWeight: 700 }}>{cp.ch}</div>
                            <div style={{ fontSize: '.62rem', color, fontWeight: 600 }}>{cp.freq}</div>
                          </div>
                        </div>
                        {channelSlug && <span style={{ fontSize: '.55rem', color: 'var(--t3)' }}>&#8250;</span>}
                      </div>
                      <div style={{ padding: '1rem 1.25rem' }}>
                        <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--t2)', marginBottom: '.25rem' }}>{cp.role}</div>
                        <div style={{ fontSize: '.72rem', color: 'var(--t3)', lineHeight: 1.6, marginBottom: '.6rem' }}>{cp.desc}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.2rem', marginBottom: '.5rem' }}>
                          {cp.metrics.map((met: string, j: number) => <span key={j} style={{ fontSize: '.55rem', padding: '.12rem .35rem', borderRadius: 4, background: `${color}10`, color, fontWeight: 600 }}>{met}</span>)}
                        </div>
                        {responsible.length > 0 && (
                          <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: '.5rem' }}>
                            {responsible.map((m: any) => (
                              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '.25rem', fontSize: '.65rem' }}>
                                <div className="ava" style={{ width: 18, height: 18, fontSize: '.5rem' }}>{m.avatar}</div>
                                <span style={{ fontWeight: 600 }}>{m.name.split(' ')[0]}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                  return channelSlug ? (
                    <Link key={i} href={`/${orgSlug}/channels/${channelSlug}`} style={{ textDecoration: 'none', color: 'inherit' }}>{card}</Link>
                  ) : (
                    <div key={i}>{card}</div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Kanavat ja vastuut (fallback kun ei channelProfiles) ── */}
          {channelProfiles.length === 0 && channels.length > 0 && (
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', marginBottom: '1.5rem' }}>
              <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.88rem', fontWeight: 500, textTransform: 'uppercase' }}>Kanavat ja vastuut</h3>
              </div>
              <div style={{ padding: '1.25rem 1.5rem' }}>
                {channels.map((ch: any, i: number) => {
                  const responsible = teamData.filter(m => (m.channels || []).includes(ch.name));
                  const goal = (org.goals || []).find((g: any) => g.t?.toLowerCase().includes(ch.name.toLowerCase()));
                  const card = (
                    <div style={{ padding: '1rem', background: 'var(--elev)', border: '1px solid var(--border)', borderRadius: 'var(--r)', marginBottom: '.75rem', borderLeft: `4px solid ${ch.color}`, cursor: ch.slug ? 'pointer' : 'default' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '.5rem' }}>
                        <div>
                          <div style={{ fontSize: '.95rem', fontWeight: 700 }}>{ch.name}</div>
                          {goal?.m && <span style={{ fontSize: '.65rem', padding: '.15rem .4rem', borderRadius: 4, background: 'rgba(5,107,159,.1)', color: 'var(--pri-l)', fontWeight: 600 }}>{goal.m}</span>}
                        </div>
                        <span style={{ width: 28, height: 28, borderRadius: 'var(--r)', background: `${ch.color}20`, color: ch.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.65rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>{ch.ic}</span>
                      </div>
                      {goal?.d && <div style={{ fontSize: '.78rem', color: 'var(--t2)', lineHeight: 1.6, marginBottom: '.5rem' }}>{goal.d}</div>}
                      {responsible.length > 0 ? (
                        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                          {responsible.map((m: any) => (
                            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '.35rem', fontSize: '.72rem', padding: '.2rem .5rem', background: 'var(--card)', borderRadius: 9999, border: '1px solid var(--border)' }}>
                              <div className="ava" style={{ width: 18, height: 18, fontSize: '.5rem' }}>{m.avatar}</div>
                              <span style={{ fontWeight: 600 }}>{m.name}</span>
                            </div>
                          ))}
                        </div>
                      ) : <div style={{ fontSize: '.72rem', color: 'var(--t3)', fontStyle: 'italic' }}>Ei vastuuhenkiloa maaritelty</div>}
                    </div>
                  );
                  return ch.slug ? (
                    <Link key={i} href={`/${orgSlug}/channels/${ch.slug}`} style={{ textDecoration: 'none', color: 'inherit' }}>{card}</Link>
                  ) : (
                    <div key={i}>{card}</div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Mittaristo ── */}
          {org.metricsFramework?.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '.72rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--t3)', marginBottom: '1rem' }}>Mittarit ja seuranta</h2>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr 1fr', gap: '.5rem' }}>
                {org.metricsFramework.map((m: any, i: number) => (
                  <div key={i} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '1rem' }}>
                    <div style={{ fontSize: '.78rem', fontWeight: 700, marginBottom: '.4rem' }}>{m.area}</div>
                    {m.metrics.map((met: string, j: number) => <div key={j} style={{ fontSize: '.68rem', color: 'var(--t3)', lineHeight: 1.8 }}>{met}</div>)}
                    <div style={{ fontSize: '.6rem', color: 'var(--pri-l)', fontWeight: 600, marginTop: '.35rem' }}>{m.interval}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Tavoitteet (legacy fallback) ── */}
          {org.goals?.length > 0 && (
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', marginBottom: '1.5rem' }}>
              <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.88rem', fontWeight: 500, textTransform: 'uppercase' }}>Tavoitteet</h3>
              </div>
              <div style={{ padding: '1.25rem 1.5rem' }}>
                {org.goals.map((g: any, i: number) => (
                  <div key={i} style={{ padding: '.75rem', background: 'var(--elev)', border: '1px solid var(--border)', borderRadius: 'var(--r)', marginBottom: '.4rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                      {g.m && <span style={{ fontSize: '.6rem', padding: '.1rem .4rem', borderRadius: 4, background: 'rgba(5,107,159,.1)', color: 'var(--pri-l)', fontWeight: 700 }}>{g.m}</span>}
                      <div style={{ fontSize: '.82rem', fontWeight: 600 }}>{g.t}</div>
                    </div>
                    {g.d && <div style={{ fontSize: '.72rem', color: 'var(--t3)', lineHeight: 1.5, marginTop: '.2rem' }}>{g.d}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Kampanjat (legacy fallback) ── */}
          {!org.quarterlyThemes?.length && org.campaigns?.length > 0 && (
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)' }}>
              <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.88rem', fontWeight: 500, textTransform: 'uppercase' }}>Kampanjat</h3>
              </div>
              <div style={{ padding: '1.25rem 1.5rem' }}>
                {org.campaigns.map((c: any, i: number) => (
                  <div key={i} style={{ display: 'flex', gap: '1rem', padding: '.75rem', background: 'var(--elev)', border: '1px solid var(--border)', borderRadius: 'var(--r)', marginBottom: '.5rem' }}>
                    {c.month && <div style={{ width: 40, height: 40, borderRadius: 'var(--r)', background: 'rgba(5,107,159,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.65rem', fontWeight: 700, color: 'var(--pri-l)', flexShrink: 0, fontFamily: 'var(--font-display)' }}>
                      {['', 'TAM', 'HEL', 'MAA', 'HUH', 'TOU', 'KES', 'HEI', 'ELO', 'SYY', 'LOK', 'MAR', 'JOU'][c.month] || ''}
                    </div>}
                    <div>
                      <div style={{ fontSize: '.82rem', fontWeight: 600 }}>{c.name}</div>
                      <div style={{ fontSize: '.68rem', color: 'var(--t3)', lineHeight: 1.5 }}>{c.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════
          TAB 2: STRATEGIA
          ═══════════════════════════════════════════════════════════ */}
      {tab === 'strategy' && (
        <>
          {/* ── Missio ja visio hero ── */}
          <div style={{ background: 'linear-gradient(135deg, rgba(5,107,159,.06), rgba(24,94,91,.04))', border: '1px solid rgba(5,107,159,.12)', borderRadius: 'var(--rl)', padding: isMobile ? '1.5rem' : '2rem 2.5rem', marginBottom: '1.5rem' }}>
            {orgStrategy.strategicPeriod && <div style={{ fontSize: '.6rem', fontWeight: 700, color: 'var(--pri-l)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '1rem', fontFamily: 'var(--font-display)' }}>Strategia {orgStrategy.strategicPeriod}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? '1.5rem' : '2.5rem' }}>
              <EditableBlock label="Missio" color="var(--pri-l)" sectionKey="orgStrategy.mission" value={orgStrategy.mission} parentKey="orgStrategy" />
              <EditableBlock label="Visio" color="var(--green)" sectionKey="orgStrategy.vision" value={orgStrategy.vision} parentKey="orgStrategy" />
            </div>
            {orgStrategy.values?.length > 0 && (
              <div style={{ display: 'flex', gap: '.5rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
                {orgStrategy.values.map((v: any, i: number) => (
                  <div key={i} style={{ padding: '.5rem 1rem', background: 'rgba(255,255,255,.04)', border: '1px solid var(--border)', borderRadius: 9999 }}>
                    <span style={{ fontSize: '.78rem', fontWeight: 700 }}>{v.name}</span>
                    <span style={{ fontSize: '.68rem', color: 'var(--t3)', marginLeft: '.4rem' }}>{v.desc}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Viestinnan missio ── */}
          {(org.commsMission || canEdit) && (
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.5rem', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '.65rem', fontWeight: 600, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '.5rem' }}>Viestinnan missio</div>
              {editSection === 'commsMission' ? (
                <div>
                  <textarea className="input textarea" value={tempText} onChange={e => setTempText(e.target.value)} />
                  <div style={{ display: 'flex', gap: '.5rem', marginTop: '.5rem' }}>
                    <button className="btn btn-primary btn-sm" onClick={() => saveText('commsMission')}>Tallenna</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditSection(null)}>Peruuta</button>
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: '.92rem', fontWeight: 500, color: 'var(--t1)', lineHeight: 1.8, cursor: canEdit ? 'pointer' : 'default' }} onClick={() => canEdit && startEdit('commsMission', org.commsMission || '')}>
                  {org.commsMission || 'Klikkaa maaritelläksesi viestinnan missio...'}
                </p>
              )}
            </div>
          )}

          {/* ── Perustehtavat ── */}
          {coreRoles.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '.72rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--t3)', marginBottom: '1rem' }}>{org.commsCoreRoles ? 'Viestinnan perustehtavat' : 'Sisaltopilarit'}</h2>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : `repeat(${Math.min(coreRoles.length, 4)}, 1fr)`, gap: '.75rem' }}>
                {coreRoles.map((cp: any, i: number) => (
                  <div key={i} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.25rem', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: cp.color || 'var(--pri)' }} />
                    <div style={{ fontSize: '.85rem', fontWeight: 700, marginBottom: '.4rem', marginTop: '.25rem' }}>{cp.name}</div>
                    <div style={{ fontSize: '.72rem', color: 'var(--t3)', lineHeight: 1.65 }}>{cp.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Kohderyhmat ── */}
          {auds.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '.72rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--t3)', marginBottom: '1rem' }}>Kohderyhmat</h2>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '.75rem' }}>
                {auds.map((a: any, i: number) => (
                  <div key={i} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.25rem' }}>
                    <div style={{ fontSize: '.88rem', fontWeight: 700, marginBottom: '.3rem' }}>{a.n}</div>
                    <div style={{ fontSize: '.75rem', color: 'var(--t2)', lineHeight: 1.6, marginBottom: '.4rem' }}>{a.d}</div>
                    {a.tone && (
                      <div style={{ fontSize: '.68rem', fontStyle: 'italic', color: 'var(--pri-l)', marginBottom: '.5rem' }}>Savy: {a.tone}</div>
                    )}
                    {a.c?.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.2rem' }}>
                        {a.c.map((ch: string, j: number) => {
                          const channel = channels.find((c: any) => c.name === ch);
                          return <span key={j} style={{ fontSize: '.55rem', padding: '.12rem .35rem', borderRadius: 9999, background: `${channel?.color || '#666'}15`, color: channel?.color || 'var(--t3)', fontWeight: 600 }}>{ch}</span>;
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Viestinnan arvot ── */}
          {org.vals?.length > 0 && (
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.25rem 1.5rem', marginBottom: '1.5rem' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '.72rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--t3)', marginBottom: '.75rem' }}>Viestinnan arvot</h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem' }}>
                {org.vals.map((v: any, i: number) => {
                  const color = Q_COLORS[i % Q_COLORS.length];
                  return (
                    <div key={i} style={{ padding: '.5rem 1rem', background: `${color}10`, border: `1px solid ${color}25`, borderRadius: 9999 }}>
                      <span style={{ fontSize: '.82rem', fontWeight: 700, color }}>{v.t}</span>
                      {v.d && <span style={{ fontSize: '.65rem', color: 'var(--t3)', marginLeft: '.4rem' }}>{v.d}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Ydinviestit ── */}
          {org.keyMessages?.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '.72rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--t3)', marginBottom: '1rem' }}>Ydinviestit</h2>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '.5rem' }}>
                {org.keyMessages.map((m: any, i: number) => {
                  const role = coreRoles.find((r: any) => r.id === m.theme);
                  return (
                    <div key={i} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.25rem' }}>
                        <div style={{ fontSize: '.82rem', fontWeight: 700 }}>{m.title}</div>
                        {role && <span style={{ fontSize: '.5rem', padding: '.1rem .35rem', borderRadius: 4, background: `${role.color}15`, color: role.color, fontWeight: 700 }}>{role.name}</span>}
                      </div>
                      <div style={{ fontSize: '.72rem', color: 'var(--t3)', lineHeight: 1.6 }}>{m.desc}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Tilannekuva ja kehityshankkeet ── */}
          {(currentCtx.expansion || currentCtx.visualIdentity || org.developmentPlan2027) && (
            <div style={{ background: 'rgba(241,180,52,.04)', border: '1px solid rgba(241,180,52,.12)', borderRadius: 'var(--rl)', padding: '1.25rem 1.5rem', marginBottom: '1.5rem' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '.72rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--yellow)', marginBottom: '.75rem' }}>Ajankohtaista ja kehityshankkeet</h2>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '.5rem' }}>
                {currentCtx.expansion && <div style={{ fontSize: '.78rem', color: 'var(--t2)', lineHeight: 1.6, padding: '.5rem .75rem', background: 'rgba(255,255,255,.02)', borderRadius: 'var(--r)' }}><strong style={{ color: 'var(--t1)' }}>Laajennus</strong><br />{currentCtx.expansion}</div>}
                {currentCtx.visualIdentity && <div style={{ fontSize: '.78rem', color: 'var(--t2)', lineHeight: 1.6, padding: '.5rem .75rem', background: 'rgba(255,255,255,.02)', borderRadius: 'var(--r)' }}><strong style={{ color: 'var(--t1)' }}>Visuaalinen ilme</strong><br />{currentCtx.visualIdentity}</div>}
                {currentCtx.websiteUpdate && <div style={{ fontSize: '.78rem', color: 'var(--t2)', lineHeight: 1.6, padding: '.5rem .75rem', background: 'rgba(255,255,255,.02)', borderRadius: 'var(--r)' }}><strong style={{ color: 'var(--t1)' }}>Verkkosivut</strong><br />{currentCtx.websiteUpdate}</div>}
                {currentCtx.steaCuts && <div style={{ fontSize: '.78rem', color: 'var(--t2)', lineHeight: 1.6, padding: '.5rem .75rem', background: 'rgba(255,255,255,.02)', borderRadius: 'var(--r)' }}><strong style={{ color: 'var(--t1)' }}>Rahoitus</strong><br />{currentCtx.steaCuts}</div>}
                {currentCtx.accessibility && <div style={{ fontSize: '.78rem', color: 'var(--t2)', lineHeight: 1.6, padding: '.5rem .75rem', background: 'rgba(255,255,255,.02)', borderRadius: 'var(--r)' }}><strong style={{ color: 'var(--t1)' }}>Saavutettavuus</strong><br />{currentCtx.accessibility}</div>}
                {currentCtx.elections2027 && <div style={{ fontSize: '.78rem', color: 'var(--t2)', lineHeight: 1.6, padding: '.5rem .75rem', background: 'rgba(255,255,255,.02)', borderRadius: 'var(--r)' }}><strong style={{ color: 'var(--t1)' }}>Vaikuttaminen</strong><br />{currentCtx.elections2027}</div>}
              </div>
              {/* Kehityskohteet 2027 */}
              {org.developmentPlan2027?.targets?.length > 0 && (
                <div style={{ marginTop: '1rem', borderTop: '1px solid rgba(241,180,52,.12)', paddingTop: '1rem' }}>
                  <div style={{ fontSize: '.65rem', fontWeight: 700, color: 'var(--yellow)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '.5rem' }}>Kehityskohteet 2027</div>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: '.4rem' }}>
                    {org.developmentPlan2027.targets.map((t: any, i: number) => (
                      <div key={i} style={{ fontSize: '.72rem', color: 'var(--t2)', padding: '.5rem .75rem', background: 'rgba(255,255,255,.02)', borderRadius: 'var(--r)', lineHeight: 1.5 }}>
                        <span style={{ fontWeight: 700, color: 'var(--t1)' }}>{t.name}</span>
                        <span style={{ color: 'var(--t3)', marginLeft: '.35rem', fontSize: '.62rem' }}>{t.prep}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── AI-koulutus ── */}
          <div style={{ background: 'linear-gradient(135deg, rgba(5,107,159,.06), rgba(228,92,129,.04))', border: '1px solid rgba(5,107,159,.15)', borderRadius: 'var(--rl)', overflow: 'hidden' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(5,107,159,.1)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', marginBottom: '.25rem' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--pri)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '.6rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>M</div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.88rem', fontWeight: 500 }}>Kouluta Momentum tuntemaan strategiasi</h3>
              </div>
              <p style={{ fontSize: '.78rem', color: 'var(--t2)', lineHeight: 1.6 }}>Laheta strategiasi Momentum-tiimille niin koulutamme AI-kumppanisi tuntemaan sen.</p>
            </div>
            <div style={{ padding: '1.25rem 1.5rem' }}>
              {submitted ? (
                <div style={{ textAlign: 'center', padding: '1rem' }}>
                  <div style={{ color: 'var(--green)', fontSize: '1.2rem', marginBottom: '.5rem' }}>{'✓'}</div>
                  <p style={{ fontSize: '.85rem', fontWeight: 600 }}>Lahetetty!</p>
                  <button className="btn btn-ghost btn-sm" onClick={() => setSubmitted(false)} style={{ marginTop: '.5rem' }}>Laheta uusi</button>
                </div>
              ) : (
                <>
                  <textarea className="input textarea-lg" value={submitText} onChange={e => setSubmitText(e.target.value)} placeholder="Liita strategia tahan..." style={{ minHeight: 120, marginBottom: '.75rem' }} />
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="btn btn-primary" onClick={handleStrategySubmit} disabled={submitting || !submitText.trim()}>{submitting ? 'Lahetetaan...' : 'Laheta'}</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
