'use client';

/*
 * Yksittäisen julkaisun työtila — kolme palstaa:
 *   VASEN:  brief + meta (tila, vastuuhenkilö, deadlinet, prioriteetti, brief-teksti)
 *   KESKI:  sisältö (otsikko, teksti, kategoria, kanavat, cover-kuva)
 *   OIKEA:  materiaalit (mediapankin integraatio) + Editori-linkki + Julkaise-paneeli
 *
 * Kaikki muutokset tallennetaan suoraan Firestoreen — ei erillistä "Tallenna luonnos" -nappia.
 */

import { useState, useMemo, useEffect } from 'react';
import { useOrgData } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { useIsMobile } from '@/lib/use-mobile';
import {
  Publication,
  PublicationStatus,
  STATUS_LABELS,
  STATUS_COLORS,
  PUBLICATION_CATEGORIES,
  PLATFORM_META,
  normalizePublication,
  publicationCompleteness,
  deadlineStatus,
} from '@/lib/publications-shared';
import { useParams } from 'next/navigation';
import { OrgTeam, OrgTeamMember } from '@/lib/team-shared';
import { CommsPlan, normalizeCommsPlan, unifiedChannels } from '@/lib/comms-plan-shared';
import { getOrgTeams, getOrgTeamMembers, getOrgCommsPlan } from '@/lib/org-defaults';

import { workerFetch, WORKER_URL } from '@/lib/worker-fetch';
const R2_CDN = 'https://pub-f3aa3f94aaf8436da08a8ee775b44349.r2.dev';

interface MediaFile {
  id: string;
  name: string;
  key: string;
  url: string;
  folder: string;
  ext: string;
  size: number;
  isImage: boolean;
}

interface CalEvent {
  id: number;
  t: string;
  ch: string;
  date: string;
  st: string;
  pubId?: string;
  kind?: string;
}

interface Props {
  publicationId: string;
  onBack: () => void;
  onOpenEditor: (publicationId: string) => void;
}

