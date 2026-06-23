'use client';

/*
 * Julkinen esitesivu Aivovammaliitolle — osoite /avl/esitteet.
 * Pääsy salasanalla (sama kuin graafisella ohjeistolla), ei vaadi kirjautumista.
 * Listaa valmiit esitteet helposti ladattaviksi yhdestä paikasta.
 *
 * Reititys: literaali reitti app/avl/... (EI org-reitti [orgSlug]), jotta
 * org-layoutin auth-gate ei ohjaa kirjautumattomia /login-sivulle.
 *
 * Salasana on yksinkertainen porttikontrolli, ei tietoturva.
 */

import { useState, useEffect, FormEvent } from 'react';
import { AVL_PUBLIC_BROCHURES_PASSWORD } from '@/lib/avl-brand-assets';

const STORAGE_KEY = 'esitteet_unlocked';

interface PublicBrochure {
  filename: string;
  url: string;
  accessible: boolean;
  uploadedAt?: number;
}

export default function PublicBrochuresPage() {
  const [unlocked, setUnlocked] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState(false);
  const [brochures, setBrochures] = useState<PublicBrochure[] | null>(null);

  useEffect(() => {
    setHydrated(true);
    if (typeof window !== 'undefined' && sessionStorage.getItem(STORAGE_KEY) === '1') {
      setUnlocked(true);
    }
  }, []);

  useEffect(() => {
    if (!unlocked) return;
    fetch('/api/avl/esitteet')
      .then((r) => r.json())
      .then((d) => setBrochures(Array.isArray(d.brochures) ? d.brochures : []))
      .catch(() => setBrochures([]));
  }, [unlocked]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (input.trim().toLowerCase() === AVL_PUBLIC_BROCHURES_PASSWORD.toLowerCase()) {
      sessionStorage.setItem(STORAGE_KEY, '1');
      setUnlocked(true);
      setError(false);
    } else {
      setError(true);
    }
  };

  if (!hydrated) return null;

  if (!unlocked) {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: '2rem' }}>
        <div style={{ width: '100%', maxWidth: 420, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '2rem' }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 600, marginBottom: '.5rem' }}>Esitteet</h1>
          <p style={{ fontSize: '.88rem', color: 'var(--t2)', lineHeight: 1.55, marginBottom: '1.5rem' }}>
            Aivovammaliiton esitteet. Anna salasana päästäksesi lataamaan esitteet.
          </p>
          <form onSubmit={onSubmit}>
            <div className="field" style={{ marginBottom: '1rem' }}>
              <label htmlFor="pw">Salasana</label>
              <input
                id="pw"
                type="password"
                className="input"
                value={input}
                onChange={(e) => { setInput(e.target.value); setError(false); }}
                autoFocus
                style={{ fontSize: '1rem' }}
              />
              {error && (
                <div style={{ fontSize: '.78rem', color: 'var(--danger, #c0392b)', marginTop: '.4rem' }}>
                  Väärä salasana. Yritä uudestaan.
                </div>
              )}
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={!input.trim()}>
              Jatka
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header style={{ borderBottom: '1px solid var(--border)', padding: '1.25rem 1.5rem', background: 'var(--card)' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>
          Aivovammaliiton esitteet
        </h1>
        <p style={{ fontSize: '.78rem', color: 'var(--t3)', margin: '.25rem 0 0' }}>
          Lataa esitteet alta. Saavutettavat versiot on merkitty.
        </p>
      </header>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {brochures === null ? (
          <p style={{ color: 'var(--t3)' }}>Ladataan esitteitä…</p>
        ) : brochures.length === 0 ? (
          <p style={{ color: 'var(--t3)' }}>Ei vielä esitteitä.</p>
        ) : (
          brochures.map((b, i) => (
            <div
              key={i}
              style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
            >
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontWeight: 600, color: 'var(--t1)' }}>{b.filename}</div>
                {b.accessible && (
                  <div style={{ fontSize: 12, color: 'var(--green)', marginTop: 2 }}>Saavutettava (WCAG 2.1 AA)</div>
                )}
              </div>
              <a className="btn btn-primary" href={b.url} target="_blank" rel="noreferrer">
                Lataa
              </a>
            </div>
          ))
        )}
      </div>
    </main>
  );
}
