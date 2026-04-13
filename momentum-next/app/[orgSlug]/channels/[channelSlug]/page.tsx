'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { useOrgData } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { useIsMobile } from '@/lib/use-mobile';

const FREQ_OPTIONS = [
  { value: 'paivittain', label: 'Paivittain' },
  { value: '3-5x/vko', label: '3-5x / viikko' },
  { value: '1-2x/vko', label: '1-2x / viikko' },
  { value: 'viikoittain', label: 'Viikoittain' },
  { value: '2x/kk', label: '2x / kuukausi' },
  { value: 'kuukausittain', label: 'Kuukausittain' },
  { value: '4x/v', label: '4x / vuosi' },
  { value: 'tarpeen mukaan', label: 'Tarpeen mukaan' },
];

const ACTIVITY_LEVELS = [
  { value: 'high', label: 'Korkea', color: '#185e5b', desc: 'Aktiivisesti kaytetty, paikanava' },
  { value: 'medium', label: 'Normaali', color: '#056b9f', desc: 'Saannollinen julkaisutahti' },
  { value: 'low', label: 'Matala', color: '#f1b434', desc: 'Satunnainen, kokeileva' },
  { value: 'paused', label: 'Tauolla', color: '#ef6b6b', desc: 'Ei aktiivista julkaisua' },
];

