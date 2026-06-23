'use client';

/*
 * Julkinen graafinen ohjeisto Aivovammaliitolle — osoite /avl/graafinenohje.
 * Pääsy salasanalla, ei vaadi kirjautumista Momentumiin — sama idea kuin
 * logogeneraattorissa: sisältöä voi jakaa myös ihmisille joilla ei ole tunnuksia.
 *
 * HUOM reititys: tämä on tarkoituksella literaali reitti (app/avl/...), EI
 * org-reitti app/[orgSlug]/. Org-reittien layout (app/[orgSlug]/layout.tsx)
 * ohjaa kirjautumattomat /login-sivulle; literaali reitti välttää sen ja pysyy
 * julkisena. Muut /avl/* polut resolvoituvat yhä [orgSlug]-puuhun normaalisti.
 *
 * Salasana on tarkoituksellisesti yksinkertainen porttikontrolli, ei
 * tietoturva — clientissä oleva merkkijono on luettavissa bundle-koodista.
 */

import { useState, useEffect, FormEvent } from 'react';
import dynamic from 'next/dynamic';
import { getDefaultBrandGuide } from '@/lib/brand-guide-shared';
import { AVL_PUBLIC_GUIDE_PASSWORD } from '@/lib/avl-brand-assets';

const BrandGuidePublic = dynamic(() => import('@/components/sections/BrandGuidePublic'), {
  ssr: false,
  loading: () => (
    <div style={{ padding: '2rem', textAlign: 'center', opacity: 0.5 }}>
      <div className="typing"><span /><span /><span /></div>
    </div>
  ),
});

const STORAGE_KEY = 'graafinenohje_unlocked';

export default function PublicBrandGuidePage() {
  const [unlocked, setUnlocked] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    setHydrated(true);
    if (typeof window !== 'undefined' && sessionStorage.getItem(STORAGE_KEY) === '1') {
      setUnlocked(true);
    }
  }, []);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (input.trim().toLowerCase() === AVL_PUBLIC_GUIDE_PASSWORD.toLowerCase()) {
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
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 600, marginBottom: '.5rem' }}>Graafinen ohjeisto</h1>
          <p style={{ fontSize: '.88rem', color: 'var(--t2)', lineHeight: 1.55, marginBottom: '1.5rem' }}>
            Aivovammaliiton graafinen ohjeisto. Anna salasana päästäksesi selaamaan ohjeistoa ja lataamaan logot ja fontit.
          </p>
          <form onSubmit={onSubmit}>
            <div className="field" style={{ marginBottom: '1rem' }}>
              <label htmlFor="pw">Salasana</label>
              <input
                id="pw"
                type="password"
                className="input"
                value={input}
                onChange={e => { setInput(e.target.value); setError(false); }}
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

  const guide = getDefaultBrandGuide('avl');

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header style={{ borderBottom: '1px solid var(--border)', padding: '1.25rem 1.5rem', background: 'var(--card)' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>
          {guide.intro.title || 'Aivovammaliiton graafinen ohjeisto'}
        </h1>
        <p style={{ fontSize: '.78rem', color: 'var(--t3)', margin: '.25rem 0 0' }}>
          {guide.intro.subtitle || 'Brändi, värit, typografia ja kuvamaailma'}
          {guide.intro.lastUpdated ? ` — päivitetty ${guide.intro.lastUpdated}` : ''}
        </p>
      </header>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '1.5rem' }}>
        <BrandGuidePublic guide={guide} />
      </div>
    </main>
  );
}
