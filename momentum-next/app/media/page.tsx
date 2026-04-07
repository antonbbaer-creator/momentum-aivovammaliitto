'use client';

import { useState, useRef } from 'react';
import AppShell from '@/components/AppShell';
import { useOrgData } from '@/lib/firestore';

const WORKER_URL = 'https://momentum-worker.anton-4f9.workers.dev';
const R2_PUBLIC = 'https://pub-f3aa3f94aaf8436da08a8ee775b44349.r2.dev';

interface MediaFile { id: string; name: string; size: number; type: string; ext: string; path: string; thumb: string; folder: string; source: string; r2Key?: string; added?: string; }

export default function MediaPage() {
  const [mediaMeta, setMediaMeta] = useOrgData<Record<string, { tags: string[]; desc: string; title: string }>>('media_meta', {});
  const [uploadedFiles, setUploadedFiles] = useOrgData<MediaFile[]>('media_uploaded', []);
  const [collections, setCollections] = useOrgData<{ id: string; name: string; fileIds: string[]; color: string }[]>('media_collections', []);

  const [search, setSearch] = useState('');
  const [detailIdx, setDetailIdx] = useState(-1);
  const [uploading, setUploading] = useState(false);
  const [sortBy, setSortBy] = useState('name');
  const fileRef = useRef<HTMLInputElement>(null);

  const activeOrg = typeof window !== 'undefined' ? localStorage.getItem('momentum_activeOrg') || '' : '';

  // All files: uploaded + R2
  const allFiles = uploadedFiles;

  const getMeta = (id: string) => mediaMeta[id] || { tags: [], desc: '', title: '' };

  const filtered = search.trim()
    ? allFiles.filter(f => {
        const q = search.toLowerCase();
        const m = getMeta(f.id);
        return f.name.toLowerCase().includes(q) || (m.title || '').toLowerCase().includes(q) || (m.tags || []).some(t => t.toLowerCase().includes(q));
      })
    : allFiles;

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'size') return (b.size || 0) - (a.size || 0);
    if (sortBy === 'date') return (b.added || '').localeCompare(a.added || '');
    return (a.name || '').localeCompare(b.name || '');
  });

  const formatSize = (bytes: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleUpload = async (fileList: File[]) => {
    setUploading(true);
    const newFiles: MediaFile[] = [];
    for (const file of fileList) {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const isImg = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext);
      try {
        const form = new FormData();
        form.append('file', file);
        form.append('folder', 'uploaded');
        const res = await fetch(WORKER_URL + '/media/upload', { method: 'POST', body: form, headers: { 'X-Momentum-Org': activeOrg } });
        if (res.ok) {
          const data = await res.json();
          newFiles.push({ id: data.id, name: data.name, size: data.size, type: isImg ? 'image' : 'other', ext, path: data.publicUrl, thumb: isImg ? data.publicUrl : '', folder: 'uploaded', source: 'r2', r2Key: data.key, added: data.uploaded });
        }
      } catch (e) {
        console.error('Upload failed:', e);
      }
    }
    if (newFiles.length > 0) setUploadedFiles(prev => [...newFiles, ...prev]);
    setUploading(false);
  };

  const deleteFile = async (file: MediaFile) => {
    if (file.r2Key) {
      try { await fetch(WORKER_URL + '/media/delete/' + file.r2Key, { method: 'DELETE', headers: { 'X-Momentum-Org': activeOrg } }); } catch (e) {}
    }
    setUploadedFiles(prev => prev.filter(f => f.id !== file.id));
    setDetailIdx(-1);
  };

  const detail = detailIdx >= 0 && detailIdx < sorted.length ? sorted[detailIdx] : null;

  return (
    <AppShell title="Mediapankki" subtitle={`${allFiles.length} tiedostoa`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '.75rem' }}>
        <div style={{ position: 'relative' }}>
          <input className="input" placeholder="Hae tiedostoja..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: 280, paddingLeft: '2rem', fontSize: '.82rem' }} />
          <span style={{ position: 'absolute', left: '.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)', fontSize: '.85rem' }}>{'\u2315'}</span>
        </div>
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
          <select className="input" value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ width: 'auto', fontSize: '.78rem' }}>
            <option value="name">Nimi</option><option value="size">Koko</option><option value="date">Päivämäärä</option>
          </select>
          <button className="btn btn-primary btn-sm" onClick={() => fileRef.current?.click()}>+ Lisää</button>
          <input ref={fileRef} type="file" multiple accept="image/*,video/*,.svg,.pdf" style={{ display: 'none' }} onChange={e => { if (e.target.files?.length) handleUpload(Array.from(e.target.files)); e.target.value = ''; }} />
        </div>
      </div>

      {uploading && (
        <div style={{ marginBottom: '1rem', padding: '.75rem 1rem', background: 'rgba(26,143,196,.08)', border: '1px solid rgba(26,143,196,.2)', borderRadius: 'var(--r)', display: 'flex', alignItems: 'center', gap: '.75rem' }}>
          <div className="typing"><span /><span /><span /></div>
          <span style={{ fontSize: '.82rem', fontWeight: 600, color: 'var(--pri-l)' }}>Ladataan pilveen...</span>
        </div>
      )}

      {/* Upload zone */}
      <div onClick={() => fileRef.current?.click()} style={{ marginBottom: '1.5rem', border: '2px dashed var(--border)', borderRadius: 'var(--r)', padding: '1.5rem', textAlign: 'center', cursor: 'pointer', transition: 'all .2s', background: 'var(--elev)' }}
        onMouseEnter={e => { (e.currentTarget as any).style.borderColor = 'var(--pri)'; }} onMouseLeave={e => { (e.currentTarget as any).style.borderColor = 'var(--border)'; }}>
        <div style={{ fontSize: '1.5rem', marginBottom: '.5rem', opacity: .5 }}>{'\u2191'}</div>
        <p style={{ fontSize: '.85rem', fontWeight: 600, color: 'var(--t2)', marginBottom: '.25rem' }}>Vedä ja pudota tiedostoja tähän</p>
        <p style={{ fontSize: '.75rem', color: 'var(--t3)' }}>tai klikkaa valitaksesi</p>
      </div>

      {/* Collections */}
      {collections.length > 0 && (
        <div style={{ marginBottom: '1rem', display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
          {collections.map(c => (
            <span key={c.id} style={{ fontSize: '.72rem', padding: '.25rem .6rem', borderRadius: 9999, background: 'var(--elev)', border: '1px solid var(--border)', borderLeft: `3px solid ${c.color}`, fontWeight: 600 }}>
              {c.name} ({c.fileIds.length})
            </span>
          ))}
        </div>
      )}

      {/* Grid */}
      <div className="mb-grid">
        {sorted.map((f, i) => {
          const m = getMeta(f.id);
          return (
            <div key={f.id} className="mb-item" onClick={() => setDetailIdx(i)}>
              <div className="mb-thumb">
                {f.type === 'image' && (f.thumb || f.path) ? <img src={f.thumb || f.path} alt={m.title || f.name} loading="lazy" /> : <div className="mb-thumb-icon">{'\u25a1'}</div>}
                <span className="mb-badge">{f.ext}</span>
              </div>
              <div className="mb-meta">
                <h4>{m.title || f.name}</h4>
                <p>{formatSize(f.size)}</p>
              </div>
            </div>
          );
        })}
      </div>

      {sorted.length === 0 && <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--t3)' }}>Ei tiedostoja. Lataa ensimmäinen ylhäältä.</div>}

      {/* Lightbox */}
      {detail && (
        <div className="mb-detail" onClick={() => setDetailIdx(-1)}>
          <div style={{ display: 'flex', alignItems: 'center', width: '100%', height: '100%', position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setDetailIdx(-1)} style={{ position: 'absolute', top: '.75rem', right: '.75rem', background: 'rgba(0,0,0,.5)', border: 'none', color: '#fff', fontSize: '1.3rem', width: 40, height: 40, borderRadius: '50%', cursor: 'pointer', zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{'\u2715'}</button>
            <div style={{ position: 'absolute', top: '1rem', left: '50%', transform: 'translateX(-50%)', color: 'rgba(255,255,255,.6)', fontSize: '.78rem', fontWeight: 600, zIndex: 20 }}>{detailIdx + 1} / {sorted.length}</div>

            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }} onClick={() => setDetailIdx(-1)}>
              <button onClick={e => { e.stopPropagation(); if (detailIdx > 0) setDetailIdx(detailIdx - 1); }} style={{ position: 'absolute', left: '.5rem', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,.6)', border: 'none', color: '#fff', fontSize: '1.3rem', width: 44, height: 44, borderRadius: '50%', cursor: 'pointer', zIndex: 10 }}>{'\u2190'}</button>
              <button onClick={e => { e.stopPropagation(); if (detailIdx < sorted.length - 1) setDetailIdx(detailIdx + 1); }} style={{ position: 'absolute', right: '.5rem', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,.6)', border: 'none', color: '#fff', fontSize: '1.3rem', width: 44, height: 44, borderRadius: '50%', cursor: 'pointer', zIndex: 10 }}>{'\u2192'}</button>
              {detail.type === 'image' && <img src={detail.path || detail.thumb} alt="" style={{ maxWidth: 'calc(100% - 100px)', maxHeight: '85vh', objectFit: 'contain', borderRadius: 'var(--r)' }} onClick={e => e.stopPropagation()} />}
            </div>

            <div className="lb-sidebar" style={{ width: 320, flexShrink: 0, background: 'var(--card)', borderLeft: '1px solid var(--border)', padding: '1.25rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }} onClick={e => e.stopPropagation()}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, wordBreak: 'break-word' }}>{getMeta(detail.id).title || detail.name}</h3>
              <p style={{ fontSize: '.78rem', color: 'var(--t2)' }}>{formatSize(detail.size)} {'\u00b7'} {detail.ext.toUpperCase()}</p>
              <a href={detail.path || detail.thumb} download={detail.name} className="btn btn-sm btn-primary" style={{ width: '100%', textDecoration: 'none', textAlign: 'center', display: 'block' }}>Lataa tiedosto</a>
              <button className="btn btn-sm btn-secondary" onClick={() => { navigator.clipboard.writeText(detail.path || detail.thumb || ''); }} style={{ width: '100%' }}>Kopioi linkki</button>
              <button className="btn btn-sm" onClick={() => deleteFile(detail)} style={{ width: '100%', color: 'var(--red)', border: '1px solid rgba(239,68,68,.3)', background: 'rgba(239,68,68,.05)' }}>Poista tiedosto</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
