'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useParams } from 'next/navigation';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/lib/auth';
import { useOrgData } from '@/lib/firestore';
import { useToast } from '@/lib/toast';
import { storage } from '@/lib/firebase';
import {
  type BrandGuide,
  type BrandColor,
  type BrandFont,
  type BrandAsset,
  type BrandImageryBlock,
  type BrandMaterial,
  EMPTY_BRAND_GUIDE,
  brandId,
  getDefaultBrandGuide,
} from '@/lib/brand-guide-shared';
import { AVL_LOGO_VARIANTS, AVL_FONTS, AVL_GUIDE_PDF, AVL_GUIDE_TOTAL_PAGES, AVL_PUBLIC_GUIDE_PATH, AVL_PUBLIC_GUIDE_PASSWORD } from '@/lib/avl-brand-assets';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

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

const headerRow: CSSProperties = { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.5rem' };

const editBtn: CSSProperties = { fontSize: '0.78rem', padding: '0.4rem 0.85rem' };

function isImage(mime?: string): boolean {
  return !!mime && mime.startsWith('image/');
}

function fileExtLabel(asset: BrandAsset): string {
  const m = asset.url.split('?')[0].match(/\.([a-z0-9]+)$/i);
  return (m?.[1] || asset.mimeType?.split('/')[1] || 'file').toUpperCase();
}

export default function GraafinenOhjeistoPage() {
  const orgSlug = (useParams().orgSlug as string) || '';
  const { canEdit, activeOrg } = useAuth();
  const { toast } = useToast();
  const defaults = useMemo(() => getDefaultBrandGuide(orgSlug), [orgSlug]);
  const [guide, setGuide, loading] = useOrgData<BrandGuide>('brandGuide', defaults);

  // Pidetään kortti-kohtainen edit-tila yhdessä Setissä — yksinkertaisempaa kuin per-sektio booleanit.
  const [editing, setEditing] = useState<Set<string>>(new Set());
  const isEditing = (id: string) => editing.has(id);
  const toggleEdit = (id: string) => {
    setEditing(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const stopEditing = (id: string) => {
    setEditing(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  // Patch-helperit — useOrgData persistoi automaattisesti debounced.
  const patch = (updater: (g: BrandGuide) => BrandGuide) => setGuide(prev => updater(prev || EMPTY_BRAND_GUIDE));

  // Storage-upload: brandGuide/{orgId}/{section}/{timestamp}_{filename}
  const uploadAsset = async (file: File, section: string): Promise<BrandAsset | null> => {
    if (!activeOrg) { toast('Ei aktiivista organisaatiota', 'error'); return null; }
    if (file.size > MAX_FILE_SIZE) { toast(`Tiedosto liian suuri (max ${MAX_FILE_SIZE / 1024 / 1024} MB)`, 'error'); return null; }
    const path = `brandGuide/${activeOrg}/${section}/${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
    const storageRef = ref(storage, path);
    try {
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      return {
        id: brandId('asset'),
        name: file.name,
        url,
        storagePath: path,
        mimeType: file.type,
      };
    } catch (e) {
      console.error('upload failed', e);
      toast('Tiedoston lataaminen epäonnistui', 'error');
      return null;
    }
  };

  const removeStored = async (asset: BrandAsset) => {
    if (asset.storagePath) {
      try { await deleteObject(ref(storage, asset.storagePath)); } catch { /* ignore — voi olla jo poistettu */ }
    }
  };

  if (loading) {
    return (
      <AppShell title="Graafinen ohjeisto" subtitle="">
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--t3)' }}>
          <div className="typing"><span /><span /><span /></div>
        </div>
      </AppShell>
    );
  }

  const isAvl = orgSlug === 'avl';

  return (
    <AppShell title={guide.intro.title || 'Graafinen ohjeisto'} subtitle={guide.intro.subtitle || ''}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>

        {/* AVL — alkuperäinen PDF luettavissa kokonaisuudessaan */}
        {isAvl && <AvlOriginalPdfCard />}

        {/* LOGO */}
        <LogoCard
          guide={guide}
          editing={isEditing('logo')}
          canEdit={canEdit}
          onToggleEdit={() => toggleEdit('logo')}
          onStop={() => stopEditing('logo')}
          patch={patch}
          uploadAsset={uploadAsset}
          removeStored={removeStored}
          isAvl={isAvl}
        />

        {/* COLORS */}
        <ColorsCard
          guide={guide}
          editing={isEditing('colors')}
          canEdit={canEdit}
          onToggleEdit={() => toggleEdit('colors')}
          onStop={() => stopEditing('colors')}
          patch={patch}
        />

        {/* TYPOGRAPHY */}
        <TypographyCard
          guide={guide}
          editing={isEditing('typography')}
          canEdit={canEdit}
          onToggleEdit={() => toggleEdit('typography')}
          onStop={() => stopEditing('typography')}
          patch={patch}
          isAvl={isAvl}
        />

      </div>
    </AppShell>
  );
}

/* ─────────────────────────────────────────────── */
/* INTRO                                          */
/* ─────────────────────────────────────────────── */

interface CardProps {
  guide: BrandGuide;
  editing: boolean;
  canEdit: boolean;
  onToggleEdit: () => void;
  onStop: () => void;
  patch: (updater: (g: BrandGuide) => BrandGuide) => void;
}

function EditButtons({ canEdit, editing, onToggleEdit, onStop }: { canEdit: boolean; editing: boolean; onToggleEdit: () => void; onStop: () => void }) {
  if (!canEdit) return null;
  return editing ? (
    <button className="btn btn-primary" style={editBtn} onClick={onStop}>Tallenna</button>
  ) : (
    <button className="btn btn-secondary" style={editBtn} onClick={onToggleEdit}>Muokkaa</button>
  );
}

function IntroCard({ guide, editing, canEdit, onToggleEdit, onStop, patch }: CardProps) {
  return (
    <div style={card}>
      <div style={headerRow}>
        <div>
          <div style={sectionTitle}>Esittely</div>
          <h2 style={sectionHeading}>{guide.intro.title || 'Graafinen ohjeisto'}</h2>
        </div>
        <EditButtons canEdit={canEdit} editing={editing} onToggleEdit={onToggleEdit} onStop={onStop} />
      </div>

      {editing ? (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          <div className="field">
            <label>Otsikko</label>
            <input className="input" value={guide.intro.title} onChange={e => patch(g => ({ ...g, intro: { ...g.intro, title: e.target.value } }))} />
          </div>
          <div className="field">
            <label>Alaotsikko</label>
            <input className="input" value={guide.intro.subtitle || ''} onChange={e => patch(g => ({ ...g, intro: { ...g.intro, subtitle: e.target.value } }))} />
          </div>
          <div className="field">
            <label>Päivitetty viimeksi</label>
            <input className="input" placeholder="esim. 27.4.2026" value={guide.intro.lastUpdated || ''} onChange={e => patch(g => ({ ...g, intro: { ...g.intro, lastUpdated: e.target.value } }))} />
          </div>
        </div>
      ) : (
        <>
          {guide.intro.subtitle && <p style={{ ...muted, marginBottom: '0.5rem' }}>{guide.intro.subtitle}</p>}
          {guide.intro.lastUpdated && (
            <p style={{ fontSize: '0.78rem', color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Päivitetty {guide.intro.lastUpdated}
            </p>
          )}
        </>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────── */
/* LOGO                                           */
/* ─────────────────────────────────────────────── */

interface AssetCardProps extends CardProps {
  uploadAsset: (file: File, section: string) => Promise<BrandAsset | null>;
  removeStored: (a: BrandAsset) => Promise<void>;
}

interface LogoCardProps extends AssetCardProps {
  isAvl?: boolean;
}

function AvlOriginalPdfCard() {
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const total = AVL_GUIDE_TOTAL_PAGES;
  const goPrev = () => setPage(p => Math.max(1, p - 1));
  const goNext = () => setPage(p => Math.min(total, p + 1));

  // Jaa julkinen ohjeisto: avaa salasanasuojattu sivu uuteen välilehteen ja
  // kopioi linkki + salasana leikepöydälle helppoa jakamista varten.
  const sharePublic = async () => {
    const url = `${window.location.origin}${AVL_PUBLIC_GUIDE_PATH}`;
    try {
      await navigator.clipboard.writeText(`Aivovammaliiton graafinen ohjeisto:\n${url}\nSalasana: ${AVL_PUBLIC_GUIDE_PASSWORD}`);
      toast('Julkinen linkki ja salasana kopioitu', 'success');
    } catch {
      toast(`Julkinen osoite: ${url} (salasana ${AVL_PUBLIC_GUIDE_PASSWORD})`, 'success');
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

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
      <div style={headerRow}>
        <h2 style={{ ...sectionHeading, marginBottom: 0 }}>Graafinen ohjeisto</h2>
        <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
          <button className="btn btn-primary" style={editBtn} onClick={sharePublic} title="Jaa julkinen ohjeisto ilman tunnuksia">Jaa julkinen ohjeisto</button>
          <a className="btn btn-secondary" style={editBtn} href={AVL_GUIDE_PDF} target="_blank" rel="noopener noreferrer" download>Lataa PDF</a>
        </div>
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

        {/* Edellinen */}
        <button
          onClick={(e) => { e.stopPropagation(); goPrev(); }}
          disabled={page === 1}
          aria-label="Edellinen sivu"
          style={navBtnStyle('left', page === 1)}
        >‹</button>

        {/* Seuraava */}
        <button
          onClick={(e) => { e.stopPropagation(); goNext(); }}
          disabled={page === total}
          aria-label="Seuraava sivu"
          style={navBtnStyle('right', page === total)}
        >›</button>

        {/* Sivunumero */}
        <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.65)', color: '#fff', padding: '0.3rem 0.7rem', borderRadius: 999, fontSize: '0.78rem', fontFamily: 'var(--font-display)', letterSpacing: '0.05em' }}>
          {page} / {total}
        </div>
      </div>
    </div>
  );
}

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

function AvlLogoVariants() {
  return (
    <div style={{ marginTop: '1.75rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)' }}>
      <div style={{ ...sectionTitle, marginBottom: '0.75rem' }}>Lataa logoversiot</div>
      <p style={{ ...muted, fontSize: '0.88rem', marginBottom: '1rem' }}>
        Aivovammaliiton viralliset logoversiot PNG-kuvina. Vaakalogo on ensisijainen versio; pystylogoa käytetään esimerkiksi kapeissa tiloissa kuten käyntikorteissa. Tunnus toimii yksinään erikoissovelluksissa tai graafisena elementtinä. Valitse läpinäkyvä tausta esimerkiksi värilliselle pohjalle, valkoinen tausta valmiiksi valkoisena kuvana.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem' }}>
        {AVL_LOGO_VARIANTS.map(v => (
          <div key={v.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '0.85rem', background: 'var(--paper-l)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ height: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', marginBottom: '0.6rem', borderRadius: 'var(--r)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={v.pngTransparent} alt={v.title} style={{ maxWidth: '85%', maxHeight: '85%', objectFit: 'contain' }} />
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: '0.95rem', color: 'var(--t1)', marginBottom: '0.6rem' }}>{v.title}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: 'auto' }}>
              <a className="btn btn-primary" style={{ fontSize: '0.78rem', padding: '0.4rem 0.7rem', textAlign: 'center' }} href={v.pngTransparent} target="_blank" rel="noopener noreferrer" download>
                Läpinäkyvä tausta (PNG)
              </a>
              <a className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '0.4rem 0.7rem', textAlign: 'center' }} href={v.pngWhite} target="_blank" rel="noopener noreferrer" download>
                Valkoinen tausta (PNG)
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AvlFontDownloads() {
  return (
    <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)' }}>
      <div style={{ ...sectionTitle, marginBottom: '0.75rem' }}>Lataa fontit</div>
      <div style={{ display: 'grid', gap: '1rem' }}>
        {AVL_FONTS.map(f => (
          <div key={f.family} style={{ border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1rem', background: 'var(--paper-l)', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ flex: '1 1 240px' }}>
              <div style={{ fontFamily: `'${f.family}', var(--font-display)`, fontWeight: 500, fontSize: '1.1rem', color: 'var(--t1)', marginBottom: '0.25rem' }}>{f.family}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--t3)', marginBottom: f.note ? '0.4rem' : 0 }}>
                Leikkaukset: {f.weights.join(', ')}
              </div>
              {f.note && <p style={{ ...muted, fontSize: '0.82rem', margin: 0 }}>{f.note}</p>}
            </div>
            <a className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '0.45rem 0.9rem' }} href={f.bundle} target="_blank" rel="noopener noreferrer" download>
              Lataa kaikki (ZIP)
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

function LogoCard({ guide, editing, canEdit, onToggleEdit, onStop, patch, uploadAsset, removeStored, isAvl }: LogoCardProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    const newOnes: BrandAsset[] = [];
    for (const f of Array.from(files)) {
      const a = await uploadAsset(f, 'logo');
      if (a) newOnes.push(a);
    }
    if (newOnes.length) patch(g => ({ ...g, logo: { ...g.logo, assets: [...g.logo.assets, ...newOnes] } }));
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const removeAsset = async (a: BrandAsset) => {
    await removeStored(a);
    patch(g => ({ ...g, logo: { ...g.logo, assets: g.logo.assets.filter(x => x.id !== a.id) } }));
  };

  return (
    <div style={card}>
      <div style={headerRow}>
        <div>
          <div style={sectionTitle}>Logo & tunnus</div>
          <h2 style={sectionHeading}>Logo ja tunnus</h2>
        </div>
        <EditButtons canEdit={canEdit} editing={editing} onToggleEdit={onToggleEdit} onStop={onStop} />
      </div>

      {editing ? (
        <textarea
          className="input textarea"
          rows={5}
          value={guide.logo.description}
          onChange={e => patch(g => ({ ...g, logo: { ...g.logo, description: e.target.value } }))}
          placeholder="Kuvaa logon ja tunnuksen käyttöä..."
        />
      ) : (
        <p style={muted}>{guide.logo.description || (canEdit ? 'Lisää kuvaus painikkeesta Muokkaa.' : 'Ei kuvausta.')}</p>
      )}

      {/* AVL — viralliset logoversiot (aina näkyvissä) */}
      {isAvl && <AvlLogoVariants />}

      {/* Logo-tiedostot */}
      <div style={{ marginTop: '1.5rem' }}>
        <div style={{ ...sectionTitle, marginBottom: '0.75rem' }}>Logo-tiedostot</div>
        {guide.logo.assets.length === 0 && (
          <p style={{ ...muted, fontSize: '0.85rem' }}>Ei ladattuja logo-tiedostoja.</p>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem' }}>
          {guide.logo.assets.map(a => (
            <div key={a.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '0.75rem', background: 'var(--paper-l)', position: 'relative' }}>
              {isImage(a.mimeType) ? (
                <div style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', marginBottom: '0.5rem', borderRadius: 'var(--r)' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.url} alt={a.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                </div>
              ) : (
                <div style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--paper-d)', marginBottom: '0.5rem', borderRadius: 'var(--r)', fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--t2)' }}>
                  {fileExtLabel(a)}
                </div>
              )}
              <div style={{ fontSize: '0.78rem', color: 'var(--t1)', wordBreak: 'break-word', marginBottom: '0.4rem' }}>{a.name}</div>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <a className="btn btn-ghost" style={{ fontSize: '0.72rem', padding: '0.3rem 0.5rem', flex: 1, textAlign: 'center' }} href={a.url} target="_blank" rel="noopener noreferrer" download>Lataa</a>
                {canEdit && editing && (
                  <button className="btn btn-ghost" style={{ fontSize: '0.72rem', padding: '0.3rem 0.5rem', color: 'var(--red)' }} onClick={() => removeAsset(a)}>Poista</button>
                )}
              </div>
            </div>
          ))}
        </div>
        {canEdit && editing && (
          <div style={{ marginTop: '0.75rem' }}>
            <input ref={fileRef} type="file" multiple accept="image/*,.pdf,.svg,.eps,.ai" style={{ display: 'none' }} onChange={e => handleUpload(e.target.files)} />
            <button className="btn btn-secondary" style={editBtn} disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? 'Ladataan…' : '+ Lisää tiedosto'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────── */
/* COLORS                                         */
/* ─────────────────────────────────────────────── */

function ColorsCard({ guide, editing, canEdit, onToggleEdit, onStop, patch }: CardProps) {
  const updateColor = (group: 'primary' | 'accent', id: string, field: keyof BrandColor, value: string) => {
    patch(g => ({
      ...g,
      colors: {
        ...g.colors,
        [group]: g.colors[group].map(c => (c.id === id ? { ...c, [field]: value } : c)),
      },
    }));
  };
  const addColor = (group: 'primary' | 'accent') => {
    patch(g => ({
      ...g,
      colors: {
        ...g.colors,
        [group]: [...g.colors[group], { id: brandId('clr'), name: 'Uusi väri', hex: '#000000' }],
      },
    }));
  };
  const removeColor = (group: 'primary' | 'accent', id: string) => {
    patch(g => ({
      ...g,
      colors: {
        ...g.colors,
        [group]: g.colors[group].filter(c => c.id !== id),
      },
    }));
  };

  return (
    <div style={card}>
      <div style={headerRow}>
        <div>
          <div style={sectionTitle}>Väripaletti</div>
          <h2 style={sectionHeading}>Värit</h2>
        </div>
        <EditButtons canEdit={canEdit} editing={editing} onToggleEdit={onToggleEdit} onStop={onStop} />
      </div>

      {editing ? (
        <textarea
          className="input textarea"
          rows={3}
          value={guide.colors.description || ''}
          onChange={e => patch(g => ({ ...g, colors: { ...g.colors, description: e.target.value } }))}
          placeholder="Kuvaus värien käytöstä..."
        />
      ) : (
        guide.colors.description && <p style={{ ...muted, marginBottom: '1.25rem' }}>{guide.colors.description}</p>
      )}

      {(['primary', 'accent'] as const).map(group => (
        <div key={group} style={{ marginTop: '1.5rem' }}>
          <div style={{ ...sectionTitle, marginBottom: '0.75rem' }}>{group === 'primary' ? 'Päävärit' : 'Lisävärit'}</div>
          {guide.colors[group].length === 0 && (
            <p style={{ ...muted, fontSize: '0.85rem' }}>Ei {group === 'primary' ? 'päävärejä' : 'lisävärejä'}.</p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem' }}>
            {guide.colors[group].map(c => (
              <ColorSwatch
                key={c.id}
                color={c}
                editing={editing}
                onChange={(field, value) => updateColor(group, c.id, field, value)}
                onRemove={() => removeColor(group, c.id)}
              />
            ))}
          </div>
          {canEdit && editing && (
            <button className="btn btn-secondary" style={{ ...editBtn, marginTop: '0.75rem' }} onClick={() => addColor(group)}>
              + Lisää {group === 'primary' ? 'pääväri' : 'lisäväri'}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function ColorSwatch({ color, editing, onChange, onRemove }: { color: BrandColor; editing: boolean; onChange: (field: keyof BrandColor, value: string) => void; onRemove: () => void }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const copyHex = async () => {
    if (!color.hex) return;
    try {
      await navigator.clipboard.writeText(color.hex);
      setCopied(true);
      toast(`Kopioitu ${color.hex}`, 'success');
      setTimeout(() => setCopied(false), 1400);
    } catch {
      toast('Kopiointi epäonnistui', 'error');
    }
  };

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--rl)', overflow: 'hidden', background: 'var(--paper-l)' }}>
      <div style={{ height: 90, background: color.hex || '#ccc' }} />
      <div style={{ padding: '0.85rem' }}>
        {editing ? (
          <>
            <input className="input" style={{ marginBottom: '0.4rem', fontWeight: 600 }} value={color.name} onChange={e => onChange('name', e.target.value)} placeholder="Nimi" />
            <input className="input" style={{ marginBottom: '0.4rem', fontFamily: 'var(--font-display)' }} value={color.hex} onChange={e => onChange('hex', e.target.value)} placeholder="#000000" />
            <input className="input" style={{ marginBottom: '0.4rem', fontSize: '0.78rem' }} value={color.cmyk || ''} onChange={e => onChange('cmyk', e.target.value)} placeholder="CMYK" />
            <input className="input" style={{ marginBottom: '0.4rem', fontSize: '0.78rem' }} value={color.rgb || ''} onChange={e => onChange('rgb', e.target.value)} placeholder="RGB" />
            <input className="input" style={{ marginBottom: '0.4rem', fontSize: '0.78rem' }} value={color.theme || ''} onChange={e => onChange('theme', e.target.value)} placeholder="Teema (esim. Aivovammat)" />
            <textarea className="input" style={{ minHeight: 60, fontSize: '0.78rem' }} value={color.description || ''} onChange={e => onChange('description', e.target.value)} placeholder="Kuvaus" />
            <button className="btn btn-ghost" style={{ fontSize: '0.72rem', padding: '0.3rem 0', marginTop: '0.4rem', color: 'var(--red)' }} onClick={onRemove}>Poista</button>
          </>
        ) : (
          <>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.95rem', color: 'var(--t1)', marginBottom: '0.2rem' }}>{color.name}</div>
            {color.theme && <div style={{ fontSize: '0.72rem', color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>{color.theme}</div>}
            <button
              type="button"
              onClick={copyHex}
              title="Kopioi värikoodi"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '0.85rem',
                color: 'var(--t1)',
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r)',
                padding: '0.25rem 0.55rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              <span>{color.hex}</span>
              <span style={{ fontSize: '0.68rem', color: copied ? 'var(--pri)' : 'var(--t3)' }}>{copied ? 'Kopioitu' : 'Kopioi'}</span>
            </button>
            {color.cmyk && <div style={{ fontSize: '0.72rem', color: 'var(--t3)', marginTop: '0.4rem' }}>{color.cmyk}</div>}
            {color.rgb && <div style={{ fontSize: '0.72rem', color: 'var(--t3)' }}>{color.rgb}</div>}
            {color.description && <div style={{ fontSize: '0.78rem', color: 'var(--t2)', marginTop: '0.5rem', lineHeight: 1.5 }}>{color.description}</div>}
          </>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────── */
/* TYPOGRAPHY                                     */
/* ─────────────────────────────────────────────── */

function TypographyCard({ guide, editing, canEdit, onToggleEdit, onStop, patch, isAvl }: CardProps & { isAvl?: boolean }) {
  const updateFont = (id: string, field: keyof BrandFont, value: string) => {
    patch(g => ({
      ...g,
      typography: {
        ...g.typography,
        fonts: g.typography.fonts.map(f => (f.id === id ? { ...f, [field]: value } : f)),
      },
    }));
  };
  const addFont = () => {
    patch(g => ({
      ...g,
      typography: {
        ...g.typography,
        fonts: [...g.typography.fonts, { id: brandId('fnt'), role: 'body', family: 'Uusi fontti' }],
      },
    }));
  };
  const removeFont = (id: string) => {
    patch(g => ({ ...g, typography: { ...g.typography, fonts: g.typography.fonts.filter(f => f.id !== id) } }));
  };

  return (
    <div style={card}>
      <div style={headerRow}>
        <div>
          <div style={sectionTitle}>Typografia</div>
          <h2 style={sectionHeading}>Typografia</h2>
        </div>
        <EditButtons canEdit={canEdit} editing={editing} onToggleEdit={onToggleEdit} onStop={onStop} />
      </div>

      {editing ? (
        <textarea className="input textarea" rows={3} value={guide.typography.description || ''}
          onChange={e => patch(g => ({ ...g, typography: { ...g.typography, description: e.target.value } }))}
          placeholder="Yleinen kuvaus typografiasta..." />
      ) : (
        guide.typography.description && <p style={{ ...muted, marginBottom: '1.25rem' }}>{guide.typography.description}</p>
      )}

      <div style={{ display: 'grid', gap: '1rem', marginTop: '1rem' }}>
        {guide.typography.fonts.map(f => (
          <div key={f.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.25rem', background: 'var(--paper-l)' }}>
            {editing ? (
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                <select className="input" value={f.role} onChange={e => updateFont(f.id, 'role', e.target.value)}>
                  <option value="heading">Otsikko</option>
                  <option value="body">Leipäteksti</option>
                </select>
                <input className="input" value={f.family} onChange={e => updateFont(f.id, 'family', e.target.value)} placeholder="Fontin nimi (esim. Outfit)" />
                <input className="input" value={f.source || ''} onChange={e => updateFont(f.id, 'source', e.target.value)} placeholder="Lähde (esim. Google Fonts)" />
                <input className="input" value={f.weights || ''} onChange={e => updateFont(f.id, 'weights', e.target.value)} placeholder="Leikkaukset (esim. Light, Regular, Medium…)" />
                <input className="input" value={f.fallback || ''} onChange={e => updateFont(f.id, 'fallback', e.target.value)} placeholder="Korvaava fontti" />
                <textarea className="input" style={{ minHeight: 80 }} value={f.description || ''} onChange={e => updateFont(f.id, 'description', e.target.value)} placeholder="Kuvaus" />
                <button className="btn btn-ghost" style={{ fontSize: '0.72rem', padding: '0.3rem 0', alignSelf: 'flex-start', color: 'var(--red)' }} onClick={() => removeFont(f.id)}>Poista fontti</button>
              </div>
            ) : (
              <>
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
              </>
            )}
          </div>
        ))}
      </div>

      {canEdit && editing && (
        <button className="btn btn-secondary" style={{ ...editBtn, marginTop: '0.75rem' }} onClick={addFont}>+ Lisää fontti</button>
      )}

      {isAvl && <AvlFontDownloads />}
    </div>
  );
}

/* ─────────────────────────────────────────────── */
/* IMAGERY                                        */
/* ─────────────────────────────────────────────── */

function ImageryCard({ guide, editing, canEdit, onToggleEdit, onStop, patch, uploadAsset, removeStored }: AssetCardProps) {
  const updateBlock = (id: string, field: keyof BrandImageryBlock, value: string) => {
    patch(g => ({ ...g, imagery: g.imagery.map(b => (b.id === id ? { ...b, [field]: value } : b)) }));
  };
  const addBlock = () => {
    patch(g => ({ ...g, imagery: [...g.imagery, { id: brandId('img'), title: 'Uusi blokki', description: '', examples: [] }] }));
  };
  const removeBlock = async (id: string) => {
    const block = guide.imagery.find(b => b.id === id);
    if (block) for (const a of block.examples) await removeStored(a);
    patch(g => ({ ...g, imagery: g.imagery.filter(b => b.id !== id) }));
  };
  const handleUpload = async (blockId: string, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newOnes: BrandAsset[] = [];
    for (const f of Array.from(files)) {
      const a = await uploadAsset(f, `imagery_${blockId}`);
      if (a) newOnes.push(a);
    }
    if (newOnes.length) {
      patch(g => ({ ...g, imagery: g.imagery.map(b => (b.id === blockId ? { ...b, examples: [...b.examples, ...newOnes] } : b)) }));
    }
  };
  const removeExample = async (blockId: string, asset: BrandAsset) => {
    await removeStored(asset);
    patch(g => ({ ...g, imagery: g.imagery.map(b => (b.id === blockId ? { ...b, examples: b.examples.filter(x => x.id !== asset.id) } : b)) }));
  };

  return (
    <div style={card}>
      <div style={headerRow}>
        <div>
          <div style={sectionTitle}>Kuvamaailma</div>
          <h2 style={sectionHeading}>Kuvamaailma</h2>
        </div>
        <EditButtons canEdit={canEdit} editing={editing} onToggleEdit={onToggleEdit} onStop={onStop} />
      </div>

      <div style={{ display: 'grid', gap: '1rem' }}>
        {guide.imagery.map(b => (
          <ImageryBlockView
            key={b.id}
            block={b}
            editing={editing}
            canEdit={canEdit}
            onChange={(field, value) => updateBlock(b.id, field, value)}
            onRemove={() => removeBlock(b.id)}
            onUpload={files => handleUpload(b.id, files)}
            onRemoveExample={a => removeExample(b.id, a)}
          />
        ))}
      </div>

      {canEdit && editing && (
        <button className="btn btn-secondary" style={{ ...editBtn, marginTop: '0.75rem' }} onClick={addBlock}>+ Lisää blokki</button>
      )}
    </div>
  );
}

function ImageryBlockView({ block, editing, canEdit, onChange, onRemove, onUpload, onRemoveExample }:
  { block: BrandImageryBlock; editing: boolean; canEdit: boolean;
    onChange: (field: keyof BrandImageryBlock, value: string) => void;
    onRemove: () => void;
    onUpload: (files: FileList | null) => Promise<void>;
    onRemoveExample: (a: BrandAsset) => Promise<void>;
  }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const handle = async (files: FileList | null) => {
    setUploading(true);
    await onUpload(files);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.25rem', background: 'var(--paper-l)' }}>
      {editing ? (
        <>
          <input className="input" style={{ fontWeight: 600, marginBottom: '0.5rem' }} value={block.title} onChange={e => onChange('title', e.target.value)} />
          <textarea className="input textarea" rows={4} value={block.description} onChange={e => onChange('description', e.target.value)} />
          <button className="btn btn-ghost" style={{ fontSize: '0.72rem', padding: '0.3rem 0', marginTop: '0.4rem', color: 'var(--red)' }} onClick={onRemove}>Poista blokki</button>
        </>
      ) : (
        <>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: '1.15rem', color: 'var(--t1)', marginBottom: '0.5rem' }}>{block.title}</div>
          <p style={muted}>{block.description}</p>
        </>
      )}

      {(block.examples.length > 0 || (canEdit && editing)) && (
        <div style={{ marginTop: '1rem' }}>
          <div style={{ ...sectionTitle, marginBottom: '0.5rem' }}>Esimerkit</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.5rem' }}>
            {block.examples.map(a => (
              <div key={a.id} style={{ position: 'relative', border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden', background: '#fff', aspectRatio: '1 / 1' }}>
                {isImage(a.mimeType) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.url} alt={a.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.78rem', color: 'var(--t2)' }}>{fileExtLabel(a)}</div>
                )}
                {canEdit && editing && (
                  <button onClick={() => onRemoveExample(a)} style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', fontSize: '0.7rem' }} title="Poista">×</button>
                )}
              </div>
            ))}
          </div>
          {canEdit && editing && (
            <div style={{ marginTop: '0.5rem' }}>
              <input ref={fileRef} type="file" multiple accept="image/*" style={{ display: 'none' }} onChange={e => handle(e.target.files)} />
              <button className="btn btn-ghost" style={{ fontSize: '0.78rem' }} disabled={uploading} onClick={() => fileRef.current?.click()}>
                {uploading ? 'Ladataan…' : '+ Lisää kuva'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────── */
/* MATERIALS                                      */
/* ─────────────────────────────────────────────── */

function MaterialsCard({ guide, editing, canEdit, onToggleEdit, onStop, patch, uploadAsset, removeStored }: AssetCardProps) {
  const updateMat = (id: string, field: keyof BrandMaterial, value: string) => {
    patch(g => ({ ...g, materials: g.materials.map(m => (m.id === id ? { ...m, [field]: value } : m)) }));
  };
  const addMat = () => {
    patch(g => ({ ...g, materials: [...g.materials, { id: brandId('mat'), title: 'Uusi materiaali', description: '', files: [] }] }));
  };
  const removeMat = async (id: string) => {
    const mat = guide.materials.find(m => m.id === id);
    if (mat) for (const a of mat.files) await removeStored(a);
    patch(g => ({ ...g, materials: g.materials.filter(m => m.id !== id) }));
  };
  const handleUpload = async (matId: string, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newOnes: BrandAsset[] = [];
    for (const f of Array.from(files)) {
      const a = await uploadAsset(f, `materials_${matId}`);
      if (a) newOnes.push(a);
    }
    if (newOnes.length) patch(g => ({ ...g, materials: g.materials.map(m => (m.id === matId ? { ...m, files: [...m.files, ...newOnes] } : m)) }));
  };
  const removeFile = async (matId: string, asset: BrandAsset) => {
    await removeStored(asset);
    patch(g => ({ ...g, materials: g.materials.map(m => (m.id === matId ? { ...m, files: m.files.filter(x => x.id !== asset.id) } : m)) }));
  };

  return (
    <div style={card}>
      <div style={headerRow}>
        <div>
          <div style={sectionTitle}>Materiaalit & pohjat</div>
          <h2 style={sectionHeading}>Materiaalit</h2>
        </div>
        <EditButtons canEdit={canEdit} editing={editing} onToggleEdit={onToggleEdit} onStop={onStop} />
      </div>

      <div style={{ display: 'grid', gap: '1rem' }}>
        {guide.materials.map(m => (
          <MaterialView
            key={m.id}
            material={m}
            editing={editing}
            canEdit={canEdit}
            onChange={(field, value) => updateMat(m.id, field, value)}
            onRemove={() => removeMat(m.id)}
            onUpload={files => handleUpload(m.id, files)}
            onRemoveFile={a => removeFile(m.id, a)}
          />
        ))}
      </div>

      {canEdit && editing && (
        <button className="btn btn-secondary" style={{ ...editBtn, marginTop: '0.75rem' }} onClick={addMat}>+ Lisää materiaalityyppi</button>
      )}
    </div>
  );
}

function MaterialView({ material, editing, canEdit, onChange, onRemove, onUpload, onRemoveFile }:
  { material: BrandMaterial; editing: boolean; canEdit: boolean;
    onChange: (field: keyof BrandMaterial, value: string) => void;
    onRemove: () => void;
    onUpload: (files: FileList | null) => Promise<void>;
    onRemoveFile: (a: BrandAsset) => Promise<void>;
  }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const handle = async (files: FileList | null) => {
    setUploading(true);
    await onUpload(files);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.25rem', background: 'var(--paper-l)' }}>
      {editing ? (
        <>
          <input className="input" style={{ fontWeight: 600, marginBottom: '0.5rem' }} value={material.title} onChange={e => onChange('title', e.target.value)} />
          <textarea className="input textarea" rows={4} value={material.description} onChange={e => onChange('description', e.target.value)} />
          <button className="btn btn-ghost" style={{ fontSize: '0.72rem', padding: '0.3rem 0', marginTop: '0.4rem', color: 'var(--red)' }} onClick={onRemove}>Poista materiaalityyppi</button>
        </>
      ) : (
        <>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: '1.15rem', color: 'var(--t1)', marginBottom: '0.5rem' }}>{material.title}</div>
          <p style={muted}>{material.description}</p>
        </>
      )}

      {(material.files.length > 0 || (canEdit && editing)) && (
        <div style={{ marginTop: '1rem' }}>
          <div style={{ ...sectionTitle, marginBottom: '0.5rem' }}>Tiedostot</div>
          {material.files.length === 0 && <p style={{ ...muted, fontSize: '0.85rem' }}>Ei ladattuja tiedostoja.</p>}
          <div style={{ display: 'grid', gap: '0.4rem' }}>
            {material.files.map(a => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', background: 'var(--paper-d)', borderRadius: 'var(--r)' }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.78rem', color: 'var(--t2)', minWidth: 50 }}>{fileExtLabel(a)}</span>
                <span style={{ flex: 1, fontSize: '0.85rem', color: 'var(--t1)', wordBreak: 'break-word' }}>{a.name}</span>
                <a className="btn btn-ghost" style={{ fontSize: '0.72rem', padding: '0.3rem 0.6rem' }} href={a.url} target="_blank" rel="noopener noreferrer" download>Lataa</a>
                {canEdit && editing && (
                  <button className="btn btn-ghost" style={{ fontSize: '0.72rem', padding: '0.3rem 0.6rem', color: 'var(--red)' }} onClick={() => onRemoveFile(a)}>Poista</button>
                )}
              </div>
            ))}
          </div>
          {canEdit && editing && (
            <div style={{ marginTop: '0.5rem' }}>
              <input ref={fileRef} type="file" multiple style={{ display: 'none' }} onChange={e => handle(e.target.files)} />
              <button className="btn btn-ghost" style={{ fontSize: '0.78rem' }} disabled={uploading} onClick={() => fileRef.current?.click()}>
                {uploading ? 'Ladataan…' : '+ Lisää tiedosto'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────── */
/* ACCESSIBILITY                                  */
/* ─────────────────────────────────────────────── */

function AccessibilityCard({ guide, editing, canEdit, onToggleEdit, onStop, patch }: CardProps) {
  const updatePoint = (idx: number, value: string) => {
    patch(g => ({ ...g, accessibility: { ...g.accessibility, points: g.accessibility.points.map((p, i) => (i === idx ? value : p)) } }));
  };
  const addPoint = () => patch(g => ({ ...g, accessibility: { ...g.accessibility, points: [...g.accessibility.points, ''] } }));
  const removePoint = (idx: number) => patch(g => ({ ...g, accessibility: { ...g.accessibility, points: g.accessibility.points.filter((_, i) => i !== idx) } }));

  return (
    <div style={card}>
      <div style={headerRow}>
        <div>
          <div style={sectionTitle}>Saavutettavuus</div>
          <h2 style={sectionHeading}>Saavutettavuus</h2>
        </div>
        <EditButtons canEdit={canEdit} editing={editing} onToggleEdit={onToggleEdit} onStop={onStop} />
      </div>

      {editing ? (
        <textarea className="input textarea" rows={3} value={guide.accessibility.description || ''}
          onChange={e => patch(g => ({ ...g, accessibility: { ...g.accessibility, description: e.target.value } }))}
          placeholder="Kuvaus saavutettavuusperiaatteista..." />
      ) : (
        guide.accessibility.description && <p style={{ ...muted, marginBottom: '1rem' }}>{guide.accessibility.description}</p>
      )}

      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.5rem' }}>
        {guide.accessibility.points.map((p, i) => (
          <li key={i} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', padding: '0.6rem 0.85rem', background: 'var(--paper-l)', borderRadius: 'var(--r)' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--pri)', minWidth: 24 }}>{i + 1}.</span>
            {editing ? (
              <>
                <input className="input" style={{ flex: 1 }} value={p} onChange={e => updatePoint(i, e.target.value)} />
                <button className="btn btn-ghost" style={{ fontSize: '0.72rem', padding: '0.3rem 0.5rem', color: 'var(--red)' }} onClick={() => removePoint(i)}>×</button>
              </>
            ) : (
              <span style={{ flex: 1, color: 'var(--t1)', lineHeight: 1.55 }}>{p}</span>
            )}
          </li>
        ))}
      </ul>

      {canEdit && editing && (
        <button className="btn btn-secondary" style={{ ...editBtn, marginTop: '0.75rem' }} onClick={addPoint}>+ Lisää kohta</button>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────── */
/* CONTACT                                        */
/* ─────────────────────────────────────────────── */

function ContactCard({ guide, editing, canEdit, onToggleEdit, onStop, patch }: CardProps) {
  const updateField = (field: keyof BrandGuide['contact'], value: string) => {
    patch(g => ({ ...g, contact: { ...g.contact, [field]: value } }));
  };
  return (
    <div style={card}>
      <div style={headerRow}>
        <div>
          <div style={sectionTitle}>Yhteystiedot</div>
          <h2 style={sectionHeading}>Materiaalien tilaus</h2>
        </div>
        <EditButtons canEdit={canEdit} editing={editing} onToggleEdit={onToggleEdit} onStop={onStop} />
      </div>

      {editing ? (
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          <input className="input" placeholder="Organisaatio" value={guide.contact.organization || ''} onChange={e => updateField('organization', e.target.value)} />
          <input className="input" placeholder="Puhelin" value={guide.contact.phone || ''} onChange={e => updateField('phone', e.target.value)} />
          <input className="input" placeholder="Sähköposti" value={guide.contact.email || ''} onChange={e => updateField('email', e.target.value)} />
          <textarea className="input textarea" rows={3} placeholder="Lisätiedot" value={guide.contact.notes || ''} onChange={e => updateField('notes', e.target.value)} />
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '0.4rem' }}>
          {guide.contact.organization && <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: 'var(--t1)' }}>{guide.contact.organization}</div>}
          {guide.contact.phone && <div style={muted}><strong>Puhelin:</strong> {guide.contact.phone}</div>}
          {guide.contact.email && (
            <div style={muted}><strong>Sähköposti:</strong> <a href={`mailto:${guide.contact.email}`} style={{ color: 'var(--pri)' }}>{guide.contact.email}</a></div>
          )}
          {guide.contact.notes && <p style={{ ...muted, marginTop: '0.5rem' }}>{guide.contact.notes}</p>}
        </div>
      )}
    </div>
  );
}
