'use client';

// Käsikirjoitusmoduulin listanäkymä — käsikirjoitusten luonti, avaus ja poisto.
// Sisältö (elementit) elää avaimessa screenplay_doc_{id}; tämä näkymä käyttää
// vain screenplays-indeksiä, joten lista pysyy kevyenä.

import { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useOrgData } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { ScreenplayMeta, newId } from '@/lib/screenplay-shared';

export default function ScreenplayListSection() {
  const router = useRouter();
  const orgSlug = (useParams().orgSlug as string) || '';
  const { user, canEdit } = useAuth();
  const { toast } = useToast();

  const [screenplays, setScreenplays, loading] = useOrgData<ScreenplayMeta[]>('screenplays', []);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [logline, setLogline] = useState('');

  const active = useMemo(
    () => screenplays.filter(s => !s.deletedAt).sort((a, b) => b.updatedAt - a.updatedAt),
    [screenplays]
  );

  const create = () => {
    const t = title.trim();
    if (!t) { toast('Anna käsikirjoitukselle nimi', 'error'); return; }
    const id = newId('sp');
    const meta: ScreenplayMeta = {
      id,
      title: t,
      author: author.trim() || user?.displayName || '',
      logline: logline.trim() || undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setScreenplays(prev => [...prev, meta]);
    setTitle(''); setAuthor(''); setLogline(''); setShowForm(false);
    toast('Käsikirjoitus luotu', 'success');
    router.push(`/${orgSlug}/kasikirjoitus/${id}`);
  };

  const remove = (id: string) => {
    if (typeof window !== 'undefined' && !window.confirm('Siirretäänkö käsikirjoitus roskakoriin?')) return;
    setScreenplays(prev => prev.map(s => s.id === id ? { ...s, deletedAt: Date.now() } : s));
    toast('Käsikirjoitus siirretty roskakoriin', 'success');
  };

  const fmtDate = (ts: number) =>
    new Date(ts).toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric', year: 'numeric' });

  return (
    <div>
      {/* Toiminnot */}
      {canEdit && (
        <div style={{ marginBottom: '1.5rem' }}>
          {!showForm ? (
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Uusi käsikirjoitus</button>
          ) : (
            <div style={{
              background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: 'var(--rl)', padding: '1.25rem 1.5rem', maxWidth: 560,
            }}>
              <div style={{
                fontFamily: 'var(--font-display)', fontSize: '.72rem', letterSpacing: '.1em',
                textTransform: 'uppercase', color: 'var(--t2)', marginBottom: '.9rem',
              }}>Uusi käsikirjoitus</div>
              <input
                className="input" placeholder="Työnimi *" value={title} autoFocus
                onChange={e => setTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') create(); }}
                style={{ marginBottom: '.6rem' }}
              />
              <input
                className="input" placeholder="Käsikirjoittaja" value={author}
                onChange={e => setAuthor(e.target.value)}
                style={{ marginBottom: '.6rem' }}
              />
              <input
                className="input" placeholder="Logline (lyhyt kuvaus)" value={logline}
                onChange={e => setLogline(e.target.value)}
                style={{ marginBottom: '.9rem' }}
              />
              <div style={{ display: 'flex', gap: '.5rem' }}>
                <button className="btn btn-primary btn-sm" onClick={create}>Luo</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowForm(false)}>Peruuta</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div style={{ color: 'var(--t3)', padding: '2rem 0' }}>Ladataan…</div>
      ) : active.length === 0 ? (
        <div style={{
          border: '1px dashed var(--border)', borderRadius: 'var(--rl)',
          padding: '3rem 2rem', textAlign: 'center', color: 'var(--t3)',
        }}>
          Ei vielä käsikirjoituksia.
          {canEdit && ' Aloita luomalla ensimmäinen.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
          {active.map(s => (
            <div
              key={s.id}
              onClick={() => router.push(`/${orgSlug}/kasikirjoitus/${s.id}`)}
              style={{
                background: 'var(--card)', border: '1px solid var(--border)',
                borderRadius: 'var(--rl)', padding: '1.25rem 1.4rem', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', gap: '.4rem',
                transition: 'border-color .2s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--pri)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'; }}
            >
              <div style={{
                fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: '1rem',
                textTransform: 'uppercase', letterSpacing: '.03em', color: 'var(--t1)',
              }}>{s.title}</div>
              {s.author && <div style={{ fontSize: '.82rem', color: 'var(--t2)' }}>{s.author}</div>}
              {s.logline && (
                <div style={{ fontSize: '.82rem', color: 'var(--t3)', lineHeight: 1.5 }}>{s.logline}</div>
              )}
              <div style={{
                display: 'flex', gap: '.9rem', marginTop: '.5rem',
                fontSize: '.74rem', color: 'var(--t3)', fontFamily: 'var(--font-display)',
                letterSpacing: '.04em',
              }}>
                {typeof s.pageCount === 'number' && <span>{s.pageCount} SIVUA</span>}
                {typeof s.sceneCount === 'number' && <span>{s.sceneCount} KOHTAUSTA</span>}
                <span>MUOKATTU {fmtDate(s.updatedAt)}</span>
              </div>
              {canEdit && (
                <div style={{ marginTop: '.4rem' }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={e => { e.stopPropagation(); remove(s.id); }}
                    style={{ color: 'var(--red)' }}
                  >Poista</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
