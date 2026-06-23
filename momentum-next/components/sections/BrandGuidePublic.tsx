'use client';

/*
 * Graafisen ohjeiston julkinen, vain luku -näkymä.
 * Käytetään salasanasuojatulla jakelusivulla (/graafinen-ohje) — ei vaadi
 * kirjautumista eikä Firestorea. Sisältö tulee staattisena BrandGuide-propina
 * (AVL:llä getDefaultBrandGuide('avl')). Ladattavat assetit ovat public/brand/avl/.
 */

import { useEffect, useState, type CSSProperties } from 'react';
import type { BrandGuide, BrandColor } from '@/lib/brand-guide-shared';
import { AVL_LOGO_VARIANTS, AVL_FONTS, AVL_GUIDE_PDF, AVL_GUIDE_TOTAL_PAGES } from '@/lib/avl-brand-assets';

const card: CSSProperties = {
  background: 'var(--elev)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--rl)',
  padding: '1.75rem',
  marginBottom: '1.5rem',
};

const sectionTitle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: '0.78rem',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'var(--t3)',
  marginBottom: '0.5rem',
};

const sectionHeading: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: '1.6rem',
  fontWeight: 500,
  color: 'var(--t1)',
  marginBottom: '1rem',
  letterSpacing: '-0.01em',
};

const muted: CSSProperties = { color: 'var(--t2)', lineHeight: 1.6, fontSize: '0.95rem' };

export default function BrandGuidePublic({ guide }: { guide: BrandGuide }) {
  return (
    <div style={{ maxWidth: 980, margin: '0 auto' }}>
      <PdfCard />
      <LogoCard description={guide.logo.description} />
      <ColorsCard colors={guide.colors} />
      <TypographyCard typography={guide.typography} />
      <ImageryCard imagery={guide.imagery} />
      <MaterialsCard materials={guide.materials} />
      <AccessibilityCard accessibility={guide.accessibility} />
      <ContactCard contact={guide.contact} />
    </div>
  );
}

/* ── Alkuperäinen PDF, sivuselain ───────────────── */

function navBtnStyle(side: 'left' | 'right', disabled: boolean): CSSProperties {
  return {
    position: 'absolute',
    top: '50%',
    [side]: 12,
    transform: 'translateY(-50%)',
    width: 44,
    height: 44,
    borderRadius: '50%',
    border: 'none',
    background: 'rgba(0,0,0,0.55)',
    color: '#fff',
    fontSize: '1.6rem',
    lineHeight: 1,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.3 : 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 4,
  } as CSSProperties;
}

function PdfCard() {
  const [page, setPage] = useState(1);
  const total = AVL_GUIDE_TOTAL_PAGES;
  const goPrev = () => setPage(p => Math.max(1, p - 1));
  const goNext = () => setPage(p => Math.min(total, p + 1));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight' || e.key === ' ') goNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.5rem' }}>
        <h2 style={{ ...sectionHeading, marginBottom: 0 }}>Graafinen ohjeisto</h2>
        <a className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '0.4rem 0.85rem' }} href={AVL_GUIDE_PDF} target="_blank" rel="noopener noreferrer" download>Lataa PDF</a>
      </div>

      <div
        onClick={(e) => {
          const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
          if (e.clientX - rect.left < rect.width / 2) goPrev(); else goNext();
        }}
        style={{ position: 'relative', width: '100%', aspectRatio: '3368 / 2382', background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--rl)', overflow: 'hidden', cursor: 'pointer', userSelect: 'none' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/brand/avl/pages/page-${pad(page)}.png`}
          alt={`Sivu ${page} / ${total}`}
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
          draggable={false}
        />
        <button onClick={(e) => { e.stopPropagation(); goPrev(); }} disabled={page === 1} aria-label="Edellinen sivu" style={navBtnStyle('left', page === 1)}>‹</button>
        <button onClick={(e) => { e.stopPropagation(); goNext(); }} disabled={page === total} aria-label="Seuraava sivu" style={navBtnStyle('right', page === total)}>›</button>
        <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.65)', color: '#fff', padding: '0.3rem 0.7rem', borderRadius: 999, fontSize: '0.78rem', fontFamily: 'var(--font-display)', letterSpacing: '0.05em' }}>
          {page} / {total}
        </div>
      </div>
    </div>
  );
}

/* ── Logo & tunnus ──────────────────────────────── */

