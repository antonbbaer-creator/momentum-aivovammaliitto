'use client';

import React, { useEffect, useRef, useState } from 'react';
import { FORMAT, LEATHER, Notebook, NOTEBOOK_PAGES, NotebookFolder } from '@/lib/notebooks-shared';
import NotebookCoverTile from '@/components/notebooks/NotebookCoverTile';

// Kirjahylly aitona 3D:nä valkoisessa epätilassa: porrastettu zig-zag-torni,
// jonka jokainen lauta on oikea kappale ja lokerot liittyvät toisiinsa
// jaetuilla vaakalaudoilla. Vihot seisovat selkä ulospäin ja nojaavat
// seinään/toisiinsa. Raahaus kääntää näkymää, hiiren rulla zoomaa.
// Vihot lisätään "Uusi muistikirja" -napista (kansio valitaan customizerissa).

interface Props {
  folders: NotebookFolder[];
  notebooks: Notebook[];
  onOpen: (id: string) => void;
  onEdit: (nb: Notebook) => void;
  onNew: (folderId: string | null) => void;
  onCreateFolder: (name: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (folder: NotebookFolder) => void;
}

const SCALE = 0.85;     // vihkojen skaala hyllyssä
const T = 18;           // lautojen paksuus
const D = 185;          // hyllyn syvyys
const IH = 250;         // lokeron sisäkorkeus
const PADX = 26;        // vihkorivin sisennys lokerossa
const THICK = 24;       // vihon paksuus (selän leveys)
const PITCH = THICK + 7;
const STEP = 120;       // porrastuksen sivusiirtymä
const LEAN = 8;         // nojauskulma asteina

const pageCountLabel = (n?: number) => `${n || 0}/${NOTEBOOK_PAGES}`;

const bookDims = (nb: Notebook) => {
  const w = Math.round(FORMAT[nb.format].tileW * SCALE);
  const h = Math.round(nb.format === 'pocket' ? (w * 14) / 9 : w * 1.414);
  return { w, h };
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Lauta aitona 3D-kappaleena: etupinta + ylä-, ala- ja päätypinnat. */
function Slab({ x, y, w, h, vertical }: { x: number; y: number; w: number; h: number; vertical?: boolean }) {
  return (
    <div className={`n3s${vertical ? ' v' : ''}`} style={{ left: x, top: y, width: w, height: h }}>
      <div className="n3s-front" />
      <div className="n3s-top" style={{ height: D }} />
      <div className="n3s-bottom" style={{ height: D }} />
      <div className="n3s-left" style={{ width: D }} />
      <div className="n3s-right" style={{ width: D }} />
    </div>
  );
}

/** Vihko 3D-kappaleena, selkä ulospäin. Kansi näkyy hyllyä kääntämällä. */
function Book3D({ nb, lean, onOpen }: { nb: Notebook; lean: number; onOpen: () => void }) {
  const { w, h } = bookDims(nb);
  const leather = LEATHER[nb.cover];
  const half = THICK / 2;
  const emboss = `color-mix(in srgb, ${leather.base} 60%, black)`;
  return (
    <div
      className="n3b"
      style={{ width: w, height: h, transform: `rotateZ(${lean}deg) rotateY(90deg)` }}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
    >
      {/* kansi (oikea kylki katsojasta) */}
      <div className="n3b-f" style={{ transform: `translateZ(${half}px)` }}>
        <NotebookCoverTile notebook={nb} scale={SCALE} />
      </div>
      {/* takakansi (vasen kylki) */}
      <div className="n3b-f n3b-back" style={{ transform: `translateZ(${-half}px)`, background: `linear-gradient(135deg, ${leather.base}, ${leather.lo})` }} />
      {/* selkä — sitoo kannet yhteen, ulottuu kannesta (+z) takakanteen (-z) */}
      <div className="n3b-s n3b-spine" style={{ left: 0, width: THICK, transform: `translateZ(${-half}px) rotateY(-90deg)`, background: `linear-gradient(90deg, ${leather.lo}, ${leather.base} 30%, ${leather.hi} 55%, ${leather.base} 80%, ${leather.lo})` }}>
        {nb.title ? <span className="n3b-title" style={{ color: emboss }}>{nb.title}</span> : null}
      </div>
      {/* sivuleikkaus */}
      <div className="n3b-s" style={{ left: '100%', width: THICK, marginLeft: -1, transform: `translateZ(${-half}px) rotateY(-90deg)`, background: 'repeating-linear-gradient(90deg, #F4EDDD 0 2px, #E0D7C2 2px 3px)' }} />
      {/* yläleikkaus */}
      <div className="n3b-t" style={{ height: THICK, transform: `translateZ(${-half}px) rotateX(90deg)`, background: 'repeating-linear-gradient(0deg, #F2EADA 0 2px, #DDD3BD 2px 3px)' }} />
    </div>
  );
}

export default function NotebookShelf({
  folders, notebooks, onOpen, onEdit, onNew, onCreateFolder, onRenameFolder, onDeleteFolder,
}: Props) {
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [rot, setRot] = useState({ x: 7, y: -22 });
  const [zoom, setZoom] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ px: number; py: number; rx: number; ry: number; moved: number } | null>(null);
  const suppressClick = useRef(false);

  // Rullazoomaus: natiivi kuuntelija, jotta sivun vieritys voidaan estää
  // (Reactin synteettinen wheel on passiivinen eikä salli preventDefaultia)
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => clamp(z - e.deltaY * 0.7, -700, 520));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const byUpdated = (a: Notebook, b: Notebook) => (b.updatedAt || 0) - (a.updatedAt || 0);
  const orderedFolders = [...folders].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const ungrouped = notebooks.filter((n) => !n.folderId || !folders.some((f) => f.id === n.folderId)).sort(byUpdated);

