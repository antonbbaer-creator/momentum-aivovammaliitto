'use client';

import { useState } from 'react';
import AppShell from '@/components/AppShell';
import { useOrgData } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { useParams } from 'next/navigation';

interface Publication {
  id: string; title: string; body: string; channels: string[]; date: string | null;
  image: string | null; status: string; created: string; publishedChannels: string[];
  category?: string; // for LLFF: 'some' | 'press' | 'partner' | 'internal'
}

const platformLinks: Record<string, { url: string; post: string; color: string; ic: string }> = {
  'Facebook': { url: 'https://business.facebook.com/latest/home', post: 'https://business.facebook.com/latest/composer', color: '#1877F2', ic: 'FB' },
  'Instagram': { url: 'https://business.facebook.com/latest/home', post: 'https://business.facebook.com/latest/composer', color: '#E1306C', ic: 'IG' },
  'LinkedIn': { url: 'https://www.linkedin.com/feed/', post: 'https://www.linkedin.com/post/new', color: '#0A66C2', ic: 'LI' },
  'TikTok': { url: 'https://www.tiktok.com/creator#/upload', post: 'https://www.tiktok.com/creator#/upload', color: '#00f2ea', ic: 'TT' },
  'YouTube': { url: 'https://studio.youtube.com/', post: 'https://studio.youtube.com/', color: '#FF0000', ic: 'YT' },
  'Nettisivut': { url: '#', post: '#', color: '#34d399', ic: 'WW' },
  'Uutiskirje': { url: '#', post: '#', color: '#fb923c', ic: 'UK' },
};

// Category tabs for organizations that need them
const commsCategories = [
  { id: 'all', label: 'Kaikki' },
  { id: 'some', label: 'Sosiaalinen media' },
  { id: 'press', label: 'Lehdistö' },
  { id: 'partner', label: 'Kumppanit' },
  { id: 'internal', label: 'Sisäinen' },
];

