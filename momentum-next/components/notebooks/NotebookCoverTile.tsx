'use client';

import React, { useRef } from 'react';
import { ACCENTS, FORMAT, LEATHER, Notebook } from '@/lib/notebooks-shared';

// Muistikirjan kansi puhtaalla CSS:llä — nahkagradientit, martiointi
// (SVG-kohina), kuminauha, lukunauha, embossattu etiketti/nimikirjaimet
// ja kanteen liimatut tarrat. Käytetään hyllyssä ja customizerin
// esikatselussa; stickerEdit-propilla tarroja voi raahata kannella.

interface StickerEdit {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
}

interface Props {
  notebook: Pick<Notebook, 'cover' | 'finish' | 'band' | 'ribbon' | 'format' | 'label' | 'initials' | 'stickers'>;
  onClick?: () => void;
  /** Skaalauskerroin tiilen leveydelle (esikatselu voi olla isompi) */
  scale?: number;
  /** Tarrojen muokkaus (vain customizer) */
  stickerEdit?: StickerEdit;
}

export default function NotebookCoverTile({ notebook, onClick, scale = 1, stickerEdit }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const dragId = useRef<string | null>(null);
  const leather = LEATHER[notebook.cover];
  const fmt = FORMAT[notebook.format];
  const vars = {
    '--nb-hi': leather.hi,
    '--nb-base': leather.base,
    '--nb-lo': leather.lo,
    '--nb-band-c': ACCENTS[notebook.band].hex,
    '--nb-ribbon-c': ACCENTS[notebook.ribbon].hex,
    width: Math.round(fmt.tileW * scale),
    aspectRatio: fmt.aspect,
  } as React.CSSProperties;

  const moveTo = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    if (!root || !dragId.current || !stickerEdit) return;
    const rect = root.getBoundingClientRect();
    const x = Math.min(0.95, Math.max(0.05, (clientX - rect.left) / rect.width));
    const y = Math.min(0.95, Math.max(0.05, (clientY - rect.top) / rect.height));
    stickerEdit.onMove(dragId.current, x, y);
  };

  return (
    <div
      ref={rootRef}
      className={`nb-tile${onClick ? ' nb-click' : ''}`}
      style={vars}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
    >
      <div className={`nb-grain${notebook.finish === 'grained' ? ' on' : ''}`} />
      <div className="nb-spine" />
      {notebook.label ? <div className="nb-label">{notebook.label}</div> : null}
      {notebook.initials ? <div className="nb-initials">{notebook.initials}</div> : null}
      {(notebook.stickers || []).map((s) => (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          key={s.id}
          src={s.src}
          alt=""
          draggable={false}
          className={`nb-sticker${stickerEdit ? ' edit' : ''}${stickerEdit?.selectedId === s.id ? ' sel' : ''}`}
          style={{
            left: `${s.x * 100}%`,
            top: `${s.y * 100}%`,
            width: `${s.scale * 38}%`,
            transform: `translate(-50%,-50%) rotate(${s.rotation}deg)`,
          }}
          onPointerDown={stickerEdit ? (e) => {
            e.preventDefault();
            e.stopPropagation();
            dragId.current = s.id;
            stickerEdit.onSelect(s.id);
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          } : undefined}
          onPointerMove={stickerEdit ? (e) => { if (dragId.current) moveTo(e.clientX, e.clientY); } : undefined}
          onPointerUp={stickerEdit ? () => { dragId.current = null; } : undefined}
        />
      ))}
      <div className="nb-band" />
      <div className="nb-ribbon" />
    </div>
  );
}
