'use client';

/*
 * Aivovammaliiton jäsenyhdistysten logogeneraattori.
 * Tuottaa kaksi sommittelua (puu päällä / puu vieressä) × kolme kokoa.
 * Vakiotuotos: Iso valkoisella, Keski läpinäkyvällä, Pieni valkoisella.
 * Käyttää AVL:n puuikonia ja Avenir-fonttia.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useToast } from '@/lib/toast';

type Layout = 'top' | 'side';
type Size = 'large' | 'medium' | 'small';

const SIZE_LABEL: Record<Size, string> = {
  large: 'Iso',
  medium: 'Keskikokoinen',
  small: 'Pieni',
};

const LAYOUT_LABEL: Record<Layout, string> = {
  side: 'Puu vieressä',
  top: 'Puu päällä',
};

// Vakio: iso valkoinen, keski läpinäkyvä, pieni valkoinen.
const TRANSPARENT_BY_SIZE: Record<Size, boolean> = {
  large: false,
  medium: true,
  small: false,
};

const OUTPUT_SCALES: Record<Size, number> = {
  large: 1,
  medium: 0.75,
  small: 0.45,
};

const BASE_ICON_SIZE = 400;
const BASE_FONT_SIZE = 56;
const PAD = 40;
const GAP = 24;
const SIDE_MAX_TEXT_WIDTH = 700;

function sanitizeFilenameStem(s: string) {
  return s
    .replace(/[åÅäÄ]/g, 'a')
    .replace(/[öÖ]/g, 'o')
    .replace(/[^a-zA-Z0-9._\- ]/g, '')
    .trim();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines = 3): string[] {
  if (!text) return [''];
  if (ctx.measureText(text).width <= maxWidth) return [text];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const candidate = current ? current + ' ' + word : word;
    if (ctx.measureText(candidate).width <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines - 1) {
        const rest = [current, ...words.slice(i + 1)].join(' ');
        lines.push(rest);
        current = '';
        break;
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

export default function LogoGeneratorSection() {
  const { toast } = useToast();
  const [logoName, setLogoName] = useState('');
  const [layout, setLayout] = useState<Layout>('side');
  const [treeImg, setTreeImg] = useState<HTMLImageElement | null>(null);
  const [treeBounds, setTreeBounds] = useState<{
    x: number; y: number; w: number; h: number;
    trunkAnchorX: number; trunkAnchorY: number;
  } | null>(null);
  const [, setFontLoaded] = useState(false);
  const [logoFontSize, setLogoFontSize] = useState(100);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      // Etsi puun sisällön rajat (ei-läpinäkyvät pikselit) jotta
      // sommittelussa voidaan ohittaa PNG:n läpinäkyvät reunukset.
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const cx = c.getContext('2d');
        if (cx) {
          cx.drawImage(img, 0, 0);
          const data = cx.getImageData(0, 0, c.width, c.height).data;
          let minX = c.width, minY = c.height, maxX = -1, maxY = -1;
          for (let y = 0; y < c.height; y++) {
            for (let x = 0; x < c.width; x++) {
              if (data[(y * c.width + x) * 4 + 3] > 8) {
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
              }
            }
          }
          if (maxX >= minX && maxY >= minY) {
            // Tunnista rungon tyvi (alimpien rivien opaakkien pikseleiden keskipiste).
            const scanRows = Math.max(1, Math.floor((maxY - minY) * 0.05));
            let trunkLeft = c.width, trunkRight = -1;
            for (let y = maxY - scanRows + 1; y <= maxY; y++) {
              for (let x = 0; x < c.width; x++) {
                if (data[(y * c.width + x) * 4 + 3] > 8) {
                  if (x < trunkLeft) trunkLeft = x;
                  if (x > trunkRight) trunkRight = x;
                }
              }
            }
            const trunkAnchorX = trunkRight >= trunkLeft ? (trunkLeft + trunkRight) / 2 : (minX + maxX) / 2;
            setTreeBounds({
              x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1,
              trunkAnchorX, trunkAnchorY: maxY,
            });
          }
        }
      } catch {
        // CORS-ongelma — käytetään koko kuvaa
      }
      setTreeImg(img);
    };
    img.src = '/brand/avl-tree-icon.png';

    const font = new FontFace('Avenir', 'url(/fonts/avenir-regular.ttf)');
    font.load().then(f => { document.fonts.add(f); setFontLoaded(true); }).catch(() => setFontLoaded(true));
  }, []);

  const drawLogo = useCallback((canvas: HTMLCanvasElement, layoutArg: Layout, size: Size, transparent: boolean, forExport = false) => {
    const ctx = canvas.getContext('2d');
    if (!ctx || !treeImg) return;

    const srcBounds = treeBounds ?? {
      x: 0, y: 0,
      w: treeImg.naturalWidth, h: treeImg.naturalHeight,
      trunkAnchorX: treeImg.naturalWidth / 2,
      trunkAnchorY: treeImg.naturalHeight,
    };
    // Sovita puun sisältö 400×400 ruudukkoon säilyttäen kuvasuhde.
    const treeAspect = srcBounds.w / srcBounds.h;
    const treeDrawH = treeAspect >= 1 ? BASE_ICON_SIZE / treeAspect : BASE_ICON_SIZE;
    const treeDrawW = treeAspect >= 1 ? BASE_ICON_SIZE : BASE_ICON_SIZE * treeAspect;

    const scale = OUTPUT_SCALES[size];
    const dpr = forExport ? 2 : (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
    const fontPx = Math.round(BASE_FONT_SIZE * (logoFontSize / 100));
    const lineHeight = Math.round(fontPx * 1.25);

    const text = logoName || 'Yhdistyksen nimi';
    ctx.font = `${fontPx}px Avenir, 'Avenir Next', Helvetica, sans-serif`;

    let lines: string[];
    let textW: number;
    let textH: number;
    let logicalW: number;
    let logicalH: number;

    // Side-sommittelussa puu sijoitetaan rungon tyvellä — ankkuripiste
    // tekstin oikealla puolella viimeisen rivin baseline-viivalla, jolloin
    // lehvistö saa levitä vasemmalle ja ylös tekstin yli.
    let sideTextOffsetX = 0;
    let sideTextOffsetY = 0;
    let sideIconX = 0;
    let sideIconY = 0;
    const sideAscent = lineHeight * 0.8;
    const TRUNK_GAP = 50;

    if (layoutArg === 'side') {
      lines = wrapText(ctx, text, SIDE_MAX_TEXT_WIDTH, 3);
      textW = Math.max(...lines.map(l => ctx.measureText(l).width));
      textH = lines.length * lineHeight;

      const lastBaseline = sideAscent + (lines.length - 1) * lineHeight;
      const trunkX = (srcBounds.trunkAnchorX - srcBounds.x) * (treeDrawW / srcBounds.w);
      const trunkY = (srcBounds.trunkAnchorY - srcBounds.y) * (treeDrawH / srcBounds.h);

      // Sijoita rungon tyvi tekstin oikealle puolelle, viimeisen rivin baseline-viivalle.
      const iconX = textW + TRUNK_GAP - trunkX;
      const iconY = lastBaseline - trunkY;

      // Sisällön bounding box (teksti vasen yläkulma 0,0; teksti oikea = textW; teksti ala = textH)
      const minX = Math.min(0, iconX);
      const maxX = Math.max(textW, iconX + treeDrawW);
      const minY = Math.min(0, iconY);
      const maxY = Math.max(textH, iconY + treeDrawH);

      sideTextOffsetX = PAD - minX;
      sideTextOffsetY = PAD - minY;
      sideIconX = iconX + sideTextOffsetX;
      sideIconY = iconY + sideTextOffsetY;

      logicalW = (maxX - minX) + PAD * 2;
      logicalH = (maxY - minY) + PAD * 2;
    } else {
      const topMaxTextWidth = Math.max(treeDrawW * 1.6, ctx.measureText(text).width);
      lines = wrapText(ctx, text, topMaxTextWidth, 3);
      textW = Math.max(...lines.map(l => ctx.measureText(l).width));
      textH = lines.length * lineHeight;
      logicalW = Math.max(treeDrawW, textW) + PAD * 2;
      logicalH = treeDrawH + GAP + textH + PAD * 2;
    }

    const outW = Math.round(logicalW * scale);
    const outH = Math.round(logicalH * scale);

    canvas.width = Math.max(1, outW * dpr);
    canvas.height = Math.max(1, outH * dpr);
    // Älä aseta canvas.style.width/height pikselinä — antaa CSS:n hoitaa skaalauksen
    // intrinsic-suhteella (max-width:100%, height:auto). Estää venymisen.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr * scale, dpr * scale);

    if (!transparent) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, logicalW, logicalH);
    } else {
      ctx.clearRect(0, 0, logicalW, logicalH);
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    if (layoutArg === 'side') {
      // Piirrä puu ensin (taustalle), sitten teksti päälle.
      ctx.drawImage(treeImg, srcBounds.x, srcBounds.y, srcBounds.w, srcBounds.h, sideIconX, sideIconY, treeDrawW, treeDrawH);

      ctx.font = `${fontPx}px Avenir, 'Avenir Next', Helvetica, sans-serif`;
      ctx.fillStyle = '#2d3436';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      lines.forEach((line, i) => {
        const baselineY = sideTextOffsetY + sideAscent + i * lineHeight;
        ctx.fillText(line, sideTextOffsetX, baselineY);
      });
    } else {
      const iconX = (logicalW - treeDrawW) / 2;
      const iconY = PAD;
      ctx.drawImage(treeImg, srcBounds.x, srcBounds.y, srcBounds.w, srcBounds.h, iconX, iconY, treeDrawW, treeDrawH);

      ctx.font = `${fontPx}px Avenir, 'Avenir Next', Helvetica, sans-serif`;
      ctx.fillStyle = '#2d3436';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const textTop = PAD + treeDrawH + GAP;
      lines.forEach((line, i) => {
        ctx.fillText(line, logicalW / 2, textTop + i * lineHeight + lineHeight / 2);
      });
    }
  }, [treeImg, treeBounds, logoName, logoFontSize]);

  const downloadLogo = useCallback(async (layoutArg: Layout, size: Size) => {
    if (!logoName.trim()) return;
    const transparent = TRANSPARENT_BY_SIZE[size];
    const canvas = document.createElement('canvas');
    drawLogo(canvas, layoutArg, size, transparent, true);

    const stem = sanitizeFilenameStem(logoName) || 'yhdistys';
    const layoutTag = layoutArg === 'side' ? 'Vieressa' : 'Paalla';
    const sizeTag = size === 'large' ? 'Iso' : size === 'medium' ? 'Keski' : 'Pieni';
    const filename = `${stem} - ${layoutTag} - ${sizeTag}.png`;

    const blob: Blob | null = await new Promise(resolve => {
      canvas.toBlob(b => resolve(b), 'image/png');
    });
    if (!blob) {
      toast('Logon luominen epäonnistui', 'error');
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = filename;
    link.href = url;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }, [drawLogo, logoName, toast]);

  const downloadAll = useCallback(async () => {
    if (!logoName.trim()) {
      toast('Kirjoita yhdistyksen nimi', 'error');
      return;
    }
    toast('Ladataan kolme logoa…', 'success');
    const sizes: Size[] = ['large', 'medium', 'small'];
    for (const size of sizes) {
      await downloadLogo(layout, size);
      await new Promise(r => setTimeout(r, 350));
    }
  }, [logoName, layout, downloadLogo, toast]);

  const previewReady = !!treeImg;
  const namePresent = logoName.trim().length > 0;

  return (
    <div>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.5rem', marginBottom: '1.5rem' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.88rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.02em', marginBottom: '.5rem' }}>Yhdistyksen logon luonti</h3>
        <p style={{ fontSize: '.82rem', color: 'var(--t2)', lineHeight: 1.6, marginBottom: '1.25rem' }}>
          Kirjoita yhdistyksen nimi ja valitse sommittelu. Saat kolme logoa: iso valkoisella taustalla, keskikokoinen läpinäkyvällä taustalla ja pieni valkoisella taustalla. Hyödyllinen kun nimi muuttuu tai uusi yhdistys tarvitsee oman tunnuksen.
        </p>

        <div style={{ display: 'flex', gap: '.75rem', alignItems: 'flex-end', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <div className="field" style={{ flex: '1 1 320px', marginBottom: 0 }}>
            <label>Yhdistyksen nimi</label>
            <input
              className="input"
              value={logoName}
              onChange={e => setLogoName(e.target.value)}
              placeholder="Esim. AVH-yhdistys Pirkanmaa ry"
              style={{ fontSize: '1rem' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '.25rem' }}>
            <label style={{ fontSize: '.72rem', fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Sommittelu</label>
            <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 'var(--rl)', overflow: 'hidden' }}>
              {(['side', 'top'] as Layout[]).map(opt => (
                <button
                  key={opt}
                  onClick={() => setLayout(opt)}
                  className="btn btn-sm"
                  style={{
                    fontSize: '.82rem',
                    padding: '.4rem .85rem',
                    border: 'none',
                    borderRadius: 0,
                    background: layout === opt ? 'var(--accent)' : 'transparent',
                    color: layout === opt ? '#fff' : 'var(--t2)',
                    fontWeight: layout === opt ? 700 : 500,
                  }}
                >
                  {LAYOUT_LABEL[opt]}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
            <label style={{ fontSize: '.78rem', fontWeight: 600, color: 'var(--t3)' }}>Tekstin koko:</label>
            <button className="btn btn-ghost btn-sm" onClick={() => setLogoFontSize(s => Math.max(60, s - 10))} style={{ fontSize: '.8rem', padding: '.2rem .55rem' }}>−</button>
            <span style={{ fontSize: '.82rem', fontWeight: 700, minWidth: 42, textAlign: 'center' }}>{logoFontSize}%</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setLogoFontSize(s => Math.min(160, s + 10))} style={{ fontSize: '.8rem', padding: '.2rem .55rem' }}>+</button>
          </div>

          <button
            className="btn btn-primary"
            onClick={downloadAll}
            disabled={!namePresent || !previewReady}
            title="Lataa iso, keski ja pieni kerralla"
          >
            Lataa kaikki kolme
          </button>
        </div>
      </div>

      {!previewReady && (
        <div style={{ padding: '2rem', textAlign: 'center', opacity: 0.5 }}>Ladataan puuikonia…</div>
      )}

      {previewReady && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', alignItems: 'start' }}>
          {(['large', 'medium', 'small'] as Size[]).map(size => (
            <PreviewCard
              key={size}
              layout={layout}
              size={size}
              transparent={TRANSPARENT_BY_SIZE[size]}
              drawLogo={drawLogo}
              onDownload={() => downloadLogo(layout, size)}
              disabled={!namePresent}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PreviewCard({
  layout,
  size,
  transparent,
  drawLogo,
  onDownload,
  disabled,
}: {
  layout: Layout;
  size: Size;
  transparent: boolean;
  drawLogo: (canvas: HTMLCanvasElement, layout: Layout, size: Size, transparent: boolean) => void;
  onDownload: () => void;
  disabled: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (canvasRef.current) drawLogo(canvasRef.current, layout, size, transparent);
  });

  const previewBg = transparent
    ? 'repeating-conic-gradient(var(--elev) 0% 25%, var(--bg) 0% 50%) 50% / 16px 16px'
    : '#ffffff';

  const bgLabel = transparent ? 'Läpinäkyvä' : 'Valkoinen tausta';

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '.55rem .85rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '.5rem' }}>
        <span style={{ fontSize: '.82rem', fontWeight: 700 }}>{SIZE_LABEL[size]}</span>
        <span style={{ fontSize: '.66rem', color: 'var(--t3)' }}>{bgLabel}</span>
      </div>

      <div style={{ padding: '1rem', background: previewBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <canvas
          ref={canvasRef}
          style={{ maxWidth: '100%', height: 'auto', display: 'block' }}
        />
      </div>

      <div style={{ padding: '.6rem', borderTop: '1px solid var(--border)' }}>
        <button className="btn btn-ghost btn-sm" disabled={disabled} onClick={onDownload} style={{ width: '100%' }}>
          Lataa
        </button>
      </div>
    </div>
  );
}
