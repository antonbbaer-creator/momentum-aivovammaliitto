'use client';

/*
 * Esitteet — Momentumin sisäinen sivu (AVL), vain valmiit ladattavat esitteet.
 * Sama sisältö kuin julkisella /avl/esitteet-sivulla: jokaisesta esitteestä
 * saavutettava nettiversio ja painoversio. Lista tulee AVL_BROCHURES-datasta
 * (lib/avl-brand-assets.ts) — uusi esite lisätään sinne yhdellä rivillä.
 *
 * PDF-saavutettavuustyökalu on erikseen /saavutettavuus-moduulissa.
 */

import { type CSSProperties } from 'react';
import { useParams } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { useToast } from '@/lib/toast';
import { AVL_BROCHURES, AVL_PUBLIC_BROCHURES_PATH, AVL_PUBLIC_BROCHURES_PASSWORD } from '@/lib/avl-brand-assets';

const card: CSSProperties = {
  background: 'var(--elev)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--rl)',
  padding: '1.75rem',
  marginBottom: '1.5rem',
};

const muted: CSSProperties = { color: 'var(--t2)', lineHeight: 1.6, fontSize: '0.95rem' };

export default function EsitteetPage() {
  const orgSlug = (useParams().orgSlug as string) || '';
  const { toast } = useToast();
  const brochures = orgSlug === 'avl' ? AVL_BROCHURES : [];

  // Jaa julkinen esitesivu: linkki + salasana leikepöydälle ja sivu uuteen välilehteen.
  const sharePublic = async () => {
    const url = `${window.location.origin}${AVL_PUBLIC_BROCHURES_PATH}`;
    try {
      await navigator.clipboard.writeText(`Aivovammaliiton esitteet:\n${url}\nSalasana: ${AVL_PUBLIC_BROCHURES_PASSWORD}`);
      toast('Esitesivun linkki ja salasana kopioitu', 'success');
    } catch {
      toast(`Esitesivun osoite: ${url} (salasana ${AVL_PUBLIC_BROCHURES_PASSWORD})`, 'success');
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <AppShell title="Esitteet" subtitle="Valmiit esitteet — saavutettava nettiversio ja painoversio samassa paikassa">
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <p style={{ ...muted, margin: 0, flex: '1 1 300px' }}>
              Jokaisesta esitteestä on kaksi versiota: saavutettava nettiversio sähköiseen jakoon ja painoversio painotaloa varten. Sitä mukaa kun uusia esitteitä valmistuu, ne päivittyvät tälle sivulle.
            </p>
            {orgSlug === 'avl' && (
              <button className="btn btn-primary" style={{ fontSize: '0.78rem', padding: '0.4rem 0.85rem', flexShrink: 0 }} onClick={sharePublic} title="Jaa julkinen esitesivu ilman tunnuksia">
                Jaa julkinen esitesivu
              </button>
            )}
          </div>

          {brochures.length === 0 ? (
            <p style={{ ...muted, fontSize: '0.85rem' }}>Ei vielä esitteitä.</p>
          ) : (
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              {brochures.map((b) => (
                <div
                  key={b.id}
                  style={{ border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1rem', background: 'var(--paper-l)', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}
                >
                  <div style={{ flex: '1 1 240px' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: '1.05rem', color: 'var(--t1)' }}>{b.title}</div>
                    {b.description && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--t3)', marginTop: 2 }}>{b.description}</div>
                    )}
                    {b.webPdf && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--green)', marginTop: 2 }}>Nettiversio on saavutettava (WCAG 2.1 AA)</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {b.webPdf && (
                      <a className="btn btn-primary" style={{ fontSize: '0.78rem', padding: '0.4rem 0.85rem' }} href={b.webPdf} target="_blank" rel="noopener noreferrer">
                        Nettiversio (PDF)
                      </a>
                    )}
                    {b.printPdf ? (
                      <a className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '0.4rem 0.85rem' }} href={b.printPdf} target="_blank" rel="noopener noreferrer">
                        Painoversio (PDF)
                      </a>
                    ) : (
                      <span style={{ fontSize: '0.78rem', color: 'var(--t3)', alignSelf: 'center' }}>Painoversio tulossa</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
