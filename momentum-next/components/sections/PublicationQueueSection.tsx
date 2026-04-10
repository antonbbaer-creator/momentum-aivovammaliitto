'use client';

/*
 * Viestinnän työjono — Kanban kaikille julkaisuille elinkaarella brief → draft → ready → published.
 * Päänäkymä Viestinta-hubissa: "okei mitä tehdään" → klikkaus avaa PublicationDetailSection samassa tab-tilassa.
 */

import { useState, useMemo } from 'react';
import { useOrgData } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import {
  Publication,
  PublicationStatus,
  STATUS_ORDER,
  STATUS_LABELS,
  STATUS_COLORS,
  PUBLICATION_CATEGORIES,
  PLATFORM_META,
  normalizePublication,
  newBriefTemplate,
  publicationCompleteness,
  effectiveDeadline,
  deadlineStatus,
  groupByStatus,
  filterByAssignee,
  filterByChannel,
  filterByCategory,
} from '@/lib/publications-shared';
import { OrgTeam, OrgTeamMember, DEFAULT_LLFF_TEAMS, DEFAULT_LLFF_TEAM_MEMBERS, resolveUserMember } from '@/lib/team-shared';

interface Props {
  onOpenDetail: (id: string) => void;
  onOpenEditor: (publicationId?: string) => void;
}

