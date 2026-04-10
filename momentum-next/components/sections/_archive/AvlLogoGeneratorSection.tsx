'use client';

/*
 * ==========================================================================
 * AVL LOGO GENERATOR — ARCHIVED
 * ==========================================================================
 *
 * Tämä on arkistoitu versio AVL:n (Aivovammaliitto) yhdistyksille tarkoitetusta
 * logogeneraattorista. Poistettu LLFF-puolen EditorSectionista koska se on
 * kontekstisidonnainen AVL:n jäsenyhdistyksille.
 *
 * EI käytössä tällä hetkellä — säilytetty kunnes AVL-puoli rakennetaan uudelleen.
 *
 * Käyttö jatkossa (kun AVL-puoli on aktivoitu):
 *   import AvlLogoGeneratorSection from '@/components/sections/_archive/AvlLogoGeneratorSection';
 *   <AvlLogoGeneratorSection />
 *
 * Riippuvuudet:
 *   - /public/brand/avl-tree-icon.png  (AVL:n puu-ikoni)
 *   - /public/fonts/avenir-regular.ttf (Avenir-fontti)
 *   - useToast from '@/lib/toast'
 *
 * Toiminnallisuus:
 *   - Käyttäjä kirjoittaa yhdistyksen nimen
 *   - Generoi kolme versiota: läpinäkyvä, iso valkoisella, pieni
 *   - HiDPI-export 2x resoluutiolla
 *   - Säädettävä tekstin koko (50-200%)
 *   - Lataa kaikki -nappi
 *
 * Siirretty alkuperäisestä lähdekoodista:
 *   components/sections/EditorSection.tsx (rivit ~1-125, ~200-263)
 * ==========================================================================
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useToast } from '@/lib/toast';

export default function AvlLogoGeneratorSection() {
  const { toast } = useToast();
  const [logoName, setLogoName] = useState('');
  const [logoPreview, setLogoPreview] = useState(false);
  const [treeImg, setTreeImg] = useState<HTMLImageElement | null>(null);
  const [, setFontLoaded] = useState(false);
  const [logoFontSize, setLogoFontSize] = useState(100);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setTreeImg(img);
    img.src = '/brand/avl-tree-icon.png';

    const font = new FontFace('Avenir', 'url(/fonts/avenir-regular.ttf)');
    font.load().then(f => { document.fonts.add(f); setFontLoaded(true); }).catch(() => setFontLoaded(true));
  }, []);

  const outputScales = { large: 1, medium: 0.75, small: 0.375 };

  const drawLogo = useCallback((canvas: HTMLCanvasElement, size: 'large' | 'medium' | 'small', transparent: boolean, forExport = false) => {
    const ctx = canvas.getContext('2d');
    if (!ctx || !treeImg) return;

    const scale = outputScales[size];
    const dpr = forExport ? 2 : (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
    const baseFontSize = Math.round(42 * (logoFontSize / 100));

    ctx.font = `${baseFontSize}px Avenir, 'Avenir Next', Helvetica, sans-serif`;
    const textW = ctx.measureText(logoName || 'Yhdistyksen nimi').width;

    const baseIconSize = 400;
    const pad = 30;
    const gap = 15;
    const logicalW = Math.max(baseIconSize, textW) + pad * 2;
    const logicalH = baseIconSize + gap + baseFontSize + pad * 2;

    const outW = Math.round(logicalW * scale);
    const outH = Math.round(logicalH * scale);

    canvas.width = outW * dpr;
    canvas.height = outH * dpr;
    canvas.style.width = outW + 'px';
    canvas.style.height = outH + 'px';
    ctx.scale(dpr, dpr);

    const s = scale;
    if (!transparent) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, outW, outH); } else { ctx.clearRect(0, 0, outW, outH); }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const iconW = baseIconSize * s;
    const iconX = (outW - iconW) / 2;
    const iconY = pad * s;
    ctx.drawImage(treeImg, iconX, iconY, iconW, iconW);

    const fontSize = Math.round(baseFontSize * s);
    ctx.font = `${fontSize}px Avenir, 'Avenir Next', Helvetica, sans-serif`;
    ctx.fillStyle = '#2d3436';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(logoName || 'Yhdistyksen nimi', outW / 2, iconY + iconW + gap * s);
  }, [treeImg, logoName, logoFontSize]);

  const generateLogos = () => {
    if (!logoName.trim()) { toast('Kirjoita yhdistyksen nimi', 'error'); return; }
    setLogoPreview(true);
  };

  const downloadLogo = (size: 'large' | 'medium' | 'small', transparent: boolean, filename: string) => {
    const canvas = document.createElement('canvas');
    drawLogo(canvas, size, transparent, true);
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
    toast('Ladattu: ' + filename, 'success');
  };

  const downloadAllLogos = () => {
    if (!logoName.trim()) return;
    downloadLogo('medium', true, `${logoName} - Läpinäkyvä.png`);
    setTimeout(() => downloadLogo('large', false, `${logoName} - Iso.png`), 300);
    setTimeout(() => downloadLogo('small', false, `${logoName} - Pieni.png`), 600);
  };

  return (
    <div>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.5rem', marginBottom: '1.5rem' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.88rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.02em', marginBottom: '1rem' }}>Yhdistyksen logon luonti</h3>
        <p style={{ fontSize: '.82rem', color: 'var(--t2)', lineHeight: 1.6, marginBottom: '1.25rem' }}>
          Kirjoita yhdistyksen nimi. Luodaan kolme versiota: läpinäkyvällä taustalla, valkoisella taustalla (iso) ja pieni versio.
        </p>
        <div style={{ display: 'flex', gap: '.75rem', alignItems: 'flex-end', marginBottom: '1rem' }}>
          <div className="field" style={{ flex: 1, marginBottom: 0 }}>
            <label>Yhdistyksen nimi</label>
            <input className="input" value={logoName} onChange={e => { setLogoName(e.target.value); if (logoPreview) setLogoPreview(true); }} placeholder="Esim. AVH-ammattilaiset ry" style={{ fontSize: '1rem' }} />
          </div>
          <button className="btn btn-primary" onClick={generateLogos} disabled={!logoName.trim() || !treeImg}>Luo logot</button>
        </div>

        {logoPreview && (
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
              <label style={{ fontSize: '.78rem', fontWeight: 600, color: 'var(--t3)' }}>Tekstin koko:</label>
              <button className="btn btn-ghost btn-sm" onClick={() => setLogoFontSize(s => Math.max(50, s - 10))} style={{ fontSize: '.8rem', padding: '.2rem .5rem' }}>-</button>
              <span style={{ fontSize: '.82rem', fontWeight: 700, minWidth: 36, textAlign: 'center' }}>{logoFontSize}%</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setLogoFontSize(s => Math.min(200, s + 10))} style={{ fontSize: '.8rem', padding: '.2rem .5rem' }}>+</button>
            </div>
          </div>
        )}
      </div>

      {logoPreview && treeImg && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
          <button className="btn btn-primary" onClick={downloadAllLogos}>Lataa kaikki logot</button>
        </div>
      )}
      {logoPreview && treeImg && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.25rem' }}>
          {([
            { size: 'medium' as const, transparent: true, label: 'Läpinäkyvä', bgStyle: 'repeating-conic-gradient(var(--elev) 0% 25%, var(--bg) 0% 50%) 50% / 20px 20px' },
            { size: 'large' as const, transparent: false, label: 'Iso (valkoinen tausta)', bgStyle: '#ffffff' },
            { size: 'small' as const, transparent: false, label: 'Pieni', bgStyle: '#ffffff' },
          ]).map(v => {
            const tempCanvas = document.createElement('canvas');
            drawLogo(tempCanvas, v.size, v.transparent);
            const dims = `${tempCanvas.width}x${tempCanvas.height}`;
            return (
              <div key={v.size} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', overflow: 'hidden' }}>
                <div style={{ padding: '1rem', background: v.bgStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 180 }}>
                  <canvas ref={el => { if (el) drawLogo(el, v.size, v.transparent); }} style={{ maxWidth: '100%', height: 'auto' }} />
                </div>
                <div style={{ padding: '.85rem 1.1rem', borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '.82rem', fontWeight: 600, marginBottom: '.15rem' }}>{v.label}</div>
                  <div style={{ fontSize: '.68rem', color: 'var(--t3)', marginBottom: '.6rem' }}>{dims} px, PNG</div>
                  <button className="btn btn-primary btn-sm" style={{ width: '100%' }} onClick={() => downloadLogo(v.size, v.transparent, `${logoName} - ${v.label}.png`)}>Lataa</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
