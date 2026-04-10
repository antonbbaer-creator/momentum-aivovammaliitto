'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useOrgData } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import {
  OrgTeam,
  OrgTeamMember,
  DEFAULT_LLFF_TEAMS,
  DEFAULT_LLFF_TEAM_MEMBERS,
} from '@/lib/team-shared';
import {
  Grant,
  LLFF_GRANTS_DEFAULT,
  STATUS_DEFS,
  normalizeGrant,
  daysUntilDeadline,
} from '@/lib/grants-shared';
import ProjectsSection, { Project } from './ProjectsSection';

type TabView = 'overview' | 'members' | 'projects';

const deadlineColor = (dl: string) => {
  if (!dl) return null;
  const diff = new Date(dl).getTime() - Date.now();
  const day = 86400000;
  if (diff < 0) return { color: 'var(--red)', bg: 'rgba(239,68,68,.1)', label: 'Myöhässä' };
  if (diff < 7 * day) return { color: 'var(--red)', bg: 'rgba(239,68,68,.1)', label: Math.ceil(diff / day) + ' pv' };
  if (diff < 30 * day) return { color: 'var(--yellow)', bg: 'rgba(245,197,66,.1)', label: Math.ceil(diff / day) + ' pv' };
  return { color: 'var(--green)', bg: 'rgba(45,212,160,.1)', label: Math.ceil(diff / day) + ' pv' };
};