  const compartments: { folder: NotebookFolder | null; items: Notebook[] }[] = orderedFolders.map((f) => ({
    folder: f,
    items: notebooks.filter((n) => n.folderId === f.id).sort(byUpdated),
  }));
  if (ungrouped.length > 0 || compartments.length === 0) {
    compartments.push({ folder: null, items: ungrouped });
  }

  // Vihkojen sijoittelu: selät ulospäin tiiviinä rivinä. Ensimmäinen nojaa
  // vasempaan seinään; joka neljäs nojaa raon jälkeen edellisiin.
  const sinLean = Math.sin((LEAN * Math.PI) / 180);
  const boxes = compartments.map((c, i) => {
    let x = PADX;
    const placed = c.items.map((nb, idx) => {
      const d = bookDims(nb);
      let lean = 0;
      if (idx === 0) {
        lean = -LEAN;
        x = Math.round(d.h * sinLean) + 4;
      } else if (idx % 4 === 0) {
        lean = -LEAN;
        x += 22;
      }
      const item = { nb, x, lean, ...d };
      x += PITCH;
      return item;
    });
    const innerW = Math.max(280, x + PADX + 60);
    const width = innerW + 2 * T;
    return { ...c, placed, width, left: i % 2 === 0 ? 0 : -1 };
  });
  const towerW = Math.max(...boxes.map((b) => b.width)) + STEP;
  boxes.forEach((b, i) => { b.left = i % 2 === 0 ? 0 : towerW - b.width; });
  const n = boxes.length;
  const towerH = n * (IH + T) + T + 24;

  // Vaakalaudat: jaettu lauta kattaa molempien viereisten lokeroiden leveyden,
  // jolloin porrastetut lokerot liittyvät saumattomasti toisiinsa.
  const hSlabs = Array.from({ length: n + 1 }, (_, i) => {
    const above = i > 0 ? boxes[i - 1] : null;
    const below = i < n ? boxes[i] : null;
    const x0 = Math.min(above ? above.left : Infinity, below ? below.left : Infinity);
    const x1 = Math.max(above ? above.left + above.width : -Infinity, below ? below.left + below.width : -Infinity);
    return { x: x0, y: i * (IH + T), w: x1 - x0 };
  });

  const submitNewFolder = () => {
    if (newFolderName.trim()) onCreateFolder(newFolderName);
    setNewFolderName('');
    setNewFolderOpen(false);
  };

  const submitRename = (id: string) => {
    if (renameValue.trim()) onRenameFolder(id, renameValue);
    setRenamingId(null);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    drag.current = { px: e.clientX, py: e.clientY, rx: rot.x, ry: rot.y, moved: 0 };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.px;
    const dy = e.clientY - d.py;
    d.moved = Math.max(d.moved, Math.abs(dx) + Math.abs(dy));
    if (d.moved > 4) {
      setRot({ x: clamp(d.rx - dy * 0.12, -4, 24), y: clamp(d.ry + dx * 0.25, -70, 70) });
    }
  };
  const endDrag = () => {
    if (drag.current && drag.current.moved > 6) suppressClick.current = true;
    drag.current = null;
  };
  const onClickCapture = (e: React.MouseEvent) => {
    if (suppressClick.current) {
      e.stopPropagation();
      e.preventDefault();
      suppressClick.current = false;
    }
  };