export default function ChannelPage() {
  const { channelSlug, orgSlug } = useParams<{ channelSlug: string; orgSlug: string }>();
  const router = useRouter();
  const { canEdit } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [org, setOrg] = useOrgData<any>('org', {});
  const [teamData] = useOrgData<any[]>('teamMembers', []);

  const channels = org.channels || [];
  const channel = channels.find((c: any) => c.slug === channelSlug);
  const channelProfiles = org.channelProfiles || [];
  const profile = channelProfiles.find((cp: any) => {
    const chName = channel?.name;
    return cp.ch === chName;
  });

  const [editing, setEditing] = useState(false);
  const [editFreq, setEditFreq] = useState('');
  const [editActivity, setEditActivity] = useState('');
  const [editDesc, setEditDesc] = useState('');

  if (!channel) {
    return (
      <AppShell title="Kanava" subtitle="">
        <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--t3)' }}>
          <div style={{ fontSize: '1.2rem', marginBottom: '.5rem' }}>Kanavaa ei loydy</div>
          <button className="btn btn-ghost" onClick={() => router.push(`/${orgSlug}/strategy`)}>Takaisin</button>
        </div>
      </AppShell>
    );
  }

  const responsible = teamData.filter(m => (m.channels || []).includes(channel.name));
  const allTeam = teamData.length > 0 ? teamData : (org.team || []);
  const activity = ACTIVITY_LEVELS.find(a => a.value === (channel.activity || (channel.enabled !== false ? 'medium' : 'paused')));
  const quarterlyCalendar = org.quarterlyCalendar || [];
  const channelMentions = quarterlyCalendar.flatMap((q: any) =>
    (q.months || []).filter((m: any) => (m.channels || []).some((ch: string) => ch.includes(channel.name) || channel.name.includes(ch)))
      .map((m: any) => ({ ...m, q: q.q, theme: q.theme }))
  );

  const startEdit = () => {
    setEditFreq(profile?.freq || channel.freq || '');
    setEditActivity(channel.activity || (channel.enabled !== false ? 'medium' : 'paused'));
    setEditDesc(profile?.desc || channel.desc || '');
    setEditing(true);
  };

  const saveEdit = () => {
    setOrg((prev: any) => {
      const newChannels = (prev.channels || []).map((c: any) =>
        c.slug === channelSlug ? { ...c, freq: editFreq, activity: editActivity, desc: editDesc } : c
      );
      // Also update channelProfile if exists
      const newProfiles = (prev.channelProfiles || []).map((cp: any) =>
        cp.ch === channel.name ? { ...cp, freq: editFreq, desc: editDesc } : cp
      );
      return { ...prev, channels: newChannels, channelProfiles: newProfiles };
    });
    setEditing(false);
    toast('Kanava paivitetty', 'success');
  };

  const toggleEnabled = () => {
    setOrg((prev: any) => ({
      ...prev,
      channels: (prev.channels || []).map((c: any) =>
        c.slug === channelSlug ? { ...c, enabled: !(c.enabled !== false), activity: c.enabled !== false ? 'paused' : 'medium' } : c
      ),
    }));
    toast(channel.enabled !== false ? 'Kanava pois kaytosta' : 'Kanava kaytetty', 'success');
  };

  const toggleResponsible = (memberId: string) => {
    const member = allTeam.find((m: any) => m.id === memberId || m.name === memberId);
    if (!member) return;
    const memberChannels = member.channels || [];
    const isAssigned = memberChannels.includes(channel.name);

    // Update teamMembers data
    const updatedTeam = allTeam.map((m: any) => {
      if ((m.id || m.name) === memberId) {
        return {
          ...m,
          channels: isAssigned
            ? memberChannels.filter((ch: string) => ch !== channel.name)
            : [...memberChannels, channel.name],
        };
      }
      return m;
    });

    // If using teamMembers collection, we need to handle differently
    // For now update org.team as fallback
    if (teamData.length > 0) {
      // teamData is managed separately, update via the hook isn't straightforward
      // We'll update org.team as source of truth
    }
    setOrg((prev: any) => ({ ...prev, team: updatedTeam }));
    toast(isAssigned ? `${member.name} poistettu` : `${member.name} lisatty`, 'success');
  };

  return (
    <AppShell title={channel.name} subtitle={org.name || ''}>
      {/* Back + header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => router.push(`/${orgSlug}/strategy`)} style={{ marginBottom: '1rem', fontSize: '.75rem' }}>
          &larr; Takaisin
        </button>

        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', overflow: 'hidden' }}>
          {/* Channel header with color bar */}
          <div style={{ height: 4, background: channel.color }} />
          <div style={{ padding: '1.5rem', display: 'flex', alignItems: 'flex-start', gap: '1rem', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ width: 48, height: 48, borderRadius: 'var(--r)', background: `${channel.color}18`, color: channel.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', fontWeight: 700, fontFamily: 'var(--font-display)', flexShrink: 0 }}>{channel.ic}</div>
              <div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{channel.name}</div>
                {profile?.role && <div style={{ fontSize: '.78rem', color: channel.color, fontWeight: 600, marginTop: '.1rem' }}>{profile.role}</div>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
              {/* Activity badge */}
              {activity && (
                <span style={{ fontSize: '.68rem', padding: '.25rem .6rem', borderRadius: 9999, background: `${activity.color}15`, color: activity.color, fontWeight: 700 }}>{activity.label}</span>
              )}
              {/* External link */}
              {channel.url && (
                <a href={channel.url} target="_blank" rel="noopener noreferrer" style={{
                  fontSize: '.72rem', padding: '.35rem .75rem', borderRadius: 'var(--r)',
                  background: `${channel.color}12`, color: channel.color, fontWeight: 600,
                  textDecoration: 'none', border: `1px solid ${channel.color}30`,
                }}>Avaa &rarr;</a>
              )}
              {canEdit && (
                <button className="btn btn-ghost btn-sm" onClick={toggleEnabled} style={{ color: channel.enabled !== false ? 'var(--red)' : 'var(--green)' }}>
                  {channel.enabled !== false ? 'Poista kaytosta' : 'Ota kayttoon'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main content grid */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: '1.25rem' }}>

        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Kuvaus ja julkaisutahti */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.82rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.02em' }}>Kanavan profiili</h3>
              {canEdit && !editing && <button className="btn btn-ghost btn-sm" onClick={startEdit}>Muokkaa</button>}
            </div>
            <div style={{ padding: '1.25rem 1.5rem' }}>
              {editing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {/* Julkaisutiheys */}
                  <div>
                    <label style={{ fontSize: '.72rem', fontWeight: 600, color: 'var(--t3)', display: 'block', marginBottom: '.4rem' }}>Julkaisutiheys</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem' }}>
                      {FREQ_OPTIONS.map(f => (
                        <button key={f.value} onClick={() => setEditFreq(f.value)} style={{
                          padding: '.4rem .75rem', borderRadius: 9999, fontSize: '.72rem', fontWeight: 600, cursor: 'pointer',
                          background: editFreq === f.value ? `${channel.color}15` : 'var(--elev)',
                          border: `1.5px solid ${editFreq === f.value ? channel.color : 'var(--border)'}`,
                          color: editFreq === f.value ? channel.color : 'var(--t2)',
                        }}>{f.label}</button>
                      ))}
                    </div>
                  </div>
                  {/* Aktiivisuustaso */}
                  <div>
                    <label style={{ fontSize: '.72rem', fontWeight: 600, color: 'var(--t3)', display: 'block', marginBottom: '.4rem' }}>Aktiivisuustaso</label>
                    <div style={{ display: 'flex', gap: '.35rem' }}>
                      {ACTIVITY_LEVELS.map(a => (
                        <button key={a.value} onClick={() => setEditActivity(a.value)} style={{
                          flex: 1, padding: '.5rem', borderRadius: 'var(--r)', fontSize: '.72rem', fontWeight: 600, cursor: 'pointer', textAlign: 'center',
                          background: editActivity === a.value ? `${a.color}15` : 'var(--elev)',
                          border: `1.5px solid ${editActivity === a.value ? a.color : 'var(--border)'}`,
                          color: editActivity === a.value ? a.color : 'var(--t2)',
                        }}>
                          <div>{a.label}</div>
                          <div style={{ fontSize: '.58rem', color: 'var(--t3)', marginTop: '.15rem' }}>{a.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Kuvaus */}
                  <div>
                    <label style={{ fontSize: '.72rem', fontWeight: 600, color: 'var(--t3)', display: 'block', marginBottom: '.4rem' }}>Kuvaus</label>
                    <textarea className="input textarea" value={editDesc} onChange={e => setEditDesc(e.target.value)} style={{ minHeight: 80 }} />
                  </div>
                  <div style={{ display: 'flex', gap: '.5rem' }}>
                    <button className="btn btn-primary btn-sm" onClick={saveEdit}>Tallenna</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Peruuta</button>
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: '.65rem', fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '.25rem' }}>Julkaisutiheys</div>
                      <div style={{ fontSize: '.92rem', fontWeight: 700, color: channel.color }}>{profile?.freq || channel.freq || '-'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '.65rem', fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '.25rem' }}>Aktiivisuus</div>
                      <div style={{ fontSize: '.92rem', fontWeight: 700, color: activity?.color }}>{activity?.label || '-'}</div>
                    </div>
                    {profile?.auds && (
                      <div>
                        <div style={{ fontSize: '.65rem', fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '.25rem' }}>Kohderyhmat</div>
                        <div style={{ display: 'flex', gap: '.2rem', flexWrap: 'wrap' }}>
                          {profile.auds.map((a: string, i: number) => <span key={i} style={{ fontSize: '.68rem', padding: '.15rem .4rem', borderRadius: 4, background: 'var(--elev)', color: 'var(--t2)', fontWeight: 600 }}>{a}</span>)}
                        </div>
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: '.85rem', color: 'var(--t2)', lineHeight: 1.7 }}>{profile?.desc || channel.desc || 'Ei kuvausta.'}</div>
                  {/* Mittarit */}
                  {profile?.metrics?.length > 0 && (
                    <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '.65rem', fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '.4rem' }}>Mittarit</div>
                      <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap' }}>
                        {profile.metrics.map((m: string, i: number) => <span key={i} style={{ fontSize: '.68rem', padding: '.2rem .5rem', borderRadius: 4, background: `${channel.color}10`, color: channel.color, fontWeight: 600 }}>{m}</span>)}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Kvartaalikalenteri: missa tama kanava esiintyy */}
          {channelMentions.length > 0 && (
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)' }}>
              <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.82rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.02em' }}>Vuosisuunnitelma</h3>
              </div>
              <div style={{ padding: '1.25rem 1.5rem' }}>
                {channelMentions.map((m: any, i: number) => {
                  const monthNames = ['', 'Tammi', 'Helmi', 'Maalis', 'Huhti', 'Touko', 'Kesa', 'Heina', 'Elo', 'Syys', 'Loka', 'Marras', 'Joulu'];
                  return (
                    <div key={i} style={{ display: 'flex', gap: '.75rem', padding: '.75rem', background: 'var(--elev)', border: '1px solid var(--border)', borderRadius: 'var(--r)', marginBottom: '.5rem' }}>
                      <div style={{ width: 36, height: 36, borderRadius: 'var(--r)', background: `${channel.color}12`, color: channel.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.6rem', fontWeight: 700, fontFamily: 'var(--font-display)', flexShrink: 0 }}>{monthNames[m.m]?.slice(0, 3)?.toUpperCase()}</div>
                      <div>
                        <div style={{ fontSize: '.78rem', fontWeight: 600 }}>{m.content}</div>
                        <div style={{ fontSize: '.62rem', color: 'var(--t3)', marginTop: '.15rem' }}>Q{m.q} / {m.aud}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Vastuuhenkilot */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.82rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.02em' }}>Vastuuhenkilot</h3>
            </div>
            <div style={{ padding: '1.25rem 1.5rem' }}>
              {allTeam.map((m: any, i: number) => {
                const isAssigned = (m.channels || []).includes(channel.name);
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: '.6rem', padding: '.6rem .75rem',
                    background: isAssigned ? `${channel.color}08` : 'transparent',
                    border: `1px solid ${isAssigned ? `${channel.color}30` : 'var(--border)'}`,
                    borderRadius: 'var(--r)', marginBottom: '.4rem',
                    cursor: canEdit ? 'pointer' : 'default',
                    transition: 'all .15s ease',
                  }} onClick={() => canEdit && toggleResponsible(m.id || m.name)}>
                    <div className="ava" style={{ width: 28, height: 28, fontSize: '.65rem', background: isAssigned ? channel.color : 'var(--elev)', flexShrink: 0 }}>{m.avatar}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '.82rem', fontWeight: isAssigned ? 700 : 500, color: isAssigned ? 'var(--t1)' : 'var(--t3)' }}>{m.name}</div>
                      <div style={{ fontSize: '.62rem', color: 'var(--t3)' }}>{m.role}</div>
                    </div>
                    {isAssigned && <span style={{ fontSize: '.6rem', padding: '.1rem .35rem', borderRadius: 4, background: `${channel.color}15`, color: channel.color, fontWeight: 700 }}>Vastuussa</span>}
                  </div>
                );
              })}
              {allTeam.length === 0 && <div style={{ fontSize: '.78rem', color: 'var(--t3)', fontStyle: 'italic' }}>Ei tiimijasenia</div>}
            </div>
          </div>

          {/* Linkki */}
          {channel.url && (
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)' }}>
              <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.82rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.02em' }}>Linkki</h3>
              </div>
              <div style={{ padding: '1.25rem 1.5rem' }}>
                <a href={channel.url} target="_blank" rel="noopener noreferrer" style={{
                  display: 'flex', alignItems: 'center', gap: '.6rem', padding: '.75rem 1rem',
                  background: `${channel.color}08`, border: `1px solid ${channel.color}25`,
                  borderRadius: 'var(--r)', textDecoration: 'none', color: channel.color,
                  fontSize: '.78rem', fontWeight: 600, transition: 'all .15s ease',
                }}>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{channel.url}</span>
                  <span>&rarr;</span>
                </a>
              </div>
            </div>
          )}

          {/* Kanavan tilastot */}
          {(() => {
            const stats = (org.channelStats || []).find?.((s: any) => s?.name === channel.name) ||
                          // Fallback: check imported stats
                          null;
            if (!stats) return null;
            return (
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)' }}>
                <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.82rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.02em' }}>Tilastot</h3>
                </div>
                <div style={{ padding: '1.25rem 1.5rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
                  {stats.followers && (
                    <div>
                      <div style={{ fontSize: '.62rem', color: 'var(--t3)', textTransform: 'uppercase' }}>Seuraajat</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: channel.color }}>{stats.followers.toLocaleString()}</div>
                    </div>
                  )}
                  {stats.reach && (
                    <div>
                      <div style={{ fontSize: '.62rem', color: 'var(--t3)', textTransform: 'uppercase' }}>Tavoittavuus</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: channel.color }}>{stats.reach}</div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </AppShell>
  );
}
