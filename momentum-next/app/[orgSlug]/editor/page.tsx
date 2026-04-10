'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import AppShell from '@/components/AppShell';
import { useToast } from '@/lib/toast';

type EditorMode = 'logo' | 'post';

// Post templates
const postTemplates = [
  { id: 'ig-square', label: 'Instagram (1080x1080)', w: 1080, h: 1080 },
  { id: 'ig-story', label: 'IG Story (1080x1920)', w: 1080, h: 1920 },
  { id: 'fb-post', label: 'Facebook (1200x630)', w: 1200, h: 630 },
  { id: 'linkedin', label: 'LinkedIn (1200x627)', w: 1200, h: 627 },
  { id: 'custom', label: 'Vapaa koko', w: 800, h: 600 },
];

export default function EditorPage() {
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<EditorMode>('logo');

  // Logo state
  const [logoName, setLogoName] = useState('');
  const [logoPreview, setLogoPreview] = useState(false);
  const [treeImg, setTreeImg] = useState<HTMLImageElement | null>(null);
  const [fontLoaded, setFontLoaded] = useState(false);
  const [logoFontSize, setLogoFontSize] = useState(100); // percentage scale
  const [logoOutputSize, setLogoOutputSize] = useState<'large' | 'medium' | 'small'>('large');

  // Post state
  const [postTemplate, setPostTemplate] = useState(postTemplates[0]);
  const [postBg, setPostBg] = useState('#056b9f');
  const [postTitle, setPostTitle] = useState('');
  const [postSubtitle, setPostSubtitle] = useState('');
  const [postImage, setPostImage] = useState<HTMLImageElement | null>(null);
  const postFileRef = useRef<HTMLInputElement>(null);

  // Load tree icon and Avenir font
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setTreeImg(img);
    img.src = '/brand/avl-tree-icon.png';

    const font = new FontFace('Avenir', 'url(/fonts/avenir-regular.ttf)');
    font.load().then(f => { document.fonts.add(f); setFontLoaded(true); }).catch(() => setFontLoaded(true));
  }, []);

  // ═══ LOGO GENERATOR ═══
  // All sizes use identical aspect ratio. Scale factor determines output resolution.
  // HiDPI: canvases render at 2x for sharp output, display at CSS 1x
  const outputScales = { large: 1, medium: 0.75, small: 0.375 };

  const drawLogo = useCallback((canvas: HTMLCanvasElement, size: 'large' | 'medium' | 'small', transparent: boolean, forExport = false) => {
    const ctx = canvas.getContext('2d');
    if (!ctx || !treeImg) return;

    const scale = outputScales[size];
    const dpr = forExport ? 2 : (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
    const baseFontSize = Math.round(42 * (logoFontSize / 100));

    // Measure text at high res to calculate tight canvas width
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
    // Background
    if (!transparent) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, outW, outH); } else { ctx.clearRect(0, 0, outW, outH); }

    // Tree icon centered — use high-quality image smoothing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const iconW = baseIconSize * s;
    const iconX = (outW - iconW) / 2;
    const iconY = pad * s;
    ctx.drawImage(treeImg, iconX, iconY, iconW, iconW);

    // Text below icon
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
    drawLogo(canvas, size, transparent, true); // forExport=true → 2x resolution
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
    toast('Ladattu: ' + filename, 'success');
  };

  // Download all logos at once
  const downloadAllLogos = () => {
    if (!logoName.trim()) return;
    downloadLogo('medium', true, `${logoName} - Läpinäkyvä.png`);
    setTimeout(() => downloadLogo('large', false, `${logoName} - Iso.png`), 300);
    setTimeout(() => downloadLogo('small', false, `${logoName} - Pieni.png`), 600);
  };

  // ═══ POST EDITOR ═══
  const drawPost = useCallback((canvas: HTMLCanvasElement, forExport = false) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = forExport ? 2 : (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
    const w = postTemplate.w;
    const h = postTemplate.h;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.scale(dpr, dpr);

    // High quality
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Background
    ctx.fillStyle = postBg;
    ctx.fillRect(0, 0, w, h);

    // Background image if set
    if (postImage) {
      const scale = Math.max(w / postImage.width, h / postImage.height);
      const iw = postImage.width * scale; const ih = postImage.height * scale;
      ctx.globalAlpha = 0.3;
      ctx.drawImage(postImage, (w - iw) / 2, (h - ih) / 2, iw, ih);
      ctx.globalAlpha = 1;
    }

    // Title
    if (postTitle) {
      const titleSize = Math.round(w * 0.06);
      ctx.font = `bold ${titleSize}px Avenir, 'Avenir Next', Helvetica, sans-serif`;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // Word wrap
      const words = postTitle.split(' ');
      const lines: string[] = [];
      let line = '';
      const maxW = w * 0.8;
      for (const word of words) {
        const test = line + (line ? ' ' : '') + word;
        if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = word; } else { line = test; }
      }
      if (line) lines.push(line);
      const lineH = titleSize * 1.3;
      const startY = h * 0.4 - (lines.length * lineH) / 2;
      lines.forEach((l, i) => ctx.fillText(l, w / 2, startY + i * lineH));
    }

    // Subtitle
    if (postSubtitle) {
      const subSize = Math.round(w * 0.03);
      ctx.font = `${subSize}px Avenir, 'Avenir Next', Helvetica, sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,.8)';
      ctx.textAlign = 'center';
      ctx.fillText(postSubtitle, w / 2, h * 0.65);
    }

    // Tree icon at bottom
    if (treeImg) {
      const iconSize = Math.round(w * 0.08);
      ctx.drawImage(treeImg, (w - iconSize) / 2, h - iconSize - 30, iconSize, iconSize);
    }
  }, [postTemplate, postBg, postTitle, postSubtitle, postImage, treeImg]);

  // Redraw preview
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (mode === 'post') drawPost(canvas);
  }, [mode, drawPost]);

  const downloadPost = () => {
    const canvas = document.createElement('canvas');
    drawPost(canvas, true); // forExport=true → 2x
    const link = document.createElement('a');
    link.download = `${postTitle || 'postaus'}_${postTemplate.w}x${postTemplate.h}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    toast('Postaus ladattu', 'success');
  };

  const handlePostImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => setPostImage(img);
    img.src = URL.createObjectURL(file);
  };

  const bgColors = ['#056b9f', '#044d73', '#185e5b', '#2a8a86', '#e45c81', '#f1b434', '#f09a52', '#9b7cf6', '#2d3436', '#0a0c10'];

  return (
    <AppShell title="Editori" subtitle="Logot ja postaukset">

      {/* Mode switcher */}
      <div style={{ display: 'flex', background: 'var(--elev)', borderRadius: 'var(--r)', padding: '3px', marginBottom: '1.5rem', width: 'fit-content' }}>
        <button className={`cal-view-btn ${mode === 'logo' ? 'act' : ''}`} onClick={() => setMode('logo')}>Logot</button>
        <button className={`cal-view-btn ${mode === 'post' ? 'act' : ''}`} onClick={() => setMode('post')}>Postaus</button>
      </div>

      {/* ═══ LOGO GENERATOR ═══ */}
      {mode === 'logo' && (
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

            {/* Font size and output size controls — visible after preview */}
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

          {/* Logo preview — all three versions */}
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
                // Calculate dimensions for display
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
      )}

      {/* ═══ POST EDITOR ═══ */}
      {mode === 'post' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '1.5rem' }}>
          {/* Preview */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', overflow: 'hidden' }}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.82rem', fontWeight: 500, textTransform: 'uppercase' }}>Esikatselu</h3>
              <span style={{ fontSize: '.68rem', color: 'var(--t3)' }}>{postTemplate.w} x {postTemplate.h}</span>
            </div>
            <div style={{ padding: '1.5rem', display: 'flex', justifyContent: 'center', background: 'var(--bg)' }}>
              <canvas ref={canvasRef} style={{ maxWidth: '100%', maxHeight: 500, borderRadius: 'var(--r)', boxShadow: '0 4px 20px rgba(0,0,0,.3)' }} />
            </div>
          </div>

          {/* Controls */}
          <div>
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.25rem', marginBottom: '1rem' }}>
              <div className="field">
                <label>Koko</label>
                <select className="input" value={postTemplate.id} onChange={e => { const t = postTemplates.find(p => p.id === e.target.value); if (t) setPostTemplate(t); }}>
                  {postTemplates.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>

              <div className="field">
                <label>Taustaväri</label>
                <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
                  {bgColors.map(c => (
                    <div key={c} onClick={() => setPostBg(c)} style={{
                      width: 32, height: 32, borderRadius: 'var(--r)', background: c, cursor: 'pointer',
                      border: postBg === c ? '2px solid #fff' : '2px solid transparent',
                      boxShadow: postBg === c ? '0 0 0 2px var(--pri)' : 'none',
                    }} />
                  ))}
                </div>
              </div>

              <div className="field">
                <label>Otsikko</label>
                <input className="input" value={postTitle} onChange={e => setPostTitle(e.target.value)} placeholder="Esim. Aivovaurio koskettaa miljoonaa" />
              </div>

              <div className="field">
                <label>Alaotsikko</label>
                <input className="input" value={postSubtitle} onChange={e => setPostSubtitle(e.target.value)} placeholder="Esim. aivovammaliitto.fi" />
              </div>

              <div className="field">
                <label>Taustakuva (valinnainen)</label>
                <button className="btn btn-secondary btn-sm" onClick={() => postFileRef.current?.click()}>
                  {postImage ? 'Vaihda kuva' : 'Valitse kuva'}
                </button>
                <input ref={postFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePostImage} />
                {postImage && <button className="btn btn-ghost btn-sm" onClick={() => setPostImage(null)} style={{ marginLeft: '.5rem' }}>Poista</button>}
              </div>
            </div>

            <button className="btn btn-primary" style={{ width: '100%' }} onClick={downloadPost}>Lataa postaus (PNG)</button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
