'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useOrgData } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { useIsMobile } from '@/lib/use-mobile';
import { storage } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

interface AudioRec {
  id: string;
  name: string;
  url: string;          // Firebase Storage download URL
  storagePath: string;  // path bucketissa (poistoa varten)
  size: number;
  type: string;
  duration?: number;    // sekunteina
  uploadedAt: string;   // ISO
  uploadedBy?: string;
}

const EMPTY: AudioRec[] = [];
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

function fmtTime(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}
function fmtSize(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} kB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}
function sanitize(name: string): string {
  return name.replace(/[^\w.\-]+/g, '_').slice(0, 80);
}
function getAudioDuration(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const a = document.createElement('audio');
    a.preload = 'metadata';
    a.onloadedmetadata = () => resolve(a.duration);
    a.onerror = () => reject(new Error('metadata'));
    a.src = url;
  });
}

// ── Yksittäisen äänitteen soitin nopeussäädöllä ────────────────────────────
function AudioPlayer({ src, initialDuration }: { src: string; initialDuration?: number }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(initialDuration || 0);
  const [rate, setRate] = useState(1);
  const [preservePitch, setPreservePitch] = useState(true);

  // Aseta toistonopeus ja äänenkorkeuden säilytys aina kun ne muuttuvat
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.playbackRate = rate;
    a.preservesPitch = preservePitch;
    // vendor-prefiksit vanhemmille selaimille
    (a as unknown as { mozPreservesPitch?: boolean }).mozPreservesPitch = preservePitch;
    (a as unknown as { webkitPreservesPitch?: boolean }).webkitPreservesPitch = preservePitch;
  }, [rate, preservePitch]);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) { a.play(); setPlaying(true); }
    else { a.pause(); setPlaying(false); }
  };

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const a = audioRef.current;
    if (!a) return;
    const t = Number(e.target.value);
    a.currentTime = t;
    setCur(t);
  };

  return (
    <div style={{ marginTop: '.75rem' }}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={e => setDur(e.currentTarget.duration)}
        onTimeUpdate={e => setCur(e.currentTarget.currentTime)}
        onEnded={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
        <button
          onClick={toggle}
          aria-label={playing ? 'Tauko' : 'Toista'}
          style={{
            width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
            background: 'var(--pri)', color: '#fff', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem',
          }}
        >{playing ? '❚❚' : '►'}</button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <input
            type="range" min={0} max={dur || 0} step={0.1} value={Math.min(cur, dur || 0)}
            onChange={seek}
            style={{ width: '100%', accentColor: 'var(--pri)', cursor: 'pointer' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.7rem', color: 'var(--t3)', fontVariantNumeric: 'tabular-nums' }}>
            <span>{fmtTime(cur)}</span>
            <span>{fmtTime(dur)}</span>
          </div>
        </div>
      </div>

      {/* Nopeussäätö */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexWrap: 'wrap', marginTop: '.6rem' }}>
        <span style={{ fontSize: '.62rem', color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600, marginRight: '.2rem' }}>Nopeus</span>
        {SPEEDS.map(s => {
          const active = Math.abs(s - rate) < 0.001;
          return (
            <button
              key={s}
              onClick={() => setRate(s)}
              style={{
                fontSize: '.72rem', fontWeight: 600, padding: '.2rem .5rem', cursor: 'pointer',
                borderRadius: 9999, fontVariantNumeric: 'tabular-nums',
                border: `1px solid ${active ? 'var(--pri)' : 'var(--border)'}`,
                background: active ? 'var(--pri)' : 'transparent',
                color: active ? '#fff' : 'var(--t2)',
              }}
            >{s}×</button>
          );
        })}
        <label style={{ display: 'flex', alignItems: 'center', gap: '.3rem', fontSize: '.68rem', color: 'var(--t3)', cursor: 'pointer', marginLeft: '.4rem' }}>
          <input type="checkbox" checked={preservePitch} onChange={e => setPreservePitch(e.target.checked)} style={{ accentColor: 'var(--pri)' }} />
          Säilytä äänenkorkeus
        </label>
      </div>
    </div>
  );
}

export default function AaniteSection() {
  const { canEdit, activeOrg, user } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [recs, setRecs] = useOrgData<AudioRec[]>('aanitteet', EMPTY);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Tämän session aikana ladattujen tiedostojen paikalliset object-URLit → välitön toisto ilman latausta
  const [localUrls, setLocalUrls] = useState<Record<string, string>>({});
  const localUrlsRef = useRef<Record<string, string>>({});
  useEffect(() => { localUrlsRef.current = localUrls; }, [localUrls]);

  // Vapauta object-URLit kun komponentti puretaan
  useEffect(() => () => { Object.values(localUrlsRef.current).forEach(u => URL.revokeObjectURL(u)); }, []);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!activeOrg) { toast('Ei aktiivista työtilaa', 'error'); return; }
    setUploading(true);
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('audio/')) { toast(`${file.name} ei ole äänitiedosto`, 'error'); continue; }
      const id = 'a_' + Date.now() + '_' + Math.floor(Math.random() * 1e4);
      const localUrl = URL.createObjectURL(file);
      setLocalUrls(prev => ({ ...prev, [id]: localUrl }));
      let duration: number | undefined;
      try { duration = await getAudioDuration(localUrl); } catch { /* ohita */ }
      try {
        const path = `organizations/${activeOrg}/aanite/${id}-${sanitize(file.name)}`;
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, file, { contentType: file.type });
        const url = await getDownloadURL(storageRef);
        const rec: AudioRec = {
          id, name: file.name, url, storagePath: path,
          size: file.size, type: file.type, duration,
          uploadedAt: new Date().toISOString(), uploadedBy: user?.uid,
        };
        setRecs(prev => [rec, ...prev]);
        toast('Äänite ladattu', 'success');
      } catch (e) {
        console.error('Äänitteen lataus epäonnistui:', e);
        toast('Lataus pilveen epäonnistui — tarkista Storage-oikeudet', 'error');
      }
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = '';
  }, [activeOrg, user, setRecs, toast]);

  const remove = async (rec: AudioRec) => {
    setRecs(prev => prev.filter(r => r.id !== rec.id));
    const local = localUrlsRef.current[rec.id];
    if (local) {
      URL.revokeObjectURL(local);
      setLocalUrls(prev => { const n = { ...prev }; delete n[rec.id]; return n; });
    }
    try { await deleteObject(ref(storage, rec.storagePath)); } catch { /* tiedosto saattaa jo puuttua */ }
    toast('Äänite poistettu', 'success');
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '.5rem' }}>
        <div style={{ fontSize: '.78rem', color: 'var(--t3)' }}>{recs.length} äänitettä</div>
      </div>

      {/* Latausalue */}
      {canEdit && (
        <div
          onClick={() => !uploading && inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
          style={{
            border: `2px dashed ${dragOver ? 'var(--pri)' : 'var(--border)'}`,
            borderRadius: 'var(--rl)', padding: isMobile ? '1.5rem 1rem' : '2.25rem',
            textAlign: 'center', cursor: uploading ? 'wait' : 'pointer', marginBottom: '1.5rem',
            background: dragOver ? 'rgba(5,107,159,.06)' : 'transparent', transition: 'all .2s',
          }}
        >
          <div style={{ fontSize: '1.6rem', color: 'var(--t3)', marginBottom: '.4rem' }}>♪</div>
          <div style={{ fontSize: '.9rem', fontWeight: 600, color: 'var(--t1)' }}>
            {uploading ? 'Ladataan…' : 'Lataa oma äänite'}
          </div>
          <div style={{ fontSize: '.75rem', color: 'var(--t3)', marginTop: '.3rem' }}>
            Klikkaa tai raahaa äänitiedosto tähän (mp3, m4a, wav, ogg…)
          </div>
          <input
            ref={inputRef} type="file" accept="audio/*" multiple
            onChange={e => handleFiles(e.target.files)}
            style={{ display: 'none' }}
          />
        </div>
      )}

      {/* Äänitelista */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
        {recs.map(rec => (
          <div key={rec.id} style={{
            background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)',
            padding: '1rem 1.25rem', borderLeft: '4px solid var(--pri)',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '.75rem' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '.95rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rec.name}</div>
                <div style={{ fontSize: '.7rem', color: 'var(--t3)', marginTop: '.15rem' }}>
                  {fmtSize(rec.size)}
                  {rec.duration ? ` · ${fmtTime(rec.duration)}` : ''}
                  {` · ${new Date(rec.uploadedAt).toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric', year: 'numeric' })}`}
                </div>
              </div>
              {canEdit && (
                <button className="btn btn-ghost btn-sm" onClick={() => remove(rec)} style={{ color: 'var(--red)', flexShrink: 0 }}>×</button>
              )}
            </div>
            <AudioPlayer src={localUrls[rec.id] || rec.url} initialDuration={rec.duration} />
          </div>
        ))}
        {recs.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--t3)' }}>
            Ei äänitteitä vielä. {canEdit ? 'Lataa ensimmäinen ylhäältä.' : ''}
          </div>
        )}
      </div>
    </>
  );
}