export default function PublicationQueueSection({ onOpenDetail, onOpenEditor }: Props) {
  const { user, canEdit } = useAuth();
  const { toast } = useToast();
  const [rawPubs, setPubs] = useOrgData<any[]>('publications', []);
  const [orgTeams] = useOrgData<OrgTeam[]>('orgTeams', DEFAULT_LLFF_TEAMS);
  const [teamMembers] = useOrgData<OrgTeamMember[]>('orgTeamMembers', DEFAULT_LLFF_TEAM_MEMBERS);
  const [org] = useOrgData<any>('org', { channels: [] });

  const pubs: Publication[] = useMemo(() => (rawPubs || []).map(normalizePublication), [rawPubs]);

  // Resolve the logged-in user to a team member (for "minun tehtäväni" filter)
  const myMember = resolveUserMember(teamMembers, user);

  // Filters
  const [scope, setScope] = useState<'mine' | 'all'>(myMember ? 'mine' : 'all');
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Drag-drop state (id → status)
  const [dragId, setDragId] = useState<string | null>(null);

  // Quick "+ Uusi brief" inline form
  const [showQuick, setShowQuick] = useState(false);
  const [qTitle, setQTitle] = useState('');
  const [qBrief, setQBrief] = useState('');
  const [qAssignee, setQAssignee] = useState<string>(myMember?.id || '');
  const [qDue, setQDue] = useState('');
  const [qChannels, setQChannels] = useState<string[]>([]);
  const [qCategory, setQCategory] = useState('some');
  const [qPriority, setQPriority] = useState<'low' | 'normal' | 'high'>('normal');

  // Apply filters
  const filtered = useMemo(() => {
    let list = pubs;
    if (scope === 'mine' && myMember) {
      list = filterByAssignee(list, [myMember.id]);
    }
    list = filterByChannel(list, channelFilter);
    list = filterByCategory(list, categoryFilter);
    return list;
  }, [pubs, scope, myMember, channelFilter, categoryFilter]);

  const grouped = useMemo(() => groupByStatus(filtered), [filtered]);

  const moveTo = (id: string, status: PublicationStatus) => {
    setPubs(prev => (prev || []).map(p => p.id === id ? { ...p, status, updatedAt: Date.now() } : p));
  };

  const resetQuickForm = () => {
    setQTitle(''); setQBrief(''); setQAssignee(myMember?.id || ''); setQDue('');
    setQChannels([]); setQCategory('some'); setQPriority('normal');
  };

  const createBrief = () => {
    if (!qTitle.trim()) { toast('Anna otsikko', 'error'); return; }
    const pub = newBriefTemplate({
      title: qTitle.trim(),
      brief: qBrief.trim(),
      assigneeId: qAssignee || undefined,
      requestedById: myMember?.id,
      dueDate: qDue || null,
      channels: qChannels,
      category: qCategory,
      priority: qPriority,
    });
    setPubs(prev => [pub, ...(prev || [])]);
    resetQuickForm();
    setShowQuick(false);
    toast('Brief luotu — näkyy työjonossa', 'success');
  };

  const toggleQCh = (name: string) => setQChannels(prev => prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]);

  const assigneeById = (id?: string) => id ? teamMembers.find(m => m.id === id) : null;

  const hasMyFilter = scope === 'mine' && myMember;

  return (
    <>
      {/* Top bar — scope toggle + filters + new brief */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '1.25rem', flexWrap: 'wrap', gap: '.75rem',
      }}>
        <div style={{ display: 'flex', gap: '.35rem', background: 'var(--elev)', borderRadius: 'var(--r)', padding: '3px' }}>
          <button
            onClick={() => setScope('mine')}
            className={`cal-view-btn ${scope === 'mine' ? 'act' : ''}`}
            disabled={!myMember}
            title={!myMember ? 'Linkitä käyttäjätilisi tiimiläiseen Tiimi-sivulla' : ''}
          >
            Minun tehtäväni {myMember && `(${filterByAssignee(pubs, [myMember.id]).filter(p => p.status !== 'published').length})`}
          </button>
          <button onClick={() => setScope('all')} className={`cal-view-btn ${scope === 'all' ? 'act' : ''}`}>
            Koko tiimi ({pubs.filter(p => p.status !== 'published').length})
          </button>
        </div>

        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <select className="input" value={channelFilter} onChange={e => setChannelFilter(e.target.value)} style={{ width: 'auto', fontSize: '.78rem' }}>
            <option value="all">Kaikki kanavat</option>
            {(org.channels || []).map((ch: any) => <option key={ch.name} value={ch.name}>{ch.name}</option>)}
          </select>
          <select className="input" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={{ width: 'auto', fontSize: '.78rem' }}>
            <option value="all">Kaikki kategoriat</option>
            {PUBLICATION_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          {canEdit && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowQuick(v => !v)}>
              {showQuick ? '× Sulje' : '+ Uusi brief'}
            </button>
          )}
          {canEdit && (
            <button className="btn btn-secondary btn-sm" onClick={() => onOpenEditor()}>
              ◎ Avaa editori
            </button>
          )}
        </div>
      </div>

      {/* Quick "+ Uusi brief" form — inline, collapses when done */}
      {showQuick && (
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)',
          padding: '1.25rem', marginBottom: '1.25rem',
        }}>
          <h3 style={{ fontSize: '.82rem', fontWeight: 700, marginBottom: '.75rem', color: 'var(--t1)' }}>Uusi brief</h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem', marginBottom: '.75rem' }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Otsikko *</label>
              <input className="input" value={qTitle} onChange={e => setQTitle(e.target.value)} placeholder="Esim. IG-julkistus ohjelmistosta" autoFocus />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Vastuuhenkilö</label>
              <select className="input" value={qAssignee} onChange={e => setQAssignee(e.target.value)}>
                <option value="">(ei valittu)</option>
                {teamMembers.map(m => {
                  const tm = orgTeams.find(t => t.id === m.teamId);
                  return <option key={m.id} value={m.id}>{m.name}{tm ? ` · ${tm.name}` : ''}</option>;
                })}
              </select>
            </div>
          </div>

          <div className="field" style={{ marginBottom: '.75rem' }}>
            <label>Brief — mitä pitäisi tehdä?</label>
            <textarea
              className="input textarea"
              value={qBrief}
              onChange={e => setQBrief(e.target.value)}
              placeholder="Tavoite, sävy, kohderyhmä, avainviestit..."
              style={{ minHeight: 80 }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '.75rem', marginBottom: '.75rem' }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Deadline</label>
              <input type="date" className="input" value={qDue} onChange={e => setQDue(e.target.value)} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Kategoria</label>
              <select className="input" value={qCategory} onChange={e => setQCategory(e.target.value)}>
                {PUBLICATION_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Prioriteetti</label>
              <select className="input" value={qPriority} onChange={e => setQPriority(e.target.value as any)}>
                <option value="low">Matala</option>
                <option value="normal">Normaali</option>
                <option value="high">Korkea ★</option>
              </select>
            </div>
          </div>

          <div className="field" style={{ marginBottom: '.75rem' }}>
            <label>Kanavat</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem' }}>
              {(org.channels || []).map((ch: any) => (
                <button
                  key={ch.name}
                  type="button"
                  onClick={() => toggleQCh(ch.name)}
                  className={`btn btn-sm ${qChannels.includes(ch.name) ? 'btn-primary' : 'btn-secondary'}`}
                >
                  {ch.name}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '.5rem' }}>
            <button className="btn btn-primary" onClick={createBrief} disabled={!qTitle.trim()}>Luo brief</button>
            <button className="btn btn-ghost" onClick={() => { resetQuickForm(); setShowQuick(false); }}>Peruuta</button>
          </div>
        </div>
      )}

      {/* Kanban — 4 columns */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '.75rem' }}>
        {STATUS_ORDER.map(status => {
          const items = grouped[status];
          const colors = STATUS_COLORS[status];
          return (
            <div
              key={status}
              onDragOver={e => e.preventDefault()}
              onDrop={() => { if (dragId) { moveTo(dragId, status); setDragId(null); } }}
              style={{
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderTop: `3px solid ${colors.fg === 'var(--pri-l)' ? 'var(--pri-l)' : colors.fg}`,
                borderRadius: 'var(--rl)',
                minHeight: 420,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div style={{
                padding: '.85rem 1rem',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <h3 style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '.78rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '.04em',
                  color: colors.fg,
                }}>{STATUS_LABELS[status]}</h3>
                <span style={{
                  fontSize: '.68rem',
                  fontWeight: 700,
                  padding: '.15rem .5rem',
                  borderRadius: 9999,
                  background: colors.bg,
                  color: colors.fg,
                }}>{items.length}</span>
              </div>

              <div style={{ padding: '.6rem', display: 'flex', flexDirection: 'column', gap: '.5rem', flex: 1 }}>
                {items.map(p => {
                  const dl = deadlineStatus(effectiveDeadline(p));
                  const comp = publicationCompleteness(p);
                  const assignee = assigneeById(p.assigneeId);
                  const assigneeTeam = assignee ? orgTeams.find(t => t.id === assignee.teamId) : null;
                  const isHigh = p.priority === 'high';
                  return (
                    <div
                      key={p.id}
                      draggable={canEdit}
                      onDragStart={() => setDragId(p.id)}
                      onDragEnd={() => setDragId(null)}
                      onClick={() => onOpenDetail(p.id)}
                      style={{
                        background: 'var(--elev)',
                        border: '1px solid var(--border)',
                        borderLeft: assigneeTeam ? `3px solid ${assigneeTeam.color}` : '1px solid var(--border)',
                        borderRadius: 'var(--r)',
                        padding: '.75rem .85rem',
                        cursor: 'pointer',
                        transition: 'border-color .15s, transform .1s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--pri)')}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                    >
                      {/* Top row: title + priority */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '.35rem', marginBottom: '.4rem' }}>
                        {isHigh && <span style={{ fontSize: '.7rem', color: '#f5c542', lineHeight: 1 }} title="Korkea prioriteetti">★</span>}
                        <div style={{ flex: 1, fontSize: '.82rem', fontWeight: 600, lineHeight: 1.35, color: 'var(--t1)' }}>
                          {p.title || <span style={{ color: 'var(--t3)', fontStyle: 'italic' }}>(nimetön)</span>}
                        </div>
                      </div>

                      {/* Channel chips */}
                      {p.channels.length > 0 && (
                        <div style={{ display: 'flex', gap: '.25rem', flexWrap: 'wrap', marginBottom: '.4rem' }}>
                          {p.channels.slice(0, 4).map(ch => {
                            const pm = PLATFORM_META[ch];
                            return (
                              <span key={ch} style={{
                                width: 22, height: 22, borderRadius: 4,
                                background: `${pm?.color || '#666'}20`,
                                color: pm?.color || '#666',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '.55rem', fontWeight: 700,
                                fontFamily: 'var(--font-display)',
                              }}>{pm?.ic || ch[0]}</span>
                            );
                          })}
                          {p.channels.length > 4 && (
                            <span style={{ fontSize: '.6rem', color: 'var(--t3)', alignSelf: 'center' }}>+{p.channels.length - 4}</span>
                          )}
                        </div>
                      )}

                      {/* Deadline badge */}
                      {dl && (
                        <div style={{
                          display: 'inline-block',
                          fontSize: '.62rem',
                          padding: '.15rem .45rem',
                          borderRadius: 9999,
                          background: dl.bg,
                          color: dl.color,
                          fontWeight: 700,
                          marginBottom: '.35rem',
                        }}>{dl.label}</div>
                      )}

                      {/* Completeness progress bar (only for brief/draft/ready) */}
                      {status !== 'published' && (
                        <div style={{ marginBottom: '.35rem' }}>
                          <div style={{
                            height: 3,
                            background: 'var(--bg)',
                            borderRadius: 2,
                            overflow: 'hidden',
                          }}>
                            <div style={{
                              height: '100%',
                              width: `${comp.percentage}%`,
                              background: comp.percentage === 100 ? 'var(--green)' : 'var(--pri)',
                              transition: 'width .3s',
                            }} />
                          </div>
                          <div style={{
                            display: 'flex', gap: '.25rem', marginTop: '.3rem',
                            fontSize: '.55rem', color: 'var(--t3)',
                          }}>
                            <span style={{ opacity: comp.hasTitle ? 1 : 0.35 }}>otsikko</span>
                            <span style={{ opacity: comp.hasBody ? 1 : 0.35 }}>· teksti</span>
                            <span style={{ opacity: comp.hasMedia ? 1 : 0.35 }}>· kuva</span>
                            <span style={{ opacity: comp.hasChannels ? 1 : 0.35 }}>· kanavat</span>
                            <span style={{ opacity: comp.hasSchedule ? 1 : 0.35 }}>· aika</span>
                          </div>
                        </div>
                      )}

                      {/* Assignee */}
                      {assignee ? (
                        <div style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '.3rem',
                          fontSize: '.65rem',
                          padding: '.15rem .45rem',
                          borderRadius: 9999,
                          background: assigneeTeam ? `${assigneeTeam.color}15` : 'var(--card)',
                          color: assigneeTeam?.color || 'var(--t2)',
                          fontWeight: 600,
                          border: `1px solid ${assigneeTeam ? `${assigneeTeam.color}30` : 'var(--border)'}`,
                        }}>
                          <span style={{
                            width: 14, height: 14, borderRadius: '50%',
                            background: assigneeTeam?.color || 'var(--t3)',
                            color: '#fff',
                            fontSize: '.5rem', fontWeight: 700,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>{assignee.name[0]}</span>
                          {assignee.name.split(' ')[0]}
                        </div>
                      ) : (
                        <div style={{ fontSize: '.6rem', color: 'var(--t3)', fontStyle: 'italic' }}>Ei vastuuhenkilöä</div>
                      )}
                    </div>
                  );
                })}
                {items.length === 0 && (
                  <div style={{
                    textAlign: 'center',
                    padding: '1.5rem .5rem',
                    color: 'var(--t3)',
                    fontSize: '.75rem',
                    fontStyle: 'italic',
                  }}>
                    {status === 'brief' && hasMyFilter ? 'Ei briefejä sinulle' : status === 'brief' ? 'Ei briefejä' : null}
                    {status === 'draft' && 'Ei työn alla'}
                    {status === 'ready' && 'Ei valmiita odottamassa'}
                    {status === 'published' && 'Ei julkaistuja'}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {pubs.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '3rem 1rem',
          color: 'var(--t3)',
          marginTop: '1rem',
        }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '.5rem', color: 'var(--t2)' }}>Ei yhtään julkaisua</h3>
          <p style={{ fontSize: '.85rem', marginBottom: '1rem' }}>Aloita luomalla brief — se on lyhyt kuvaus siitä mitä pitäisi tehdä.</p>
          {canEdit && <button className="btn btn-primary" onClick={() => setShowQuick(true)}>+ Luo ensimmäinen brief</button>}
        </div>
      )}
    </>
  );
}