export default function PublicationsPage() {
  const { canEdit } = useAuth();
  const { toast } = useToast();
  const params = useParams();
  const orgSlug = params.orgSlug as string;
  const [pubs, setPubs] = useOrgData<Publication[]>('publications', []);
  const [org] = useOrgData<any>('org', { channels: [] });
  const [mode, setMode] = useState<'list' | 'new' | 'detail'>('list');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Form state
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [channels, setChannels] = useState<string[]>([]);
  const [pubDate, setPubDate] = useState('');
  const [imgUrl, setImgUrl] = useState('');
  const [category, setCategory] = useState('some');

  const toggleCh = (name: string) => setChannels(p => p.includes(name) ? p.filter(c => c !== name) : [...p, name]);

  const createPub = () => {
    if (!title.trim() || !channels.length) { toast('Anna otsikko ja valitse kanava', 'error'); return; }
    const pub: Publication = {
      id: 'pub_' + Date.now(), title: title.trim(), body: body.trim(), channels, date: pubDate || null,
      image: imgUrl || null, status: 'draft', created: new Date().toISOString().slice(0, 10),
      publishedChannels: [], category,
    };
    setPubs(prev => [pub, ...prev]);
    setTitle(''); setBody(''); setChannels([]); setPubDate(''); setImgUrl('');
    setMode('list');
    toast('Julkaisu luotu', 'success');
  };

  const updatePub = (id: string, updates: Partial<Publication>) => setPubs(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  const deletePub = (id: string) => { setPubs(prev => prev.filter(p => p.id !== id)); setMode('list'); toast('Julkaisu poistettu', 'success'); };

  // Filtering
  let filtered = pubs;
  if (statusFilter !== 'all') filtered = filtered.filter(p => p.status === statusFilter);
  if (categoryFilter !== 'all') filtered = filtered.filter(p => (p.category || 'some') === categoryFilter);

  const detail = detailId ? pubs.find(p => p.id === detailId) : null;

  // ═══ DETAIL VIEW ═══
  if (mode === 'detail' && detail) {
    return (
      <AppShell title={detail.title} subtitle="Julkaisu">
        <button className="btn btn-ghost" onClick={() => setMode('list')} style={{ marginBottom: '1rem' }}>{'\u2190'} Takaisin</button>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '1.5rem' }}>
          <div>
            {/* Content */}
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.5rem', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '.75rem' }}>{detail.title}</h3>
              {detail.category && (
                <span style={{ fontSize: '.68rem', padding: '.15rem .5rem', borderRadius: 9999, background: 'rgba(5,107,159,.1)', color: 'var(--pri-l)', fontWeight: 600, marginBottom: '.75rem', display: 'inline-block' }}>
                  {commsCategories.find(c => c.id === detail.category)?.label || detail.category}
                </span>
              )}
              <p style={{ color: 'var(--t2)', lineHeight: 1.8, fontSize: '.9rem', whiteSpace: 'pre-wrap' }}>{detail.body || 'Ei sisältöä'}</p>
              <button className="btn btn-ghost btn-sm" style={{ marginTop: '.75rem' }} onClick={() => { navigator.clipboard.writeText(detail.body || ''); toast('Teksti kopioitu', 'success'); }}>Kopioi teksti</button>
            </div>
            {detail.image && <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1rem' }}>
              <img src={detail.image} alt="" style={{ width: '100%', borderRadius: 'var(--r)' }} />
            </div>}
          </div>

          {/* Sidebar */}
          <div>
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.25rem', marginBottom: '1rem' }}>
              <div className="field"><label>Tila</label>
                <select className="input" value={detail.status} onChange={e => updatePub(detail.id, { status: e.target.value })}>
                  <option value="draft">Luonnos</option><option value="ready">Valmis</option><option value="published">Julkaistu</option>
                </select>
              </div>
              {detail.date && <div style={{ fontSize: '.78rem', color: 'var(--t3)', marginBottom: '.5rem' }}>Julkaisupäivä: {detail.date}</div>}
            </div>

            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.25rem', marginBottom: '1rem' }}>
              <h4 style={{ fontSize: '.78rem', fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', marginBottom: '.75rem' }}>Kanavat</h4>
              {detail.channels.map(ch => {
                const pl = platformLinks[ch];
                const published = (detail.publishedChannels || []).includes(ch);
                return (
                  <div key={ch} style={{ display: 'flex', alignItems: 'center', gap: '.6rem', padding: '.6rem', background: 'var(--elev)', border: '1px solid var(--border)', borderRadius: 'var(--r)', marginBottom: '.4rem' }}>
                    <span style={{ fontSize: '.75rem', fontWeight: 700, color: pl?.color || 'var(--t1)', fontFamily: 'var(--font-display)' }}>{pl?.ic || ch[0]}</span>
                    <span style={{ flex: 1, fontSize: '.82rem' }}>{ch}</span>
                    {published ? (
                      <span style={{ fontSize: '.68rem', color: 'var(--green)', fontWeight: 600 }}>{'\u2713'} Julkaistu</span>
                    ) : (
                      <button className="btn btn-primary btn-sm" style={{ fontSize: '.7rem' }} onClick={() => {
                        navigator.clipboard.writeText(detail.body || '');
                        updatePub(detail.id, { publishedChannels: [...(detail.publishedChannels || []), ch] });
                        if (pl?.post && pl.post !== '#') window.open(pl.post, '_blank');
                        toast('Teksti kopioitu, kanava avattu', 'success');
                      }}>Julkaise</button>
                    )}
                  </div>
                );
              })}
            </div>
            <button className="btn btn-sm" onClick={() => deletePub(detail.id)} style={{ width: '100%', color: 'var(--red)', border: '1px solid rgba(239,107,107,.3)', background: 'rgba(239,107,107,.05)' }}>Poista julkaisu</button>
          </div>
        </div>
      </AppShell>
    );
  }

  // ═══ NEW PUBLICATION ═══
  if (mode === 'new') {
    return (
      <AppShell title="Uusi julkaisu" subtitle="Luo uusi sisältö">
        <button className="btn btn-ghost" onClick={() => setMode('list')} style={{ marginBottom: '1rem' }}>{'\u2190'} Takaisin</button>
        <div style={{ maxWidth: 600, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '2rem' }}>
          <div className="field"><label>Kategoria</label>
            <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
              {commsCategories.filter(c => c.id !== 'all').map(c => (
                <button key={c.id} className={`btn btn-sm ${category === c.id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setCategory(c.id)}>{c.label}</button>
              ))}
            </div>
          </div>
          <div className="field"><label>Otsikko *</label><input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Julkaisun otsikko" autoFocus /></div>
          <div className="field"><label>Sisältö</label><textarea className="input textarea-lg" value={body} onChange={e => setBody(e.target.value)} placeholder="Kirjoita julkaisun teksti..." /></div>
          <div className="field"><label>Kuvan URL</label><input className="input" value={imgUrl} onChange={e => setImgUrl(e.target.value)} placeholder="https://..." /></div>
          <div className="field"><label>Julkaisupäivä</label><input type="date" className="input" value={pubDate} onChange={e => setPubDate(e.target.value)} style={{ maxWidth: 200 }} /></div>
          <div className="field"><label>Kanavat *</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem' }}>
              {(org.channels || []).map((ch: any) => (
                <button key={ch.name} className={`btn btn-sm ${channels.includes(ch.name) ? 'btn-primary' : 'btn-secondary'}`} onClick={() => toggleCh(ch.name)}>{ch.name}</button>
              ))}
            </div>
          </div>
          <button className="btn btn-primary" onClick={createPub} disabled={!title.trim() || !channels.length}>Luo julkaisu</button>
        </div>
      </AppShell>
    );
  }

  // ═══ LIST VIEW ═══
  return (
    <AppShell title="Viestintä" subtitle={`${pubs.length} julkaisua`}>
      {/* Category tabs */}
      <div style={{ display: 'flex', background: 'var(--elev)', borderRadius: 'var(--r)', padding: '3px', marginBottom: '1rem', width: 'fit-content' }}>
        {commsCategories.map(c => (
          <button key={c.id} className={`cal-view-btn ${categoryFilter === c.id ? 'act' : ''}`} onClick={() => setCategoryFilter(c.id)}>
            {c.label} {c.id !== 'all' && <span style={{ opacity: .5, marginLeft: '.25rem' }}>({pubs.filter(p => c.id === 'all' || (p.category || 'some') === c.id).length})</span>}
          </button>
        ))}
      </div>

      {/* Status filter + new button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '.3rem' }}>
          {[{ k: 'all', l: 'Kaikki' }, { k: 'draft', l: 'Luonnokset' }, { k: 'ready', l: 'Valmiit' }, { k: 'published', l: 'Julkaistut' }].map(f => (
            <button key={f.k} className={`btn btn-ghost btn-sm ${statusFilter === f.k ? '' : ''}`} onClick={() => setStatusFilter(f.k)}
              style={{ fontWeight: statusFilter === f.k ? 700 : 400, color: statusFilter === f.k ? 'var(--pri-l)' : 'var(--t3)', borderBottom: statusFilter === f.k ? '2px solid var(--pri)' : '2px solid transparent', borderRadius: 0, padding: '.4rem .6rem' }}>
              {f.l}
            </button>
          ))}
        </div>
        {canEdit && <button className="btn btn-primary btn-sm" onClick={() => setMode('new')}>+ Uusi julkaisu</button>}
      </div>

      {/* Publications list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
        {filtered.map(pub => {
          const cat = commsCategories.find(c => c.id === (pub.category || 'some'));
          return (
            <div key={pub.id} onClick={() => { setDetailId(pub.id); setMode('detail'); }} style={{
              display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.25rem',
              background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--r)', cursor: 'pointer',
              transition: 'border-color .15s',
            }} onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--pri)')} onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                  <span style={{ fontSize: '.88rem', fontWeight: 600 }}>{pub.title}</span>
                  {cat && cat.id !== 'all' && (
                    <span style={{ fontSize: '.6rem', padding: '.1rem .4rem', borderRadius: 4, background: 'var(--elev)', color: 'var(--t3)', fontWeight: 600 }}>{cat.label}</span>
                  )}
                </div>
                <div style={{ fontSize: '.72rem', color: 'var(--t3)', marginTop: '.15rem' }}>
                  {pub.created}{pub.channels.length > 0 && ` \u00b7 ${pub.channels.join(', ')}`}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '.3rem', flexShrink: 0 }}>
                {pub.channels.slice(0, 3).map(ch => {
                  const pl = platformLinks[ch];
                  return <span key={ch} style={{ width: 24, height: 24, borderRadius: 4, background: `${pl?.color || '#666'}20`, color: pl?.color || '#666', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.55rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>{pl?.ic || ch[0]}</span>;
                })}
              </div>
              <span style={{
                fontSize: '.72rem', padding: '.2rem .6rem', borderRadius: 9999, fontWeight: 600,
                background: pub.status === 'published' ? 'rgba(45,212,160,.1)' : pub.status === 'ready' ? 'rgba(5,107,159,.1)' : 'var(--elev)',
                color: pub.status === 'published' ? 'var(--green)' : pub.status === 'ready' ? 'var(--pri-l)' : 'var(--t3)',
              }}>{pub.status === 'draft' ? 'Luonnos' : pub.status === 'ready' ? 'Valmis' : 'Julkaistu'}</span>
            </div>
          );
        })}
        {filtered.length === 0 && <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--t3)' }}>Ei julkaisuja. Luo ensimmäinen ylhäältä.</div>}
      </div>
    </AppShell>
  );
}
