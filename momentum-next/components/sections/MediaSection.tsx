'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useOrgData } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';

import { workerFetch, WORKER_URL } from '@/lib/worker-fetch';
const R2_CDN = 'https://pub-f3aa3f94aaf8436da08a8ee775b44349.r2.dev';

interface MediaFile { id: string; name: string; size: number; type: string; ext: string; path: string; thumb: string; folder: string; source: string; r2Key?: string; added?: string; }

// sessionStorage handoff key read by EditorSection on mount
export const EDITOR_HANDOFF_KEY = 'momentum_editor_handoff';

export default function MediaSection() {
  const { activeOrg, canEdit } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const params = useParams();
  const orgSlug = (params?.orgSlug as string) || '';
  const [mediaMeta, setMediaMeta] = useOrgData<Record<string, { tags: string[]; desc: string; title: string }>>('media_meta', {});
  const [uploadedFiles, setUploadedFiles] = useOrgData<MediaFile[]>('media_uploaded', []);
  const [collections, setCollections] = useOrgData<{ id: string; name: string; fileIds: string[]; color: string }[]>('media_collections', []);

  const [r2Files, setR2Files] = useState<MediaFile[]>([]);
  const [search, setSearch] = useState('');
  const [detailIdx, setDetailIdx] = useState(-1);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [dragging, setDragging] = useState(false);
  const dragCounter = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Selection mode: pick multiple images for editor/AI handoff ──
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiChannel, setAiChannel] = useState('Instagram Feed');
  const [aiTone, setAiTone] = useState('Lämmin ja innostunut');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiResult, setAiResult] = useState('');

  useEffect(() => {
    if (!activeOrg) return;
    workerFetch('/media/list?limit=500', { orgId: activeOrg })
      .then(r => r.json())
      .then(d => {
        if (d.files) {
          setR2Files(d.files.map((f: any) => {
            const ext = (f.name || '').split('.').pop()?.toLowerCase() || '';
            const isImg = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext);
            const cleanName = f.name.replace(/^\d+_/, '');
            // Prefer the small worker-served thumbnail for grid view. Fall back to the
            // raw R2 CDN URL for legacy uploads that have no sidecar thumb.
            const origPath = R2_CDN + '/' + f.key;
            const thumbPath = isImg
              ? (f.hasThumb && f.thumbUrl ? f.thumbUrl : origPath)
              : '';
            return {
              id: 'r2_' + f.key,
              name: cleanName,
              size: f.size,
              type: isImg ? 'image' : 'other',
              ext,
              path: origPath,
              thumb: thumbPath,
              folder: f.key.split('/')[1] || 'uploaded',
              source: 'r2',
              r2Key: f.key,
              added: (f.uploaded || '').slice(0, 10),
            };
          }));
        }
      })
      .catch(() => console.warn('R2 offline, using local files only'));
  }, [activeOrg]);

  // Generate a small JPEG thumbnail from an image File entirely on the client.
  // Returned as a Blob so it can be appended to FormData as a proper file field.
  const generateThumbnailBlob = useCallback(async (file: File, maxDim = 400): Promise<Blob | null> => {
    if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') return null;
    const bitmap = await new Promise<HTMLImageElement>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = ev => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = ev.target!.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    }).catch(() => null);
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
  }, []);

  const allFiles = useMemo(() => {
    const r2Keys = new Set(r2Files.map(f => f.r2Key));
    const localOnly = uploadedFiles.filter(f => !f.r2Key || !r2Keys.has(f.r2Key));
    return [...r2Files, ...localOnly];
  }, [r2Files, uploadedFiles]);

  const getMeta = useCallback((id: string) => mediaMeta[id] || { tags: [], desc: '', title: '' }, [mediaMeta]);

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? allFiles.filter(f => {
          const m = getMeta(f.id);
          return f.name.toLowerCase().includes(q) || (m.title || '').toLowerCase().includes(q) || (m.tags || []).some(t => t.toLowerCase().includes(q));
        })
      : allFiles;
    const arr = [...filtered];
    arr.sort((a, b) => {
      if (sortBy === 'size') return (b.size || 0) - (a.size || 0);
      if (sortBy === 'date') return (b.added || '').localeCompare(a.added || '');
      return (a.name || '').localeCompare(b.name || '');
    });
    return arr;
  }, [allFiles, search, sortBy, getMeta]);

  // ── Selection helpers ──
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
    setSelectMode(false);
    setAiOpen(false);
    setAiResult('');
  }, []);

  const selectedFiles = useMemo(
    () => selectedIds.map(id => allFiles.find(f => f.id === id)).filter((f): f is MediaFile => !!f && f.type === 'image'),
    [selectedIds, allFiles]
  );

  // Persist selection to sessionStorage and navigate to editor.
  // EditorSection reads EDITOR_HANDOFF_KEY on mount and loads the images as overlays.
  const sendToEditor = useCallback((aiText?: string) => {
    if (selectedFiles.length === 0) { toast('Valitse vähintään yksi kuva', 'error'); return; }
    const handoff = {
      images: selectedFiles.map(f => ({
        url: f.path || f.thumb,
        name: f.name,
        id: f.id,
      })),
      text: aiText || '',
      timestamp: Date.now(),
    };
    try {
      sessionStorage.setItem(EDITOR_HANDOFF_KEY, JSON.stringify(handoff));
    } catch (e) {
      toast('Handoff-tallennus epäonnistui', 'error');
      return;
    }
    toast(`${selectedFiles.length} kuvaa viety editoriin`, 'success');
    clearSelection();
    if (orgSlug) router.push(`/${orgSlug}/editor`);
  }, [selectedFiles, toast, clearSelection, orgSlug, router]);

  // Generate a social post draft using the selected images' metadata as context.
  const generateAiPost = useCallback(async () => {
    if (selectedFiles.length === 0) { toast('Valitse kuvat ensin', 'error'); return; }
    setAiBusy(true);
    setAiResult('');

    // Build image context from tags/title/desc so the AI has something concrete to work with
    const imageContext = selectedFiles.map((f, i) => {
      const m = mediaMeta[f.id] || { tags: [], desc: '', title: '' };
      const parts = [`Kuva ${i + 1}: ${m.title || f.name}`];
      if (m.desc) parts.push(`Kuvaus: ${m.desc}`);
      if (m.tags?.length) parts.push(`Avainsanat: ${m.tags.join(', ')}`);
      return parts.join(' — ');
    }).join('\n');

    const orgName = orgSlug === 'llff' ? 'LLFF-festivaalin' : orgSlug === 'avl' ? 'Aivovammaliiton' : 'organisaation';
    const orgTone = orgSlug === 'llff' ? 'rohkea, lämmin, taiteellinen mutta tavoitettava' : orgSlug === 'avl' ? 'asiallinen, empaattinen, rohkaiseva, selkeä' : 'asiallinen ja selkeä';
    const systemPrompt = [
      `Olet ${orgName} viestintäassistentti. Kirjoitat suomeksi sosiaalisen median postauksia.`,
      `Noudata äänensävyä: ${orgTone}.`,
      'Älä käytä emojeja. Pidä teksti konkreettisena ja kuvaa tukevana.',
      `Kanava: ${aiChannel}. Säädä pituus ja tyyli kanavan mukaan (IG Feed ~100-180 sanaa, Stories lyhyt, LinkedIn asiallisempi, Facebook keskipitkä).`,
      `Tunnelma: ${aiTone}.`,
      'Palauta VAIN postauksen teksti ilman otsikoita, selityksiä tai lainausmerkkejä.',
    ].join(' ');

    const userMessage = [
      `Kirjoita postaus seuraavien ${selectedFiles.length} kuvan pohjalta:`,
      '',
      imageContext,
      '',
      aiPrompt.trim() ? `Lisäohje: ${aiPrompt.trim()}` : '',
    ].filter(Boolean).join('\n');

    try {
      const res = await workerFetch('/api/chat', {
        method: 'POST',
        orgId: activeOrg || '',
        body: JSON.stringify({
          messages: [{ role: 'user', content: userMessage }],
          system: systemPrompt,
          max_tokens: 800,
        }),
      });
      const data = await res.json();
      if (data.error) {
        toast('AI-virhe: ' + data.error, 'error');
        setAiBusy(false);
        return;
      }
      setAiResult((data.response || '').trim());
    } catch (e: any) {
      toast('AI-kutsu epäonnistui: ' + (e?.message || 'verkkovirhe'), 'error');
    } finally {
      setAiBusy(false);
    }
  }, [selectedFiles, mediaMeta, aiPrompt, aiChannel, aiTone, activeOrg, toast]);

  const formatSize = (bytes: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleUpload = useCallback(async (fileList: File[]) => {
    if (!canEdit) { toast('Vierailijat eivät voi ladata tiedostoja', 'error'); return; }
    setUploading(true);
    const newR2: MediaFile[] = [];
    const newLocal: MediaFile[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      setUploadProgress(`${i + 1}/${fileList.length}: ${file.name}`);
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const isImg = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext);

      try {
        // Generate a compact thumbnail client-side so the worker can store it
        // alongside the original in R2. This keeps grid load times tiny.
        const thumbBlob = isImg ? await generateThumbnailBlob(file, 400) : null;

        const form = new FormData();
        form.append('file', file);
        form.append('folder', 'uploaded');
        if (thumbBlob) form.append('thumb', thumbBlob, 'thumb.jpg');

        const res = await workerFetch('/media/upload', {
          method: 'POST', body: form,
          orgId: activeOrg || '',
        });
        if (res.ok) {
          const data = await res.json();
          const origPath = R2_CDN + '/' + data.key;
          const r2File: MediaFile = {
            id: data.id, name: file.name, size: data.size,
            type: isImg ? 'image' : 'other', ext,
            path: origPath,
            thumb: isImg ? (data.hasThumb && data.thumbUrl ? data.thumbUrl : origPath) : '',
            folder: 'uploaded', source: 'r2',
            r2Key: data.key, added: data.uploaded || new Date().toISOString().slice(0, 10),
          };
          newR2.push(r2File);
          continue;
        }
      } catch (e) { /* fallback to local */ }

      let thumbUrl = '';
      if (isImg) {
        thumbUrl = await new Promise<string>(resolve => {
          const reader = new FileReader();
          reader.onload = ev => {
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement('canvas');
              const scale = Math.min(300 / img.width, 1);
              canvas.width = img.width * scale; canvas.height = img.height * scale;
              canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
              resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
            img.src = ev.target!.result as string;
          };
          reader.readAsDataURL(file);
        });
      }
      newLocal.push({
        id: 'local_' + Date.now() + '_' + Math.random().toString(36).slice(2),
        name: file.name, size: file.size, type: isImg ? 'image' : 'other', ext,
        path: '', thumb: thumbUrl, folder: 'uploaded', source: 'local',
        added: new Date().toISOString().slice(0, 10),
      });
    }

    if (newR2.length > 0) setR2Files(prev => [...newR2, ...prev]);
    if (newLocal.length > 0) setUploadedFiles(prev => [...newLocal, ...prev]);
    setUploading(false); setUploadProgress('');
    const total = newR2.length + newLocal.length;
    toast(`${total} tiedostoa ladattu${newR2.length > 0 ? ' pilveen' : ''}`, 'success');
  }, [activeOrg, canEdit, toast, setUploadedFiles]);

  const deleteFile = async (file: MediaFile) => {
    if (!canEdit) { toast('Vierailijat eivät voi poistaa tiedostoja', 'error'); return; }
    if (file.r2Key) {
      try { await workerFetch('/media/delete/' + file.r2Key, { method: 'DELETE', orgId: activeOrg || '' }); } catch (e) {}
      setR2Files(prev => prev.filter(f => f.id !== file.id));
    } else {
      setUploadedFiles(prev => prev.filter(f => f.id !== file.id));
    }
    setDetailIdx(-1);
    toast('Tiedosto poistettu', 'success');
  };

  const onDragEnter = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCounter.current++; if (dragCounter.current === 1) setDragging(true); };
  const onDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCounter.current--; if (dragCounter.current === 0) setDragging(false); };
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragging(false); dragCounter.current = 0;
    if (e.dataTransfer.files?.length) handleUpload(Array.from(e.dataTransfer.files));
  };

  useEffect(() => {
    if (detailIdx < 0) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' && detailIdx < sorted.length - 1) setDetailIdx(detailIdx + 1);
      else if (e.key === 'ArrowLeft' && detailIdx > 0) setDetailIdx(detailIdx - 1);
      else if (e.key === 'Escape') setDetailIdx(-1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [detailIdx, sorted.length]);

  const detail = detailIdx >= 0 && detailIdx < sorted.length ? sorted[detailIdx] : null;

  return (
    <>
      <div onDragEnter={onDragEnter} onDragLeave={onDragLeave} onDragOver={onDragOver} onDrop={onDrop}>
        {dragging && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(26,143,196,.12)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{ background: 'var(--card)', border: '3px dashed var(--pri)', borderRadius: 20, padding: '3rem 4rem', textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', marginBottom: '1rem', opacity: .5 }}>{'↑'}</div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--t1)', marginBottom: '.5rem' }}>Pudota tiedostot tähän</h3>
              <p style={{ fontSize: '.85rem', color: 'var(--t2)' }}>Kuvat, videot ja grafiikat</p>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
            <div style={{ position: 'relative' }}>
              <input className="input" placeholder="Hae tiedostoja..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: 280, paddingLeft: '2rem', fontSize: '.82rem' }} />
              <span style={{ position: 'absolute', left: '.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)', fontSize: '.85rem' }}>{'⌕'}</span>
            </div>
            <span style={{ fontSize: '.75rem', color: 'var(--t3)' }}>{allFiles.length} tiedostoa</span>
          </div>
          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
            <select className="input" value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ width: 'auto', fontSize: '.78rem' }}>
              <option value="name">Nimi</option><option value="size">Koko</option><option value="date">Päivämäärä</option>
            </select>
            <button
              className={`btn btn-sm ${selectMode ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => { setSelectMode(m => !m); if (selectMode) setSelectedIds([]); }}
              title="Valintatila: valitse useita kuvia"
            >
              {selectMode ? `Valinta (${selectedIds.length})` : 'Valitse'}
            </button>
            {canEdit && (
              <>
                <button className="btn btn-primary btn-sm" onClick={() => fileRef.current?.click()}>+ Lisää tiedostoja</button>
                <input ref={fileRef} type="file" multiple accept="image/*,video/*,.svg,.pdf,.doc,.docx" style={{ display: 'none' }} onChange={e => { if (e.target.files?.length) handleUpload(Array.from(e.target.files)); e.target.value = ''; }} />
              </>
            )}
          </div>
        </div>

        {uploading && (
          <div style={{ marginBottom: '1rem', padding: '.75rem 1rem', background: 'rgba(26,143,196,.08)', border: '1px solid rgba(26,143,196,.2)', borderRadius: 'var(--r)', display: 'flex', alignItems: 'center', gap: '.75rem' }}>
            <div className="typing"><span /><span /><span /></div>
            <span style={{ fontSize: '.82rem', fontWeight: 600, color: 'var(--pri-l)' }}>Ladataan pilveen... {uploadProgress}</span>
          </div>
        )}

        {canEdit && (
          <div onClick={() => fileRef.current?.click()} style={{ marginBottom: '1.5rem', border: '2px dashed var(--border)', borderRadius: 'var(--r)', padding: '1.5rem', textAlign: 'center', cursor: 'pointer', transition: 'all .2s', background: 'var(--elev)' }}
            onMouseEnter={e => { (e.currentTarget as any).style.borderColor = 'var(--pri)'; }} onMouseLeave={e => { (e.currentTarget as any).style.borderColor = 'var(--border)'; }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '.5rem', opacity: .5 }}>{'↑'}</div>
            <p style={{ fontSize: '.85rem', fontWeight: 600, color: 'var(--t2)', marginBottom: '.25rem' }}>Vedä ja pudota tiedostoja tähän</p>
            <p style={{ fontSize: '.75rem', color: 'var(--t3)' }}>tai klikkaa valitaksesi {'·'} kuvat, videot, grafiikat, PDF</p>
          </div>
        )}

        {collections.length > 0 && (
          <div style={{ marginBottom: '1rem', display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
            {collections.map(c => (
              <span key={c.id} style={{ fontSize: '.72rem', padding: '.25rem .6rem', borderRadius: 9999, background: 'var(--elev)', border: '1px solid var(--border)', borderLeft: `3px solid ${c.color}`, fontWeight: 600 }}>
                {c.name} ({c.fileIds.length})
              </span>
            ))}
          </div>
        )}

        <div className="mb-grid" style={{ paddingBottom: selectedIds.length > 0 ? 90 : 0 }}>
          {sorted.map((f, i) => {
            const m = getMeta(f.id);
            const isSelected = selectedIds.includes(f.id);
            const cardClick = () => {
              if (selectMode && f.type === 'image') {
                toggleSelect(f.id);
              } else {
                setDetailIdx(i);
              }
            };
            return (
              <div
                key={f.id}
                className="mb-item"
                onClick={cardClick}
                style={isSelected ? { outline: '3px solid var(--pri)', outlineOffset: -3 } : undefined}
              >
                <div className="mb-thumb">
                  {f.type === 'image' && (f.thumb || f.path) ? <img src={f.thumb || f.path} alt={m.title || f.name} loading="lazy" decoding="async" width={200} height={160} /> : <div className="mb-thumb-icon">{'□'}</div>}
                  <span className="mb-badge">{f.ext}</span>
                  {f.source === 'r2' && <span className="mb-badge" style={{ left: '.5rem', right: 'auto', bottom: '.5rem', top: 'auto', background: 'rgba(26,143,196,.85)', fontSize: '.55rem' }}>Pilvi</span>}
                  {selectMode && f.type === 'image' && (
                    <div style={{
                      position: 'absolute', top: '.5rem', left: '.5rem',
                      width: 26, height: 26, borderRadius: '50%',
                      background: isSelected ? 'var(--pri)' : 'rgba(0,0,0,.55)',
                      border: '2px solid #fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontSize: '.85rem', fontWeight: 700,
                      backdropFilter: 'blur(8px)',
                    }}>
                      {isSelected ? '✓' : ''}
                    </div>
                  )}
                </div>
                <div className="mb-meta">
                  <h4>{m.title || f.name}</h4>
                  <p>{formatSize(f.size)}</p>
                  {m.tags?.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', marginTop: '.3rem' }}>
                      {m.tags.slice(0, 3).map((tag, j) => <span key={j} style={{ fontSize: '.55rem', padding: '.1rem .35rem', borderRadius: 4, background: 'rgba(26,143,196,.1)', color: 'var(--pri-l)', fontWeight: 600 }}>{tag}</span>)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── SELECTION ACTION BAR ── */}
        {selectedIds.length > 0 && (
          <div style={{
            position: 'fixed',
            left: '50%',
            bottom: '1.5rem',
            transform: 'translateX(-50%)',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 9999,
            padding: '.55rem .65rem .55rem 1.1rem',
            boxShadow: '0 10px 40px rgba(0,0,0,.45)',
            display: 'flex',
            alignItems: 'center',
            gap: '.6rem',
            zIndex: 80,
            backdropFilter: 'blur(12px)',
          }}>
            <span style={{ fontSize: '.78rem', fontWeight: 600, color: 'var(--t1)' }}>
              {selectedIds.length} valittu
            </span>
            <span style={{ width: 1, height: 22, background: 'var(--border)' }} />
            <button
              className="btn btn-sm btn-secondary"
              onClick={() => sendToEditor()}
              style={{ fontSize: '.72rem', fontWeight: 600 }}
            >
              Vie editoriin
            </button>
            <button
              className="btn btn-sm btn-primary"
              onClick={() => { setAiOpen(true); setAiResult(''); }}
              style={{ fontSize: '.72rem', fontWeight: 600 }}
            >
              Luo AI-postaus
            </button>
            <button
              onClick={clearSelection}
              style={{
                background: 'transparent', border: 'none', color: 'var(--t3)',
                cursor: 'pointer', fontSize: '1rem', padding: '.25rem .5rem',
              }}
              title="Tyhjennä valinta"
            >
              ✕
            </button>
          </div>
        )}

        {sorted.length === 0 && !uploading && (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--t3)' }}>
            <div style={{ fontSize: '2rem', marginBottom: '1rem', opacity: .3 }}>{'▣'}</div>
            <h3 style={{ fontWeight: 700, marginBottom: '.5rem' }}>Ei tiedostoja</h3>
            <p style={{ fontSize: '.85rem' }}>Lataa ensimmäinen tiedosto ylhäältä tai vedä ja pudota tähän.</p>
          </div>
        )}
      </div>

      {detail && (
        <div className="mb-detail" onClick={() => setDetailIdx(-1)}>
          <div style={{ display: 'flex', alignItems: 'center', width: '100%', height: '100%', position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setDetailIdx(-1)} style={{ position: 'absolute', top: '.75rem', right: '.75rem', background: 'rgba(0,0,0,.5)', border: 'none', color: '#fff', fontSize: '1.3rem', width: 40, height: 40, borderRadius: '50%', cursor: 'pointer', zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }}>{'✕'}</button>
            <div style={{ position: 'absolute', top: '1rem', left: '50%', transform: 'translateX(-50%)', color: 'rgba(255,255,255,.6)', fontSize: '.78rem', fontWeight: 600, zIndex: 20 }}>{detailIdx + 1} / {sorted.length}</div>

            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }} onClick={() => setDetailIdx(-1)}>
              {detailIdx > 0 && (
                <button onClick={e => { e.stopPropagation(); setDetailIdx(detailIdx - 1); }} style={{ position: 'absolute', left: '.5rem', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,.6)', border: '1px solid rgba(255,255,255,.1)', color: '#fff', fontSize: '1.3rem', width: 44, height: 44, borderRadius: '50%', cursor: 'pointer', zIndex: 10, backdropFilter: 'blur(8px)' }}>{'←'}</button>
              )}
              {detailIdx < sorted.length - 1 && (
                <button onClick={e => { e.stopPropagation(); setDetailIdx(detailIdx + 1); }} style={{ position: 'absolute', right: '.5rem', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,.6)', border: '1px solid rgba(255,255,255,.1)', color: '#fff', fontSize: '1.3rem', width: 44, height: 44, borderRadius: '50%', cursor: 'pointer', zIndex: 10, backdropFilter: 'blur(8px)' }}>{'→'}</button>
              )}
              {detail.type === 'image' && <img src={detail.path || detail.thumb} alt="" style={{ maxWidth: 'calc(100% - 100px)', maxHeight: '85vh', objectFit: 'contain', borderRadius: 'var(--r)', boxShadow: '0 8px 40px rgba(0,0,0,.5)' }} onClick={e => e.stopPropagation()} />}
            </div>

            <div style={{ width: 320, flexShrink: 0, background: 'var(--card)', borderLeft: '1px solid var(--border)', padding: '1.25rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }} onClick={e => e.stopPropagation()}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, wordBreak: 'break-word' }}>{getMeta(detail.id).title || detail.name}</h3>
              <p style={{ fontSize: '.78rem', color: 'var(--t2)' }}>
                {formatSize(detail.size)} {'·'} {detail.ext.toUpperCase()} {'·'} {detail.folder}
                {detail.source === 'r2' && <span style={{ marginLeft: '.4rem', color: 'var(--pri-l)' }}>Pilvi</span>}
              </p>

              {getMeta(detail.id).tags?.length > 0 && (
                <div>
                  <div style={{ fontSize: '.72rem', fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', marginBottom: '.4rem' }}>Avainsanat</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.3rem' }}>
                    {getMeta(detail.id).tags.map((tag, j) => (
                      <span key={j} style={{ fontSize: '.68rem', padding: '.2rem .5rem', borderRadius: 9999, fontWeight: 600, background: 'rgba(26,143,196,.1)', color: 'var(--pri-l)', border: '1px solid rgba(26,143,196,.15)' }}>{tag}</span>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '.75rem', marginTop: 'auto' }}>
                <div style={{ fontSize: '.72rem', color: 'var(--t3)', lineHeight: 1.8 }}>
                  <div><strong>Tiedosto:</strong> {detail.name}</div>
                  <div><strong>Koko:</strong> {formatSize(detail.size)}</div>
                  {detail.added && <div><strong>Lisätty:</strong> {detail.added}</div>}
                </div>

                <a href={detail.path || detail.thumb} download={detail.name} className="btn btn-sm btn-primary" style={{ marginTop: '.75rem', width: '100%', textDecoration: 'none', textAlign: 'center', display: 'block', fontSize: '.75rem', fontWeight: 600 }}>Lataa tiedosto</a>
                <button className="btn btn-sm btn-secondary" onClick={() => { navigator.clipboard.writeText(detail.path || detail.thumb || ''); toast('Linkki kopioitu', 'success'); }} style={{ marginTop: '.4rem', width: '100%', fontSize: '.75rem', fontWeight: 600 }}>Kopioi linkki</button>
                {canEdit && (
                  <button className="btn btn-sm" onClick={() => deleteFile(detail)} style={{ marginTop: '.4rem', width: '100%', color: 'var(--red)', border: '1px solid rgba(239,68,68,.3)', background: 'rgba(239,68,68,.05)', fontSize: '.75rem', fontWeight: 600 }}>Poista tiedosto</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── AI POST MODAL ── */}
      {aiOpen && (
        <div
          onClick={() => !aiBusy && setAiOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.72)',
            zIndex: 150, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1rem', backdropFilter: 'blur(6px)',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: 'var(--rl)', width: 720, maxWidth: '95vw',
              maxHeight: '90vh', display: 'flex', flexDirection: 'column',
              boxShadow: '0 20px 80px rgba(0,0,0,.6)',
            }}
          >
            {/* Header */}
            <div style={{
              padding: '1.1rem 1.4rem', borderBottom: '1px solid var(--border)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
            }}>
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 500 }}>
                  Luo postaus tekoälyllä
                </h3>
                <p style={{ fontSize: '.72rem', color: 'var(--t3)', marginTop: '.2rem' }}>
                  {selectedFiles.length} kuvaa valittu · AI käyttää kuvien avainsanoja ja kuvauksia kontekstina
                </p>
              </div>
              <button
                onClick={() => setAiOpen(false)}
                disabled={aiBusy}
                className="btn btn-ghost btn-sm"
                style={{ fontSize: '1rem' }}
              >
                ✕
              </button>
            </div>

            {/* Body — scrollable */}
            <div style={{ padding: '1.1rem 1.4rem', overflowY: 'auto', flex: 1 }}>
              {/* Selected image thumbs */}
              <div style={{
                display: 'flex', gap: '.45rem', marginBottom: '1rem',
                flexWrap: 'wrap', paddingBottom: '.75rem',
                borderBottom: '1px solid var(--border)',
              }}>
                {selectedFiles.map(f => (
                  <div
                    key={f.id}
                    style={{
                      width: 56, height: 56, borderRadius: 'var(--r)',
                      overflow: 'hidden', position: 'relative',
                      border: '1px solid var(--border)', flexShrink: 0,
                    }}
                  >
                    <img src={f.thumb || f.path} alt={f.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                ))}
              </div>

              {/* Channel + tone */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem', marginBottom: '.75rem' }}>
                <div>
                  <label style={{ fontSize: '.7rem', color: 'var(--t3)', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>Kanava</label>
                  <select className="input" value={aiChannel} onChange={e => setAiChannel(e.target.value)} style={{ width: '100%', fontSize: '.8rem' }}>
                    <option>Instagram Feed</option>
                    <option>Instagram Stories</option>
                    <option>Instagram Reels</option>
                    <option>Facebook</option>
                    <option>TikTok</option>
                    <option>LinkedIn</option>
                    <option>Uutiskirje</option>
                    <option>Verkkosivut</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '.7rem', color: 'var(--t3)', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>Tunnelma</label>
                  <select className="input" value={aiTone} onChange={e => setAiTone(e.target.value)} style={{ width: '100%', fontSize: '.8rem' }}>
                    <option>Lämmin ja innostunut</option>
                    <option>Rohkea ja taiteellinen</option>
                    <option>Informoiva ja selkeä</option>
                    <option>Leikkisä ja kutsuva</option>
                    <option>Arvokas ja vakaa</option>
                  </select>
                </div>
              </div>

              {/* Context / prompt */}
              <label style={{ fontSize: '.7rem', color: 'var(--t3)', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>
                Lisäohje (valinnainen)
              </label>
              <textarea
                value={aiPrompt}
                onChange={e => setAiPrompt(e.target.value)}
                placeholder="Esim. 'Kirjoita postaus valittujen kuvien pohjalta'"
                className="input"
                rows={3}
                style={{ width: '100%', fontSize: '.82rem', resize: 'vertical', marginBottom: '1rem' }}
              />

              {/* Result */}
              {aiResult && (
                <div style={{
                  padding: '1rem 1.15rem',
                  background: 'var(--elev)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r)',
                  fontSize: '.85rem',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  marginBottom: '.5rem',
                  color: 'var(--t1)',
                }}>
                  {aiResult}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{
              padding: '.9rem 1.4rem', borderTop: '1px solid var(--border)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              gap: '.5rem', flexWrap: 'wrap',
            }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setAiOpen(false)}
                disabled={aiBusy}
              >
                Peruuta
              </button>
              <div style={{ display: 'flex', gap: '.5rem' }}>
                {aiResult && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => { navigator.clipboard.writeText(aiResult); toast('Teksti kopioitu', 'success'); }}
                  >
                    Kopioi teksti
                  </button>
                )}
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={generateAiPost}
                  disabled={aiBusy}
                >
                  {aiBusy ? 'Kirjoitetaan...' : aiResult ? 'Luo uusi versio' : 'Luo postaus'}
                </button>
                {aiResult && (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => sendToEditor(aiResult)}
                    disabled={aiBusy}
                  >
                    Vie editoriin
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
