'use client';

/*
 * Julkinen logogeneraattori Aivovammaliiton jäsenyhdistyksille.
 * Pääsy salasanalla, ei vaadi kirjautumista Momentumiin.
 *
 * Huom: salasana on tarkoituksellisesti yksinkertainen porttikontrolli, ei
 * tietoturva — clientissä oleva merkkijono on luettavissa bundle-koodista.
 * Logogeneraattorin sisältö ei ole salaista, vain rajoitettua jakelua varten.
 */

import { useState, useEffect, FormEvent } from 'react';
import dynamic from 'next/dynamic';

const LogoGeneratorSection = dynamic(() => import('@/components/sections/LogoGeneratorSection'), {
  ssr: false,
  loading: () => (
    <div style={{ padding: '2rem', textAlign: 'center', opacity: 0.5 }}>
      <div className="typing"><span /><span /><span /></div>
    </div>
  ),
});

const PASSWORD = 'AVL';
const STORAGE_KEY = 'logogeneraattori_unlocked';

export default function PublicLogoGeneratorPage() {
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
    if (input.trim().toLowerCase() === PASSWORD.toLowerCase()) {
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
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 600, marginBottom: '.5rem' }}>Logogeneraattori</h1>
          <p style={{ fontSize: '.88rem', color: 'var(--t2)', lineHeight: 1.55, marginBottom: '1.5rem' }}>
            Aivovammaliiton jäsenyhdistysten logogeneraattori. Anna salasana päästäksesi tekemään yhdistyksesi logon.
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

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header style={{ borderBottom: '1px solid var(--border)', padding: '1.25rem 1.5rem', background: 'var(--card)' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>
          Aivovammaliiton jäsenyhdistysten logogeneraattori
        </h1>
        <p style={{ fontSize: '.78rem', color: 'var(--t3)', margin: '.25rem 0 0' }}>
          Kirjoita yhdistyksen nimi, valitse sommittelu ja lataa logot.
        </p>
      </header>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '1.5rem' }}>
        <LogoGeneratorSection />
      </div>
    </main>
  );
}