export default function PublicationDetailSection({ publicationId, onBack, onOpenEditor }: Props) {
  const { activeOrg, canEdit } = useAuth();
  const { toast } = useToast();
  const orgSlug = (useParams().orgSlug as string) || '';
  const isMobile = useIsMobile();
  const [rawPubs, setPubs] = useOrgData<any[]>('publications', []);
  const [, setCalEvents] = useOrgData<CalEvent[]>('events', []);
  const [teamMembers] = useOrgData<OrgTeamMember[]>('orgTeamMembers', getOrgTeamMembers(orgSlug));
  const [orgTeams] = useOrgData<OrgTeam[]>('orgTeams', getOrgTeams(orgSlug));
  const [org] = useOrgData<any>('org', { channels: [] });
  const [rawCommsPlan] = useOrgData<CommsPlan>('commsPlan', getOrgCommsPlan(orgSlug));
  const commsPlan = useMemo(() => normalizeCommsPlan(rawCommsPlan), [rawCommsPlan]);
  const availableChannels = useMemo(() => unifiedChannels(commsPlan, org.channels), [commsPlan, org.channels]);

  const pub = useMemo(() => {
    const found = (rawPubs || []).find(p => p.id === publicationId);
    return found ? normalizePublication(found) : null;
  }, [rawPubs, publicationId]);

  // Media bank state — loaded lazily when right panel is visible
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaSearch, setMediaSearch] = useState('');
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [showPublishPanel, setShowPublishPanel] = useState(false);

  // Eagerly load media bank — needed both for picker AND for resolving names of attached files.
  // (URLs alone can be derived from mediaId, but names/folder come from the listing.)
  useEffect(() => {
    if (!activeOrg || mediaFiles.length > 0) return;
    setMediaLoading(true);
    workerFetch('/media/list?limit=500', { orgId: activeOrg })
      .then(r => r.json())
      .then(d => {
        if (d.files) {
          setMediaFiles(d.files.map((f: any) => {
            const ext = (f.name || '').split('.').pop()?.toLowerCase() || '';
            const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext);
            const cleanName = (f.name || '').replace(/^\d+_/, '');
            return {
              id: 'r2_' + f.key,
              name: cleanName,
              key: f.key,
              url: `${R2_CDN}/${f.key}`,
              folder: (f.key || '').split('/')[1] || 'uploaded',
              ext,
              size: f.size || 0,
              isImage,
            };
          }));
        }
      })
      .catch(() => toast('Mediapankin lataus epäonnistui', 'error'))
      .finally(() => setMediaLoading(false));
  }, [activeOrg, mediaFiles.length, toast]);

  if (!pub) {
    return (
      <>
        <button className="btn btn-ghost" onClick={onBack} style={{ marginBottom: '1rem' }}>{'←'} Takaisin työjonoon</button>
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--t3)' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '.5rem' }}>Julkaisua ei löytynyt</h3>
          <p style={{ fontSize: '.85rem' }}>Se on voitu poistaa tai id on virheellinen.</p>
        </div>
      </>
    );
  }

  const update = (patch: Partial<Publication>) => {
    setPubs(prev => (prev || []).map(p => p.id === pub.id ? { ...p, ...patch, updatedAt: Date.now() } : p));
  };

  const toggleChannel = (name: string) => {
    const next = pub.channels.includes(name)
      ? pub.channels.filter(c => c !== name)
      : [...pub.channels, name];
    update({ channels: next });
  };

  const attachMedia = (file: MediaFile) => {
    const mediaIds = pub.mediaIds || [];
    if (mediaIds.includes(file.id)) return;
    const patch: Partial<Publication> = { mediaIds: [...mediaIds, file.id] };
    // If no cover image yet, use this file's URL as the cover
    if (!pub.image && file.isImage) {
      patch.image = file.url;
    }
    update(patch);
    toast('Liitetty julkaisuun', 'success');
  };

  const removeMedia = (fileId: string) => {
    const next = (pub.mediaIds || []).filter(id => id !== fileId);
    update({ mediaIds: next });
  };

  const deletePub = () => {
    if (!window.confirm('Poistetaanko julkaisu lopullisesti?')) return;
    setPubs(prev => (prev || []).filter(p => p.id !== pub.id));
    setCalEvents(prev => (prev || []).filter(e => e.pubId !== pub.id));
    toast('Julkaisu poistettu', 'success');
    onBack();
  };

  const markReadyOrBack = () => {
    const next = pub.status === 'ready' ? 'draft' : 'ready';
    update({ status: next });
    if (next === 'ready') toast('Merkitty valmiiksi', 'success');
  };

  const publishToChannel = (ch: string) => {
    const pm = PLATFORM_META[ch];
    if (pub.body) navigator.clipboard.writeText(pub.body);
    const already = pub.publishedChannels || [];
    if (!already.includes(ch)) {
      const nextChannels = [...already, ch];
      const allDone = pub.channels.every(c => nextChannels.includes(c));
      update({
        publishedChannels: nextChannels,
        status: allDone ? 'published' : pub.status,
      });
    }
    if (pm?.post && pm.post !== '#') window.open(pm.post, '_blank');
    toast(`Teksti kopioitu${pm?.post ? ', kanava avattu' : ''}`, 'success');
  };

  // Sync a calendar event when publish date is set
  const syncCalendar = (date: string | null) => {
    update({ date });
    setCalEvents(prev => {
      const list = (prev || []).filter(e => e.pubId !== pub.id);
      if (date) {
        list.push({
          id: Date.now(),
          t: pub.title || '(nimetön julkaisu)',
          date,
          ch: pub.channels.join(', '),
          st: pub.status === 'ready' ? 'valmis' : 'suunniteltu',
          pubId: pub.id,
          kind: 'publication',
        });
      }
      return list;
    });
  };

  const comp = publicationCompleteness(pub);
  const assignee = pub.assigneeId ? teamMembers.find(m => m.id === pub.assigneeId) : null;
  const assigneeTeam = assignee ? orgTeams.find(t => t.id === assignee.teamId) : null;
  const dueStat = deadlineStatus(pub.dueDate || null);
  const pubStat = deadlineStatus(pub.date || null);
  const colors = STATUS_COLORS[pub.status];

  const filteredMedia = mediaSearch.trim()
    ? mediaFiles.filter(f => f.name.toLowerCase().includes(mediaSearch.toLowerCase()))
    : mediaFiles;

  // Resolve attached media. mediaId format: 'r2_<key>' (e.g. r2_llff/brand/123_logo.png).
  // We try the loaded cache first (for name/size metadata), then fall back to deriving the URL
  // directly from the id so carousel slides always render — even before the picker has loaded.
  const attachedFiles: MediaFile[] = (pub.mediaIds || [])
    .map(id => {
      const cached = mediaFiles.find(f => f.id === id);
      if (cached) return cached;
      if (!id.startsWith('r2_')) return null;
      const key = id.slice(3);
      const fileName = key.split('/').pop() || key;
      const ext = (fileName.split('.').pop() || '').toLowerCase();
      const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext);
      return {
        id,
        name: fileName.replace(/^\d+_/, ''),
        key,
        url: `${R2_CDN}/${key}`,
        folder: key.split('/')[1] || 'uploaded',
        ext,
        size: 0,
        isImage,
      } as MediaFile;
    })
    .filter((f): f is MediaFile => !!f);

  return (
    <>
      {/* Sticky header with back + status + main actions */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '1rem', flexWrap: 'wrap', gap: '.5rem',
      }}>
        <button className="btn btn-ghost" onClick={onBack}>{'←'} Työjono</button>
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{
            fontSize: '.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em',
            padding: '.3rem .7rem', borderRadius: 9999,
            background: colors.bg, color: colors.fg, border: `1px solid ${colors.border}`,
          }}>{STATUS_LABELS[pub.status]}</span>
          {canEdit && pub.status !== 'published' && (
            <button className="btn btn-secondary btn-sm" onClick={markReadyOrBack}>
              {pub.status === 'ready' ? '← Palauta työn alle' : 'Merkitse valmiiksi'}
            </button>
          )}
          {canEdit && pub.channels.length > 0 && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowPublishPanel(v => !v)}>
              {'▶'} Julkaise
            </button>
          )}
        </div>
      </div>

      {/* Completeness bar */}
      {pub.status !== 'published' && (
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 'var(--r)', padding: '.6rem 1rem',
          marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '1rem',
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ height: 4, background: 'var(--bg)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${comp.percentage}%`,
                background: comp.percentage === 100 ? 'var(--green)' : 'var(--pri)',
                transition: 'width .3s',
              }} />
            </div>
            <div style={{ display: 'flex', gap: '.65rem', marginTop: '.4rem', fontSize: '.68rem' }}>
              {[
                { ok: comp.hasTitle, label: 'Otsikko' },
                { ok: comp.hasBody, label: 'Teksti' },
                { ok: comp.hasMedia, label: 'Kuva' },
                { ok: comp.hasChannels, label: 'Kanavat' },
                { ok: comp.hasSchedule, label: 'Aika' },
              ].map(c => (
                <span key={c.label} style={{
                  color: c.ok ? 'var(--green)' : 'var(--t3)',
                  fontWeight: c.ok ? 700 : 500,
                }}>
                  {c.ok ? '✓' : '○'} {c.label}
                </span>
              ))}
            </div>
          </div>
          <div style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--t2)' }}>{comp.percentage}%</div>
        </div>
      )}

      {/* Publish panel (reveals channel-by-channel publish buttons) */}
      {showPublishPanel && canEdit && (
        <div style={{
          background: 'var(--card)', border: '1px solid var(--pri)', borderLeft: '3px solid var(--pri)',
          borderRadius: 'var(--rl)', padding: '1rem 1.25rem', marginBottom: '1rem',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.75rem' }}>
            <h3 style={{ fontSize: '.82rem', fontWeight: 700 }}>Julkaise kanaviin</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowPublishPanel(false)}>{'×'}</button>
          </div>
          <p style={{ fontSize: '.72rem', color: 'var(--t3)', marginBottom: '.75rem' }}>
            Klikkaus kopioi tekstin leikepöydälle ja avaa kanavan julkaisunäkymän uudessa välilehdessä.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
            {pub.channels.map(ch => {
              const pm = PLATFORM_META[ch];
              const done = (pub.publishedChannels || []).includes(ch);
              return (
                <div key={ch} style={{
                  display: 'flex', alignItems: 'center', gap: '.6rem',
                  padding: '.55rem .7rem', background: 'var(--elev)',
                  border: '1px solid var(--border)', borderRadius: 'var(--r)',
                }}>
                  <span style={{
                    fontSize: '.7rem', fontWeight: 700,
                    color: pm?.color || 'var(--t1)', fontFamily: 'var(--font-display)',
                    width: 28, textAlign: 'center',
                  }}>{pm?.ic || ch[0]}</span>
                  <span style={{ flex: 1, fontSize: '.82rem' }}>{ch}</span>
                  {done ? (
                    <span style={{ fontSize: '.68rem', color: 'var(--green)', fontWeight: 700 }}>✓ Julkaistu</span>
                  ) : (
                    <button className="btn btn-primary btn-sm" onClick={() => publishToChannel(ch)}>Julkaise</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 3-column workspace */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '260px 1fr 320px', gap: '1rem' }}>
        {/* ========== LEFT: BRIEF & META ========== */}
        <aside style={{
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 'var(--rl)', padding: '1rem', alignSelf: 'flex-start',
          display: 'flex', flexDirection: 'column', gap: '.9rem',
        }}>
          <h3 style={{
            fontFamily: 'var(--font-display)', fontSize: '.72rem', fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--t3)',
          }}>Brief & meta</h3>

          <div>
            <label style={{ fontSize: '.68rem', fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase' }}>Tila</label>
            <select
              className="input"
              style={{ marginTop: '.3rem', fontSize: '.82rem' }}
              value={pub.status}
              onChange={e => update({ status: e.target.value as PublicationStatus })}
              disabled={!canEdit}
            >
              <option value="brief">Brief</option>
              <option value="draft">Työstössä</option>
              <option value="ready">Valmis</option>
              <option value="published">Julkaistu</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: '.68rem', fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase' }}>Vastuuhenkilö</label>
            <select
              className="input"
              style={{ marginTop: '.3rem', fontSize: '.82rem' }}
              value={pub.assigneeId || ''}
              onChange={e => update({ assigneeId: e.target.value || undefined })}
              disabled={!canEdit}
            >
              <option value="">(ei valittu)</option>
              {teamMembers.map(m => {
                const t = orgTeams.find(ot => ot.id === m.teamId);
                return <option key={m.id} value={m.id}>{m.name}{t ? ` · ${t.name}` : ''}</option>;
              })}
            </select>
            {assignee && assigneeTeam && (
              <div style={{
                marginTop: '.3rem',
                fontSize: '.6rem',
                color: assigneeTeam.color,
                fontWeight: 600,
              }}>{assigneeTeam.icon} {assigneeTeam.name}</div>
            )}
          </div>

          <div>
            <label style={{ fontSize: '.68rem', fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase' }}>Deadline (sisäinen)</label>
            <input
              type="date"
              className="input"
              style={{ marginTop: '.3rem', fontSize: '.82rem' }}
              value={pub.dueDate || ''}
              onChange={e => update({ dueDate: e.target.value || null })}
              disabled={!canEdit}
            />
            {dueStat && (
              <div style={{
                display: 'inline-block', marginTop: '.3rem',
                fontSize: '.6rem', padding: '.12rem .4rem', borderRadius: 9999,
                background: dueStat.bg, color: dueStat.color, fontWeight: 700,
              }}>{dueStat.label}</div>
            )}
          </div>

          <div>
            <label style={{ fontSize: '.68rem', fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase' }}>Julkaisupäivä</label>
            <input
              type="date"
              className="input"
              style={{ marginTop: '.3rem', fontSize: '.82rem' }}
              value={pub.date || ''}
              onChange={e => syncCalendar(e.target.value || null)}
              disabled={!canEdit}
            />
            {pubStat && (
              <div style={{
                display: 'inline-block', marginTop: '.3rem',
                fontSize: '.6rem', padding: '.12rem .4rem', borderRadius: 9999,
                background: pubStat.bg, color: pubStat.color, fontWeight: 700,
              }}>{pubStat.label}</div>
            )}
          </div>

          <div>
            <label style={{ fontSize: '.68rem', fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase' }}>Prioriteetti</label>
            <select
              className="input"
              style={{ marginTop: '.3rem', fontSize: '.82rem' }}
              value={pub.priority || 'normal'}
              onChange={e => update({ priority: e.target.value as any })}
              disabled={!canEdit}
            >
              <option value="low">Matala</option>
              <option value="normal">Normaali</option>
              <option value="high">Korkea ★</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: '.68rem', fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase' }}>Brief — mitä pitäisi tehdä?</label>
            <textarea
              className="input"
              style={{ marginTop: '.3rem', fontSize: '.78rem', minHeight: 120 }}
              value={pub.brief || ''}
              onChange={e => update({ brief: e.target.value })}
              placeholder="Tavoite, sävy, kohderyhmä, avainviestit..."
              disabled={!canEdit}
            />
          </div>

          {canEdit && (
            <button
              onClick={deletePub}
              className="btn btn-sm"
              style={{
                marginTop: '.5rem',
                color: 'var(--red)',
                border: '1px solid rgba(239,68,68,.3)',
                background: 'rgba(239,68,68,.05)',
                fontSize: '.72rem',
              }}
            >Poista julkaisu</button>
          )}
        </aside>

        {/* ========== CENTER: CONTENT ========== */}
        <main style={{
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 'var(--rl)', padding: '1.25rem',
          display: 'flex', flexDirection: 'column', gap: '.9rem',
        }}>
          <h3 style={{
            fontFamily: 'var(--font-display)', fontSize: '.72rem', fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--t3)',
          }}>Sisältö</h3>

          <input
            className="input"
            style={{ fontSize: '1.1rem', fontWeight: 700, padding: '.6rem .75rem' }}
            placeholder="Otsikko..."
            value={pub.title}
            onChange={e => update({ title: e.target.value })}
            disabled={!canEdit}
          />

          <textarea
            className="input"
            style={{ minHeight: 220, fontSize: '.88rem', lineHeight: 1.6, padding: '.75rem' }}
            placeholder="Julkaisun teksti — sama kopioidaan jokaiseen kanavaan..."
            value={pub.body}
            onChange={e => update({ body: e.target.value })}
            disabled={!canEdit}
          />

          <div>
            <label style={{ fontSize: '.68rem', fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase' }}>Kategoria</label>
            <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap', marginTop: '.4rem' }}>
              {PUBLICATION_CATEGORIES.map(c => (
                <button
                  key={c.id}
                  type="button"
                  disabled={!canEdit}
                  onClick={() => update({ category: c.id })}
                  className={`btn btn-sm ${(pub.category || 'some') === c.id ? 'btn-primary' : 'btn-secondary'}`}
                >{c.label}</button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ fontSize: '.68rem', fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase' }}>Kanavat</label>
            <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap', marginTop: '.4rem' }}>
              {availableChannels.map(ch => {
                const active = pub.channels.includes(ch.name);
                const pm = PLATFORM_META[ch.name];
                return (
                  <button
                    key={ch.name}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => toggleChannel(ch.name)}
                    className={`btn btn-sm ${active ? 'btn-primary' : 'btn-secondary'}`}
                    style={active ? {
                      background: pm?.color || ch.color,
                      borderColor: pm?.color || ch.color,
                    } : undefined}
                  >{ch.name}</button>
                );
              })}
              {availableChannels.length === 0 && (
                <span style={{ fontSize: '.72rem', color: 'var(--t3)', fontStyle: 'italic' }}>
                  Ei kanavia saatavilla
                </span>
              )}
            </div>
          </div>

          {/* Julkaisun visuaalinen sisältö — kansikuva + kaikki karusellin slaidit */}
          {(pub.image || attachedFiles.length > 0) && (
            <div>
              <label style={{ fontSize: '.68rem', fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase' }}>
                {attachedFiles.length > 1 ? `Julkaisun sisältö — ${attachedFiles.length} slaidia` : 'Kansikuva'}
              </label>

              {/* Cover image (only shown if it's NOT already in the carousel) */}
              {pub.image && !attachedFiles.some(f => f.url === pub.image) && (
                <div style={{
                  marginTop: '.4rem',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r)',
                  overflow: 'hidden',
                  maxWidth: 400,
                }}>
                  <img src={pub.image} alt="" style={{ display: 'block', width: '100%', height: 'auto' }} />
                </div>
              )}

              {/* Carousel slides — full size, all visible */}
              {attachedFiles.length > 0 && (
                <div style={{
                  marginTop: '.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '.5rem',
                }}>
                  {attachedFiles.map((f, idx) => (
                    <div key={f.id} style={{
                      position: 'relative',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--r)',
                      overflow: 'hidden',
                      background: 'var(--elev)',
                      maxWidth: 460,
                    }}>
                      {f.isImage ? (
                        <img
                          src={f.url}
                          alt={f.name}
                          style={{ display: 'block', width: '100%', height: 'auto' }}
                        />
                      ) : (
                        <div style={{
                          padding: '2rem 1rem',
                          textAlign: 'center',
                          fontSize: '.8rem',
                          color: 'var(--t3)',
                        }}>{f.name} ({f.ext})</div>
                      )}
                      <div style={{
                        position: 'absolute', top: 6, left: 6,
                        padding: '2px 8px',
                        background: 'rgba(0,0,0,.6)',
                        color: '#fff',
                        fontSize: '.62rem',
                        fontWeight: 700,
                        borderRadius: 4,
                        letterSpacing: '.04em',
                      }}>
                        {idx + 1} / {attachedFiles.length}
                      </div>
                      {canEdit && (
                        <button
                          onClick={() => removeMedia(f.id)}
                          title="Poista slaide"
                          style={{
                            position: 'absolute', top: 6, right: 6,
                            width: 24, height: 24, borderRadius: '50%',
                            background: 'rgba(0,0,0,.6)', color: '#fff',
                            border: 'none', fontSize: '.85rem', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >×</button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {canEdit && pub.image && (
                <button className="btn btn-ghost btn-sm" onClick={() => update({ image: null })} style={{ marginTop: '.4rem', fontSize: '.7rem' }}>
                  Poista kansikuva
                </button>
              )}
            </div>
          )}
        </main>

        {/* ========== RIGHT: MEDIA & ACTIONS ========== */}
        <aside style={{
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 'var(--rl)', padding: '1rem',
          alignSelf: 'flex-start',
          display: 'flex', flexDirection: 'column', gap: '.85rem',
        }}>
          <h3 style={{
            fontFamily: 'var(--font-display)', fontSize: '.72rem', fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--t3)',
          }}>Materiaalit</h3>

          {/* Editor link */}
          {canEdit && (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => onOpenEditor(pub.id)}
              style={{ width: '100%' }}
            >
              ◎ Avaa Editorissa
            </button>
          )}
          <div style={{ fontSize: '.65rem', color: 'var(--t3)', lineHeight: 1.4, marginTop: '-.3rem' }}>
            Editorissa tehty kuva liitetään automaattisesti tähän julkaisuun.
          </div>

          <div style={{ height: 1, background: 'var(--border)' }} />

          {/* Attached media */}
          <div>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: '.35rem',
            }}>
              <span style={{ fontSize: '.68rem', fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase' }}>
                Liitetyt ({attachedFiles.length})
              </span>
            </div>
            {attachedFiles.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: '.3rem' }}>
                {attachedFiles.map(f => (
                  <div key={f.id} style={{
                    position: 'relative',
                    aspectRatio: '1 / 1',
                    borderRadius: 6,
                    overflow: 'hidden',
                    border: '1px solid var(--border)',
                    background: 'var(--elev)',
                  }}>
                    {f.isImage && <img src={f.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                    {canEdit && (
                      <button
                        onClick={() => removeMedia(f.id)}
                        title="Poista liite"
                        style={{
                          position: 'absolute', top: 2, right: 2,
                          width: 18, height: 18, borderRadius: '50%',
                          background: 'rgba(0,0,0,.6)', color: '#fff',
                          border: 'none', fontSize: '.7rem', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >×</button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: '.68rem', color: 'var(--t3)', fontStyle: 'italic' }}>
                Ei vielä materiaaleja
              </div>
            )}
          </div>

          {canEdit && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowMediaPicker(v => !v)}
              style={{ width: '100%' }}
            >
              {showMediaPicker ? '× Sulje mediapankki' : '+ Liitä mediapankista'}
            </button>
          )}

          {/* Inline media picker */}
          {showMediaPicker && (
            <div>
              <input
                className="input"
                value={mediaSearch}
                onChange={e => setMediaSearch(e.target.value)}
                placeholder="Hae tiedostoa..."
                style={{ fontSize: '.75rem', marginBottom: '.4rem' }}
              />
              {mediaLoading && (
                <div style={{ textAlign: 'center', padding: '1rem', fontSize: '.72rem', color: 'var(--t3)' }}>
                  Ladataan...
                </div>
              )}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '.3rem',
                maxHeight: 280,
                overflowY: 'auto',
                padding: '.25rem',
                background: 'var(--elev)',
                borderRadius: 'var(--r)',
                border: '1px solid var(--border)',
              }}>
                {filteredMedia.slice(0, 60).map(f => {
                  const attached = (pub.mediaIds || []).includes(f.id);
                  return (
                    <button
                      key={f.id}
                      onClick={() => attachMedia(f)}
                      title={f.name}
                      style={{
                        aspectRatio: '1 / 1',
                        border: attached ? '2px solid var(--pri)' : '1px solid var(--border)',
                        borderRadius: 4,
                        overflow: 'hidden',
                        cursor: 'pointer',
                        padding: 0,
                        background: 'var(--card)',
                        position: 'relative',
                      }}
                    >
                      {f.isImage ? (
                        <img src={f.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                      ) : (
                        <div style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          width: '100%', height: '100%', fontSize: '.6rem', color: 'var(--t3)',
                        }}>{f.ext}</div>
                      )}
                      {attached && (
                        <span style={{
                          position: 'absolute', top: 2, right: 2,
                          fontSize: '.5rem', color: '#fff',
                          background: 'var(--pri)',
                          borderRadius: 3,
                          padding: '1px 4px',
                          fontWeight: 700,
                        }}>✓</span>
                      )}
                    </button>
                  );
                })}
              </div>
              {!mediaLoading && filteredMedia.length === 0 && (
                <div style={{ textAlign: 'center', padding: '1rem', fontSize: '.72rem', color: 'var(--t3)' }}>
                  Ei tiedostoja
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
