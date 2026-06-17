'use client';

import { useState } from 'react';
import {
  ACCENT_ORDER, ACCENTS, DEFAULT_NOTEBOOK, FINISH_NAMES, FONT_STACKS, FORMAT, FORMAT_ORDER,
  LEATHER, LEATHER_ORDER, Notebook, NotebookFolder, NotebookSticker, NOTEBOOK_FONT_ORDER,
  PAPER_NAMES, PAPER_ORDER, STICKER_LIBRARY, StickerLibraryDoc,
} from '@/lib/notebooks-shared';
import { newId } from '@/lib/personal-shared';
import { useAuth } from '@/lib/auth';
import { useUserData } from '@/lib/use-user-data';
import { uploadNotebookImage } from '@/lib/notebook-media';
import NotebookCoverTile from '@/components/notebooks/NotebookCoverTile';
import DrawingPad from '@/components/notebooks/DrawingPad';

// Muistikirjan luonti ja kannen muokkaus — elävä esikatselu vasemmalla,
// säätimet oikealla. Paper Republic -henkinen personointi.

interface Props {
  mode: 'create' | 'edit';
  initial: Notebook | null;
  /** Hylly johon uusi vihko luodaan (hyllyn +-paikasta avattaessa) */
  defaultFolderId?: string | null;
  folders: NotebookFolder[];
  onSave: (nb: Notebook) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

export default function NotebookCustomizer({ mode, initial, defaultFolderId, folders, onSave, onCancel, onDelete }: Props) {
  const { activeOrg } = useAuth();
  const [draft, setDraft] = useState<Notebook>(
    () => initial || { ...DEFAULT_NOTEBOOK(newId()), folderId: defaultFolderId ?? null },
  );
  const [stickerLib, setStickerLib] = useUserData<StickerLibraryDoc>('stickerLibrary', { items: [] });
  const [selectedSticker, setSelectedSticker] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [drawOpen, setDrawOpen] = useState(false);
  const set = (patch: Partial<Notebook>) => setDraft((d) => ({ ...d, ...patch }));

  const save = () => onSave({ ...draft, title: draft.title.trim() || 'Nimetön', updatedAt: Date.now() });

  const stickers = draft.stickers || [];
  const selected = stickers.find((s) => s.id === selectedSticker) || null;

  const addSticker = (src: string) => {
    const sticker: NotebookSticker = { id: newId(), src, x: 0.42, y: 0.62, scale: 1, rotation: -6 };
    set({ stickers: [...stickers, sticker] });
    setSelectedSticker(sticker.id);
  };

  const patchSticker = (id: string, patch: Partial<NotebookSticker>) => {
    set({ stickers: stickers.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  };

  const removeSticker = (id: string) => {
    set({ stickers: stickers.filter((s) => s.id !== id) });
    setSelectedSticker(null);
  };

  const uploadSticker = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadNotebookImage(file, activeOrg || '');
      if (url) {
        setStickerLib((prev) => ({
          items: [...(prev.items || []), { id: newId(), name: file.name.replace(/\.[^.]+$/, ''), src: url }],
        }));
        addSticker(url);
      }
    } finally {
      setUploading(false);
    }
  };

  const saveDrawnSticker = async (blob: Blob) => {
    setUploading(true);
    try {
      const file = new File([blob], 'tarra.png', { type: 'image/png' });
      const url = await uploadNotebookImage(file, activeOrg || '');
      if (url) {
        setStickerLib((prev) => ({ items: [...(prev.items || []), { id: newId(), name: 'Oma piirros', src: url }] }));
        addSticker(url);
      }
    } finally {
      setUploading(false);
      setDrawOpen(false);
    }
  };

  return (
    <div className="modal-ov" onClick={onCancel}>
      <div className="modal nb-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <h3>{mode === 'create' ? 'Uusi muistikirja' : 'Muokkaa muistikirjaa'}</h3>
          <button className="modal-x" onClick={onCancel} aria-label="Sulje">×</button>
        </div>
        <div className="modal-b" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <div className="nb-cust">
            <div className="nb-preview">
              <NotebookCoverTile
                notebook={draft}
                scale={1.15}
                stickerEdit={{
                  selectedId: selectedSticker,
                  onSelect: setSelectedSticker,
                  onMove: (id, x, y) => patchSticker(id, { x, y }),
                }}
              />
              <div style={{ fontSize: '.78rem', color: 'var(--t2)', maxWidth: 180, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {draft.title || 'Nimetön'}
              </div>
              {stickers.length > 0 && (
                <div style={{ fontSize: '.68rem', color: 'var(--t3)', textAlign: 'center' }}>
                  Raahaa tarraa kannella siirtääksesi sitä
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              <div className="field">
                <label>Nimi</label>
                <input
                  className="input"
                  value={draft.title}
                  placeholder="Muistikirjan nimi"
                  autoFocus={mode === 'create'}
                  onChange={(e) => set({ title: e.target.value })}
                />
              </div>

              <div className="field">
                <label>Kansio</label>
                <select
                  className="input"
                  value={draft.folderId || ''}
                  onChange={(e) => set({ folderId: e.target.value || null })}
                >
                  <option value="">Ei kansiota</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: '.75rem' }}>
                <div className="field">
                  <label>Etiketti kanteen</label>
                  <input
                    className="input"
                    value={draft.label || ''}
                    placeholder="Esim. Ideat"
                    maxLength={16}
                    onChange={(e) => set({ label: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Nimikirjaimet</label>
                  <input
                    className="input"
                    value={draft.initials || ''}
                    placeholder="AB"
                    maxLength={3}
                    onChange={(e) => set({ initials: e.target.value.toUpperCase() })}
                  />
                </div>
              </div>

              <div className="field">
                <label>Kannen väri</label>
                <div className="nb-swatches">
                  {LEATHER_ORDER.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`nb-swatch${draft.cover === c ? ' sel' : ''}`}
                      style={{ background: `linear-gradient(135deg, ${LEATHER[c].hi}, ${LEATHER[c].lo})` }}
                      title={LEATHER[c].name}
                      aria-label={LEATHER[c].name}
                      onClick={() => set({ cover: c })}
                    />
                  ))}
                </div>
              </div>

              <div className="field">
                <label>Pinta</label>
                <div className="nb-opt-row">
                  {(['smooth', 'grained'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      className={`nb-tool${draft.finish === f ? ' act' : ''}`}
                      onClick={() => set({ finish: f })}
                    >
                      {FINISH_NAMES[f]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="field">
                <label>Kuminauha</label>
                <div className="nb-swatches">
                  {ACCENT_ORDER.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`nb-swatch${draft.band === c ? ' sel' : ''}`}
                      style={{ background: ACCENTS[c].hex }}
                      title={ACCENTS[c].name}
                      aria-label={ACCENTS[c].name}
                      onClick={() => set({ band: c })}
                    />
                  ))}
                </div>
              </div>

              <div className="field">
                <label>Lukunauha</label>
                <div className="nb-swatches">
                  {ACCENT_ORDER.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`nb-swatch${draft.ribbon === c ? ' sel' : ''}`}
                      style={{ background: ACCENTS[c].hex }}
                      title={ACCENTS[c].name}
                      aria-label={ACCENTS[c].name}
                      onClick={() => set({ ribbon: c })}
                    />
                  ))}
                </div>
              </div>

              <div className="field">
                <label>Koko</label>
                <div className="nb-opt-row">
                  {FORMAT_ORDER.map((f) => (
                    <button
                      key={f}
                      type="button"
                      className={`nb-tool${draft.format === f ? ' act' : ''}`}
                      onClick={() => set({ format: f })}
                    >
                      {FORMAT[f].name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="field">
                <label>Paperi</label>
                <div className="nb-opt-row">
                  {PAPER_ORDER.map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={`nb-paper-mini ${p === 'lined' ? 'lined' : p === 'dotted' ? 'dotted' : ''}${draft.paper === p ? ' sel' : ''}`}
                      title={PAPER_NAMES[p]}
                      aria-label={PAPER_NAMES[p]}
                      onClick={() => set({ paper: p })}
                    />
                  ))}
                  <span style={{ fontSize: '.72rem', color: 'var(--t3)', alignSelf: 'center' }}>
                    {PAPER_NAMES[draft.paper]}
                  </span>
                </div>
              </div>

              <div className="field">
                <label>Kirjoitusfontti</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
                  {NOTEBOOK_FONT_ORDER.map((f) => (
                    <button
                      key={f}
                      type="button"
                      className={`nb-font-opt${draft.font === f ? ' sel' : ''}`}
                      onClick={() => set({ font: f })}
                    >
                      <span className="aa" style={{ fontFamily: FONT_STACKS[f].stack }}>Aa</span>
                      <span className="fn">{FONT_STACKS[f].name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="field">
                <label>Tarrat</label>
                <div className="nb-sticker-lib">
                  {STICKER_LIBRARY.map((s) => (
                    <button key={s.id} type="button" className="nb-sticker-opt" title={s.name} onClick={() => addSticker(s.src)}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.src} alt={s.name} />
                    </button>
                  ))}
                  {(stickerLib.items || []).map((s) => (
                    <button key={s.id} type="button" className="nb-sticker-opt" title={s.name} onClick={() => addSticker(s.src)}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.src} alt={s.name} />
                    </button>
                  ))}
                  <label className="nb-sticker-opt nb-sticker-add" title="Oma tarra kuvasta">
                    {uploading ? '…' : '+'}
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadSticker(f);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>

                {selected && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem', marginTop: '.6rem', padding: '.6rem .7rem', border: '1px solid var(--border)', background: 'var(--elev)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
                      <span style={{ fontSize: '.7rem', color: 'var(--t3)', width: 42 }}>Koko</span>
                      <input
                        type="range" min={0.4} max={2} step={0.05} value={selected.scale}
                        style={{ flex: 1 }}
                        onChange={(e) => patchSticker(selected.id, { scale: parseFloat(e.target.value) })}
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
                      <span style={{ fontSize: '.7rem', color: 'var(--t3)', width: 42 }}>Kierto</span>
                      <input
                        type="range" min={-45} max={45} step={1} value={selected.rotation}
                        style={{ flex: 1 }}
                        onChange={(e) => patchSticker(selected.id, { rotation: parseInt(e.target.value, 10) })}
                      />
                    </div>
                    <button className="btn-link" style={{ color: 'var(--red)', alignSelf: 'flex-start' }} onClick={() => removeSticker(selected.id)}>
                      Poista tarra
                    </button>
                  </div>
                )}

                <div style={{ marginTop: '.6rem' }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setDrawOpen(true)}>
                    Piirrä oma tarra
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="modal-f" style={{ justifyContent: 'space-between' }}>
          <span>
            {mode === 'edit' && onDelete && (
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={onDelete}>
                Poista muistikirja
              </button>
            )}
          </span>
          <span style={{ display: 'inline-flex', gap: '.75rem' }}>
            <button className="btn btn-secondary btn-sm" onClick={onCancel}>Peruuta</button>
            <button className="btn btn-primary btn-sm" onClick={save}>
              {mode === 'create' ? 'Luo muistikirja' : 'Tallenna'}
            </button>
          </span>
        </div>
        {drawOpen && (
          <DrawingPad
            title="Piirrä oma tarra"
            saveLabel="Lisää tarraksi"
            busy={uploading}
            onSave={saveDrawnSticker}
            onCancel={() => setDrawOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