export default function TeamSection() {
  const { canEdit } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const params = useParams();
  const orgSlug = (params.orgSlug as string) || '';
  const [orgTeams, setOrgTeams] = useOrgData<OrgTeam[]>('orgTeams', DEFAULT_LLFF_TEAMS);
  const [members, setMembers] = useOrgData<OrgTeamMember[]>('orgTeamMembers', DEFAULT_LLFF_TEAM_MEMBERS);
  const [projects] = useOrgData<Project[]>('projects', []);
  const [rawGrants] = useOrgData<Grant[]>('llff_grants', LLFF_GRANTS_DEFAULT);
  const grants = rawGrants.map(normalizeGrant);

  // Helper: kaikki vastuullasi olevat apurahat (jossakin tilassa joka ei ole rejected)
  const grantsForMember = (memberId: string): Grant[] =>
    grants.filter(g => g.responsibleId === memberId && g.status !== 'rejected')
      .sort((a, b) => {
        const da = daysUntilDeadline(a) ?? 999999;
        const db = daysUntilDeadline(b) ?? 999999;
        return da - db;
      });

  // null = show team picker overview; otherwise show selected team
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [tabView, setTabView] = useState<TabView>('members');

  // Member form state
  const [showMemberForm, setShowMemberForm] = useState(false);
  const [editMemberId, setEditMemberId] = useState<string | null>(null);
  const [mName, setMName] = useState('');
  const [mRole, setMRole] = useState('');
  const [mEmail, setMEmail] = useState('');
  const [mPhone, setMPhone] = useState('');
  const [mType, setMType] = useState<'permanent' | 'project' | 'external'>('permanent');
  const [mTeamId, setMTeamId] = useState('');
  const [mNote, setMNote] = useState('');

  const openNewMember = (teamId?: string) => {
    setEditMemberId(null); setMName(''); setMRole(''); setMEmail(''); setMPhone('');
    setMType('permanent'); setMTeamId(teamId || selectedTeamId || orgTeams[0]?.id || '');
    setMNote(''); setShowMemberForm(true);
  };

  const openEditMember = (m: OrgTeamMember) => {
    setEditMemberId(m.id); setMName(m.name); setMRole(m.role); setMEmail(m.email || '');
    setMPhone(m.phone || ''); setMType(m.type); setMTeamId(m.teamId); setMNote(m.note || '');
    setShowMemberForm(true);
  };

  const saveMember = () => {
    if (!mName.trim() || !mRole.trim() || !mTeamId) return;
    const member: OrgTeamMember = {
      id: editMemberId || 'm_' + Date.now(),
      name: mName.trim(), role: mRole.trim(),
      teamId: mTeamId, type: mType,
      email: mEmail.trim() || undefined,
      phone: mPhone.trim() || undefined,
      avatar: mName.trim()[0].toUpperCase(),
      note: mNote.trim() || undefined,
    };
    if (editMemberId) setMembers(prev => prev.map(x => x.id === editMemberId ? { ...x, ...member } : x));
    else setMembers(prev => [...prev, member]);
    setShowMemberForm(false);
    toast(editMemberId ? 'Jäsen päivitetty' : 'Jäsen lisätty', 'success');
  };

  const removeMember = (id: string) => {
    setMembers(prev => prev.filter(x => x.id !== id));
    toast('Jäsen poistettu', 'success');
  };

  const selectedTeam = selectedTeamId ? orgTeams.find(t => t.id === selectedTeamId) : null;
  const teamMembers = selectedTeamId ? members.filter(m => m.teamId === selectedTeamId) : [];
  const teamProjects = selectedTeamId ? projects.filter(p => p.teamId === selectedTeamId && !p.archived) : [];

  // ========================= TEAM DETAIL VIEW =========================
  if (selectedTeam) {
    return (
      <>
        <button className="btn btn-ghost" onClick={() => setSelectedTeamId(null)} style={{ marginBottom: '1rem' }}>{'←'} Takaisin tiimeihin</button>

        {/* Team header */}
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)',
          borderLeft: `6px solid ${selectedTeam.color}`,
          borderRadius: 'var(--rl)', padding: '1.5rem', marginBottom: '1.25rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{
              width: 52, height: 52, borderRadius: '50%',
              background: `${selectedTeam.color}25`, color: selectedTeam.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.6rem', flexShrink: 0,
            }}>{selectedTeam.icon}</div>
            <div style={{ flex: 1 }}>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 800 }}>{selectedTeam.name}</h2>
              <p style={{ fontSize: '.85rem', color: 'var(--t2)', marginTop: '.2rem' }}>{selectedTeam.description}</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '.25rem' }}>
              <div style={{ fontSize: '.72rem', color: 'var(--t3)' }}>{teamMembers.length} jäsentä · {teamProjects.length} aktiivista projektia</div>
            </div>
          </div>
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', background: 'var(--elev)', borderRadius: 'var(--r)', padding: '3px', marginBottom: '1.25rem', width: 'fit-content' }}>
          <button className={`cal-view-btn ${tabView === 'members' ? 'act' : ''}`} onClick={() => setTabView('members')}>
            Jäsenet ({teamMembers.length})
          </button>
          <button className={`cal-view-btn ${tabView === 'projects' ? 'act' : ''}`} onClick={() => setTabView('projects')}>
            Projektit ({teamProjects.length})
          </button>
        </div>

        {/* === MEMBERS TAB === */}
        {tabView === 'members' && (
          <>
            {canEdit && (
              <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-primary btn-sm" onClick={() => openNewMember(selectedTeam.id)}>+ Lisää jäsen</button>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '.8rem' }}>
              {teamMembers.map(m => {
                const isLead = selectedTeam.leadId === m.id;
                return (
                  <div key={m.id} style={{
                    background: 'var(--card)', border: '1px solid var(--border)',
                    borderLeft: `3px solid ${selectedTeam.color}`,
                    borderRadius: 'var(--rl)', padding: '1rem 1.1rem',
                    display: 'flex', flexDirection: 'column', gap: '.6rem',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
                      <div style={{
                        width: 42, height: 42, borderRadius: '50%',
                        background: selectedTeam.color, color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '1rem', fontWeight: 800, flexShrink: 0,
                      }}>{m.avatar || m.name[0]}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '.3rem', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '.92rem', fontWeight: 700 }}>{m.name}</span>
                          {isLead && <span style={{ fontSize: '.55rem', padding: '.1rem .35rem', borderRadius: 9999, background: 'rgba(241,180,52,.15)', color: '#f1b434', fontWeight: 700 }}>Lead</span>}
                        </div>
                        <div style={{ fontSize: '.76rem', color: 'var(--t2)', marginTop: '.1rem' }}>{m.role}</div>
                      </div>
                      {canEdit && (
                        <div style={{ display: 'flex', gap: '.2rem' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => openEditMember(m)} style={{ fontSize: '.68rem', padding: '.15rem .4rem' }}>Muokkaa</button>
                        </div>
                      )}
                    </div>
                    {(m.email || m.phone) && (
                      <div style={{ fontSize: '.7rem', color: 'var(--t3)' }}>
                        {m.email}{m.email && m.phone && ' · '}{m.phone}
                      </div>
                    )}
                    {m.note && (
                      <div style={{ fontSize: '.72rem', color: 'var(--t2)', fontStyle: 'italic', lineHeight: 1.5 }}>{m.note}</div>
                    )}

                    {/* Vastuuapurahat — tehtävälista */}
                    {(() => {
                      const myGrants = grantsForMember(m.id);
                      if (myGrants.length === 0) return null;
                      return (
                        <div style={{
                          marginTop: '.65rem', paddingTop: '.65rem',
                          borderTop: '1px dashed var(--border)',
                        }}>
                          <div style={{
                            fontSize: '.55rem', fontWeight: 700, color: 'var(--t3)',
                            textTransform: 'uppercase', letterSpacing: '.06em',
                            marginBottom: '.4rem',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          }}>
                            <span>Vastuuapurahat ({myGrants.length})</span>
                            <button
                              onClick={() => router.push(`/${orgSlug}/budget`)}
                              style={{
                                background: 'transparent', border: 'none', color: 'var(--pri-l)',
                                fontSize: '.55rem', cursor: 'pointer', textTransform: 'uppercase',
                                letterSpacing: '.05em', fontWeight: 700,
                              }}
                            >
                              Avaa →
                            </button>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '.25rem' }}>
                            {myGrants.slice(0, 4).map(g => {
                              const sd = STATUS_DEFS[g.status];
                              const days = daysUntilDeadline(g);
                              const urgent = days !== null && days >= 0 && days <= 14;
                              const past = days !== null && days < 0;
                              return (
                                <div
                                  key={g.id}
                                  onClick={() => router.push(`/${orgSlug}/budget`)}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: '.4rem',
                                    padding: '.3rem .45rem',
                                    background: 'var(--elev)',
                                    border: '1px solid var(--border)',
                                    borderLeft: `2px solid ${sd.color}`,
                                    borderRadius: 3, cursor: 'pointer',
                                    opacity: past ? .5 : 1,
                                  }}
                                >
                                  <div style={{
                                    width: 14, height: 14, borderRadius: '50%',
                                    background: sd.color, color: '#fff',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '.5rem', fontWeight: 800, flexShrink: 0,
                                  }}>{sd.icon}</div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '.66rem', fontWeight: 700, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {g.funder}
                                    </div>
                                    <div style={{ fontSize: '.55rem', color: 'var(--t3)' }}>
                                      {g.grantName} · {g.year}
                                    </div>
                                  </div>
                                  {days !== null && days >= 0 && (
                                    <span style={{
                                      fontSize: '.5rem', padding: '.1rem .3rem', borderRadius: 9999,
                                      background: urgent ? 'rgba(239,107,107,.15)' : days <= 30 ? 'rgba(245,197,66,.15)' : 'rgba(45,212,160,.1)',
                                      color: urgent ? 'var(--red)' : days <= 30 ? 'var(--yellow)' : 'var(--green)',
                                      fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em',
                                      flexShrink: 0,
                                    }}>
                                      {days === 0 ? 'TÄNÄÄN' : `${days} pv`}
                                    </span>
                                  )}
                                  {!days && g.deadlineText && (
                                    <span style={{ fontSize: '.5rem', color: 'var(--t3)', fontWeight: 600, flexShrink: 0 }}>
                                      {g.deadlineText.length > 12 ? g.deadlineText.slice(0, 12) + '…' : g.deadlineText}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                            {myGrants.length > 4 && (
                              <div style={{ fontSize: '.55rem', color: 'var(--t3)', textAlign: 'center', padding: '.2rem' }}>
                                + {myGrants.length - 4} muuta
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
              {teamMembers.length === 0 && (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '2rem', color: 'var(--t3)' }}>
                  Ei jäseniä. Lisää ensimmäinen ylhäältä.
                </div>
              )}
            </div>
          </>
        )}

        {/* === PROJECTS TAB === */}
        {tabView === 'projects' && (
          <ProjectsSection teamId={selectedTeam.id} />
        )}

        {showMemberForm && renderMemberForm()}
      </>
    );
  }

  // ========================= OVERVIEW VIEW =========================
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '.5rem' }}>
        <div style={{ fontSize: '.78rem', color: 'var(--t3)' }}>
          {orgTeams.length} tiimiä · {members.length} jäsentä · {projects.filter(p => !p.archived).length} aktiivista projektia
        </div>
        {canEdit && <button className="btn btn-primary btn-sm" onClick={() => openNewMember()}>+ Lisää jäsen</button>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
        {orgTeams.map(team => {
          const tMembers = members.filter(m => m.teamId === team.id);
          const tProjects = projects.filter(p => p.teamId === team.id && !p.archived);
          const urgent = tProjects.filter(p => p.deadline).map(p => ({ p, dlc: deadlineColor(p.deadline) })).filter(x => x.dlc && (x.dlc.color === 'var(--red)' || x.dlc.color === 'var(--yellow)'));
          const lead = team.leadId ? members.find(m => m.id === team.leadId) : null;
          return (
            <div key={team.id}
              onClick={() => { setSelectedTeamId(team.id); setTabView('members'); }}
              style={{
                background: 'var(--card)', border: '1px solid var(--border)',
                borderLeft: `5px solid ${team.color}`,
                borderRadius: 'var(--rl)', padding: '1.25rem 1.35rem',
                cursor: 'pointer', transition: 'border-color .15s, transform .15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = team.color; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.borderLeftColor = team.color; }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginBottom: '.5rem' }}>
                <div style={{
                  width: 38, height: 38, borderRadius: '50%',
                  background: `${team.color}25`, color: team.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.2rem', flexShrink: 0,
                }}>{team.icon}</div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 800 }}>{team.name}</h3>
                  {lead && <div style={{ fontSize: '.68rem', color: 'var(--t3)' }}>Vetäjä: {lead.name}</div>}
                </div>
              </div>
              <p style={{ fontSize: '.75rem', color: 'var(--t2)', lineHeight: 1.55, marginBottom: '.75rem' }}>
                {team.description}
              </p>

              {/* Members */}
              <div style={{ display: 'flex', marginBottom: '.75rem', flexWrap: 'wrap', gap: '.3rem' }}>
                {tMembers.slice(0, 6).map(m => (
                  <div key={m.id} title={m.name} style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: team.color, color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '.68rem', fontWeight: 800,
                    border: '2px solid var(--card)',
                  }}>{m.avatar || m.name[0]}</div>
                ))}
                {tMembers.length > 6 && (
                  <div style={{ fontSize: '.62rem', color: 'var(--t3)', alignSelf: 'center', marginLeft: '.25rem' }}>
                    +{tMembers.length - 6}
                  </div>
                )}
                {tMembers.length === 0 && <span style={{ fontSize: '.65rem', color: 'var(--t3)', fontStyle: 'italic' }}>Ei jäseniä</span>}
              </div>

              {/* Stats row */}
              <div style={{ display: 'flex', gap: '.5rem', marginTop: '.5rem' }}>
                <div style={{ flex: 1, background: 'var(--elev)', borderRadius: 'var(--r)', padding: '.4rem .6rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: team.color }}>{tMembers.length}</div>
                  <div style={{ fontSize: '.55rem', color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>Jäsentä</div>
                </div>
                <div style={{ flex: 1, background: 'var(--elev)', borderRadius: 'var(--r)', padding: '.4rem .6rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: team.color }}>{tProjects.length}</div>
                  <div style={{ fontSize: '.55rem', color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>Projektia</div>
                </div>
                {urgent.length > 0 && (
                  <div style={{ flex: 1, background: 'rgba(239,68,68,.08)', borderRadius: 'var(--r)', padding: '.4rem .6rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--red)' }}>{urgent.length}</div>
                    <div style={{ fontSize: '.55rem', color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>Kiireinen</div>
                  </div>
                )}
              </div>

              {/* Latest projects preview */}
              {tProjects.length > 0 && (
                <div style={{ marginTop: '.75rem', paddingTop: '.75rem', borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '.6rem', color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600, marginBottom: '.4rem' }}>Aktiiviset projektit</div>
                  {tProjects.slice(0, 3).map(p => {
                    const dlc = p.deadline ? deadlineColor(p.deadline) : null;
                    return (
                      <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '.72rem', color: 'var(--t2)', padding: '.2rem 0' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{p.t}</span>
                        {dlc && <span style={{ fontSize: '.58rem', padding: '.05rem .35rem', borderRadius: 9999, background: dlc.bg, color: dlc.color, fontWeight: 600, marginLeft: '.4rem' }}>{dlc.label}</span>}
                      </div>
                    );
                  })}
                  {tProjects.length > 3 && (
                    <div style={{ fontSize: '.62rem', color: 'var(--t3)', marginTop: '.2rem' }}>+{tProjects.length - 3} muuta</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showMemberForm && renderMemberForm()}
    </>
  );

  // --- Member form modal renderer ---
  function renderMemberForm() {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowMemberForm(false)}>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '2rem', width: 480, maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', marginBottom: '1.25rem' }}>{editMemberId ? 'Muokkaa jäsentä' : 'Lisää jäsen'}</h3>
          <div className="field"><label>Nimi *</label><input className="input" value={mName} onChange={e => setMName(e.target.value)} autoFocus /></div>
          <div className="field"><label>Rooli *</label><input className="input" value={mRole} onChange={e => setMRole(e.target.value)} placeholder="Esim. Vastaava tuottaja" /></div>
          <div className="field">
            <label>Tiimi *</label>
            <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
              {orgTeams.map(t => {
                const active = mTeamId === t.id;
                return (
                  <button key={t.id} type="button" onClick={() => setMTeamId(t.id)} style={{
                    fontSize: '.72rem', padding: '.4rem .7rem', borderRadius: 9999,
                    background: active ? t.color : 'var(--elev)',
                    color: active ? '#fff' : 'var(--t2)',
                    border: `1px solid ${active ? t.color : 'var(--border)'}`,
                    fontWeight: 600, cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: '.35rem',
                  }}>
                    <span style={{ fontSize: '.88rem' }}>{t.icon}</span>
                    {t.name}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="field">
            <label>Tyyppi</label>
            <select className="input" value={mType} onChange={e => setMType(e.target.value as any)}>
              <option value="permanent">Vakituinen</option>
              <option value="project">Projektikohtainen</option>
              <option value="external">Ulkoinen / freelancer</option>
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
            <div className="field"><label>Sähköposti</label><input className="input" value={mEmail} onChange={e => setMEmail(e.target.value)} /></div>
            <div className="field"><label>Puhelin</label><input className="input" value={mPhone} onChange={e => setMPhone(e.target.value)} /></div>
          </div>
          <div className="field"><label>Muistiinpano</label><textarea className="input textarea" value={mNote} onChange={e => setMNote(e.target.value)} /></div>
          <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end' }}>
            {editMemberId && <button className="btn btn-ghost btn-sm" onClick={() => { removeMember(editMemberId); setShowMemberForm(false); }} style={{ color: 'var(--red)', marginRight: 'auto' }}>Poista</button>}
            <button className="btn btn-ghost" onClick={() => setShowMemberForm(false)}>Peruuta</button>
            <button className="btn btn-primary" onClick={saveMember} disabled={!mName.trim() || !mRole.trim() || !mTeamId}>Tallenna</button>
          </div>
        </div>
      </div>
    );
  }
}