function LogoCard({ description }: { description: string }) {
  return (
    <div style={card}>
      <div style={sectionTitle}>Logo & tunnus</div>
      <h2 style={sectionHeading}>Logo ja tunnus</h2>
      {description && <p style={muted}>{description}</p>}

      <div style={{ marginTop: '1.75rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)' }}>
        <div style={{ ...sectionTitle, marginBottom: '0.75rem' }}>Lataa logoversiot</div>
        <p style={{ ...muted, fontSize: '0.88rem', marginBottom: '1rem' }}>
          Aivovammaliiton viralliset logoversiot. Vaakalogo on ensisijainen versio; pystylogoa käytetään esimerkiksi kapeissa tiloissa kuten käyntikorteissa. Tunnus toimii yksinään erikoissovelluksissa tai graafisena elementtinä. Lataa vektoriversio (SVG) painotuotteisiin ja skaalautuvaan käyttöön, JPG nopeaan verkkokäyttöön.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem' }}>
          {AVL_LOGO_VARIANTS.map(v => (
            <div key={v.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '0.85rem', background: 'var(--paper-l)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ height: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', marginBottom: '0.6rem', borderRadius: 'var(--r)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={v.preview} alt={v.title} style={{ maxWidth: '85%', maxHeight: '85%', objectFit: 'contain' }} />
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: '0.95rem', color: 'var(--t1)', marginBottom: '0.6rem' }}>{v.title}</div>
              <div style={{ display: 'flex', gap: '0.4rem', marginTop: 'auto' }}>
                <a className="btn btn-primary" style={{ fontSize: '0.78rem', padding: '0.4rem 0.7rem', textAlign: 'center', flex: 1 }} href={v.svg} target="_blank" rel="noopener noreferrer" download>SVG</a>
                <a className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '0.4rem 0.7rem', textAlign: 'center', flex: 1 }} href={v.jpg} target="_blank" rel="noopener noreferrer" download>JPG</a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Värit ──────────────────────────────────────── */

function ColorsCard({ colors }: { colors: BrandGuide['colors'] }) {
  return (
    <div style={card}>
      <div style={sectionTitle}>Väripaletti</div>
      <h2 style={sectionHeading}>Värit</h2>
      {colors.description && <p style={{ ...muted, marginBottom: '1.25rem' }}>{colors.description}</p>}

      {(['primary', 'accent'] as const).map(group => (
        colors[group].length > 0 && (
          <div key={group} style={{ marginTop: '1.5rem' }}>
            <div style={{ ...sectionTitle, marginBottom: '0.75rem' }}>{group === 'primary' ? 'Päävärit' : 'Lisävärit'}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem' }}>
              {colors[group].map(c => <ColorSwatch key={c.id} color={c} />)}
            </div>
          </div>
        )
      ))}
    </div>
  );
}

function ColorSwatch({ color }: { color: BrandColor }) {
  const [copied, setCopied] = useState(false);
  const copyHex = async () => {
    if (!color.hex) return;
    try {
      await navigator.clipboard.writeText(color.hex);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch { /* selain voi estää clipboardin — ei kriittinen */ }
  };

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--rl)', overflow: 'hidden', background: 'var(--paper-l)' }}>
      <div style={{ height: 90, background: color.hex || '#ccc', borderBottom: '1px solid var(--border)' }} />
      <div style={{ padding: '0.85rem' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.95rem', color: 'var(--t1)', marginBottom: '0.2rem' }}>{color.name}</div>
        {color.theme && <div style={{ fontSize: '0.72rem', color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>{color.theme}</div>}
        <button
          type="button"
          onClick={copyHex}
          title="Kopioi värikoodi"
          style={{ fontFamily: 'var(--font-display)', fontSize: '0.85rem', color: 'var(--t1)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '0.25rem 0.55rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
        >
          <span>{color.hex}</span>
          <span style={{ fontSize: '0.68rem', color: copied ? 'var(--pri)' : 'var(--t3)' }}>{copied ? 'Kopioitu' : 'Kopioi'}</span>
        </button>
        {color.cmyk && <div style={{ fontSize: '0.72rem', color: 'var(--t3)', marginTop: '0.4rem' }}>{color.cmyk}</div>}
        {color.rgb && <div style={{ fontSize: '0.72rem', color: 'var(--t3)' }}>{color.rgb}</div>}
        {color.description && <div style={{ fontSize: '0.78rem', color: 'var(--t2)', marginTop: '0.5rem', lineHeight: 1.5 }}>{color.description}</div>}
      </div>
    </div>
  );
}

/* ── Typografia ─────────────────────────────────── */

function TypographyCard({ typography }: { typography: BrandGuide['typography'] }) {
  return (
    <div style={card}>
      <div style={sectionTitle}>Typografia</div>
      <h2 style={sectionHeading}>Typografia</h2>
      {typography.description && <p style={{ ...muted, marginBottom: '1.25rem' }}>{typography.description}</p>}

      <div style={{ display: 'grid', gap: '1rem', marginTop: '1rem' }}>
        {typography.fonts.map(f => (
          <div key={f.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.25rem', background: 'var(--paper-l)' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
              {f.role === 'heading' ? 'Otsikko' : 'Leipäteksti'}
            </div>
            <div style={{ fontFamily: `'${f.family}', var(--font-display)`, fontSize: '2.2rem', fontWeight: 500, color: 'var(--t1)', marginBottom: '0.2rem', letterSpacing: '-0.01em' }}>
              {f.family}
            </div>
            <div style={{ fontFamily: `'${f.family}', var(--font)`, fontSize: '0.95rem', color: 'var(--t2)', marginBottom: '0.75rem' }}>
              AaBbCc 1234567890 Ää Öö
            </div>
            {f.weights && <div style={{ fontSize: '0.85rem', color: 'var(--t2)', marginBottom: '0.3rem' }}><strong>Leikkaukset:</strong> {f.weights}</div>}
            {f.source && <div style={{ fontSize: '0.85rem', color: 'var(--t2)', marginBottom: '0.3rem' }}><strong>Lähde:</strong> {f.source}</div>}
            {f.fallback && <div style={{ fontSize: '0.85rem', color: 'var(--t2)', marginBottom: '0.5rem' }}><strong>Korvaava fontti:</strong> {f.fallback}</div>}
            {f.description && <p style={{ ...muted, marginTop: '0.75rem' }}>{f.description}</p>}
          </div>
        ))}
      </div>

      <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)' }}>
        <div style={{ ...sectionTitle, marginBottom: '0.75rem' }}>Lataa fontit</div>
        <div style={{ display: 'grid', gap: '1rem' }}>
          {AVL_FONTS.map(f => (
            <div key={f.family} style={{ border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1rem', background: 'var(--paper-l)', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ flex: '1 1 240px' }}>
                <div style={{ fontFamily: `'${f.family}', var(--font-display)`, fontWeight: 500, fontSize: '1.1rem', color: 'var(--t1)', marginBottom: '0.25rem' }}>{f.family}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--t3)' }}>Leikkaukset: {f.weights.join(', ')}</div>
                {f.note && <p style={{ ...muted, fontSize: '0.82rem', margin: '0.4rem 0 0' }}>{f.note}</p>}
              </div>
              <a className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '0.45rem 0.9rem' }} href={f.bundle} target="_blank" rel="noopener noreferrer" download>Lataa kaikki (ZIP)</a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Kuvamaailma ────────────────────────────────── */

function ImageryCard({ imagery }: { imagery: BrandGuide['imagery'] }) {
  if (!imagery.length) return null;
  return (
    <div style={card}>
      <div style={sectionTitle}>Kuvamaailma</div>
      <h2 style={sectionHeading}>Kuvamaailma</h2>
      <div style={{ display: 'grid', gap: '1rem' }}>
        {imagery.map(b => (
          <div key={b.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.25rem', background: 'var(--paper-l)' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: '1.15rem', color: 'var(--t1)', marginBottom: '0.5rem' }}>{b.title}</div>
            <p style={muted}>{b.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Materiaalit ────────────────────────────────── */

function MaterialsCard({ materials }: { materials: BrandGuide['materials'] }) {
  if (!materials.length) return null;
  return (
    <div style={card}>
      <div style={sectionTitle}>Materiaalit & pohjat</div>
      <h2 style={sectionHeading}>Materiaalit</h2>
      <div style={{ display: 'grid', gap: '1rem' }}>
        {materials.map(m => (
          <div key={m.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.25rem', background: 'var(--paper-l)' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: '1.15rem', color: 'var(--t1)', marginBottom: '0.5rem' }}>{m.title}</div>
            <p style={muted}>{m.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Saavutettavuus ─────────────────────────────── */

function AccessibilityCard({ accessibility }: { accessibility: BrandGuide['accessibility'] }) {
  if (!accessibility.description && !accessibility.points.length) return null;
  return (
    <div style={card}>
      <div style={sectionTitle}>Saavutettavuus</div>
      <h2 style={sectionHeading}>Saavutettavuus</h2>
      {accessibility.description && <p style={{ ...muted, marginBottom: '1rem' }}>{accessibility.description}</p>}
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.5rem' }}>
        {accessibility.points.map((p, i) => (
          <li key={i} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', padding: '0.6rem 0.85rem', background: 'var(--paper-l)', borderRadius: 'var(--r)' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--pri)', minWidth: 24 }}>{i + 1}.</span>
            <span style={{ flex: 1, color: 'var(--t1)', lineHeight: 1.55 }}>{p}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Yhteystiedot ───────────────────────────────── */

function ContactCard({ contact }: { contact: BrandGuide['contact'] }) {
  if (!contact.organization && !contact.phone && !contact.email && !contact.notes) return null;
  return (
    <div style={card}>
      <div style={sectionTitle}>Yhteystiedot</div>
      <h2 style={sectionHeading}>Materiaalien tilaus</h2>
      <div style={{ display: 'grid', gap: '0.4rem' }}>
        {contact.organization && <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: 'var(--t1)' }}>{contact.organization}</div>}
        {contact.phone && <div style={muted}><strong>Puhelin:</strong> {contact.phone}</div>}
        {contact.email && <div style={muted}><strong>Sähköposti:</strong> <a href={`mailto:${contact.email}`} style={{ color: 'var(--pri)' }}>{contact.email}</a></div>}
        {contact.notes && <p style={{ ...muted, marginTop: '0.5rem' }}>{contact.notes}</p>}
      </div>
    </div>
  );
}
