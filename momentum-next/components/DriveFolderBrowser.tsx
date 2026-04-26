'use client';

import { useState, useEffect, useCallback } from 'react';
import { useOrgData } from '@/lib/firestore';
import { useDriveStatus, listFolderChildren, DriveFile } from '@/lib/drive';
import DrivePicker, { PickedItem } from './DrivePicker';
import { useToast } from '@/lib/toast';

// Drive-tiedoston thumbnail-osio. Yrittää useita lähteitä:
// 1. Drive APIn palauttama thumbnailLink (vain joillekin tyypeille — esim. HEIC ei aina saa)
// 2. drive.google.com/thumbnail?id=...&sz=w400 — toimii useimmille tiedostoille jos käyttäjä on
//    kirjautuneena samalle Google-tilille selaimessa
// 3. Tiedostoikoni viimeisenä fallbackina
function DriveFileTile({ file }: { file: DriveFile }) {
  const [stage, setStage] = useState<'primary' | 'fallback' | 'icon'>(file.thumbnailLink ? 'primary' : 'fallback');
  const isImage = file.mimeType.startsWith('image/');
  const isVideo = file.mimeType.startsWith('video/');

  const fallbackUrl = `https://drive.google.com/thumbnail?id=${file.id}&sz=w400`;

  return (
    <a
      href={file.webViewLink}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'flex', flexDirection: 'column',
        background: 'var(--elev)', border: '1px solid var(--border)',
        textDecoration: 'none', color: 'var(--t1)',
        overflow: 'hidden',
      }}
      title={file.name}
    >
      <div style={{
        width: '100%', aspectRatio: '4/3', background: 'var(--paper-d)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative', overflow: 'hidden',
      }}>
        {stage !== 'icon' && (
          <img
            src={stage === 'primary' && file.thumbnailLink ? file.thumbnailLink : fallbackUrl}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            onError={() => {
              if (stage === 'primary') setStage('fallback');
              else setStage('icon');
            }}
          />
        )}
        {stage === 'icon' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: 'var(--ink2)' }}>
            {file.iconLink ? (
              <img src={file.iconLink} alt="" style={{ width: 32, height: 32 }} />
            ) : (
              <span style={{ fontSize: 24 }}>{isVideo ? '▶' : isImage ? '◰' : '⎘'}</span>
            )}
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 9, letterSpacing: '.16em', textTransform: 'uppercase' }}>
              {(file.name.split('.').pop() || file.mimeType.split('/').pop() || '').toUpperCase()}
            </span>
          </div>
        )}
      </div>
      <div style={{ padding: '.5rem .65rem' }}>
        <div style={{ fontSize: '.78rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {file.name}
        </div>
        {file.modifiedTime && (
          <div style={{ fontSize: '.65rem', color: 'var(--t3)', marginTop: 2 }}>
            {new Date(file.modifiedTime).toLocaleDateString('fi-FI')}
          </div>
        )}
      </div>
    </a>
  );
}

export interface LinkedFolder {
  id: string;        // Drive folder id
  name: string;
  addedAt: number;
  url?: string;
}

interface Props {
  /** Esim. 'image/' rajaa vain kuvat, 'video/' vain videot. Tyhjä = kaikki. */
  mimeStartsWith?: string;
  /** useOrgData-avain jonka alle linkitetyt kansiot tallennetaan */
  storageKey?: string;
  /** Otsikon teksti */
  title?: string;
}

