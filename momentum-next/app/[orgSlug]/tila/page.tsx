'use client';

import { useState, useRef } from 'react';
import AppShell from '@/components/AppShell';
import { useOrgData } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { useIsMobile } from '@/lib/use-mobile';

interface Venue {
  id: string;
  name: string;
  description: string;
  purpose: string; // mihin käyttöön (esim. "ruokailu", "tanssi", "seremonia")
  capacity?: number;
  images: string[]; // base64 or URLs
  note?: string;
  order: number;
}

export default function TilaPage() {
  const { canEdit } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [venues, setVenues] = useOrgData<Venue[]>('venues', []);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [selectedVenue, setSelectedVenue] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Form
  const [vName, setVName] = useState('');
  const [vDesc, setVDesc] = useState('');
  const [vPurpose, setVPurpose] = useState('');
  const [vCapacity, setVCapacity] = useState('');
  const [vNote, setVNote] = useState('');
  const [vImages, setVImages] = useState<string[]>([]);

  const openNew = () => {
    setEditId(null); setVName(''); setVDesc(''); setVPurpose(''); setVCapacity('');
    setVNote(''); setVImages([]);
    setShowForm(true);
  };

  const openEdit = (v: Venue) => {
    setEditId(v.id); setVName(v.name); setVDesc(v.description); setVPurpose(v.purpose);
    setVCapacity(v.capacity?.toString() || ''); setVNote(v.note || ''); setVImages(v.images || []);
    setShowForm(true);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      if (file.size > 2 * 1024 * 1024) {
        toast('Kuva liian suuri (max 2 MB)', 'error');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setVImages(prev => [...prev, reader.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const removeImage = (idx: number) => {
    setVImages(prev => prev.filter((_, i) => i !== idx));
  };

  const save = () => {
    if (!vName.trim()) return;
    const venue: Venue = {
      id: editId || 'v_' + Date.now(),
      name: vName.trim(), description: vDesc.trim(), purpose: vPurpose.trim(),
      capacity: vCapacity ? parseInt(vCapacity) : undefined,
      images: vImages, note: vNote.trim() || undefined,
      order: editId ? (venues.find(v => v.id === editId)?.order ?? venues.length) : venues.length,
    };
    if (editId) setVenues(prev => prev.map(x => x.id === editId ? { ...x, ...venue } : x));
    else setVenues(prev => [...prev, venue]);
    setShowForm(false);
    toast(editId ? 'Tila päivitetty' : 'Tila lisätty', 'success');
  };

  const remove = (id: string) => {
    setVenues(prev => prev.filter(x => x.id !== id));
    if (selectedVenue === id) setSelectedVenue(null);
    toast('Tila poistettu', 'success');
  };

  const sorted = [...venues].sort((a, b) => a.order - b.order);
  const detail = selectedVenue ? venues.find(v => v.id === selectedVenue) : null;

  // Detail view
  if (detail) {
    return (
      <AppShell title={detail.name} subtitle={detail.purpose}>
        <button className="btn btn-ghost" onClick={() => setSelectedVenue(null)} style={{ marginBottom: '1rem' }}>{'<-'} Takaisin tiloihin</button>

        {/* Images gallery */}
        {detail.images.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: detail.images.length === 1 ? '1fr' : isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: '.75rem', marginBottom: '1.5rem' }}>
            {detail.images.map((img, i) => (
              <div key={i} style={{ borderRadius: 'var(--rl)', overflow: 'hidden', border: '1px solid var(--border)', aspectRatio: '16/10' }}>
                <img src={img} alt={`${detail.name} kuva ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            ))}
          </div>
        )}

        {/* Info card */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.5rem', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            {detail.purpose && (
              <div style={{ padding: '.35rem .7rem', borderRadius: 9999, background: 'rgba(5,107,159,.1)', color: 'var(--pri-l)', fontSize: '.75rem', fontWeight: 700 }}>
                {detail.purpose}
              </div>
            )}
            {detail.capacity && (
              <div style={{ padding: '.35rem .7rem', borderRadius: 9999, background: 'rgba(45,212,160,.1)', color: 'var(--green)', fontSize: '.75rem', fontWeight: 700 }}>
                Max {detail.capacity} hloa
              </div>
            )}
          </div>
          <p style={{ fontSize: '.92rem', color: 'var(--t2)', lineHeight: 1.7 }}>{detail.description}</p>
          {detail.note && (
            <p style={{ fontSize: '.82rem', color: 'var(--t3)', marginTop: '.75rem', fontStyle: 'italic', lineHeight: 1.6 }}>{detail.note}</p>
          )}
        </div>

        {canEdit && (
          <div style={{ display: 'flex', gap: '.5rem' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => openEdit(detail)}>Muokkaa</button>
            <button className="btn btn-ghost btn-sm" onClick={() => remove(detail.id)} style={{ color: 'var(--red)' }}>Poista</button>
          </div>
        )}
      </AppShell>
    );
  }

  // List view
  return (
    <AppShell title="Tilat" subtitle="Juhlapaikan tilat ja niiden käyttö">
      {canEdit && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.25rem' }}>
          <button className="btn btn-primary btn-sm" onClick={openNew}>+ Lisää tila</button>
        </div>
      )}

      {sorted.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--t3)' }}>
          <p style={{ fontSize: '.92rem', marginBottom: '.5rem' }}>Ei tiloja vielä.</p>
          <p style={{ fontSize: '.75rem' }}>Lisää juhlapaikan tilat ja kuvaukset täältä.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
          {sorted.map(v => (
            <div key={v.id} onClick={() => setSelectedVenue(v.id)} style={{
              background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)',
              overflow: 'hidden', cursor: 'pointer', transition: 'border-color .15s, transform .15s',
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--pri)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}
            >
              {v.images[0] && (
                <div style={{ height: 160, overflow: 'hidden' }}>
                  <img src={v.images[0]} alt={v.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              )}
              <div style={{ padding: '1rem 1.2rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '.25rem' }}>{v.name}</h3>
                <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginBottom: '.5rem' }}>
                  {v.purpose && (
                    <span style={{ fontSize: '.65rem', padding: '.15rem .45rem', borderRadius: 9999, background: 'rgba(5,107,159,.1)', color: 'var(--pri-l)', fontWeight: 700 }}>{v.purpose}</span>
                  )}
                  {v.capacity && (
                    <span style={{ fontSize: '.65rem', padding: '.15rem .45rem', borderRadius: 9999, background: 'rgba(45,212,160,.1)', color: 'var(--green)', fontWeight: 700 }}>Max {v.capacity}</span>
                  )}
                  {v.images.length > 0 && (
                    <span style={{ fontSize: '.65rem', padding: '.15rem .45rem', borderRadius: 9999, background: 'var(--elev)', color: 'var(--t3)', fontWeight: 600 }}>{v.images.length} kuvaa</span>
                  )}
                </div>
                <p style={{ fontSize: '.78rem', color: 'var(--t2)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {v.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowForm(false)}>
          <div style={{ background: 'var(--card)', border: isMobile ? 'none' : '1px solid var(--border)', borderRadius: isMobile ? 0 : 'var(--rl)', padding: isMobile ? '1.25rem' : '2rem', width: isMobile ? '100%' : 520, maxWidth: isMobile ? '100%' : '90vw', maxHeight: isMobile ? '100%' : '90vh', height: isMobile ? '100%' : 'auto', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', marginBottom: '1.25rem' }}>{editId ? 'Muokkaa tilaa' : 'Lisää tila'}</h3>
            <div className="field"><label>Tilan nimi *</label><input className="input" value={vName} onChange={e => setVName(e.target.value)} autoFocus placeholder="Esim. Juhlahuone, Piha, Sauna" /></div>
            <div className="field"><label>Käyttötarkoitus</label><input className="input" value={vPurpose} onChange={e => setVPurpose(e.target.value)} placeholder="Esim. Ruokailu, Tanssi, Seremonia" /></div>
            <div className="field"><label>Kuvaus</label><textarea className="input textarea" value={vDesc} onChange={e => setVDesc(e.target.value)} placeholder="Kerro tilasta ja sen tunnelmasta..." rows={3} /></div>
            <div className="field"><label>Kapasiteetti (hloa)</label><input className="input" type="number" value={vCapacity} onChange={e => setVCapacity(e.target.value)} placeholder="Esim. 50" /></div>

            {/* Images */}
            <div className="field">
              <label>Kuvat</label>
              <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginBottom: '.5rem' }}>
                {vImages.map((img, i) => (
                  <div key={i} style={{ position: 'relative', width: 80, height: 60, borderRadius: 'var(--r)', overflow: 'hidden', border: '1px solid var(--border)' }}>
                    <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <button onClick={() => removeImage(i)} style={{
                      position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: '50%',
                      background: 'rgba(0,0,0,.7)', color: '#fff', border: 'none', cursor: 'pointer',
                      fontSize: '.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>x</button>
                  </div>
                ))}
                <button onClick={() => fileRef.current?.click()} style={{
                  width: 80, height: 60, borderRadius: 'var(--r)',
                  border: '2px dashed var(--border)', background: 'var(--elev)',
                  color: 'var(--t3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '.72rem', fontWeight: 600,
                }}>+ Kuva</button>
              </div>
              <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleImageUpload} style={{ display: 'none' }} />
              <div style={{ fontSize: '.62rem', color: 'var(--t3)' }}>Max 2 MB / kuva. Kuvat tallennetaan työtilaan.</div>
            </div>

            <div className="field"><label>Muistiinpano</label><textarea className="input textarea" value={vNote} onChange={e => setVNote(e.target.value)} /></div>
            <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end' }}>
              {editId && <button className="btn btn-ghost btn-sm" onClick={() => { remove(editId); setShowForm(false); }} style={{ color: 'var(--red)', marginRight: 'auto' }}>Poista</button>}
              <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Peruuta</button>
              <button className="btn btn-primary" onClick={save} disabled={!vName.trim()}>Tallenna</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
