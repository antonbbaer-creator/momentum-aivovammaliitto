'use client';

import { useState } from 'react';
import { useOrgData } from '@/lib/firestore';

const platformLinks: Record<string, string> = {
  Facebook: 'https://business.facebook.com/latest/home',
  Instagram: 'https://business.facebook.com/latest/home',
  LinkedIn: 'https://www.linkedin.com/company/',
  TikTok: 'https://www.tiktok.com/creator#/portal',
  YouTube: 'https://studio.youtube.com/',
};

export default function ChannelsSection() {
  const [org] = useOrgData<any>('org', { channels: [] });
  const [channelStats, setChannelStats] = useOrgData<any[]>('channelStats', []);
  const [selected, setSelected] = useState<string | null>(null);
  const [followers, setFollowers] = useState('');
  const [reach, setReach] = useState('');

  const channels = org.channels || [];
  const selectedCh = selected ? channels.find((c: any) => c.name === selected) : null;
  const selectedStats = selected ? channelStats.find((s: any) => s.name === selected) : null;

  const saveStats = () => {
    const existing = channelStats.find((s: any) => s.name === selected);
    if (existing) {
      setChannelStats(prev => prev.map(s => s.name === selected ? { ...s, followers: parseInt(followers) || 0, reach, lastUpdated: new Date().toISOString().slice(0, 10) } : s));
    } else {
      setChannelStats(prev => [...prev, { name: selected, followers: parseInt(followers) || 0, reach, lastUpdated: new Date().toISOString().slice(0, 10) }]);
    }
  };

  if (selectedCh) {
    return (
      <>
        <button className="btn btn-ghost" onClick={() => setSelected(null)} style={{ marginBottom: '1rem' }}>{'←'} Takaisin kanaviin</button>

        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.5rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ width: 48, height: 48, borderRadius: 'var(--r)', background: selectedCh.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '1rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>{selectedCh.ic || selectedCh.name[0]}</div>
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{selectedCh.name}</h3>
            </div>
            {platformLinks[selectedCh.name] && (
              <a href={platformLinks[selectedCh.name]} target="_blank" rel="noopener" className="btn btn-primary btn-sm">Avaa hallintapaneeli {'↗'}</a>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.25rem', textAlign: 'center' }}>
            <div style={{ fontSize: '.7rem', color: 'var(--t3)', textTransform: 'uppercase', marginBottom: '.5rem' }}>Seuraajat</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>{selectedStats?.followers?.toLocaleString() || '-'}</div>
          </div>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.25rem', textAlign: 'center' }}>
            <div style={{ fontSize: '.7rem', color: 'var(--t3)', textTransform: 'uppercase', marginBottom: '.5rem' }}>Tavoittavuus</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>{selectedStats?.reach || '-'}</div>
          </div>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.25rem', textAlign: 'center' }}>
            <div style={{ fontSize: '.7rem', color: 'var(--t3)', textTransform: 'uppercase', marginBottom: '.5rem' }}>Päivitetty</div>
            <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--t2)' }}>{selectedStats?.lastUpdated || '-'}</div>
          </div>
        </div>

        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.88rem', fontWeight: 500, textTransform: 'uppercase' }}>Päivitä tilastot</h3>
          </div>
          <div style={{ display: 'flex', gap: '.75rem', alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: 1, marginBottom: 0 }}>
              <label>Seuraajat</label>
              <input className="input" type="number" value={followers} onChange={e => setFollowers(e.target.value)} placeholder={String(selectedStats?.followers || 0)} />
            </div>
            <div className="field" style={{ flex: 1, marginBottom: 0 }}>
              <label>Tavoittavuus</label>
              <input className="input" value={reach} onChange={e => setReach(e.target.value)} placeholder={selectedStats?.reach || '0'} />
            </div>
            <button className="btn btn-primary" onClick={saveStats}>Tallenna</button>
          </div>
          <p style={{ fontSize: '.75rem', color: 'var(--t3)', marginTop: '.75rem' }}>
            Kun Meta Business Suite -yhteys on aktiivinen, tilastot päivittyvät automaattisesti.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <div style={{ fontSize: '.75rem', color: 'var(--t3)', marginBottom: '.75rem' }}>{channels.length} kanavaa</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
        {channels.map((ch: any) => {
          const stats = channelStats.find((s: any) => s.name === ch.name);
          return (
            <div key={ch.name} onClick={() => setSelected(ch.name)} style={{
              display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.25rem',
              background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', cursor: 'pointer', transition: 'border-color .15s',
            }} onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-l)')} onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
              <div style={{ width: 40, height: 40, borderRadius: 'var(--r)', background: ch.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '.85rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>{ch.ic || ch.name[0]}</div>
              <div style={{ flex: 1 }}><div style={{ fontSize: '.9rem', fontWeight: 600 }}>{ch.name}</div></div>
              {stats && <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '.85rem', fontWeight: 700 }}>{stats.followers?.toLocaleString() || '-'}</div>
                <div style={{ fontSize: '.65rem', color: 'var(--t3)' }}>seuraajaa</div>
              </div>}
              <span style={{ color: 'var(--t3)' }}>{'›'}</span>
            </div>
          );
        })}
        {channels.length === 0 && <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--t3)' }}>Ei kanavia. Lisää ne Asetuksissa.</div>}
      </div>

      <div style={{ marginTop: '1.5rem', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.25rem' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.82rem', fontWeight: 500, marginBottom: '.75rem', textTransform: 'uppercase' }}>Pikayhteydet</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '.6rem' }}>
          {Object.entries(platformLinks).map(([name, url]) => (
            <a key={name} href={url} target="_blank" rel="noopener" className="btn btn-ghost" style={{ textAlign: 'center', padding: '.75rem', textDecoration: 'none', display: 'block', fontSize: '.8rem' }}>{name} {'↗'}</a>
          ))}
        </div>
      </div>
    </>
  );
}