  const setView = (x: number, y: number) => {
    setRot({ x, y });
    setZoom(0);
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <button className="btn btn-hetki btn-sm" onClick={() => onNew(null)}>Uusi muistikirja</button>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: '.7rem', color: 'var(--t3)' }}>Raahaa kääntääksesi · rulla zoomaa</span>
        <button className="btn btn-ghost btn-sm" onClick={() => setView(8, 38)}>Vasen</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setView(6, 0)}>Edestä</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setView(8, -38)}>Oikea</button>
      </div>

      <div
        ref={stageRef}
        className="nbz-stage n3-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onClickCapture={onClickCapture}
      >
        <div
          className="n3-world"
          style={{ width: towerW, height: towerH, transform: `translateZ(${zoom}px) rotateX(${rot.x}deg) rotateY(${rot.y}deg)` }}
        >
          {/* pehmeä varjo epätilan "lattialla" */}
          <div className="n3-ground" style={{ top: towerH - 320, height: 640, width: towerW + 640, left: -320 }} />

          {/* vaakalaudat (jaetut) */}
          {hSlabs.map((s, i) => (
            <Slab key={`h${i}`} x={s.x} y={s.y} w={s.w} h={T} />
          ))}
          {/* pystypäädyt per lokero */}
          {boxes.map((b, i) => (
            <React.Fragment key={`v${b.folder?.id || i}`}>
              <Slab x={b.left} y={i * (IH + T) + T} w={T} h={IH} vertical />
              <Slab x={b.left + b.width - T} y={i * (IH + T) + T} w={T} h={IH} vertical />
            </React.Fragment>
          ))}
          {/* jalusta */}
          <Slab x={boxes[n - 1].left + 36} y={n * (IH + T) + T} w={boxes[n - 1].width - 72} h={24} />

          {/* lokeroiden sisällöt */}
          {boxes.map((b, i) => (
            <div
              key={b.folder?.id || '__none__'}
              className="n3r"
              style={{ left: b.left + T, top: i * (IH + T) + T, width: b.width - 2 * T, height: IH }}
            >
              <div className="n3-ao" />
              {b.placed.map((it) => (
                <div key={it.nb.id} className="n3-slot" style={{ left: it.x - THICK / 2, height: it.h }}>
                  <div className="n3-bsh" style={{ height: it.w + 10 }} />
                  <Book3D nb={it.nb} lean={it.lean} onOpen={() => onOpen(it.nb.id)} />
                  <button className="nbz-edit" onClick={(e) => { e.stopPropagation(); onEdit(it.nb); }}>
                    Muokkaa
                  </button>
                  <span className="nbz-tag n3-name">
                    {it.nb.title || 'Nimetön'} · {pageCountLabel(it.nb.pageCount)}
                  </span>
                </div>
              ))}
              <div className="nbz-label">
                {b.folder ? (
                  renamingId === b.folder.id ? (
                    <input
                      className="input"
                      style={{ width: 180, padding: '.25rem .55rem', fontSize: '.75rem' }}
                      value={renameValue}
                      autoFocus
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') submitRename(b.folder!.id);
                        if (e.key === 'Escape') setRenamingId(null);
                      }}
                      onBlur={() => submitRename(b.folder!.id)}
                    />
                  ) : (
                    <>
                      <span className="nbz-plaque">{b.folder.name}</span>
                      <span className="nbz-tools">
                        <button className="btn-link" onClick={() => { setRenamingId(b.folder!.id); setRenameValue(b.folder!.name); }}>
                          Nimeä
                        </button>
                        <button className="btn-link" onClick={() => onDeleteFolder(b.folder!)}>Poista</button>
                      </span>
                    </>
                  )
                ) : (
                  folders.length > 0 && <span className="nbz-plaque">Ilman kansiota</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: '.9rem' }}>
        {newFolderOpen ? (
          <div className="nbz-addbox open">
            <input
              className="input"
              style={{ width: 200, padding: '.45rem .75rem' }}
              placeholder="Hyllyosan nimi"
              value={newFolderName}
              autoFocus
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitNewFolder();
                if (e.key === 'Escape') setNewFolderOpen(false);
              }}
            />
            <button className="btn btn-secondary btn-sm" onClick={submitNewFolder}>Luo</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setNewFolderOpen(false)}>Peruuta</button>
          </div>
        ) : (
          <button className="nbz-addbox" onClick={() => { setNewFolderOpen(true); setNewFolderName(''); }}>
            + Lisää hyllyosa
          </button>
        )}
      </div>
    </div>
  );
}
