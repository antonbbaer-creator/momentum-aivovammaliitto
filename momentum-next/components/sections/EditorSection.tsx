'use client';

/*
 * LLFF-viestintäeditori — Canva-tyyppinen kevyt julkaisueditori
 *
 * Tuki Instagramin ja Facebookin ajantasaisille natiiviresoluutioille (2026),
 * LLFF:n brandikitille (värit, logo), mediapankin kuville taustana ja
 * suunnitelmien tallennukseen Firestoreen.
 *
 * AVL-logogeneraattori on arkistoitu: components/sections/_archive/AvlLogoGeneratorSection.tsx
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useOrgData } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';

const WORKER_URL = 'https://momentum-worker.anton-4f9.workers.dev';
const R2_CDN = 'https://pub-f3aa3f94aaf8436da08a8ee775b44349.r2.dev';

// ========== TEMPLATES (from 2026 IG/FB specs) ==========
interface Template {
  id: string;
  label: string;
  w: number;
  h: number;
  platform: 'instagram' | 'facebook';
  tip?: string;
}

const TEMPLATES: Template[] = [
  // Instagram
  { id: 'ig-square',    label: 'IG Post — Neliö',       w: 1080, h: 1080, platform: 'instagram' },
  { id: 'ig-portrait',  label: 'IG Post — Pysty',       w: 1080, h: 1350, platform: 'instagram', tip: 'Suositus — täyttää ruudun eniten' },
  { id: 'ig-landscape', label: 'IG Post — Vaaka',       w: 1080, h:  566, platform: 'instagram' },
  { id: 'ig-story',     label: 'IG Story',              w: 1080, h: 1920, platform: 'instagram', tip: 'Jätä 310 px ylä- ja alareunaan vapaaksi' },
  { id: 'ig-reel',      label: 'IG Reel',               w: 1080, h: 1920, platform: 'instagram' },
  { id: 'ig-reel-cov',  label: 'IG Reel — Kansi',       w:  420, h:  654, platform: 'instagram' },
  { id: 'ig-profile',   label: 'IG Profiilikuva',       w:  320, h:  320, platform: 'instagram' },
  // Facebook
  { id: 'fb-post',      label: 'FB Post',               w: 1200, h:  628, platform: 'facebook' },
  { id: 'fb-event',     label: 'FB Tapahtumakuva',      w: 1920, h: 1005, platform: 'facebook', tip: 'Virallinen suositus 1.91:1' },
  { id: 'fb-page',      label: 'FB Sivun kansikuva',    w:  820, h:  312, platform: 'facebook' },
  { id: 'fb-story',     label: 'FB Story',              w: 1080, h: 1920, platform: 'facebook' },
];

// ========== LLFF BRAND KIT (2025 style) ==========
// Values derived from 2025 Instagram koulutusmateriaali
const LLFF_COLORS = [
  { name: 'Tumma violetti', value: '#3A1E5E' }, // primary — tekstitaustoille
  { name: 'Syvä violetti',  value: '#2D1248' },
  { name: 'Pastellipinkki', value: '#FBD1E4' }, // primary light — tekstitaustoille
  { name: 'Vaalea pinkki',  value: '#FDE8F0' },
  { name: 'Kerma',          value: '#FEF9E8' },
  { name: 'Aksentti pinkki', value: '#E8A5C5' }, // subtitle-väri violetilla taustalla
  { name: 'Tumma',          value: '#1A1A1A' },
  { name: 'Valkoinen',      value: '#FFFFFF' },
];

const LOGO_OPTIONS = [
  { id: 'none',    label: 'Ei logoa',   src: '' },
  { id: 'banner',  label: 'Banner',     src: '/brand/llff-banner-2026.png' },
  { id: 'logo',    label: 'Logo + nimi', src: '/brand/llff-logo-2026.png' },
  { id: 'symbol',  label: 'Pelkkä silmä', src: '/brand/llff-symbol-2026.png' },
];

type LogoPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top-center' | 'bottom-center' | 'center';

// ========== DATA MODEL ==========
interface ImageOverlay {
  id: string;
  src: string;       // URL (R2 CDN or data URL)
  name?: string;
  x: number;         // % from left (0-100)
  y: number;         // % from top (0-100)
  widthPct: number;  // width as % of canvas width (1-100)
  opacity: number;   // 0-1
  rotation: number;  // degrees
  z: number;         // stacking order within overlays (higher = on top)
}

interface Design {
  id: string;
  name: string;
  templateId: string;
  bgType: 'color' | 'image';
  bgValue: string;
  bgOpacity: number;         // overlay darkening for legibility (0-1)
  overlays: ImageOverlay[];  // UUSI: foreground images from media bank / upload
  caption: string;           // small label above title (e.g. "Muutos esityspaikkaan!", "Tickets")
  captionColor: string;
  captionSizePct: number;
  captionY: number;
  title: string;
  titleColor: string;
  titleSizePct: number;      // % of canvas width (e.g. 6 = 6%)
  titleY: number;            // % of canvas height (vertical anchor)
  titleAlign: 'left' | 'center' | 'right';
  titleWeight: number;       // 400-800 DM Sans
  subtitle: string;
  subtitleColor: string;
  subtitleSizePct: number;
  subtitleY: number;
  subtitleWeight: number;    // 400-600 DM Sans
  logoId: string;            // 'none' | 'banner' | 'logo' | 'symbol'
  logoPos: LogoPosition;
  logoSizePct: number;       // % of canvas width
  createdAt: number;
  updatedAt: number;
  thumbnail?: string;
}

interface MediaFile {
  key: string;
  name: string;
  url: string;
  folder: string;
}

// Target of media picker: background image OR foreground overlay
type PickerTarget = 'background' | 'overlay';

// ========== DESIGN PRESETS (based on LLFF 2025 Instagram style) ==========
// Jokainen preset on osittainen Design-konfiguraatio joka sovelletaan painalluksella
interface Preset {
  id: string;
  label: string;
  description: string;
  apply: (base: Design) => Design;
}

const DESIGN_PRESETS: Preset[] = [
  {
    id: 'purple-announcement',
    label: 'Violetti ilmoitus',
    description: 'Klassinen LLFF 2025 — tumma violetti, iso valkoinen otsikko',
    apply: (b) => ({
      ...b,
      bgType: 'color', bgValue: '#3A1E5E', bgOpacity: 0,
      caption: 'Muutos esityspaikkaan!',
      captionColor: '#FFFFFF', captionSizePct: 3.8, captionY: 18,
      title: 'Otsikko tähän',
      titleColor: '#FFFFFF', titleSizePct: 7.2, titleY: 42,
      titleAlign: 'center', titleWeight: 700,
      subtitle: '', subtitleColor: '#E8A5C5', subtitleSizePct: 3.2, subtitleY: 66, subtitleWeight: 400,
      logoId: 'symbol', logoPos: 'bottom-center', logoSizePct: 18,
    }),
  },
  {
    id: 'pink-tickets',
    label: 'Pinkki CTA',
    description: 'Pastellipinkki tausta, tumma violetti teksti — lipuille ja CTA-postauksille',
    apply: (b) => ({
      ...b,
      bgType: 'color', bgValue: '#FBD1E4', bgOpacity: 0,
      caption: 'Tickets',
      captionColor: '#3A1E5E', captionSizePct: 3.5, captionY: 22,
      title: 'Ticket booking is now open in Fienta!',
      titleColor: '#3A1E5E', titleSizePct: 6.5, titleY: 46,
      titleAlign: 'center', titleWeight: 700,
      subtitle: '', subtitleColor: '#3A1E5E', subtitleSizePct: 3, subtitleY: 68, subtitleWeight: 400,
      logoId: 'symbol', logoPos: 'bottom-center', logoSizePct: 18,
    }),
  },
  {
    id: 'purple-bilingual',
    label: 'Violetti kaksikielinen',
    description: 'FI-otsikko + EN-otsikko — kaksikielisiin ilmoituksiin',
    apply: (b) => ({
      ...b,
      bgType: 'color', bgValue: '#3A1E5E', bgOpacity: 0,
      caption: 'Miten loppuunvarattuun näytökseen pääsee mukaan?',
      captionColor: '#FFFFFF', captionSizePct: 3.2, captionY: 16,
      title: 'Festarikävijän pikaopas',
      titleColor: '#FFFFFF', titleSizePct: 6.8, titleY: 33,
      titleAlign: 'center', titleWeight: 700,
      subtitle: 'Festival visitors 101',
      subtitleColor: '#FFFFFF', subtitleSizePct: 5.8, subtitleY: 65, subtitleWeight: 700,
      logoId: 'symbol', logoPos: 'bottom-center', logoSizePct: 18,
    }),
  },
  {
    id: 'film-caption',
    label: 'Elokuva-otsikko',
    description: 'Kuvatausta, valkoinen teksti alavasemmalla — elokuvaesittelyihin',
    apply: (b) => ({
      ...b,
      bgType: 'image', bgValue: b.bgType === 'image' ? b.bgValue : '', bgOpacity: 0.15,
      caption: '',
      captionColor: '#FFFFFF', captionSizePct: 3, captionY: 10,
      title: 'Elokuvan nimi',
      titleColor: '#FFFFFF', titleSizePct: 6, titleY: 86,
      titleAlign: 'left', titleWeight: 500,
      subtitle: '2026',
      subtitleColor: '#FFFFFF', subtitleSizePct: 5, subtitleY: 93, subtitleWeight: 400,
      logoId: 'none', logoPos: 'bottom-right', logoSizePct: 10,
    }),
  },
  {
    id: 'photo-overlay',
    label: 'Kuva + otsikko',
    description: 'Valokuva taustalla, iso otsikko keskellä — tunnelmapostauksille',
    apply: (b) => ({
      ...b,
      bgType: 'image', bgValue: b.bgType === 'image' ? b.bgValue : '', bgOpacity: 0.35,
      caption: 'Lapinlahti Film Festival',
      captionColor: '#FFFFFF', captionSizePct: 3, captionY: 35,
      title: 'Tervetuloa',
      titleColor: '#FFFFFF', titleSizePct: 9, titleY: 50,
      titleAlign: 'center', titleWeight: 700,
      subtitle: '20.–26.8.2026',
      subtitleColor: '#FBD1E4', subtitleSizePct: 3.8, subtitleY: 64, subtitleWeight: 500,
      logoId: 'symbol', logoPos: 'bottom-center', logoSizePct: 14,
    }),
  },
  {
    id: 'purple-program',
    label: 'Violetti ohjelmisto',
    description: 'Ohjelmistojulkistukselle — tumma violetti, valkoinen otsikko, pinkki alaotsikko',
    apply: (b) => ({
      ...b,
      bgType: 'color', bgValue: '#2D1248', bgOpacity: 0,
      caption: 'Ohjelmisto 2026',
      captionColor: '#E8A5C5', captionSizePct: 3.2, captionY: 20,
      title: 'Nordic Frames',
      titleColor: '#FFFFFF', titleSizePct: 9, titleY: 42,
      titleAlign: 'center', titleWeight: 800,
      subtitle: '8 elokuvaa \u2014 Pohjoismaiden uusia kykyjä',
      subtitleColor: '#FBD1E4', subtitleSizePct: 3, subtitleY: 60, subtitleWeight: 500,
      logoId: 'symbol', logoPos: 'bottom-center', logoSizePct: 16,
    }),
  },
];

const blankDesign = (templateId: string = 'ig-square'): Design => ({
  id: 'design_' + Date.now(),
  name: 'Uusi suunnitelma',
  templateId,
  bgType: 'color',
  bgValue: '#3A1E5E', // LLFF 2025 tumma violetti
  bgOpacity: 0,
  overlays: [],
  caption: '',
  captionColor: '#FFFFFF',
  captionSizePct: 3.5,
  captionY: 18,
  title: 'Lapinlahti Film Festival',
  titleColor: '#FFFFFF',
  titleSizePct: 7,
  titleY: 45,
  titleAlign: 'center',
  titleWeight: 700,
  subtitle: '20.–26.8.2026',
  subtitleColor: '#E8A5C5',
  subtitleSizePct: 3.5,
  subtitleY: 62,
  subtitleWeight: 500,
  logoId: 'symbol',
  logoPos: 'bottom-center',
  logoSizePct: 18,
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

// Normalize loaded design — ensures new fields exist on older saves
const normalizeDesign = (d: Design): Design => ({
  ...d,
  overlays: d.overlays || [],
  caption: d.caption ?? '',
  captionColor: d.captionColor ?? '#FFFFFF',
  captionSizePct: d.captionSizePct ?? 3.5,
  captionY: d.captionY ?? 18,
  titleWeight: d.titleWeight ?? 700,
  subtitleWeight: d.subtitleWeight ?? 500,
});

export default function EditorSection() {
  const { activeOrg, canEdit } = useAuth();
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [designs, setDesigns] = useOrgData<Design[]>('llff_designs', []);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Design>(() => blankDesign());
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<PickerTarget>('background');
  const [mediaFolderFilter, setMediaFolderFilter] = useState<string>('all');
  const [mediaSearch, setMediaSearch] = useState('');
  const [fontLoaded, setFontLoaded] = useState(false);
  const [bgImg, setBgImg] = useState<HTMLImageElement | null>(null);
  const [logoImg, setLogoImg] = useState<HTMLImageElement | null>(null);
  // Overlay image cache: ref + version counter
  // Using a ref avoids stale closures in the loading effect; the version
  // counter is used solely to re-trigger draws when images finish loading.
  const overlayCache = useRef<Map<string, HTMLImageElement>>(new Map());
  const [overlayCacheVersion, setOverlayCacheVersion] = useState(0);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const overlayUploadRef = useRef<HTMLInputElement>(null);

  const template = TEMPLATES.find(t => t.id === draft.templateId) || TEMPLATES[0];

  // Load DM Sans font family (all weights)
  useEffect(() => {
    const weights: Array<[string, number]> = [
      ['/fonts/DMSans-Regular.ttf', 400],
      ['/fonts/DMSans-Medium.ttf', 500],
      ['/fonts/DMSans-SemiBold.ttf', 600],
      ['/fonts/DMSans-Bold.ttf', 700],
      ['/fonts/DMSans-ExtraBold.ttf', 800],
    ];
    Promise.all(weights.map(([url, weight]) => {
      const f = new FontFace('DM Sans', `url(${url})`, { weight: String(weight) });
      return f.load().then(loaded => { document.fonts.add(loaded); }).catch(() => {});
    })).finally(() => setFontLoaded(true));
  }, []);

  // Load background image when bgValue changes (if image type)
  useEffect(() => {
    if (draft.bgType !== 'image' || !draft.bgValue) { setBgImg(null); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setBgImg(img);
    img.onerror = () => setBgImg(null);
    img.src = draft.bgValue;
  }, [draft.bgType, draft.bgValue]);

  // Load logo image when logoId changes
  useEffect(() => {
    const logo = LOGO_OPTIONS.find(l => l.id === draft.logoId);
    if (!logo || !logo.src) { setLogoImg(null); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setLogoImg(img);
    img.onerror = () => setLogoImg(null);
    img.src = logo.src;
  }, [draft.logoId]);

  // Load overlay images when overlays change — ref-based cache to avoid stale closures
  useEffect(() => {
    const cache = overlayCache.current;
    const needed = new Set(draft.overlays.map(o => o.src));
    let changed = false;
    // Prune no-longer-used
    for (const src of Array.from(cache.keys())) {
      if (!needed.has(src)) { cache.delete(src); changed = true; }
    }
    // Find overlays whose image isn't loaded yet
    const toLoad = draft.overlays.filter(o => !cache.has(o.src));
    if (changed && toLoad.length === 0) {
      setOverlayCacheVersion(v => v + 1);
    }
    if (toLoad.length === 0) return;

    toLoad.forEach(o => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        cache.set(o.src, img);
        setOverlayCacheVersion(v => v + 1);
      };
      img.onerror = (err) => {
        console.warn('[EditorSection] Overlay image failed to load:', o.src, err);
        // Retry without crossOrigin — display-only fallback
        const fallback = new Image();
        fallback.onload = () => {
          cache.set(o.src, fallback);
          setOverlayCacheVersion(v => v + 1);
          console.warn('[EditorSection] Loaded without CORS (export may be tainted):', o.src);
        };
        fallback.onerror = () => {
          console.error('[EditorSection] Overlay image totally failed:', o.src);
        };
        fallback.src = o.src;
      };
      img.src = o.src;
    });
  }, [draft.overlays]);

  // Fetch R2 media files for background picker
  const fetchMedia = useCallback(async () => {
    if (!activeOrg || mediaLoading) return;
    setMediaLoading(true);
    try {
      const res = await fetch(WORKER_URL + '/media/list?limit=500', {
        headers: { 'X-Momentum-Org': activeOrg },
      });
      const data = await res.json();
      const files: MediaFile[] = (data.files || [])
        .filter((f: any) => /\.(jpg|jpeg|png|webp)$/i.test(f.name || ''))
        .map((f: any) => ({
          key: f.key,
          name: (f.name || '').replace(/^\d+_/, ''),
          url: R2_CDN + '/' + f.key,
          folder: (f.key || '').split('/')[1] || 'uploaded',
        }));
      setMediaFiles(files);
    } catch (e) {
      console.warn('Media fetch failed', e);
    }
    setMediaLoading(false);
  }, [activeOrg, mediaLoading]);

  // ========== CANVAS DRAWING ==========
  const draw = useCallback((canvas: HTMLCanvasElement, forExport = false) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = template.w;
    const h = template.h;
    const dpr = forExport ? 2 : (typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = '100%';
    canvas.style.height = 'auto';
    ctx.scale(dpr, dpr);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Background
    if (draft.bgType === 'image' && bgImg) {
      // Cover-fit
      const scale = Math.max(w / bgImg.width, h / bgImg.height);
      const iw = bgImg.width * scale;
      const ih = bgImg.height * scale;
      ctx.drawImage(bgImg, (w - iw) / 2, (h - ih) / 2, iw, ih);
      // Overlay for legibility
      if (draft.bgOpacity > 0) {
        ctx.fillStyle = `rgba(0,0,0,${draft.bgOpacity})`;
        ctx.fillRect(0, 0, w, h);
      }
    } else {
      ctx.fillStyle = draft.bgValue;
      ctx.fillRect(0, 0, w, h);
    }

    // === OVERLAY IMAGES (foreground media from media bank or upload) ===
    // Render in z-order (lowest z first). Images are loaded into overlayCache.current ref
    // asynchronously; setOverlayCacheVersion triggers re-draws when new ones arrive.
    const sortedOverlays = [...draft.overlays].sort((a, b) => a.z - b.z);
    for (const ov of sortedOverlays) {
      const img = overlayCache.current.get(ov.src);
      if (!img || !img.complete || img.naturalWidth === 0) continue; // still loading or failed
      const ovW = w * (ov.widthPct / 100);
      const ovH = (img.height / img.width) * ovW;
      // x/y are center-point % of canvas
      const cx = w * (ov.x / 100);
      const cy = h * (ov.y / 100);
      ctx.save();
      ctx.translate(cx, cy);
      if (ov.rotation) ctx.rotate((ov.rotation * Math.PI) / 180);
      ctx.globalAlpha = ov.opacity;
      ctx.drawImage(img, -ovW / 2, -ovH / 2, ovW, ovH);
      ctx.restore();
    }

    // Helper to draw wrapped text
    const drawWrapped = (text: string, x: number, y: number, maxWidth: number, lineHeight: number) => {
      const words = text.split(' ');
      const lines: string[] = [];
      let line = '';
      for (const word of words) {
        const test = line + (line ? ' ' : '') + word;
        if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; } else { line = test; }
      }
      if (line) lines.push(line);
      const y0 = y - ((lines.length - 1) * lineHeight) / 2;
      lines.forEach((l, i) => ctx.fillText(l, x, y0 + i * lineHeight));
    };

    // Caption (small label above title — "Muutos esityspaikkaan!", "Tickets", etc.)
    if (draft.caption) {
      const fontSize = Math.round(w * (draft.captionSizePct / 100));
      ctx.font = `500 ${fontSize}px "DM Sans", system-ui, sans-serif`;
      ctx.fillStyle = draft.captionColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      drawWrapped(draft.caption, w / 2, h * (draft.captionY / 100), w * 0.84, fontSize * 1.25);
    }

    // Title
    if (draft.title) {
      const fontSize = Math.round(w * (draft.titleSizePct / 100));
      ctx.font = `${draft.titleWeight} ${fontSize}px "DM Sans", system-ui, sans-serif`;
      ctx.fillStyle = draft.titleColor;
      ctx.textAlign = draft.titleAlign;
      ctx.textBaseline = 'middle';
      const x = draft.titleAlign === 'center' ? w / 2 : draft.titleAlign === 'left' ? w * 0.08 : w * 0.92;
      drawWrapped(draft.title, x, h * (draft.titleY / 100), w * 0.84, fontSize * 1.12);
    }

    // Subtitle
    if (draft.subtitle) {
      const fontSize = Math.round(w * (draft.subtitleSizePct / 100));
      ctx.font = `${draft.subtitleWeight} ${fontSize}px "DM Sans", system-ui, sans-serif`;
      ctx.fillStyle = draft.subtitleColor;
      ctx.textAlign = draft.titleAlign;
      ctx.textBaseline = 'middle';
      const x = draft.titleAlign === 'center' ? w / 2 : draft.titleAlign === 'left' ? w * 0.08 : w * 0.92;
      drawWrapped(draft.subtitle, x, h * (draft.subtitleY / 100), w * 0.84, fontSize * 1.2);
    }

    // Logo watermark
    if (logoImg && draft.logoId !== 'none') {
      const logoW = w * (draft.logoSizePct / 100);
      const logoH = (logoImg.height / logoImg.width) * logoW;
      const pad = w * 0.04;
      let lx = pad, ly = pad;
      switch (draft.logoPos) {
        case 'top-left':      lx = pad;              ly = pad; break;
        case 'top-right':     lx = w - logoW - pad;  ly = pad; break;
        case 'top-center':    lx = (w - logoW) / 2;  ly = pad; break;
        case 'center':        lx = (w - logoW) / 2;  ly = (h - logoH) / 2; break;
        case 'bottom-left':   lx = pad;              ly = h - logoH - pad; break;
        case 'bottom-right':  lx = w - logoW - pad;  ly = h - logoH - pad; break;
        case 'bottom-center': lx = (w - logoW) / 2;  ly = h - logoH - pad; break;
      }
      ctx.drawImage(logoImg, lx, ly, logoW, logoH);
    }
  }, [template, draft, bgImg, logoImg, overlayCacheVersion]);

  // Redraw preview on any change
  useEffect(() => {
    if (canvasRef.current && fontLoaded) draw(canvasRef.current, false);
  }, [draw, fontLoaded]);

  // ========== ACTIONS ==========
  const update = <K extends keyof Design>(key: K, value: Design[K]) => {
    setDraft(prev => ({ ...prev, [key]: value, updatedAt: Date.now() }));
  };

  const startNew = (templateId?: string) => {
    setDraft(blankDesign(templateId));
    setCurrentId(null);
  };

  const loadDesign = (id: string) => {
    const d = designs.find(x => x.id === id);
    if (!d) return;
    setDraft(normalizeDesign(d));
    setCurrentId(id);
    setSelectedOverlayId(null);
  };

  const saveDesign = async () => {
    // Generate a small thumbnail from current canvas
    const tmp = document.createElement('canvas');
    draw(tmp, false);
    const thumbCanvas = document.createElement('canvas');
    const thumbW = 200;
    const scale = thumbW / template.w;
    thumbCanvas.width = thumbW;
    thumbCanvas.height = template.h * scale;
    const tctx = thumbCanvas.getContext('2d');
    tctx?.drawImage(tmp, 0, 0, thumbCanvas.width, thumbCanvas.height);
    const thumbnail = thumbCanvas.toDataURL('image/jpeg', 0.6);

    const toSave: Design = { ...draft, thumbnail, updatedAt: Date.now() };
    if (currentId) {
      setDesigns(prev => prev.map(d => d.id === currentId ? toSave : d));
      toast('Suunnitelma päivitetty', 'success');
    } else {
      const newId = 'design_' + Date.now();
      const newDesign = { ...toSave, id: newId, createdAt: Date.now() };
      setDesigns(prev => [newDesign, ...prev]);
      setCurrentId(newId);
      setDraft(newDesign);
      toast('Suunnitelma tallennettu', 'success');
    }
  };

  const deleteDesign = (id: string) => {
    setDesigns(prev => prev.filter(d => d.id !== id));
    if (currentId === id) { setCurrentId(null); setDraft(blankDesign()); }
    toast('Suunnitelma poistettu', 'success');
  };

  const exportPng = () => {
    const canvas = document.createElement('canvas');
    draw(canvas, true);
    const link = document.createElement('a');
    const name = (draft.name || 'llff-julkaisu').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    link.download = `${name}_${template.w}x${template.h}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    toast(`Ladattu: ${template.w}×${template.h} PNG`, 'success');
  };

  // === BACKGROUND UPLOAD (local file → data URL → background) ===
  const handleBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      update('bgType', 'image');
      update('bgValue', ev.target!.result as string);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // === OVERLAY UPLOAD (local file → data URL → new overlay layer) ===
  const handleOverlayUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      addOverlayFromSrc(ev.target!.result as string, file.name);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // === MEDIA PICKER SELECTION (respects pickerTarget) ===
  const pickFromMedia = (file: MediaFile) => {
    if (pickerTarget === 'background') {
      update('bgType', 'image');
      update('bgValue', file.url);
    } else {
      addOverlayFromSrc(file.url, file.name);
    }
    setShowMediaPicker(false);
  };

  // === OVERLAY HELPERS ===
  const addOverlayFromSrc = (src: string, name?: string) => {
    const maxZ = draft.overlays.reduce((m, o) => Math.max(m, o.z), 0);
    const newOverlay: ImageOverlay = {
      id: 'ov_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      src, name,
      x: 50, y: 50,       // center by default
      widthPct: 40,
      opacity: 1,
      rotation: 0,
      z: maxZ + 1,
    };
    setDraft(prev => ({ ...prev, overlays: [...prev.overlays, newOverlay], updatedAt: Date.now() }));
    setSelectedOverlayId(newOverlay.id);
    toast('Kuva lisätty', 'success');
  };

  const updateOverlay = (id: string, patch: Partial<ImageOverlay>) => {
    setDraft(prev => ({
      ...prev,
      overlays: prev.overlays.map(o => o.id === id ? { ...o, ...patch } : o),
      updatedAt: Date.now(),
    }));
  };

  const removeOverlay = (id: string) => {
    setDraft(prev => ({
      ...prev,
      overlays: prev.overlays.filter(o => o.id !== id),
      updatedAt: Date.now(),
    }));
    if (selectedOverlayId === id) setSelectedOverlayId(null);
  };

  const moveOverlayZ = (id: string, direction: 'up' | 'down') => {
    setDraft(prev => {
      const sorted = [...prev.overlays].sort((a, b) => a.z - b.z);
      const idx = sorted.findIndex(o => o.id === id);
      if (idx === -1) return prev;
      const target = direction === 'up' ? idx + 1 : idx - 1;
      if (target < 0 || target >= sorted.length) return prev;
      // Swap z values
      const a = sorted[idx];
      const b = sorted[target];
      return {
        ...prev,
        overlays: prev.overlays.map(o => {
          if (o.id === a.id) return { ...o, z: b.z };
          if (o.id === b.id) return { ...o, z: a.z };
          return o;
        }),
        updatedAt: Date.now(),
      };
    });
  };

  // Open media picker with a specific target
  const openMediaPickerFor = (target: PickerTarget) => {
    setPickerTarget(target);
    if (mediaFiles.length === 0) fetchMedia();
    setShowMediaPicker(true);
  };

  // Filter + search for media picker
  const filteredMedia = mediaFiles.filter(f => {
    if (mediaFolderFilter !== 'all' && f.folder !== mediaFolderFilter) return false;
    if (mediaSearch.trim() && !f.name.toLowerCase().includes(mediaSearch.toLowerCase())) return false;
    return true;
  });
  const mediaFolders = Array.from(new Set(mediaFiles.map(f => f.folder))).sort();

  const selectedOverlay = selectedOverlayId ? draft.overlays.find(o => o.id === selectedOverlayId) : null;

  // ========== RENDER ==========
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr 320px', gap: '1rem', minHeight: 600 }}>
      {/* ========== LEFT SIDEBAR: TEMPLATES + SAVED DESIGNS ========== */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Template picker */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '.85rem' }}>
          <div style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '.5rem' }}>Template</div>
          <div style={{ fontSize: '.62rem', color: 'var(--t3)', marginBottom: '.5rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>Instagram</div>
          {TEMPLATES.filter(t => t.platform === 'instagram').map(t => {
            const active = draft.templateId === t.id;
            return (
              <button key={t.id} onClick={() => update('templateId', t.id)} style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '.5rem .6rem', marginBottom: '.2rem',
                background: active ? 'rgba(5,107,159,.12)' : 'transparent',
                border: '1px solid', borderColor: active ? 'var(--pri)' : 'transparent',
                borderRadius: 'var(--r)', cursor: 'pointer',
                fontSize: '.72rem', fontWeight: active ? 700 : 500,
                color: active ? 'var(--pri-l)' : 'var(--t2)',
              }}>
                <div>{t.label}</div>
                <div style={{ fontSize: '.58rem', color: 'var(--t3)', marginTop: '.1rem' }}>{t.w}×{t.h}</div>
              </button>
            );
          })}
          <div style={{ fontSize: '.62rem', color: 'var(--t3)', marginTop: '.5rem', marginBottom: '.25rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>Facebook</div>
          {TEMPLATES.filter(t => t.platform === 'facebook').map(t => {
            const active = draft.templateId === t.id;
            return (
              <button key={t.id} onClick={() => update('templateId', t.id)} style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '.5rem .6rem', marginBottom: '.2rem',
                background: active ? 'rgba(5,107,159,.12)' : 'transparent',
                border: '1px solid', borderColor: active ? 'var(--pri)' : 'transparent',
                borderRadius: 'var(--r)', cursor: 'pointer',
                fontSize: '.72rem', fontWeight: active ? 700 : 500,
                color: active ? 'var(--pri-l)' : 'var(--t2)',
              }}>
                <div>{t.label}</div>
                <div style={{ fontSize: '.58rem', color: 'var(--t3)', marginTop: '.1rem' }}>{t.w}×{t.h}</div>
              </button>
            );
          })}
        </div>

        {/* Saved designs */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '.85rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.5rem' }}>
            <div style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Tallennetut ({designs.length})</div>
            {canEdit && <button className="btn btn-ghost btn-sm" onClick={() => startNew(draft.templateId)} style={{ fontSize: '.62rem', padding: '.15rem .4rem' }}>+ Uusi</button>}
          </div>
          {designs.length === 0 && <div style={{ fontSize: '.65rem', color: 'var(--t3)', textAlign: 'center', padding: '.5rem' }}>Ei tallennettuja</div>}
          {designs.map(d => (
            <div key={d.id} onClick={() => loadDesign(d.id)} style={{
              display: 'flex', alignItems: 'center', gap: '.4rem',
              padding: '.35rem', marginBottom: '.2rem',
              background: currentId === d.id ? 'rgba(5,107,159,.12)' : 'transparent',
              border: '1px solid', borderColor: currentId === d.id ? 'var(--pri)' : 'transparent',
              borderRadius: 'var(--r)', cursor: 'pointer',
            }}>
              {d.thumbnail ? (
                <img src={d.thumbnail} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }} />
              ) : (
                <div style={{ width: 36, height: 36, background: 'var(--elev)', borderRadius: 3, flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '.7rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--t1)' }}>{d.name}</div>
                <div style={{ fontSize: '.55rem', color: 'var(--t3)' }}>{TEMPLATES.find(t => t.id === d.templateId)?.label || d.templateId}</div>
              </div>
              {canEdit && <button onClick={e => { e.stopPropagation(); deleteDesign(d.id); }} style={{ background: 'transparent', border: 'none', color: 'var(--t3)', cursor: 'pointer', fontSize: '.72rem', padding: '.1rem .25rem' }}>×</button>}
            </div>
          ))}
        </div>
      </div>

      {/* ========== CENTER: CANVAS PREVIEW ========== */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1rem', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.75rem', flexWrap: 'wrap', gap: '.5rem' }}>
          <div>
            <input
              className="input"
              value={draft.name}
              onChange={e => update('name', e.target.value)}
              placeholder="Suunnitelman nimi"
              style={{ fontSize: '.82rem', fontWeight: 600, border: 'none', background: 'transparent', padding: 0, minWidth: 160 }}
            />
            <div style={{ fontSize: '.65rem', color: 'var(--t3)' }}>
              {template.label} {'·'} {template.w}×{template.h} px
              {template.tip && <span style={{ marginLeft: '.4rem', color: 'var(--pri-l)' }}>{'·'} {template.tip}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => openMediaPickerFor('overlay')} title="Lisää kuva editoriin mediapankista">
              Mediapankki
            </button>
            {canEdit && <button className="btn btn-ghost btn-sm" onClick={saveDesign}>Tallenna</button>}
            <button className="btn btn-primary btn-sm" onClick={exportPng}>Lataa PNG</button>
          </div>
        </div>

        {/* Canvas — aspect-ratio locked wrapper */}
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg)',
          borderRadius: 'var(--r)',
          padding: '1rem',
          minHeight: 400,
        }}>
          <div style={{
            maxWidth: '100%',
            maxHeight: 560,
            aspectRatio: `${template.w} / ${template.h}`,
            width: template.w > template.h ? '100%' : 'auto',
            height: template.h >= template.w ? '100%' : 'auto',
            boxShadow: '0 8px 40px rgba(0,0,0,.4)',
            borderRadius: 4,
            overflow: 'hidden',
          }}>
            <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
          </div>
        </div>
      </div>

      {/* ========== RIGHT SIDEBAR: INSPECTOR ========== */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '.85rem', overflowY: 'auto', maxHeight: 'calc(100vh - 180px)' }}>
        {/* Presets — one-click LLFF 2025 design styles */}
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '.5rem' }}>
            LLFF 2025 -tyylit
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.3rem' }}>
            {DESIGN_PRESETS.map(p => (
              <button
                key={p.id}
                onClick={() => setDraft(prev => p.apply(prev))}
                title={p.description}
                style={{
                  padding: '.5rem .35rem',
                  background: 'var(--elev)',
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: '.62rem',
                  fontWeight: 600,
                  color: 'var(--t2)',
                  textAlign: 'left',
                  lineHeight: 1.25,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--pri)'; (e.currentTarget as HTMLElement).style.color = 'var(--t1)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--t2)'; }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Background */}
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '.5rem' }}>Tausta</div>
          <div style={{ display: 'flex', gap: '.25rem', marginBottom: '.5rem' }}>
            <button onClick={() => update('bgType', 'color')} className={`cal-view-btn ${draft.bgType === 'color' ? 'act' : ''}`} style={{ flex: 1, fontSize: '.68rem' }}>Väri</button>
            <button onClick={() => update('bgType', 'image')} className={`cal-view-btn ${draft.bgType === 'image' ? 'act' : ''}`} style={{ flex: 1, fontSize: '.68rem' }}>Kuva</button>
          </div>
          {draft.bgType === 'color' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '.25rem' }}>
              {LLFF_COLORS.map(c => (
                <div key={c.value}
                  onClick={() => update('bgValue', c.value)}
                  title={c.name}
                  style={{
                    aspectRatio: '1',
                    background: c.value,
                    borderRadius: 4,
                    cursor: 'pointer',
                    border: draft.bgValue === c.value ? '2px solid var(--pri)' : '2px solid var(--border)',
                  }}
                />
              ))}
              <input type="color" value={draft.bgValue} onChange={e => update('bgValue', e.target.value)} style={{ width: '100%', height: 28, borderRadius: 4, gridColumn: 'span 4', border: '1px solid var(--border)', marginTop: '.25rem' }} />
            </div>
          )}
          {draft.bgType === 'image' && (
            <>
              <div style={{ display: 'flex', gap: '.25rem', marginBottom: '.4rem' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => openMediaPickerFor('background')} style={{ flex: 1, fontSize: '.66rem', padding: '.3rem' }}>Mediapankki</button>
                <button className="btn btn-ghost btn-sm" onClick={() => uploadRef.current?.click()} style={{ flex: 1, fontSize: '.66rem', padding: '.3rem' }}>Lataa</button>
                <input ref={uploadRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleBgUpload} />
              </div>
              {bgImg && (
                <div style={{ marginTop: '.4rem' }}>
                  <label style={{ fontSize: '.62rem', color: 'var(--t3)' }}>Tummennus: {Math.round(draft.bgOpacity * 100)}%</label>
                  <input type="range" min={0} max={0.8} step={0.05} value={draft.bgOpacity} onChange={e => update('bgOpacity', parseFloat(e.target.value))} style={{ width: '100%' }} />
                </div>
              )}
            </>
          )}
        </div>

        {/* Caption (label above title) */}
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '.5rem' }}>
            Pikku-otsikko (yllä)
          </div>
          <input className="input" value={draft.caption} onChange={e => update('caption', e.target.value)} placeholder="Esim. Muutos esityspaikkaan!" style={{ fontSize: '.78rem' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.35rem', marginTop: '.35rem' }}>
            <div>
              <label style={{ fontSize: '.58rem', color: 'var(--t3)' }}>Koko: {draft.captionSizePct.toFixed(1)}%</label>
              <input type="range" min={1.5} max={6} step={0.25} value={draft.captionSizePct} onChange={e => update('captionSizePct', parseFloat(e.target.value))} style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: '.58rem', color: 'var(--t3)' }}>Y-sijainti: {draft.captionY}%</label>
              <input type="range" min={2} max={95} step={1} value={draft.captionY} onChange={e => update('captionY', parseInt(e.target.value))} style={{ width: '100%' }} />
            </div>
          </div>
          <input type="color" value={draft.captionColor} onChange={e => update('captionColor', e.target.value)} style={{ width: 36, height: 28, border: 'none', background: 'none', padding: 0, cursor: 'pointer', marginTop: '.35rem' }} />
        </div>

        {/* Title */}
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '.5rem' }}>Otsikko</div>
          <textarea className="input" value={draft.title} onChange={e => update('title', e.target.value)} placeholder="Julkaisun otsikko" rows={2} style={{ fontSize: '.78rem', resize: 'vertical', minHeight: 44, fontFamily: '"DM Sans", system-ui, sans-serif' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.35rem', marginTop: '.35rem' }}>
            <div>
              <label style={{ fontSize: '.58rem', color: 'var(--t3)' }}>Koko: {draft.titleSizePct.toFixed(1)}%</label>
              <input type="range" min={2} max={14} step={0.25} value={draft.titleSizePct} onChange={e => update('titleSizePct', parseFloat(e.target.value))} style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: '.58rem', color: 'var(--t3)' }}>Y-sijainti: {draft.titleY}%</label>
              <input type="range" min={5} max={95} step={1} value={draft.titleY} onChange={e => update('titleY', parseInt(e.target.value))} style={{ width: '100%' }} />
            </div>
          </div>
          <div style={{ marginTop: '.35rem' }}>
            <label style={{ fontSize: '.58rem', color: 'var(--t3)' }}>Paksuus: {draft.titleWeight}</label>
            <input type="range" min={400} max={800} step={100} value={draft.titleWeight} onChange={e => update('titleWeight', parseInt(e.target.value))} style={{ width: '100%' }} />
          </div>
          <div style={{ display: 'flex', gap: '.25rem', marginTop: '.35rem' }}>
            <input type="color" value={draft.titleColor} onChange={e => update('titleColor', e.target.value)} style={{ width: 36, height: 28, border: 'none', background: 'none', padding: 0, cursor: 'pointer' }} />
            {(['left','center','right'] as const).map(a => (
              <button key={a} onClick={() => update('titleAlign', a)} className={`cal-view-btn ${draft.titleAlign === a ? 'act' : ''}`} style={{ fontSize: '.62rem', padding: '.2rem .4rem', flex: 1 }}>
                {a === 'left' ? 'Vas' : a === 'center' ? 'Kesk' : 'Oik'}
              </button>
            ))}
          </div>
        </div>

        {/* Subtitle */}
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '.5rem' }}>Alaotsikko</div>
          <input className="input" value={draft.subtitle} onChange={e => update('subtitle', e.target.value)} placeholder="Alaotsikko" style={{ fontSize: '.78rem', fontFamily: '"DM Sans", system-ui, sans-serif' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.35rem', marginTop: '.35rem' }}>
            <div>
              <label style={{ fontSize: '.58rem', color: 'var(--t3)' }}>Koko: {draft.subtitleSizePct.toFixed(1)}%</label>
              <input type="range" min={1} max={8} step={0.25} value={draft.subtitleSizePct} onChange={e => update('subtitleSizePct', parseFloat(e.target.value))} style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: '.58rem', color: 'var(--t3)' }}>Y-sijainti: {draft.subtitleY}%</label>
              <input type="range" min={5} max={95} step={1} value={draft.subtitleY} onChange={e => update('subtitleY', parseInt(e.target.value))} style={{ width: '100%' }} />
            </div>
          </div>
          <div style={{ marginTop: '.35rem' }}>
            <label style={{ fontSize: '.58rem', color: 'var(--t3)' }}>Paksuus: {draft.subtitleWeight}</label>
            <input type="range" min={400} max={800} step={100} value={draft.subtitleWeight} onChange={e => update('subtitleWeight', parseInt(e.target.value))} style={{ width: '100%' }} />
          </div>
          <input type="color" value={draft.subtitleColor} onChange={e => update('subtitleColor', e.target.value)} style={{ width: 36, height: 28, border: 'none', background: 'none', padding: 0, cursor: 'pointer', marginTop: '.35rem' }} />
        </div>

        {/* Kuvat (overlays) — mediapankista tai local upload */}
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.5rem' }}>
            <div style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
              Kuvat ({draft.overlays.length})
            </div>
          </div>
          <div style={{ display: 'flex', gap: '.25rem', marginBottom: '.5rem' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => openMediaPickerFor('overlay')} style={{ flex: 1, fontSize: '.64rem', padding: '.3rem' }}>+ Mediapankista</button>
            <button className="btn btn-ghost btn-sm" onClick={() => overlayUploadRef.current?.click()} style={{ flex: 1, fontSize: '.64rem', padding: '.3rem' }}>+ Lataa</button>
            <input ref={overlayUploadRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleOverlayUpload} />
          </div>

          {/* Overlay list */}
          {draft.overlays.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.2rem', marginBottom: '.5rem' }}>
              {[...draft.overlays].sort((a, b) => b.z - a.z).map(ov => {
                const active = selectedOverlayId === ov.id;
                return (
                  <div key={ov.id} onClick={() => setSelectedOverlayId(ov.id)} style={{
                    display: 'flex', alignItems: 'center', gap: '.35rem',
                    padding: '.3rem',
                    background: active ? 'rgba(5,107,159,.12)' : 'var(--elev)',
                    border: '1px solid', borderColor: active ? 'var(--pri)' : 'var(--border)',
                    borderRadius: 4, cursor: 'pointer',
                  }}>
                    <img src={ov.src} alt="" style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 2, flexShrink: 0, background: 'var(--bg)' }} />
                    <span style={{ flex: 1, fontSize: '.62rem', color: 'var(--t2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ov.name || 'Kuva'}</span>
                    <button onClick={e => { e.stopPropagation(); moveOverlayZ(ov.id, 'up'); }} title="Siirrä ylös" style={{ background: 'transparent', border: 'none', color: 'var(--t3)', cursor: 'pointer', fontSize: '.72rem', padding: '.1rem .25rem' }}>↑</button>
                    <button onClick={e => { e.stopPropagation(); moveOverlayZ(ov.id, 'down'); }} title="Siirrä alas" style={{ background: 'transparent', border: 'none', color: 'var(--t3)', cursor: 'pointer', fontSize: '.72rem', padding: '.1rem .25rem' }}>↓</button>
                    <button onClick={e => { e.stopPropagation(); removeOverlay(ov.id); }} title="Poista" style={{ background: 'transparent', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: '.72rem', padding: '.1rem .25rem' }}>×</button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Selected overlay controls */}
          {selectedOverlay && (
            <div style={{ background: 'var(--elev)', border: '1px solid var(--border)', borderRadius: 4, padding: '.5rem' }}>
              <div style={{ fontSize: '.6rem', color: 'var(--t3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '.35rem' }}>Valitun kuvan säädöt</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.3rem' }}>
                <div>
                  <label style={{ fontSize: '.56rem', color: 'var(--t3)' }}>X: {selectedOverlay.x}%</label>
                  <input type="range" min={0} max={100} step={1} value={selectedOverlay.x} onChange={e => updateOverlay(selectedOverlay.id, { x: parseInt(e.target.value) })} style={{ width: '100%' }} />
                </div>
                <div>
                  <label style={{ fontSize: '.56rem', color: 'var(--t3)' }}>Y: {selectedOverlay.y}%</label>
                  <input type="range" min={0} max={100} step={1} value={selectedOverlay.y} onChange={e => updateOverlay(selectedOverlay.id, { y: parseInt(e.target.value) })} style={{ width: '100%' }} />
                </div>
                <div>
                  <label style={{ fontSize: '.56rem', color: 'var(--t3)' }}>Koko: {selectedOverlay.widthPct}%</label>
                  <input type="range" min={5} max={100} step={1} value={selectedOverlay.widthPct} onChange={e => updateOverlay(selectedOverlay.id, { widthPct: parseInt(e.target.value) })} style={{ width: '100%' }} />
                </div>
                <div>
                  <label style={{ fontSize: '.56rem', color: 'var(--t3)' }}>Kiertymä: {selectedOverlay.rotation}°</label>
                  <input type="range" min={-180} max={180} step={1} value={selectedOverlay.rotation} onChange={e => updateOverlay(selectedOverlay.id, { rotation: parseInt(e.target.value) })} style={{ width: '100%' }} />
                </div>
              </div>
              <div style={{ marginTop: '.3rem' }}>
                <label style={{ fontSize: '.56rem', color: 'var(--t3)' }}>Läpinäkyvyys: {Math.round(selectedOverlay.opacity * 100)}%</label>
                <input type="range" min={0} max={1} step={0.05} value={selectedOverlay.opacity} onChange={e => updateOverlay(selectedOverlay.id, { opacity: parseFloat(e.target.value) })} style={{ width: '100%' }} />
              </div>
            </div>
          )}
        </div>

        {/* Logo */}
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '.5rem' }}>Logo</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '.25rem', marginBottom: '.4rem' }}>
            {LOGO_OPTIONS.map(l => (
              <button key={l.id} onClick={() => update('logoId', l.id)} className={`cal-view-btn ${draft.logoId === l.id ? 'act' : ''}`} style={{ fontSize: '.62rem', padding: '.3rem' }}>
                {l.label}
              </button>
            ))}
          </div>
          {draft.logoId !== 'none' && (
            <>
              <label style={{ fontSize: '.58rem', color: 'var(--t3)' }}>Koko: {draft.logoSizePct}%</label>
              <input type="range" min={3} max={40} step={1} value={draft.logoSizePct} onChange={e => update('logoSizePct', parseInt(e.target.value))} style={{ width: '100%' }} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, marginTop: '.4rem' }}>
                {(['top-left','top-center','top-right','center','center','center','bottom-left','bottom-center','bottom-right'] as LogoPosition[]).map((p, i) => {
                  // Only keep valid position buttons (not duplicates)
                  if ((i === 4 || i === 5) && p === 'center') return <div key={i} />;
                  const active = draft.logoPos === p;
                  return (
                    <button key={i} onClick={() => update('logoPos', p)} style={{
                      aspectRatio: '1',
                      fontSize: '.55rem',
                      background: active ? 'var(--pri)' : 'var(--elev)',
                      color: active ? '#fff' : 'var(--t3)',
                      border: '1px solid var(--border)',
                      borderRadius: 3,
                      cursor: 'pointer',
                      padding: 0,
                    }}>
                      {p === 'top-left' ? '↖' : p === 'top-center' ? '↑' : p === 'top-right' ? '↗' :
                       p === 'center' ? '●' :
                       p === 'bottom-left' ? '↙' : p === 'bottom-center' ? '↓' : '↘'}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ========== MEDIA PICKER MODAL ========== */}
      {showMediaPicker && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowMediaPicker(false)}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.5rem', width: 820, maxWidth: '92vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.75rem', flexWrap: 'wrap', gap: '.5rem' }}>
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 500 }}>
                  {pickerTarget === 'background' ? 'Valitse taustakuva' : 'Lisää kuva editoriin'}
                </h3>
                <div style={{ fontSize: '.68rem', color: 'var(--t3)', marginTop: '.1rem' }}>
                  {filteredMedia.length} / {mediaFiles.length} tiedostoa
                  {pickerTarget === 'overlay' && <span> · klikkaa kuvaa lisätäksesi sen overlay-kerroksena</span>}
                </div>
              </div>
              <button onClick={() => setShowMediaPicker(false)} className="btn btn-ghost btn-sm">Sulje</button>
            </div>

            {/* Filter bar: folder chips + search */}
            <div style={{ display: 'flex', gap: '.5rem', marginBottom: '.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '.25rem', flexWrap: 'wrap' }}>
                <button
                  onClick={() => setMediaFolderFilter('all')}
                  style={{
                    fontSize: '.68rem', padding: '.35rem .7rem', borderRadius: 9999,
                    background: mediaFolderFilter === 'all' ? 'var(--t1)' : 'var(--elev)',
                    color: mediaFolderFilter === 'all' ? 'var(--bg)' : 'var(--t2)',
                    border: '1px solid var(--border)', fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Kaikki ({mediaFiles.length})
                </button>
                {mediaFolders.map(folder => {
                  const count = mediaFiles.filter(f => f.folder === folder).length;
                  const active = mediaFolderFilter === folder;
                  return (
                    <button
                      key={folder}
                      onClick={() => setMediaFolderFilter(folder)}
                      style={{
                        fontSize: '.68rem', padding: '.35rem .7rem', borderRadius: 9999,
                        background: active ? 'var(--pri)' : 'var(--elev)',
                        color: active ? '#fff' : 'var(--t2)',
                        border: '1px solid', borderColor: active ? 'var(--pri)' : 'var(--border)',
                        fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      {folder} ({count})
                    </button>
                  );
                })}
              </div>
              <input
                type="text"
                placeholder="Hae tiedostoja..."
                value={mediaSearch}
                onChange={e => setMediaSearch(e.target.value)}
                className="input"
                style={{ flex: 1, minWidth: 160, fontSize: '.78rem' }}
              />
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => fetchMedia()}
                title="Päivitä lista"
                style={{ fontSize: '.68rem' }}
              >
                ↻ Päivitä
              </button>
            </div>

            {/* Grid */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {mediaLoading && <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--t3)' }}>Ladataan mediapankkia...</div>}
              {!mediaLoading && mediaFiles.length === 0 && <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--t3)' }}>Ei kuvia mediapankissa. Lataa ensimmäinen Viestintä › Mediapankki -tabista.</div>}
              {!mediaLoading && mediaFiles.length > 0 && filteredMedia.length === 0 && <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--t3)' }}>Haku ei tuottanut tuloksia.</div>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '.5rem' }}>
                {filteredMedia.map(f => (
                  <div key={f.key} onClick={() => pickFromMedia(f)} style={{
                    position: 'relative',
                    aspectRatio: '1',
                    background: 'var(--elev)',
                    borderRadius: 4,
                    overflow: 'hidden',
                    cursor: 'pointer',
                    border: (pickerTarget === 'background' && draft.bgValue === f.url) ? '2px solid var(--pri)' : '2px solid transparent',
                    transition: 'transform .15s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.02)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
                  >
                    <img src={f.url} alt={f.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                    <div style={{
                      position: 'absolute', top: '.3rem', left: '.3rem',
                      background: 'rgba(0,0,0,.6)', color: '#fff',
                      fontSize: '.5rem', padding: '.1rem .35rem',
                      borderRadius: 9999, fontWeight: 600,
                      textTransform: 'uppercase', letterSpacing: '.04em',
                      backdropFilter: 'blur(4px)',
                    }}>{f.folder}</div>
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,.8))', color: '#fff', fontSize: '.55rem', padding: '.5rem .35rem .25rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
