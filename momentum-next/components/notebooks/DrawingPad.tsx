'use client';

import React, { useEffect, useRef, useState } from 'react';

// Piirtoalusta muistikirjoille: kynä muutamalla mustevärillä, kolme
// viivanpaksuutta ja pyyhekumi. Tulos tallentuu läpinäkyvänä PNG:nä,
// joten piirros istuu paperille kuin musteella piirretty.

interface Props {
  title: string;
  saveLabel: string;
  busy?: boolean;
  onSave: (blob: Blob) => void;
  onCancel: () => void;
}

const INKS = [
  { name: 'Musta', hex: '#1A1817' },
  { name: 'Sininen', hex: '#056b9f' },
  { name: 'Punainen', hex: '#c14545' },
  { name: 'Vihreä', hex: '#185e5b' },
  { name: 'Keltainen', hex: '#f1b434' },
  { name: 'Pinkki', hex: '#e45c81' },
];
const WIDTHS = [2, 4, 8];
const CANVAS_W = 800;
const CANVAS_H = 560;

export default function DrawingPad({ title, saveLabel, busy, onSave, onCancel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [ink, setInk] = useState(INKS[0].hex);
  const [width, setWidth] = useState(WIDTHS[1]);
  const [eraser, setEraser] = useState(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
  }, []);

  const toCanvasXY = (e: React.PointerEvent): { x: number; y: number } => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * CANVAS_W,
      y: ((e.clientY - rect.top) / rect.height) * CANVAS_H,
    };
  };

  const stroke = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.globalCompositeOperation = eraser ? 'destination-out' : 'source-over';
    ctx.strokeStyle = ink;
    ctx.lineWidth = eraser ? width * 4 : width;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = toCanvasXY(e);
    last.current = p;
    stroke(p, p);
    setEmpty(false);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawing.current || !last.current) return;
    const p = toCanvasXY(e);
    stroke(last.current, p);
    last.current = p;
  };

  const onPointerUp = () => {
    drawing.current = false;
    last.current = null;
  };

  const clear = () => {
    const ctx = canvasRef.current?.getContext('2d');
    ctx?.clearRect(0, 0, CANVAS_W, CANVAS_H);
    setEmpty(true);
  };

  const save = () => {
    canvasRef.current?.toBlob((b) => {
      if (b) onSave(b);
    }, 'image/png');
  };

  return (
    <div className="modal-ov" style={{ zIndex: 400 }} onClick={onCancel}>
      <div className="modal" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <h3>{title}</h3>
          <button className="modal-x" onClick={onCancel} aria-label="Sulje">×</button>
        </div>
        <div className="modal-b" style={{ paddingTop: '1rem' }}>
          <div className="nb-toolbar" style={{ marginBottom: '.6rem' }}>
            {INKS.map((c) => (
              <button
                key={c.hex}
                type="button"
                className={`nb-swatch${!eraser && ink === c.hex ? ' sel' : ''}`}
                style={{ width: 24, height: 24, background: c.hex }}
                title={c.name}
                aria-label={c.name}
                onClick={() => { setInk(c.hex); setEraser(false); }}
              />
            ))}
            <span style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 .35rem' }} />
            {WIDTHS.map((w) => (
              <button
                key={w}
                type="button"
                className={`nb-tool${width === w ? ' act' : ''}`}
                title={`Viivan paksuus ${w}`}
                onClick={() => setWidth(w)}
              >
                <span style={{ display: 'inline-block', width: w + 3, height: w + 3, borderRadius: '50%', background: 'currentColor', verticalAlign: 'middle' }} />
              </button>
            ))}
            <span style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 .35rem' }} />
            <button type="button" className={`nb-tool${eraser ? ' act' : ''}`} onClick={() => setEraser(!eraser)}>Pyyhekumi</button>
            <button type="button" className="nb-tool" onClick={clear} disabled={empty}>Tyhjennä</button>
          </div>
          <canvas
            ref={canvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            className="nb-drawpad"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          />
        </div>
        <div className="modal-f">
          <button className="btn btn-secondary btn-sm" onClick={onCancel}>Peruuta</button>
          <button className="btn btn-primary btn-sm" disabled={empty || busy} onClick={save}>
            {busy ? 'Tallennetaan…' : saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
