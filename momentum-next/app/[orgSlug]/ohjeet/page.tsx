'use client';

import { useState, useMemo, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { useOrgData } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { useIsMobile } from '@/lib/use-mobile';
import { softDelete, filterActive } from '@/lib/trash';
import { workerFetch } from '@/lib/worker-fetch';
import { getOrgTeamMembers } from '@/lib/org-defaults';
import { OrgTeamMember, uniqueMembersByName, resolveUserMember } from '@/lib/team-shared';
import { Ohje, OhjeStep, createEmptyOhje, createEmptyStep, getOhjeCover } from '@/lib/ohjeet-shared';

const R2_CDN = 'https://pub-f3aa3f94aaf8436da08a8ee775b44349.r2.dev';

// ── Client-side thumbnail generator (sama kuin MediaSectionissa) ──
async function generateThumbnailBlob(file: File, maxDim = 400): Promise<Blob | null> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') return null;
  const bitmap = await new Promise<HTMLImageElement | null>(resolve => {
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = ev.target!.result as string;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
  if (!bitmap) return null;
  const scale = Math.min(maxDim / bitmap.width, maxDim / bitmap.height, 1);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, w, h);
  return new Promise<Blob | null>(resolve => canvas.toBlob(b => resolve(b), 'image/jpeg', 0.78));
}

interface UploadResult {
  url: string;
  thumb?: string;
  key: string;
}

export default function OhjeetPage() {
  const params = useParams();
  const orgSlug = (params.orgSlug as string) || '';
  const { user, canEdit, activeOrg } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const [ohjeet, setOhjeet] = useOrgData<Ohje[]>('ohjeet', []);
  const [membersRaw] = useOrgData<OrgTeamMember[]>('orgTeamMembers', getOrgTeamMembers(orgSlug));
  const members = useMemo(() => uniqueMembersByName(membersRaw), [membersRaw]);
  const myMember = useMemo(() => resolveUserMember(members, user), [members, user]);
  const myName = myMember?.name || user?.displayName || 'Tuntematon';

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [uploading, setUploading] = useState<string | null>(null); // step id or 'cover'

  // ── Upload ──
  const uploadPhoto = useCallback(async (file: File): Promise<UploadResult | null> => {
    try {
      const thumbBlob = await generateThumbnailBlob(file, 400);
      const form = new FormData();
      form.append('file', file);
      form.append('folder', 'ohjeet');
      if (thumbBlob) form.append('thumb', thumbBlob, 'thumb.jpg');
      const res = await workerFetch('/media/upload', {
        method: 'POST', body: form, orgId: activeOrg || '',
      });
      if (!res.ok) return null;
      const data = await res.json();
      const url = data.publicUrl || (R2_CDN + '/' + data.key);
      return {
        url,
        thumb: data.hasThumb && data.thumbUrl ? data.thumbUrl : url,
        key: data.key,
      };
    } catch {
      return null;
    }
  }, [activeOrg]);

  // ── Derived ──
  const activeOhjeet = useMemo(() => filterActive(ohjeet), [ohjeet]);

  const categories = useMemo(() => {
    const s = new Set<string>();
    for (const o of activeOhjeet) if (o.category) s.add(o.category);
    return Array.from(s).sort();
  }, [activeOhjeet]);

  const filtered = useMemo(() => {
    let list = activeOhjeet;
    if (filterCategory !== 'all') list = list.filter(o => (o.category || '') === filterCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(o =>
        o.title.toLowerCase().includes(q) ||
        (o.description || '').toLowerCase().includes(q) ||
        (o.category || '').toLowerCase().includes(q) ||
        o.steps.some(s => s.text.toLowerCase().includes(q))
      );
    }
    return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [activeOhjeet, filterCategory, search]);

  const selected = selectedId ? ohjeet.find(o => o.id === selectedId) : null;

  // ── CRUD ──
  const createNew = () => {
    const n = createEmptyOhje(user?.uid || '', myName);
    setOhjeet(prev => [n, ...prev]);
    setSelectedId(n.id);
    setEditing(true);
  };

  const update = (id: string, patch: Partial<Ohje>) => {
    setOhjeet(prev => prev.map(o => o.id === id ? { ...o, ...patch, updatedAt: Date.now() } : o));
  };

  const remove = (id: string) => {
    if (!confirm('Poistetaanko ohje?')) return;
    setOhjeet(prev => softDelete(prev, id));
    if (selectedId === id) { setSelectedId(null); setEditing(false); }
    toast('Siirretty roskakoriin', 'success');
  };

  const addStep = (id: string) => {
    setOhjeet(prev => prev.map(o =>
      o.id === id ? { ...o, steps: [...o.steps, createEmptyStep()], updatedAt: Date.now() } : o
    ));
  };

  const removeStep = (ohjeId: string, stepId: string) => {
    setOhjeet(prev => prev.map(o =>
      o.id === ohjeId ? { ...o, steps: o.steps.filter(s => s.id !== stepId), updatedAt: Date.now() } : o
    ));
  };

  const updateStep = (ohjeId: string, stepId: string, patch: Partial<OhjeStep>) => {
    setOhjeet(prev => prev.map(o =>
      o.id === ohjeId
        ? { ...o, steps: o.steps.map(s => s.id === stepId ? { ...s, ...patch } : s), updatedAt: Date.now() }
        : o
    ));
  };

  const moveStep = (ohjeId: string, stepId: string, dir: -1 | 1) => {
    setOhjeet(prev => prev.map(o => {
      if (o.id !== ohjeId) return o;
      const idx = o.steps.findIndex(s => s.id === stepId);
      if (idx < 0) return o;
      const nextIdx = idx + dir;
      if (nextIdx < 0 || nextIdx >= o.steps.length) return o;
      const next = [...o.steps];
      [next[idx], next[nextIdx]] = [next[nextIdx], next[idx]];
      return { ...o, steps: next, updatedAt: Date.now() };
    }));
  };

  const handleStepPhoto = async (ohjeId: string, stepId: string, file: File) => {
    setUploading(stepId);
    const result = await uploadPhoto(file);
    setUploading(null);
    if (!result) { toast('Kuvan lataus epäonnistui', 'error'); return; }
    updateStep(ohjeId, stepId, { photoUrl: result.url, photoThumb: result.thumb, photoKey: result.key });
    toast('Kuva lisätty', 'success');
  };

  const handleCoverPhoto = async (ohjeId: string, file: File) => {
    setUploading('cover');
    const result = await uploadPhoto(file);
    setUploading(null);
    if (!result) { toast('Kuvan lataus epäonnistui', 'error'); return; }
    update(ohjeId, { coverPhotoUrl: result.url, coverPhotoThumb: result.thumb, coverPhotoKey: result.key });
    toast('Kansikuva vaihdettu', 'success');
  };

  // ── Detail view ──
  if (selected) {
    const cover = getOhjeCover(selected);
    return (
      <AppShell title={selected.title || 'Nimetön ohje'} subtitle={selected.category || (selected.createdByName ? `Tehnyt ${selected.createdByName}` : '')}>
        <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedId(null); setEditing(false); }}>
            {'<-'} Takaisin
          </button>
          {canEdit && !editing && (
            <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>Muokkaa</button>
          )}
          {canEdit && editing && (
            <button className="btn btn-primary btn-sm" onClick={() => setEditing(false)}>Valmis</button>
          )}
          {canEdit && (
            <button className="btn btn-ghost btn-sm" onClick={() => remove(selected.id)} style={{ color: 'var(--red)', marginLeft: 'auto' }}>
              Poista
            </button>
          )}
        </div>

        {/* Title + description — editable or read-only */}
        {editing ? (
          <>
            <input
              value={selected.title}
              onChange={e => update(selected.id, { title: e.target.value })}
              placeholder="Ohjeen otsikko"
              style={{
                width: '100%', background: 'transparent', border: 'none', outline: 'none',
                fontFamily: 'var(--font-display), Georgia, serif',
                fontSize: isMobile ? '1.3rem' : '1.75rem',
                fontWeight: 600, color: 'var(--t1)',
                padding: '.25rem 0',
              }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 160px', gap: '.6rem', marginBottom: '1rem' }}>
              <input
                value={selected.description || ''}
                onChange={e => update(selected.id, { description: e.target.value })}
                placeholder="Lyhyt kuvaus (valinnainen)"
                className="input"
                style={{ fontSize: '.86rem' }}
              />
              <input
                value={selected.category || ''}
                onChange={e => update(selected.id, { category: e.target.value })}
                placeholder="Kategoria"
                className="input"
                style={{ fontSize: '.86rem' }}
              />
            </div>
          </>
        ) : (
          <>
            <h2 style={{
              fontFamily: 'var(--font-display), Georgia, serif',
              fontSize: isMobile ? '1.3rem' : '1.75rem',
              fontWeight: 600, color: 'var(--t1)',
              marginBottom: '.25rem',
            }}>
              {selected.title || <span style={{ color: 'var(--t3)', fontStyle: 'italic' }}>Nimetön ohje</span>}
            </h2>
            {selected.description && (
              <p style={{ fontSize: '.92rem', color: 'var(--t2)', marginBottom: '1rem', lineHeight: 1.6 }}>
                {selected.description}
              </p>
            )}
          </>
        )}

        {/* Cover photo (only shown if present) */}
        {cover.url && (
          <div style={{
            position: 'relative',
            marginBottom: '1.25rem',
            borderRadius: 'var(--rl)', overflow: 'hidden',
            border: '1px solid var(--border)',
            maxHeight: 360,
          }}>
            <img
              src={cover.url}
              alt=""
              style={{ width: '100%', maxHeight: 360, objectFit: 'cover', display: 'block' }}
            />
            {editing && (
              <label style={{
                position: 'absolute', bottom: 8, right: 8,
                background: 'rgba(0,0,0,.6)', color: '#fff',
                padding: '.35rem .65rem', borderRadius: 'var(--r)',
                fontSize: '.72rem', cursor: 'pointer',
              }}>
                {uploading === 'cover' ? 'Ladataan…' : 'Vaihda kansikuva'}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: 'none' }}
                  onChange={async e => {
                    const f = e.target.files?.[0];
                    if (f) await handleCoverPhoto(selected.id, f);
                    e.target.value = '';
                  }}
                />
              </label>
            )}
          </div>
        )}
        {editing && !cover.url && (
          <label style={{
            display: 'block', textAlign: 'center',
            padding: '1.5rem 1rem', marginBottom: '1.25rem',
            border: '1px dashed var(--border)', borderRadius: 'var(--rl)',
            color: 'var(--t3)', fontSize: '.82rem', cursor: 'pointer',
          }}>
            {uploading === 'cover' ? 'Ladataan…' : '+ Lisää kansikuva (valinnainen — muuten käytetään ensimmäistä askel-kuvaa)'}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={async e => {
                const f = e.target.files?.[0];
                if (f) await handleCoverPhoto(selected.id, f);
                e.target.value = '';
              }}
            />
          </label>
        )}

        {/* Steps */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.9rem' }}>
          {selected.steps.map((step, idx) => (
            <div key={step.id} style={{
              background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: 'var(--rl)', padding: isMobile ? '.85rem' : '1rem 1.25rem',
              display: 'flex', gap: isMobile ? '.75rem' : '1rem', flexDirection: isMobile ? 'column' : 'row',
            }}>
              {/* Step number */}
              <div style={{
                flexShrink: 0,
                width: isMobile ? 'auto' : 32, height: isMobile ? 'auto' : 32,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--pri)', color: '#fff',
                borderRadius: isMobile ? 'var(--r)' : '50%',
                fontSize: '.82rem', fontWeight: 700,
                padding: isMobile ? '.2rem .55rem' : 0,
                alignSelf: 'flex-start',
              }}>
                {idx + 1}
              </div>

              {/* Photo */}
              <div style={{ flexShrink: 0, width: isMobile ? '100%' : 180 }}>
                {step.photoUrl ? (
                  <div style={{ position: 'relative' }}>
                    <img
                      src={step.photoThumb || step.photoUrl}
                      alt=""
                      style={{ width: '100%', borderRadius: 'var(--r)', display: 'block', maxHeight: 200, objectFit: 'cover', border: '1px solid var(--border)' }}
                      onClick={() => window.open(step.photoUrl, '_blank')}
                    />
                    {editing && (
                      <label style={{
                        position: 'absolute', bottom: 4, right: 4,
                        background: 'rgba(0,0,0,.65)', color: '#fff',
                        padding: '.2rem .45rem', borderRadius: 'var(--r)',
                        fontSize: '.62rem', cursor: 'pointer',
                      }}>
                        {uploading === step.id ? 'Lataa…' : 'Vaihda'}
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          style={{ display: 'none' }}
                          onChange={async e => {
                            const f = e.target.files?.[0];
                            if (f) await handleStepPhoto(selected.id, step.id, f);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    )}
                  </div>
                ) : editing ? (
                  <label style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: '100%', height: isMobile ? 140 : 120,
                    border: '1px dashed var(--border)', borderRadius: 'var(--r)',
                    color: 'var(--t3)', fontSize: '.78rem', cursor: 'pointer',
                    textAlign: 'center', padding: '.5rem',
                  }}>
                    {uploading === step.id ? 'Ladataan…' : '+ Kuva (valinnainen)'}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      style={{ display: 'none' }}
                      onChange={async e => {
                        const f = e.target.files?.[0];
                        if (f) await handleStepPhoto(selected.id, step.id, f);
                        e.target.value = '';
                      }}
                    />
                  </label>
                ) : null}
              </div>

              {/* Text */}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
                {editing ? (
                  <textarea
                    value={step.text}
                    onChange={e => updateStep(selected.id, step.id, { text: e.target.value })}
                    placeholder={`Askel ${idx + 1}: kerro mitä tehdään…`}
                    rows={3}
                    style={{
                      width: '100%', background: 'transparent',
                      border: '1px solid var(--border)', borderRadius: 'var(--r)',
                      padding: '.55rem .7rem', outline: 'none',
                      fontSize: '.88rem', lineHeight: 1.6, color: 'var(--t1)',
                      fontFamily: 'inherit', resize: 'vertical', minHeight: 70,
                    }}
                  />
                ) : (
                  <div style={{ fontSize: '.9rem', lineHeight: 1.7, color: 'var(--t1)', whiteSpace: 'pre-wrap' }}>
                    {step.text || <span style={{ color: 'var(--t3)', fontStyle: 'italic' }}>Ei tekstiä</span>}
                  </div>
                )}

                {editing && (
                  <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => moveStep(selected.id, step.id, -1)}
                      disabled={idx === 0}
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: '.68rem', opacity: idx === 0 ? 0.4 : 1 }}
                    >
                      ↑ Ylös
                    </button>
                    <button
                      type="button"
                      onClick={() => moveStep(selected.id, step.id, 1)}
                      disabled={idx === selected.steps.length - 1}
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: '.68rem', opacity: idx === selected.steps.length - 1 ? 0.4 : 1 }}
                    >
                      ↓ Alas
                    </button>
                    <div style={{ flex: 1 }} />
                    <button
                      type="button"
                      onClick={() => removeStep(selected.id, step.id)}
                      className="btn btn-ghost btn-sm"
                      style={{ color: 'var(--red)', fontSize: '.68rem' }}
                    >
                      Poista askel
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Add step button */}
        {editing && (
          <button
            onClick={() => addStep(selected.id)}
            className="btn btn-primary btn-sm"
            style={{ marginTop: '1rem' }}
          >
            + Lisää askel
          </button>
        )}

        {/* Empty state within detail */}
        {selected.steps.length === 0 && !editing && (
          <div style={{
            textAlign: 'center', padding: '2rem 1rem', color: 'var(--t3)',
            border: '1px dashed var(--border)', borderRadius: 'var(--rl)',
          }}>
            <p style={{ fontSize: '.88rem', marginBottom: '.5rem' }}>Tämä ohje on vielä tyhjä.</p>
            {canEdit && (
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)} style={{ fontSize: '.78rem' }}>
                Aloita muokkaaminen
              </button>
            )}
          </div>
        )}
      </AppShell>
    );
  }

  // ── List view ──
  return (
    <AppShell title="Ohjeet" subtitle={`${activeOhjeet.length} ohjetta`}>
      {canEdit && (
        <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <button className="btn btn-primary btn-sm" onClick={createNew}>+ Uusi ohje</button>
        </div>
      )}

      {/* Filters */}
      {(activeOhjeet.length > 0 || search) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem', alignItems: 'center', marginBottom: '1rem' }}>
          <input
            placeholder="Hae ohjeista…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex: '1 1 200px', fontSize: '.78rem', padding: '.3rem .55rem', background: 'var(--elev)', border: '1px solid var(--border)', borderRadius: 'var(--r)', color: 'var(--t1)', outline: 'none' }}
          />
          {categories.length > 0 && (
            <select
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value)}
              style={{ fontSize: '.72rem', padding: '.3rem .4rem', background: 'var(--elev)', border: '1px solid var(--border)', borderRadius: 'var(--r)', color: 'var(--t1)' }}
            >
              <option value="all">Kaikki kategoriat</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          {(filterCategory !== 'all' || search) && (
            <button
              onClick={() => { setFilterCategory('all'); setSearch(''); }}
              style={{ fontSize: '.7rem', padding: '.3rem .55rem', background: 'transparent', border: 'none', color: 'var(--t3)', cursor: 'pointer' }}
            >
              Tyhjennä
            </button>
          )}
        </div>
      )}

      {/* Empty state */}
      {filtered.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '3rem 1.5rem', color: 'var(--t3)',
          border: '1px dashed var(--border)', borderRadius: 'var(--rl)',
        }}>
          {activeOhjeet.length === 0 ? (
            <>
              <p style={{ fontSize: '1rem', color: 'var(--t2)', marginBottom: '.5rem', fontWeight: 600 }}>
                Ei vielä ohjeita.
              </p>
              <p style={{ fontSize: '.82rem', lineHeight: 1.6, maxWidth: 480, margin: '0 auto' }}>
                Luo ensimmäinen "+ Uusi ohje" -painikkeesta. Voit ottaa puhelimella kuvia ja kirjoittaa askel kerrallaan
                mitä tehdään — esim. "Moottorin käynnistys", "Mistä löytyy jakoavaimet", "Purjeen oikea kohta".
              </p>
            </>
          ) : (
            <p style={{ fontSize: '.88rem' }}>Ei ohjeita valituilla suodattimilla.</p>
          )}
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: '.75rem',
        }}>
          {filtered.map(o => {
            const cover = getOhjeCover(o);
            return (
              <div
                key={o.id}
                onClick={() => setSelectedId(o.id)}
                style={{
                  background: 'var(--card)', border: '1px solid var(--border)',
                  borderRadius: 'var(--rl)', overflow: 'hidden',
                  cursor: 'pointer', transition: 'border-color .15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--pri)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
              >
                {cover.url ? (
                  <img
                    src={cover.thumb || cover.url}
                    alt=""
                    style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }}
                  />
                ) : (
                  <div style={{
                    width: '100%', height: 140,
                    background: 'var(--elev)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    color: 'var(--t3)', fontSize: '.8rem', fontStyle: 'italic',
                  }}>
                    Ei kuvaa
                  </div>
                )}
                <div style={{ padding: '.75rem .9rem' }}>
                  {o.category && (
                    <div style={{
                      fontSize: '.58rem', fontWeight: 700, color: 'var(--t3)',
                      textTransform: 'uppercase', letterSpacing: '.05em',
                      marginBottom: '.2rem',
                    }}>
                      {o.category}
                    </div>
                  )}
                  <div style={{
                    fontFamily: 'var(--font-display), Georgia, serif',
                    fontSize: '1rem', fontWeight: 600, color: 'var(--t1)',
                    marginBottom: '.25rem', letterSpacing: '-.005em',
                  }}>
                    {o.title || <span style={{ color: 'var(--t3)', fontStyle: 'italic' }}>Nimetön ohje</span>}
                  </div>
                  {o.description && (
                    <div style={{
                      fontSize: '.75rem', color: 'var(--t2)', lineHeight: 1.5,
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                      overflow: 'hidden', marginBottom: '.35rem',
                    }}>
                      {o.description}
                    </div>
                  )}
                  <div style={{ fontSize: '.65rem', color: 'var(--t3)' }}>
                    {o.steps.length} askel{o.steps.length === 1 ? '' : 'ta'}
                    {o.createdByName ? ` · ${o.createdByName}` : ''}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