// Yksittäisen kansion kortti — kansio-ikoni + nimi + auki/kiinni-toggle.
// Lazy-lataa sisällön kun avataan ensimmäistä kertaa.
function FolderCard({
  folder,
  mimeStartsWith,
  driveConnected,
  onRemove,
}: {
  folder: LinkedFolder;
  mimeStartsWith?: string;
  driveConnected: boolean;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<DriveFile[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!driveConnected) return;
    setLoading(true); setError(null);
    try {
      const f = await listFolderChildren(folder.id, { mimeStartsWith });
      setFiles(f);
    } catch (e: any) {
      setError(e?.message || 'Kansion lataus epäonnistui');
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [folder.id, mimeStartsWith, driveConnected]);

  useEffect(() => {
    if (open && files === null && !loading) load();
  }, [open, files, loading, load]);

  // Esikatselu: 3 ensimmäistä kuvaa kansion ikonin sisällä kun on ladattu
  const previews = (files || []).slice(0, 3);

  return (
    <div style={{ background: 'var(--paper-l)', border: '1px solid var(--rule)', overflow: 'hidden' }}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(o => !o)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o); } }}
        aria-expanded={open}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 14,
          padding: '12px 14px', cursor: 'pointer',
          color: 'var(--ink)',
        }}
      >
        <FolderIcon previews={previews} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 500,
            letterSpacing: '.04em', textTransform: 'uppercase',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {folder.name}
          </div>
          <div style={{
            fontFamily: 'var(--font-display)', fontSize: 10, color: 'var(--ink2)',
            letterSpacing: '.16em', textTransform: 'uppercase', marginTop: 2,
          }}>
            {files === null ? (open ? 'Ladataan…' : 'Klikkaa avataksesi')
              : files.length === 0 ? 'Tyhjä kansio'
              : `${files.length} ${files.length === 1 ? 'kuva' : 'kuvaa'}`}
          </div>
        </div>
        {folder.url && (
          <a
            href={folder.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{
              fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '.16em',
              textTransform: 'uppercase', color: 'var(--ink2)', textDecoration: 'none',
              padding: '4px 8px', border: '1px solid var(--rule)',
            }}
            title="Avaa Drivessä"
          >
            Drive ↗
          </a>
        )}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          title="Poista kansion linkki"
          style={{ background: 'none', border: 'none', color: 'var(--ink3)', cursor: 'pointer', fontSize: 16, padding: '0 6px' }}
          aria-label="Poista linkki"
        >×</button>
        <span style={{
          fontFamily: 'var(--font-display)', fontSize: 12, color: 'var(--ink2)',
          display: 'inline-block', width: 12, textAlign: 'center',
          transform: open ? 'rotate(0)' : 'rotate(-90deg)', transition: 'transform .2s',
        }}>▾</span>
      </div>

      {open && (
        <div style={{ padding: '12px 14px 16px', borderTop: '1px solid var(--rule)' }}>
          {loading ? (
            <div className="typing"><span /><span /><span /></div>
          ) : error ? (
            <div style={{ fontSize: '.78rem', color: 'var(--red)' }}>{error}</div>
          ) : !files || files.length === 0 ? (
            <div style={{ fontSize: '.78rem', color: 'var(--ink3)' }}>Tyhjä kansio (tai ei sisällä haettuja tiedostotyyppejä).</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '.6rem' }}>
              {files.map(file => <DriveFileTile key={file.id} file={file} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Kansio-ikoni Mac Finder -tyylillä, mutta editorial-tematiikkaan: ink-outline,
// alimmainen kansio-osa hieman tummempi paperi. Esikatselut peittävät etureunan jos on.
function FolderIcon({ previews }: { previews: DriveFile[] }) {
  return (
    <div style={{ position: 'relative', width: 56, height: 44, flexShrink: 0 }}>
      {/* Takimmainen tabi */}
      <div style={{
        position: 'absolute', left: 4, top: 0, width: 22, height: 8,
        background: 'var(--paper-d)', border: '1px solid var(--rule)', borderBottom: 'none',
      }} />
      {/* Pohja */}
      <div style={{
        position: 'absolute', left: 0, top: 6, right: 0, bottom: 0,
        background: 'var(--paper)', border: '1px solid var(--rule)',
        overflow: 'hidden',
      }}>
        {previews.length > 0 ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: previews.length === 1 ? '1fr' : 'repeat(2, 1fr)',
            gridTemplateRows: previews.length > 2 ? 'repeat(2, 1fr)' : '1fr',
            width: '100%', height: '100%', gap: 1, background: 'var(--rule)',
          }}>
            {previews.map(p => (
              <img
                key={p.id}
                src={p.thumbnailLink || `https://drive.google.com/thumbnail?id=${p.id}&sz=w200`}
                alt=""
                referrerPolicy="no-referrer"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={e => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function DriveFolderBrowser({
  mimeStartsWith = 'image/',
  storageKey = 'mediaDriveFolders',
  title = 'Drive-kansiot',
}: Props) {
  const { toast } = useToast();
  const driveStatus = useDriveStatus();
  const [folders, setFolders] = useOrgData<LinkedFolder[]>(storageKey as any, []);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const handlePicked = (items: PickedItem[]) => {
    const newFolders: LinkedFolder[] = items
      .filter(it => it.isFolder)
      .map(it => ({ id: it.id, name: it.name, addedAt: Date.now(), url: it.url }));
    if (newFolders.length === 0) {
      toast('Valitse Pickerissä yksi tai useampi kansio.', 'info');
      return;
    }
    setFolders(prev => {
      const existing = new Set(prev.map(f => f.id));
      return [...prev, ...newFolders.filter(f => !existing.has(f.id))];
    });
    toast(`${newFolders.length} kansio${newFolders.length === 1 ? '' : 'a'} linkitetty`, 'success');
  };

  const removeFolder = (id: string) => {
    setFolders(prev => prev.filter(f => f.id !== id));
  };

  if (!driveStatus.connected) {
    return (
      <div style={{ padding: '1rem', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', marginBottom: '1.5rem' }}>
        <div style={{ fontSize: '.78rem', color: 'var(--t2)' }}>
          Yhdistä Google Drive (Asetukset) jos haluat selata Drive-kansioita Momentumissa.
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: '1.5rem', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '.85rem 1.1rem', borderBottom: collapsed ? 'none' : '1px solid var(--border)', gap: 12 }}>
        <button
          type="button"
          onClick={() => setCollapsed(c => !c)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Avaa kansiot' : 'Sulje kansiot'}
          style={{
            background: 'transparent', border: 0, padding: 0, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 10, flex: 1, textAlign: 'left',
            color: 'var(--ink)',
          }}
        >
          <span style={{
            fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--ink2)',
            display: 'inline-block', width: 12, transition: 'transform .2s',
            transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
          }}>▾</span>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.82rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.04em' }}>
            {title} {folders.length > 0 && <span style={{ color: 'var(--t3)', marginLeft: 6 }}>({folders.length})</span>}
          </h3>
        </button>
        {!collapsed && (
          <button className="btn btn-ghost btn-sm" onClick={() => setPickerOpen(true)} style={{ fontSize: '.7rem' }}>
            + Linkitä kansio
          </button>
        )}
      </div>
      {!collapsed && (folders.length === 0 ? (
        <div style={{ padding: '1.25rem 1.1rem', fontSize: '.78rem', color: 'var(--t3)' }}>
          Ei linkitettyjä kansioita. Klikkaa <b>+ Linkitä kansio</b> ja valitse Drivesta.
        </div>
      ) : (
        <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {folders.map(f => (
            <FolderCard
              key={f.id}
              folder={f}
              mimeStartsWith={mimeStartsWith}
              driveConnected={driveStatus.connected}
              onRemove={() => removeFolder(f.id)}
            />
          ))}
        </div>
      ))}

      <DrivePicker
        mode="folder"
        multi
        open={pickerOpen}
        setOpen={setPickerOpen}
        onPick={handlePicked}
      />
    </div>
  );
}
