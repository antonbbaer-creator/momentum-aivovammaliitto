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
import { useSearchParams } from 'next/navigation';
import { useOrgData } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { normalizePublication } from '@/lib/publications-shared';
import { CommsPlan, DEFAULT_LLFF_2026_PLAN, normalizeCommsPlan, unifiedChannels } from '@/lib/comms-plan-shared';

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
  widthPct: number;  // width as % of canvas width (1-100+)
  opacity: number;   // 0-1
  rotation: number;  // degrees
  z: number;         // stacking order within overlays (higher = on top)
}

// Per-slide content — karusellissa on yksi Slide per pohja
interface Slide {
  id: string;
  bgType: 'color' | 'image';
  bgValue: string;
  bgOpacity: number;         // overlay darkening for legibility (0-1)
  overlays: ImageOverlay[];  // foreground images from media bank / upload
  caption: string;
  captionColor: string;
  captionSizePct: number;
  captionY: number;
  title: string;
  titleColor: string;
  titleSizePct: number;
  titleY: number;
  titleAlign: 'left' | 'center' | 'right';
  titleWeight: number;
  subtitle: string;
  subtitleColor: string;
  subtitleSizePct: number;
  subtitleY: number;
  subtitleWeight: number;
  logoId: string;
  logoPos: LogoPosition;
  logoSizePct: number;
}

interface Design {
  id: string;
  name: string;
  templateId: string;
  slides: Slide[];           // karusellissa useita; yhdessä vain 1
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
// Jokainen preset on osittainen Slide-konfiguraatio joka sovelletaan painalluksella
interface Preset {
  id: string;
  label: string;
  description: string;
  apply: (base: Slide) => Slide;
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
      subtitle: '8 elokuvaa — Pohjoismaiden uusia kykyjä',
      subtitleColor: '#FBD1E4', subtitleSizePct: 3, subtitleY: 60, subtitleWeight: 500,
      logoId: 'symbol', logoPos: 'bottom-center', logoSizePct: 16,
    }),
  },
];

const blankSlide = (): Slide => ({
  id: 'slide_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
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
});

const blankDesign = (templateId: string = 'ig-square'): Design => ({
  id: 'design_' + Date.now(),
  name: 'Uusi suunnitelma',
  templateId,
  slides: [blankSlide()],
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

// Normalize slide — ensures new fields exist on older saves
const normalizeSlide = (s: any): Slide => ({
  id: s.id || 'slide_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
  bgType: s.bgType || 'color',
  bgValue: s.bgValue || '#3A1E5E',
  bgOpacity: s.bgOpacity ?? 0,
  overlays: Array.isArray(s.overlays) ? s.overlays : [],
  caption: s.caption ?? '',
  captionColor: s.captionColor ?? '#FFFFFF',
  captionSizePct: s.captionSizePct ?? 3.5,
  captionY: s.captionY ?? 18,
  title: s.title ?? '',
  titleColor: s.titleColor ?? '#FFFFFF',
  titleSizePct: s.titleSizePct ?? 7,
  titleY: s.titleY ?? 45,
  titleAlign: s.titleAlign ?? 'center',
  titleWeight: s.titleWeight ?? 700,
  subtitle: s.subtitle ?? '',
  subtitleColor: s.subtitleColor ?? '#E8A5C5',
  subtitleSizePct: s.subtitleSizePct ?? 3.5,
  subtitleY: s.subtitleY ?? 62,
  subtitleWeight: s.subtitleWeight ?? 500,
  logoId: s.logoId ?? 'symbol',
  logoPos: s.logoPos ?? 'bottom-center',
  logoSizePct: s.logoSizePct ?? 18,
});

// Normalize loaded design — migrates old single-slide designs to slides-based shape
const normalizeDesign = (d: any): Design => {
  // If the design already has slides array, just normalize each slide
  if (Array.isArray(d.slides) && d.slides.length > 0) {
    return {
      id: d.id,
      name: d.name,
      templateId: d.templateId,
      slides: d.slides.map(normalizeSlide),
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      thumbnail: d.thumbnail,
    };
  }
  // Old single-slide format — all visual fields on the design itself
  return {
    id: d.id,
    name: d.name || 'Uusi suunnitelma',
    templateId: d.templateId || 'ig-square',
    slides: [normalizeSlide(d)],
    createdAt: d.createdAt || Date.now(),
    updatedAt: d.updatedAt || Date.now(),
    thumbnail: d.thumbnail,
  };
};

export default function EditorSection() {
  const { activeOrg, canEdit } = useAuth();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  // When linked from a Publication (?pubId=pub_123), the Editor operates in "attach" mode:
  // Julkaise-painike päivittää olemassa olevaa Publication-tietuetta eikä luo uutta.
  const linkedPubId = searchParams?.get('pubId') || null;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const [designs, setDesigns] = useOrgData<Design[]>('llff_designs', []);
  // Julkaisut + kalenteritapahtumat — Julkaise-painike lisää näihin
  const [publications, setPublications] = useOrgData<any[]>('publications', []);
  const [calEvents, setCalEvents] = useOrgData<any[]>('events', []);
  const [org] = useOrgData<any>('org', { channels: [] });
  const [rawCommsPlan] = useOrgData<CommsPlan>('commsPlan', DEFAULT_LLFF_2026_PLAN);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Design>(() => blankDesign());
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<PickerTarget>('background');
  const [mediaFolderFilter, setMediaFolderFilter] = useState<string>('all');
  const [mediaSearch, setMediaSearch] = useState('');
  const [fontLoaded, setFontLoaded] = useState(false);
  // Image caches — ref-based so async loads don't stale-closure
  const bgCache = useRef<Map<string, HTMLImageElement>>(new Map());
  const logoCache = useRef<Map<string, HTMLImageElement>>(new Map());
  const overlayCache = useRef<Map<string, HTMLImageElement>>(new Map());
  const [imgCacheVersion, setImgCacheVersion] = useState(0);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [imageLoadingCount, setImageLoadingCount] = useState(0);
  // Julkaise-modalin tila
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishTitle, setPublishTitle] = useState('');
  const [publishBody, setPublishBody] = useState('');
  const [publishChannels, setPublishChannels] = useState<string[]>([]);
  const [publishDate, setPublishDate] = useState('');
  const [publishCategory, setPublishCategory] = useState<string>('some');
  const [publishStatus, setPublishStatus] = useState<'draft' | 'ready'>('ready');
  const [publishing, setPublishing] = useState(false);
  // Drag state for mouse-based overlay repositioning
  const dragState = useRef<{
    id: string;
    startX: number; startY: number;
    origX: number; origY: number;
  } | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const overlayUploadRef = useRef<HTMLInputElement>(null);
  // Tracks which linkedPubId we have already auto-loaded so user edits aren't overwritten
  const loadedFromPubRef = useRef<string | null>(null);
  // ── Canva-tyylinen vasemman sivupalkin välilehtimalli ──
  type SidebarTab = 'templates' | 'elements' | 'text' | 'brand' | 'uploads';
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('templates');
  const sidebarMediaFetched = useRef(false);

  // Auto-load linked publication into the editor (design + media), so the user sees the
  // existing slides immediately and can edit them in place. Runs once per linkedPubId.
  useEffect(() => {
    if (!linkedPubId) return;
    if (loadedFromPubRef.current === linkedPubId) return;
    // Wait until both lists are populated (firestore hooks return [] until first snapshot)
    if (!Array.isArray(publications)) return;
    const pub = publications.find((p: any) => p && p.id === linkedPubId);
    if (!pub) return; // not in this org's data — give up gracefully

    // Path A: publication has a designId AND design exists → load design directly
    if (pub.designId && Array.isArray(designs)) {
      const existingDesign = designs.find((d: any) => d && d.id === pub.designId);
      if (existingDesign) {
        setDraft(normalizeDesign(existingDesign));
        setCurrentId(existingDesign.id);
        setCurrentSlideIndex(0);
        setSelectedOverlayId(null);
        loadedFromPubRef.current = linkedPubId;
        return;
      }
    }

    // Path B: derive a draft design from the publication's mediaIds (each becomes one slide).
    // mediaId format: 'r2_<key>'  (e.g. r2_llff/brand/123_logo.png)
    const mediaIds: string[] = Array.isArray(pub.mediaIds) ? pub.mediaIds : [];
    const slideUrls: string[] = mediaIds
      .map(id => (typeof id === 'string' && id.startsWith('r2_')) ? `${R2_CDN}/${id.slice(3)}` : '')
      .filter(Boolean);

    // Fall back to cover image if mediaIds are empty
    if (slideUrls.length === 0 && pub.image) slideUrls.push(pub.image);

    if (slideUrls.length === 0) {
      // Nothing visual — at least mark as loaded so we don't keep retrying
      loadedFromPubRef.current = linkedPubId;
      return;
    }

    const baseSlide = blankSlide();
    const slides: Slide[] = slideUrls.map((url, idx) => ({
      ...baseSlide,
      id: 'slide_' + Date.now() + '_' + idx + '_' + Math.random().toString(36).slice(2, 7),
      bgType: 'image',
      bgValue: url,
      bgOpacity: 0,
      // Only show title text on the first slide so the carousel remains clean
      title: idx === 0 ? (pub.title || baseSlide.title) : '',
      caption: '',
      subtitle: '',
      logoId: 'none',
    }));

    setDraft({
      id: 'design_' + Date.now(),
      name: pub.title || 'Julkaisu ' + linkedPubId,
      templateId: 'ig-portrait',
      slides,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    setCurrentId(null);
    setCurrentSlideIndex(0);
    setSelectedOverlayId(null);
    loadedFromPubRef.current = linkedPubId;
  }, [linkedPubId, publications, designs]);

  const template = TEMPLATES.find(t => t.id === draft.templateId) || TEMPLATES[0];

  // Make sure currentSlideIndex is always valid
  const safeSlideIndex = Math.max(0, Math.min(currentSlideIndex, draft.slides.length - 1));
  const currentSlide: Slide = draft.slides[safeSlideIndex] || draft.slides[0];

  // Helper: update just the current slide within the draft
  const updateSlide = (patch: Partial<Slide>) => {
    setDraft(prev => {
      const nextSlides = prev.slides.map((s, i) =>
        i === safeSlideIndex ? { ...s, ...patch } : s
      );
      return { ...prev, slides: nextSlides, updatedAt: Date.now() };
    });
  };

  // Helper: mutate the current slide via a function (useful for array ops)
  const mutateSlide = (mutator: (s: Slide) => Slide) => {
    setDraft(prev => {
      const nextSlides = prev.slides.map((s, i) =>
        i === safeSlideIndex ? mutator(s) : s
      );
      return { ...prev, slides: nextSlides, updatedAt: Date.now() };
    });
  };

  // Helper: add/remove/reorder slides
  const addSlide = (options: { duplicate?: boolean } = {}) => {
    setDraft(prev => {
      const cur = prev.slides[safeSlideIndex];
      const newSlide: Slide = options.duplicate && cur
        ? { ...cur, id: 'slide_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
            overlays: cur.overlays.map(o => ({ ...o, id: 'ov_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7) })) }
        : blankSlide();
      return { ...prev, slides: [...prev.slides, newSlide], updatedAt: Date.now() };
    });
    // Switch to the new slide
    setTimeout(() => setCurrentSlideIndex(draft.slides.length), 0);
  };

  const removeSlide = (index: number) => {
    if (draft.slides.length <= 1) { toast('Karusellissa on oltava vähintään yksi slaide', 'error'); return; }
    setDraft(prev => ({
      ...prev,
      slides: prev.slides.filter((_, i) => i !== index),
      updatedAt: Date.now(),
    }));
    if (safeSlideIndex >= draft.slides.length - 1) {
      setCurrentSlideIndex(Math.max(0, draft.slides.length - 2));
    }
  };

  const moveSlide = (from: number, to: number) => {
    if (from === to || to < 0 || to >= draft.slides.length) return;
    setDraft(prev => {
      const arr = [...prev.slides];
      const [item] = arr.splice(from, 1);
      arr.splice(to, 0, item);
      return { ...prev, slides: arr, updatedAt: Date.now() };
    });
    setCurrentSlideIndex(to);
  };

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

  // Helper: load any image into a cache with CORS fallback
  const loadImageIntoCache = (src: string, cache: Map<string, HTMLImageElement>) => {
    if (!src || cache.has(src)) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      cache.set(src, img);
      setImgCacheVersion(v => v + 1);
    };
    img.onerror = () => {
      // Retry without CORS (export may be tainted but display works)
      const fallback = new Image();
      fallback.onload = () => {
        cache.set(src, fallback);
        setImgCacheVersion(v => v + 1);
      };
      fallback.onerror = () => console.warn('[EditorSection] Image failed to load:', src);
      fallback.src = src;
    };
    img.src = src;
  };

  // Load ALL images needed for ALL slides (bg + logos + overlays)
  // This ensures carousel thumbnails + navigation pre-load everything
  useEffect(() => {
    // Background images
    draft.slides.forEach(s => {
      if (s.bgType === 'image' && s.bgValue) {
        loadImageIntoCache(s.bgValue, bgCache.current);
      }
    });
    // Logos — all 3 logo variants
    LOGO_OPTIONS.forEach(lo => {
      if (lo.src) loadImageIntoCache(lo.src, logoCache.current);
    });
    // Overlays across all slides
    draft.slides.forEach(s => {
      s.overlays.forEach(o => {
        loadImageIntoCache(o.src, overlayCache.current);
      });
    });
  }, [draft.slides]);

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
  // Pure draw function: renders a specific slide onto a canvas.
  // This is not a useCallback — we call it manually via drawCurrent() below.
  const drawSlide = (canvas: HTMLCanvasElement, slide: Slide, forExport = false) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = template.w;
    const h = template.h;
    const dpr = forExport ? 2 : (typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = '100%';
    canvas.style.height = 'auto';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Background
    const bgImg = slide.bgType === 'image' && slide.bgValue ? bgCache.current.get(slide.bgValue) : null;
    if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
      const scale = Math.max(w / bgImg.width, h / bgImg.height);
      const iw = bgImg.width * scale;
      const ih = bgImg.height * scale;
      ctx.drawImage(bgImg, (w - iw) / 2, (h - ih) / 2, iw, ih);
      if (slide.bgOpacity > 0) {
        ctx.fillStyle = `rgba(0,0,0,${slide.bgOpacity})`;
        ctx.fillRect(0, 0, w, h);
      }
    } else {
      ctx.fillStyle = slide.bgValue || '#000';
      ctx.fillRect(0, 0, w, h);
    }

    // Overlays
    const sortedOverlays = [...slide.overlays].sort((a, b) => a.z - b.z);
    for (const ov of sortedOverlays) {
      const img = overlayCache.current.get(ov.src);
      if (!img || !img.complete || img.naturalWidth === 0) continue;
      const ovW = w * (ov.widthPct / 100);
      const ovH = (img.height / img.width) * ovW;
      const cx = w * (ov.x / 100);
      const cy = h * (ov.y / 100);
      ctx.save();
      ctx.translate(cx, cy);
      if (ov.rotation) ctx.rotate((ov.rotation * Math.PI) / 180);
      ctx.globalAlpha = ov.opacity;
      ctx.drawImage(img, -ovW / 2, -ovH / 2, ovW, ovH);
      ctx.restore();
    }

    // Wrapped text helper
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

    // Caption
    if (slide.caption) {
      const fontSize = Math.round(w * (slide.captionSizePct / 100));
      ctx.font = `500 ${fontSize}px "DM Sans", system-ui, sans-serif`;
      ctx.fillStyle = slide.captionColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      drawWrapped(slide.caption, w / 2, h * (slide.captionY / 100), w * 0.84, fontSize * 1.25);
    }

    // Title
    if (slide.title) {
      const fontSize = Math.round(w * (slide.titleSizePct / 100));
      ctx.font = `${slide.titleWeight} ${fontSize}px "DM Sans", system-ui, sans-serif`;
      ctx.fillStyle = slide.titleColor;
      ctx.textAlign = slide.titleAlign;
      ctx.textBaseline = 'middle';
      const x = slide.titleAlign === 'center' ? w / 2 : slide.titleAlign === 'left' ? w * 0.08 : w * 0.92;
      drawWrapped(slide.title, x, h * (slide.titleY / 100), w * 0.84, fontSize * 1.12);
    }

    // Subtitle
    if (slide.subtitle) {
      const fontSize = Math.round(w * (slide.subtitleSizePct / 100));
      ctx.font = `${slide.subtitleWeight} ${fontSize}px "DM Sans", system-ui, sans-serif`;
      ctx.fillStyle = slide.subtitleColor;
      ctx.textAlign = slide.titleAlign;
      ctx.textBaseline = 'middle';
      const x = slide.titleAlign === 'center' ? w / 2 : slide.titleAlign === 'left' ? w * 0.08 : w * 0.92;
      drawWrapped(slide.subtitle, x, h * (slide.subtitleY / 100), w * 0.84, fontSize * 1.2);
    }

    // Logo watermark
    const logoOption = LOGO_OPTIONS.find(l => l.id === slide.logoId);
    const logoImg = logoOption?.src ? logoCache.current.get(logoOption.src) : null;
    if (logoImg && logoImg.complete && logoImg.naturalWidth > 0 && slide.logoId !== 'none') {
      const logoW = w * (slide.logoSizePct / 100);
      const logoH = (logoImg.height / logoImg.width) * logoW;
      const pad = w * 0.04;
      let lx = pad, ly = pad;
      switch (slide.logoPos) {
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
  };

  // Redraw main preview canvas whenever slide content changes
  useEffect(() => {
    if (canvasRef.current && fontLoaded) drawSlide(canvasRef.current, currentSlide, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSlide, template, fontLoaded, imgCacheVersion]);

  // ========== ACTIONS ==========
  // Update a top-level design field (name, templateId, ...)
  const updateDesign = <K extends keyof Design>(key: K, value: Design[K]) => {
    setDraft(prev => ({ ...prev, [key]: value, updatedAt: Date.now() }));
  };

  // Shortcut: update a current-slide field (common case)
  const update = <K extends keyof Slide>(key: K, value: Slide[K]) => {
    updateSlide({ [key]: value } as Partial<Slide>);
  };

  const startNew = (templateId?: string) => {
    setDraft(blankDesign(templateId));
    setCurrentId(null);
    setCurrentSlideIndex(0);
    setSelectedOverlayId(null);
  };

  const loadDesign = (id: string) => {
    const d = designs.find(x => x.id === id);
    if (!d) return;
    setDraft(normalizeDesign(d));
    setCurrentId(id);
    setCurrentSlideIndex(0);
    setSelectedOverlayId(null);
  };

  const saveDesign = async () => {
    // Generate a thumbnail of the FIRST slide for the saved-designs sidebar
    const tmp = document.createElement('canvas');
    drawSlide(tmp, draft.slides[0], false);
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
    if (currentId === id) { setCurrentId(null); setDraft(blankDesign()); setCurrentSlideIndex(0); }
    toast('Suunnitelma poistettu', 'success');
  };

  // Export a single slide as PNG
  const exportSlide = (slide: Slide, suffix?: string) => {
    const canvas = document.createElement('canvas');
    drawSlide(canvas, slide, true);
    const link = document.createElement('a');
    const base = (draft.name || 'llff-julkaisu').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    const fname = suffix ? `${base}_${suffix}_${template.w}x${template.h}.png` : `${base}_${template.w}x${template.h}.png`;
    link.download = fname;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  // Export current slide only
  const exportCurrent = () => {
    exportSlide(currentSlide);
    toast(`Ladattu: ${template.w}×${template.h} PNG`, 'success');
  };

  // Batch export: all slides sequentially (for carousels)
  const exportAll = async () => {
    for (let i = 0; i < draft.slides.length; i++) {
      exportSlide(draft.slides[i], String(i + 1).padStart(2, '0'));
      await new Promise(r => setTimeout(r, 250)); // brief delay between downloads
    }
    toast(`Ladattu: ${draft.slides.length} slaidia`, 'success');
  };

  // Render first slide to a Blob for R2 upload (Firestore 1MB limit forbids embedding data URLs)
  const renderFirstSlideBlob = (): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      drawSlide(canvas, draft.slides[0], true);
      canvas.toBlob(
        b => (b ? resolve(b) : reject(new Error('Canvas toBlob returned null'))),
        'image/jpeg',
        0.85
      );
    });
  };

  // Upload a Blob to R2 via the worker — returns the public URL
  const uploadBlobToR2 = async (blob: Blob, filename: string, folder = 'julkaisut'): Promise<string> => {
    if (!activeOrg) throw new Error('Ei aktiivista organisaatiota');
    const form = new FormData();
    form.append('file', blob, filename);
    form.append('folder', folder);
    const res = await fetch(WORKER_URL + '/media/upload', {
      method: 'POST',
      body: form,
      headers: { 'X-Momentum-Org': activeOrg },
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => res.statusText);
      throw new Error(`Upload failed (${res.status}): ${msg}`);
    }
    const data = await res.json();
    return R2_CDN + '/' + data.key;
  };

  // Open the publish modal — prefill from draft, or from linked publication if provided
  const openPublishModal = () => {
    const firstSlide = draft.slides[0];
    // If editing a linked publication, prefill from its existing fields
    if (linkedPubId) {
      const existing = (publications || []).find(p => p.id === linkedPubId);
      if (existing) {
        setPublishTitle(existing.title || '');
        setPublishBody(existing.body || '');
        setPublishChannels(existing.channels || []);
        setPublishDate(existing.date || '');
        setPublishCategory(existing.category || 'some');
        setPublishStatus(existing.status === 'published' ? 'ready' : (existing.status || 'ready'));
        setShowPublishModal(true);
        return;
      }
    }
    const defaultTitle = (firstSlide.title || firstSlide.caption || draft.name || 'LLFF-julkaisu').slice(0, 120);
    const defaultBody = [firstSlide.title, firstSlide.subtitle, firstSlide.caption]
      .filter(Boolean)
      .join('\n\n');
    setPublishTitle(defaultTitle);
    setPublishBody(defaultBody);
    setPublishChannels([]);
    setPublishDate('');
    setPublishCategory('some');
    setPublishStatus('ready');
    setShowPublishModal(true);
  };

  const togglePublishChannel = (name: string) => {
    setPublishChannels(prev => prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]);
  };

  // Confirm publish: upload image to R2, create Publication + CalEvent, save design snapshot
  const confirmPublish = async () => {
    if (!publishTitle.trim()) { toast('Anna otsikko', 'error'); return; }
    if (publishChannels.length === 0) { toast('Valitse vähintään yksi kanava', 'error'); return; }
    if (!canEdit) { toast('Vierailijat eivät voi julkaista', 'error'); return; }
    setPublishing(true);
    try {
      // 1) Render first slide and upload to R2
      const blob = await renderFirstSlideBlob();
      const safeName = (draft.name || 'llff-julkaisu').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      const filename = `${Date.now()}_${safeName}.jpg`;
      let imageUrl = '';
      try {
        imageUrl = await uploadBlobToR2(blob, filename, 'julkaisut');
      } catch (uploadErr) {
        console.error('R2 upload failed', uploadErr);
        toast('Kuvan lataus R2:een epäonnistui — tarkista verkko', 'error');
        setPublishing(false);
        return;
      }

      // 2) Create or update Publication record
      const nowIso = new Date().toISOString().slice(0, 10);
      const nowMs = Date.now();
      // If editor was opened from an existing publication (?pubId=...), update it in place.
      // Otherwise create a new one.
      const targetPubId = linkedPubId || ('pub_' + nowMs);

      if (linkedPubId) {
        setPublications(prev => (prev || []).map(p => p.id === linkedPubId ? normalizePublication({
          ...p,
          title: publishTitle.trim(),
          body: publishBody.trim(),
          channels: publishChannels,
          date: publishDate || p.date || null,
          image: imageUrl,
          status: publishStatus,
          category: publishCategory,
          designId: draft.id,
          updatedAt: nowMs,
        }) : p));
      } else {
        const newPub = normalizePublication({
          id: targetPubId,
          title: publishTitle.trim(),
          body: publishBody.trim(),
          channels: publishChannels,
          date: publishDate || null,
          image: imageUrl,
          status: publishStatus,
          created: nowIso,
          publishedChannels: [],
          category: publishCategory,
          designId: draft.id,
          updatedAt: nowMs,
        });
        setPublications(prev => [newPub, ...(prev || [])]);
      }

      // 3) Create/update matching calendar event (only if date chosen)
      if (publishDate) {
        setCalEvents(prev => {
          const list = (prev || []).filter(e => e.pubId !== targetPubId);
          list.push({
            id: nowMs,
            t: publishTitle.trim(),
            date: publishDate,
            ch: publishChannels.join(', '),
            st: publishStatus === 'ready' ? 'valmis' : 'suunniteltu',
            pubId: targetPubId,
            kind: 'publication',
          });
          return list;
        });
      }

      // 4) Save the design draft too so it can be edited later (non-fatal)
      try {
        await saveDesign();
      } catch (e) {
        console.warn('saveDesign failed during publish', e);
      }

      setShowPublishModal(false);
      toast(
        publishDate
          ? `Julkaisu tallennettu · ${publishDate}`
          : 'Julkaisu tallennettu',
        'success'
      );
    } catch (e) {
      console.error('Publish failed', e);
      const msg = e instanceof Error ? e.message : 'Tuntematon virhe';
      toast(`Julkaisun tallennus epäonnistui: ${msg}`, 'error');
    } finally {
      setPublishing(false);
    }
  };

  // === BACKGROUND UPLOAD (local file → data URL → background) ===
  const handleBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      updateSlide({ bgType: 'image', bgValue: ev.target!.result as string });
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
      // Preload image into bgCache so canvas renders it immediately.
      // Track loading state for the spinner overlay.
      const cached = bgCache.current.get(file.url);
      if (cached && cached.complete && cached.naturalWidth > 0) {
        updateSlide({ bgType: 'image', bgValue: file.url });
      } else {
        setImageLoadingCount(c => c + 1);
        const img = new Image();
        img.crossOrigin = 'anonymous';
        const finish = (el: HTMLImageElement) => {
          bgCache.current.set(file.url, el);
          setImgCacheVersion(v => v + 1);
          updateSlide({ bgType: 'image', bgValue: file.url });
          setImageLoadingCount(c => Math.max(0, c - 1));
        };
        img.onload = () => finish(img);
        img.onerror = () => {
          // Retry without CORS
          const fallback = new Image();
          fallback.onload = () => finish(fallback);
          fallback.onerror = () => {
            setImageLoadingCount(c => Math.max(0, c - 1));
            toast('Taustakuvan lataus epäonnistui', 'error');
          };
          fallback.src = file.url;
        };
        img.src = file.url;
      }
    } else {
      addOverlayFromSrc(file.url, file.name);
    }
    setShowMediaPicker(false);
  };

  // === OVERLAY HELPERS ===
  // Cover-fit width calculator: given an image's natural size, returns the widthPct
  // that makes the overlay fill (cover) the canvas frame.
  const computeCoverWidthPct = (imgW: number, imgH: number): number => {
    if (imgW <= 0 || imgH <= 0) return 100;
    const coverScale = Math.max(template.w / imgW, template.h / imgH);
    const displayW = imgW * coverScale;
    return (displayW / template.w) * 100;
  };

  // Add overlay — loads image FIRST to compute cover-fit widthPct before adding
  const addOverlayFromSrc = (src: string, name?: string) => {
    // Track loading state — skip spinner if already cached
    const cached = overlayCache.current.get(src);
    const needsLoad = !cached || !cached.complete || cached.naturalWidth === 0;
    if (needsLoad) setImageLoadingCount(c => c + 1);
    const clearLoading = () => {
      if (needsLoad) setImageLoadingCount(c => Math.max(0, c - 1));
    };
    // Load the image to measure dimensions
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const finishAdding = (imgEl: HTMLImageElement) => {
      const widthPct = computeCoverWidthPct(imgEl.naturalWidth || imgEl.width, imgEl.naturalHeight || imgEl.height);
      const maxZ = currentSlide.overlays.reduce((m, o) => Math.max(m, o.z), 0);
      const newOverlay: ImageOverlay = {
        id: 'ov_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        src, name,
        x: 50, y: 50, // center
        widthPct,     // fills the frame by default
        opacity: 1,
        rotation: 0,
        z: maxZ + 1,
      };
      // Cache the image so it draws immediately
      overlayCache.current.set(src, imgEl);
      mutateSlide(s => ({ ...s, overlays: [...s.overlays, newOverlay] }));
      setSelectedOverlayId(newOverlay.id);
      setImgCacheVersion(v => v + 1);
      clearLoading();
      toast('Kuva lisätty', 'success');
    };
    img.onload = () => finishAdding(img);
    img.onerror = () => {
      // Retry without CORS for display
      const fallback = new Image();
      fallback.onload = () => finishAdding(fallback);
      fallback.onerror = () => {
        clearLoading();
        toast('Kuvan lataus epäonnistui', 'error');
      };
      fallback.src = src;
    };
    img.src = src;
  };

  // Lisää muoto overlayna — generoi SVG data-URLin ja käyttää olemassa olevaa kuvapolkua
  const insertShape = (
    shape: 'rectangle' | 'rounded' | 'circle' | 'line' | 'triangle' | 'arrow' | 'star'
  ) => {
    const color = '#FFFFFF';
    let svg = '';
    if (shape === 'rectangle')
      svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240"><rect width="400" height="240" fill="${color}"/></svg>`;
    else if (shape === 'rounded')
      svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240"><rect width="400" height="240" rx="40" ry="40" fill="${color}"/></svg>`;
    else if (shape === 'circle')
      svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><circle cx="200" cy="200" r="196" fill="${color}"/></svg>`;
    else if (shape === 'line')
      svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 12"><rect width="400" height="12" fill="${color}"/></svg>`;
    else if (shape === 'triangle')
      svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 346"><polygon points="200,4 396,342 4,342" fill="${color}"/></svg>`;
    else if (shape === 'arrow')
      svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 120"><path d="M0 45 H300 V10 L395 60 L300 110 V75 H0 Z" fill="${color}"/></svg>`;
    else if (shape === 'star')
      svg =
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 380"><polygon fill="${color}" points="200,10 250,140 390,150 285,240 320,375 200,300 80,375 115,240 10,150 150,140"/></svg>`;
    const dataUrl = 'data:image/svg+xml;base64,' + btoa(svg);
    addOverlayFromSrc(dataUrl, `Muoto · ${shape}`);
  };

  // ── MediaSection handoff ──
  // When the user selects images in MediaSection and clicks "Vie editoriin" or the
  // AI modal's "Vie editoriin", we land here. Read the handoff once, then clear it.
  const handoffApplied = useRef(false);
  useEffect(() => {
    if (handoffApplied.current) return;
    if (typeof window === 'undefined') return;
    let raw: string | null = null;
    try { raw = sessionStorage.getItem('momentum_editor_handoff'); } catch {}
    if (!raw) return;
    handoffApplied.current = true;
    try { sessionStorage.removeItem('momentum_editor_handoff'); } catch {}

    let handoff: { images?: Array<{ url: string; name?: string; id?: string }>; text?: string } | null = null;
    try { handoff = JSON.parse(raw); } catch { return; }
    if (!handoff) return;

    const imgs = Array.isArray(handoff.images) ? handoff.images : [];
    if (imgs.length === 0 && !handoff.text) return;

    // First image → background of current slide, rest → overlays
    if (imgs.length > 0) {
      const [first, ...rest] = imgs;
      // Load bg image into cache so the canvas draws it immediately
      const bgImg = new Image();
      bgImg.crossOrigin = 'anonymous';
      const setBg = (el: HTMLImageElement) => {
        bgCache.current.set(first.url, el);
        setImgCacheVersion(v => v + 1);
        updateSlide({ bgType: 'image', bgValue: first.url });
      };
      bgImg.onload = () => setBg(bgImg);
      bgImg.onerror = () => {
        const fb = new Image();
        fb.onload = () => setBg(fb);
        fb.src = first.url;
      };
      bgImg.src = first.url;

      // Queue remaining images as overlays
      rest.forEach((f, i) => {
        window.setTimeout(() => addOverlayFromSrc(f.url, f.name), 120 * (i + 1));
      });
    }

    // Prefill publish text if provided (from AI post generation)
    if (handoff.text && handoff.text.trim()) {
      setPublishBody(handoff.text.trim());
      // Give a helpful generic title if empty
      setPublishTitle(prev => prev || 'AI-luonnos');
      toast('Kuvat ja teksti tuotu mediapankista', 'success');
    } else if (imgs.length > 0) {
      toast(`${imgs.length} kuvaa tuotu mediapankista`, 'success');
    }
  // Intentionally empty deps: handoff is a one-shot on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateOverlay = (id: string, patch: Partial<ImageOverlay>) => {
    mutateSlide(s => ({
      ...s,
      overlays: s.overlays.map(o => o.id === id ? { ...o, ...patch } : o),
    }));
  };

  const removeOverlay = (id: string) => {
    mutateSlide(s => ({ ...s, overlays: s.overlays.filter(o => o.id !== id) }));
    if (selectedOverlayId === id) setSelectedOverlayId(null);
  };

  const moveOverlayZ = (id: string, direction: 'up' | 'down') => {
    mutateSlide(s => {
      const sorted = [...s.overlays].sort((a, b) => a.z - b.z);
      const idx = sorted.findIndex(o => o.id === id);
      if (idx === -1) return s;
      const target = direction === 'up' ? idx + 1 : idx - 1;
      if (target < 0 || target >= sorted.length) return s;
      const a = sorted[idx];
      const b = sorted[target];
      return {
        ...s,
        overlays: s.overlays.map(o => {
          if (o.id === a.id) return { ...o, z: b.z };
          if (o.id === b.id) return { ...o, z: a.z };
          return o;
        }),
      };
    });
  };

  // =============================================================================
  // MOUSE DRAG: click overlay on canvas to select, drag to move
  // =============================================================================

  // Convert client coordinates to % of canvas width/height
  const clientToPct = (clientX: number, clientY: number): { xPct: number; yPct: number } | null => {
    const wrapper = canvasWrapperRef.current;
    if (!wrapper) return null;
    const rect = wrapper.getBoundingClientRect();
    const xPct = ((clientX - rect.left) / rect.width) * 100;
    const yPct = ((clientY - rect.top) / rect.height) * 100;
    return { xPct, yPct };
  };

  // Hit-test overlays at a given canvas-pct point.
  // Returns the topmost (highest z) overlay under the point.
  const hitTestOverlay = (xPct: number, yPct: number): ImageOverlay | null => {
    const aspect = template.w / template.h;
    // Convert pct to canvas-unit coordinates (where canvas is template.w × template.h)
    const px = (xPct / 100) * template.w;
    const py = (yPct / 100) * template.h;
    // Iterate overlays in reverse z-order (topmost first)
    const sorted = [...currentSlide.overlays].sort((a, b) => b.z - a.z);
    for (const ov of sorted) {
      const img = overlayCache.current.get(ov.src);
      if (!img) continue;
      const ovW = template.w * (ov.widthPct / 100);
      const ovH = (img.height / img.width) * ovW;
      const cx = template.w * (ov.x / 100);
      const cy = template.h * (ov.y / 100);
      // Inverse-transform point by rotation if any
      let dx = px - cx;
      let dy = py - cy;
      if (ov.rotation) {
        const rad = (-ov.rotation * Math.PI) / 180;
        const cos = Math.cos(rad), sin = Math.sin(rad);
        [dx, dy] = [dx * cos - dy * sin, dx * sin + dy * cos];
      }
      if (Math.abs(dx) <= ovW / 2 && Math.abs(dy) <= ovH / 2) {
        return ov;
      }
    }
    return null;
  };

  const onCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!canEdit) return;
    const pct = clientToPct(e.clientX, e.clientY);
    if (!pct) return;
    const hit = hitTestOverlay(pct.xPct, pct.yPct);
    if (hit) {
      setSelectedOverlayId(hit.id);
      dragState.current = {
        id: hit.id,
        startX: pct.xPct,
        startY: pct.yPct,
        origX: hit.x,
        origY: hit.y,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } else {
      setSelectedOverlayId(null);
    }
  };

  const onCanvasPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragState.current;
    if (!d) return;
    const pct = clientToPct(e.clientX, e.clientY);
    if (!pct) return;
    const dx = pct.xPct - d.startX;
    const dy = pct.yPct - d.startY;
    updateOverlay(d.id, {
      x: Math.max(-50, Math.min(150, d.origX + dx)),
      y: Math.max(-50, Math.min(150, d.origY + dy)),
    });
  };

  const onCanvasPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragState.current = null;
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
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

  const selectedOverlay = selectedOverlayId ? currentSlide.overlays.find(o => o.id === selectedOverlayId) : null;

  // Kun käyttäjä avaa "Lataukset"-välilehden ensimmäistä kertaa, hae mediapankki automaattisesti
  useEffect(() => {
    if (sidebarTab !== 'uploads') return;
    if (sidebarMediaFetched.current) return;
    if (mediaFiles.length > 0) { sidebarMediaFetched.current = true; return; }
    sidebarMediaFetched.current = true;
    fetchMedia();
  }, [sidebarTab, mediaFiles.length, fetchMedia]);

  // Yksi-klikkauksen apuri: valitun tekstikentän (otsikko/alaotsikko/kuvaus) koon ja tyylin presetti
  const applyTextPreset = (
    field: 'title' | 'subtitle' | 'caption',
    preset: { sizePct?: number; weight?: number; align?: 'left' | 'center' | 'right'; text?: string }
  ) => {
    const patch: Partial<Slide> = {};
    if (field === 'title') {
      if (preset.sizePct !== undefined) patch.titleSizePct = preset.sizePct;
      if (preset.weight !== undefined) patch.titleWeight = preset.weight;
      if (preset.align !== undefined) patch.titleAlign = preset.align;
      if (preset.text !== undefined && !currentSlide.title) patch.title = preset.text;
    } else if (field === 'subtitle') {
      if (preset.sizePct !== undefined) patch.subtitleSizePct = preset.sizePct;
      if (preset.weight !== undefined) patch.subtitleWeight = preset.weight;
      if (preset.text !== undefined && !currentSlide.subtitle) patch.subtitle = preset.text;
    } else if (field === 'caption') {
      if (preset.sizePct !== undefined) patch.captionSizePct = preset.sizePct;
      if (preset.text !== undefined && !currentSlide.caption) patch.caption = preset.text;
    }
    updateSlide(patch);
  };

  // ========== RENDER ==========
  // Canva-tyylinen vasen rail — 56 px ikoninauha + 224 px paneeli = 280 px yhteensä
  const SIDEBAR_TABS: Array<{ id: SidebarTab; label: string; icon: string }> = [
    { id: 'templates', label: 'Mallit', icon: '▦' },
    { id: 'elements',  label: 'Elementit', icon: '◇' },
    { id: 'text',      label: 'Teksti', icon: 'T' },
    { id: 'brand',     label: 'Brändi', icon: '◉' },
    { id: 'uploads',   label: 'Lataukset', icon: '▲' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr 320px', gap: '1rem', minHeight: 600 }}>
      {/* ========== LEFT SIDEBAR: Canva-tyylinen tab rail + panel ========== */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '56px 1fr',
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--rl)',
          overflow: 'hidden',
          minHeight: 560,
          alignSelf: 'start',
          maxHeight: 'calc(100vh - 140px)',
        }}
      >
        {/* Tab rail — vertikaali ikoninauha */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            borderRight: '1px solid var(--border)',
            background: 'var(--bg)',
            padding: '.4rem 0',
            gap: '.1rem',
          }}
        >
          {SIDEBAR_TABS.map(t => {
            const active = sidebarTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setSidebarTab(t.id)}
                title={t.label}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '.2rem',
                  padding: '.65rem .25rem',
                  background: active ? 'var(--card)' : 'transparent',
                  border: 'none',
                  borderLeft: active ? '2px solid var(--pri-l)' : '2px solid transparent',
                  color: active ? 'var(--pri-l)' : 'var(--t2)',
                  cursor: 'pointer',
                  transition: 'background .15s, color .15s',
                }}
                onMouseEnter={e => {
                  if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'var(--elev)';
                }}
                onMouseLeave={e => {
                  if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                }}
              >
                <span style={{ fontSize: '1rem', fontWeight: 700, lineHeight: 1 }}>{t.icon}</span>
                <span style={{ fontSize: '.58rem', fontWeight: 600, letterSpacing: '.02em' }}>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Panel content */}
        <div style={{ overflowY: 'auto', padding: '.85rem', minHeight: 0 }}>
          {sidebarTab === 'templates' && (
            <div>
              <div style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '.5rem' }}>
                Mallipohjat
              </div>
              <div style={{ fontSize: '.62rem', color: 'var(--t3)', marginBottom: '.25rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                Instagram
              </div>
              {TEMPLATES.filter(t => t.platform === 'instagram').map(t => {
                const active = draft.templateId === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => updateDesign('templateId', t.id)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '.5rem .6rem', marginBottom: '.2rem',
                      background: active ? 'rgba(5,107,159,.12)' : 'transparent',
                      border: '1px solid', borderColor: active ? 'var(--pri)' : 'transparent',
                      borderRadius: 'var(--r)', cursor: 'pointer',
                      fontSize: '.72rem', fontWeight: active ? 700 : 500,
                      color: active ? 'var(--pri-l)' : 'var(--t2)',
                    }}
                  >
                    <div>{t.label}</div>
                    <div style={{ fontSize: '.58rem', color: 'var(--t3)', marginTop: '.1rem' }}>{t.w}×{t.h}</div>
                  </button>
                );
              })}
              <div style={{ fontSize: '.62rem', color: 'var(--t3)', marginTop: '.5rem', marginBottom: '.25rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                Facebook
              </div>
              {TEMPLATES.filter(t => t.platform === 'facebook').map(t => {
                const active = draft.templateId === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => updateDesign('templateId', t.id)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '.5rem .6rem', marginBottom: '.2rem',
                      background: active ? 'rgba(5,107,159,.12)' : 'transparent',
                      border: '1px solid', borderColor: active ? 'var(--pri)' : 'transparent',
                      borderRadius: 'var(--r)', cursor: 'pointer',
                      fontSize: '.72rem', fontWeight: active ? 700 : 500,
                      color: active ? 'var(--pri-l)' : 'var(--t2)',
                    }}
                  >
                    <div>{t.label}</div>
                    <div style={{ fontSize: '.58rem', color: 'var(--t3)', marginTop: '.1rem' }}>{t.w}×{t.h}</div>
                  </button>
                );
              })}

              {/* Saved designs */}
              <div style={{
                marginTop: '1rem', paddingTop: '.75rem', borderTop: '1px solid var(--border)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.5rem',
              }}>
                <div style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                  Tallennetut ({designs.length})
                </div>
                {canEdit && (
                  <button className="btn btn-ghost btn-sm" onClick={() => startNew(draft.templateId)} style={{ fontSize: '.62rem', padding: '.15rem .4rem' }}>
                    + Uusi
                  </button>
                )}
              </div>
              {designs.length === 0 && (
                <div style={{ fontSize: '.65rem', color: 'var(--t3)', textAlign: 'center', padding: '.5rem' }}>
                  Ei tallennettuja
                </div>
              )}
              {designs.map(d => (
                <div
                  key={d.id}
                  onClick={() => loadDesign(d.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '.4rem',
                    padding: '.35rem', marginBottom: '.2rem',
                    background: currentId === d.id ? 'rgba(5,107,159,.12)' : 'transparent',
                    border: '1px solid', borderColor: currentId === d.id ? 'var(--pri)' : 'transparent',
                    borderRadius: 'var(--r)', cursor: 'pointer',
                  }}
                >
                  {d.thumbnail ? (
                    <img src={d.thumbnail} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 36, height: 36, background: 'var(--elev)', borderRadius: 3, flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '.7rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--t1)' }}>
                      {d.name}
                    </div>
                    <div style={{ fontSize: '.55rem', color: 'var(--t3)' }}>
                      {TEMPLATES.find(t => t.id === d.templateId)?.label || d.templateId}
                    </div>
                  </div>
                  {canEdit && (
                    <button
                      onClick={e => { e.stopPropagation(); deleteDesign(d.id); }}
                      style={{ background: 'transparent', border: 'none', color: 'var(--t3)', cursor: 'pointer', fontSize: '.72rem', padding: '.1rem .25rem' }}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* =========== ELEMENTIT — shapes, lines, logos ============ */}
          {sidebarTab === 'elements' && (
            <div>
              <div style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '.5rem' }}>
                Muodot
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.4rem', marginBottom: '1rem' }}>
                {([
                  { id: 'rectangle', label: 'Suorakaide', svg: <rect x="4" y="10" width="32" height="20" fill="currentColor" /> },
                  { id: 'rounded',   label: 'Pyöristetty', svg: <rect x="4" y="10" width="32" height="20" rx="5" ry="5" fill="currentColor" /> },
                  { id: 'circle',    label: 'Ympyrä',     svg: <circle cx="20" cy="20" r="14" fill="currentColor" /> },
                  { id: 'triangle',  label: 'Kolmio',     svg: <polygon points="20,6 36,34 4,34" fill="currentColor" /> },
                  { id: 'line',      label: 'Viiva',      svg: <rect x="4" y="18" width="32" height="3" fill="currentColor" /> },
                  { id: 'arrow',     label: 'Nuoli',      svg: <path d="M4 17 H26 V11 L36 20 L26 29 V23 H4 Z" fill="currentColor" /> },
                  { id: 'star',      label: 'Tähti',      svg: <polygon points="20,4 25,15 36,16 27,24 30,36 20,30 10,36 13,24 4,16 15,15" fill="currentColor" /> },
                ] as const).map(s => (
                  <button
                    key={s.id}
                    onClick={() => canEdit && insertShape(s.id as any)}
                    disabled={!canEdit}
                    title={s.label}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      gap: '.25rem', padding: '.55rem .3rem',
                      background: 'var(--elev)', border: '1px solid var(--border)',
                      borderRadius: 'var(--r)', cursor: canEdit ? 'pointer' : 'not-allowed',
                      opacity: canEdit ? 1 : .5,
                      color: 'var(--t1)',
                    }}
                    onMouseEnter={e => { if (canEdit) (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--pri)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; }}
                  >
                    <svg width="40" height="40" viewBox="0 0 40 40">{s.svg}</svg>
                    <span style={{ fontSize: '.58rem', color: 'var(--t3)', fontWeight: 600 }}>{s.label}</span>
                  </button>
                ))}
              </div>

              <div style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '.5rem' }}>
                Logot
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
                {LOGO_OPTIONS.map(l => {
                  const active = currentSlide.logoId === l.id;
                  return (
                    <button
                      key={l.id}
                      onClick={() => canEdit && updateSlide({ logoId: l.id })}
                      disabled={!canEdit}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '.5rem',
                        padding: '.5rem .6rem',
                        background: active ? 'rgba(5,107,159,.12)' : 'var(--elev)',
                        border: '1px solid', borderColor: active ? 'var(--pri)' : 'var(--border)',
                        borderRadius: 'var(--r)', cursor: canEdit ? 'pointer' : 'not-allowed',
                        opacity: canEdit ? 1 : .5,
                        fontSize: '.72rem', color: 'var(--t1)', textAlign: 'left',
                      }}
                    >
                      {l.src ? (
                        <img src={l.src} alt={l.label} style={{ width: 28, height: 20, objectFit: 'contain', flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 28, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t3)', fontSize: '.85rem' }}>∅</div>
                      )}
                      <span style={{ flex: 1 }}>{l.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* =========== TEKSTI — quick inserts + style presets =========== */}
          {sidebarTab === 'text' && (
            <div>
              <div style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '.5rem' }}>
                Tekstityylit
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.45rem', marginBottom: '1rem' }}>
                <button
                  onClick={() => canEdit && applyTextPreset('title', { sizePct: 9, weight: 800, align: 'center', text: 'Otsikko tähän' })}
                  disabled={!canEdit}
                  style={{
                    padding: '.95rem .75rem', background: 'var(--elev)', border: '1px solid var(--border)',
                    borderRadius: 'var(--r)', cursor: canEdit ? 'pointer' : 'not-allowed', textAlign: 'left',
                    fontSize: '1.15rem', fontWeight: 800, color: 'var(--t1)', fontFamily: 'var(--font-display)',
                  }}
                >
                  Lisää otsikko
                </button>
                <button
                  onClick={() => canEdit && applyTextPreset('subtitle', { sizePct: 5, weight: 600, text: 'Alaotsikko' })}
                  disabled={!canEdit}
                  style={{
                    padding: '.75rem .75rem', background: 'var(--elev)', border: '1px solid var(--border)',
                    borderRadius: 'var(--r)', cursor: canEdit ? 'pointer' : 'not-allowed', textAlign: 'left',
                    fontSize: '.92rem', fontWeight: 600, color: 'var(--t2)',
                  }}
                >
                  Lisää alaotsikko
                </button>
                <button
                  onClick={() => canEdit && applyTextPreset('caption', { sizePct: 3.2, text: 'Kuvaus' })}
                  disabled={!canEdit}
                  style={{
                    padding: '.65rem .75rem', background: 'var(--elev)', border: '1px solid var(--border)',
                    borderRadius: 'var(--r)', cursor: canEdit ? 'pointer' : 'not-allowed', textAlign: 'left',
                    fontSize: '.75rem', fontWeight: 500, color: 'var(--t3)',
                  }}
                >
                  Lisää kuvaus / pikkuteksti
                </button>
              </div>

              <div style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '.45rem' }}>
                Otsikon tasaus
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '.3rem', marginBottom: '1rem' }}>
                {(['left', 'center', 'right'] as const).map(a => {
                  const active = currentSlide.titleAlign === a;
                  return (
                    <button
                      key={a}
                      onClick={() => canEdit && updateSlide({ titleAlign: a })}
                      disabled={!canEdit}
                      style={{
                        padding: '.45rem', background: active ? 'var(--pri)' : 'var(--elev)',
                        color: active ? '#fff' : 'var(--t2)',
                        border: '1px solid', borderColor: active ? 'var(--pri)' : 'var(--border)',
                        borderRadius: 'var(--r)', cursor: canEdit ? 'pointer' : 'not-allowed',
                        fontSize: '.7rem', fontWeight: 600,
                      }}
                    >
                      {a === 'left' ? 'Vasen' : a === 'center' ? 'Keskitä' : 'Oikea'}
                    </button>
                  );
                })}
              </div>

              <div style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '.45rem' }}>
                Otsikon paksuus
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '.3rem' }}>
                {[400, 600, 700, 800].map(w => {
                  const active = currentSlide.titleWeight === w;
                  return (
                    <button
                      key={w}
                      onClick={() => canEdit && updateSlide({ titleWeight: w })}
                      disabled={!canEdit}
                      style={{
                        padding: '.45rem', background: active ? 'var(--pri)' : 'var(--elev)',
                        color: active ? '#fff' : 'var(--t2)',
                        border: '1px solid', borderColor: active ? 'var(--pri)' : 'var(--border)',
                        borderRadius: 'var(--r)', cursor: canEdit ? 'pointer' : 'not-allowed',
                        fontSize: '.7rem', fontWeight: w,
                      }}
                    >
                      {w === 400 ? 'Ohut' : w === 600 ? 'Med' : w === 700 ? 'Bold' : 'Xbold'}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* =========== BRÄNDI — LLFF colors + logos =========== */}
          {sidebarTab === 'brand' && (
            <div>
              <div style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '.5rem' }}>
                LLFF-värit
              </div>
              <div style={{ fontSize: '.6rem', color: 'var(--t3)', marginBottom: '.5rem' }}>Napauta → taustaväri</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '.35rem', marginBottom: '1rem' }}>
                {LLFF_COLORS.map(c => {
                  const active = currentSlide.bgType === 'color' && currentSlide.bgValue === c.value;
                  return (
                    <button
                      key={c.value}
                      onClick={() => canEdit && updateSlide({ bgType: 'color', bgValue: c.value })}
                      disabled={!canEdit}
                      title={`${c.name}\n${c.value}`}
                      style={{
                        aspectRatio: '1 / 1',
                        background: c.value,
                        border: '2px solid',
                        borderColor: active ? 'var(--pri-l)' : 'var(--border)',
                        borderRadius: 'var(--r)',
                        cursor: canEdit ? 'pointer' : 'not-allowed',
                        padding: 0,
                      }}
                    />
                  );
                })}
              </div>

              <div style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '.5rem' }}>
                Tekstivärit
              </div>
              <div style={{ fontSize: '.6rem', color: 'var(--t3)', marginBottom: '.5rem' }}>Napauta → otsikon väri</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '.35rem', marginBottom: '1rem' }}>
                {LLFF_COLORS.map(c => {
                  const active = currentSlide.titleColor === c.value;
                  return (
                    <button
                      key={c.value}
                      onClick={() => canEdit && updateSlide({ titleColor: c.value })}
                      disabled={!canEdit}
                      title={`${c.name}`}
                      style={{
                        aspectRatio: '1 / 1',
                        background: c.value,
                        border: '2px solid',
                        borderColor: active ? 'var(--pri-l)' : 'var(--border)',
                        borderRadius: '50%',
                        cursor: canEdit ? 'pointer' : 'not-allowed',
                        padding: 0,
                      }}
                    />
                  );
                })}
              </div>

              <div style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '.5rem' }}>
                Logot
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem', marginBottom: '1rem' }}>
                {LOGO_OPTIONS.map(l => {
                  const active = currentSlide.logoId === l.id;
                  return (
                    <button
                      key={l.id}
                      onClick={() => canEdit && updateSlide({ logoId: l.id })}
                      disabled={!canEdit}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '.5rem',
                        padding: '.5rem .6rem',
                        background: active ? 'rgba(5,107,159,.12)' : 'var(--elev)',
                        border: '1px solid', borderColor: active ? 'var(--pri)' : 'var(--border)',
                        borderRadius: 'var(--r)', cursor: canEdit ? 'pointer' : 'not-allowed',
                        opacity: canEdit ? 1 : .5,
                        fontSize: '.72rem', color: 'var(--t1)', textAlign: 'left',
                      }}
                    >
                      {l.src ? (
                        <img src={l.src} alt={l.label} style={{ width: 28, height: 20, objectFit: 'contain', flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 28, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t3)', fontSize: '.85rem' }}>∅</div>
                      )}
                      <span style={{ flex: 1 }}>{l.label}</span>
                    </button>
                  );
                })}
              </div>

              <div style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '.5rem' }}>
                Preset-tyylit
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
                {DESIGN_PRESETS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => canEdit && mutateSlide(s => p.apply(s))}
                    disabled={!canEdit}
                    title={p.description}
                    style={{
                      padding: '.55rem .65rem', background: 'var(--elev)', border: '1px solid var(--border)',
                      borderRadius: 'var(--r)', cursor: canEdit ? 'pointer' : 'not-allowed', textAlign: 'left',
                      fontSize: '.72rem', color: 'var(--t1)', fontWeight: 600,
                    }}
                    onMouseEnter={e => { if (canEdit) (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--pri)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* =========== LATAUKSET — inline mediapankki =========== */}
          {sidebarTab === 'uploads' && (
            <div>
              <div style={{ display: 'flex', gap: '.3rem', marginBottom: '.5rem' }}>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => canEdit && uploadRef.current?.click()}
                  disabled={!canEdit}
                  style={{ flex: 1, fontSize: '.7rem' }}
                  title="Lataa tiedosto kansioon"
                >
                  ▲ Lataa tiedosto
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => fetchMedia()}
                  title="Päivitä lista"
                  style={{ fontSize: '.7rem' }}
                >
                  ↻
                </button>
              </div>

              <input
                className="input"
                placeholder="Hae kuvia..."
                value={mediaSearch}
                onChange={e => setMediaSearch(e.target.value)}
                style={{ fontSize: '.75rem', padding: '.45rem .6rem', marginBottom: '.45rem' }}
              />

              {mediaFolders.length > 0 && (
                <select
                  className="input"
                  value={mediaFolderFilter}
                  onChange={e => setMediaFolderFilter(e.target.value)}
                  style={{ fontSize: '.72rem', padding: '.4rem .55rem', marginBottom: '.6rem' }}
                >
                  <option value="all">Kaikki kansiot</option>
                  {mediaFolders.map(f => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              )}

              <div style={{
                fontSize: '.58rem', color: 'var(--t3)', marginBottom: '.4rem',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span>{filteredMedia.length} kuvaa</span>
                <span>▤ Klikkaa → lisää · ⇧ Klikkaa → tausta</span>
              </div>

              {mediaLoading && mediaFiles.length === 0 && (
                <div style={{ fontSize: '.68rem', color: 'var(--t3)', textAlign: 'center', padding: '1rem' }}>
                  Ladataan mediapankkia...
                </div>
              )}

              {!mediaLoading && filteredMedia.length === 0 && mediaFiles.length > 0 && (
                <div style={{ fontSize: '.68rem', color: 'var(--t3)', textAlign: 'center', padding: '1rem' }}>
                  Ei hakutuloksia
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.35rem' }}>
                {filteredMedia.slice(0, 120).map(f => (
                  <button
                    key={f.key}
                    onClick={e => {
                      if (!canEdit) return;
                      // Shift-click → background, plain click → overlay
                      if (e.shiftKey) {
                        setPickerTarget('background');
                        pickFromMedia(f);
                      } else {
                        addOverlayFromSrc(f.url, f.name);
                      }
                    }}
                    disabled={!canEdit}
                    title={`${f.name}\nKlikkaa: lisää kuvaksi\nShift+klikkaa: aseta taustaksi`}
                    style={{
                      aspectRatio: '1 / 1',
                      background: `center/cover url("${f.url}")`,
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--r)',
                      cursor: canEdit ? 'pointer' : 'not-allowed',
                      padding: 0,
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                    onMouseEnter={e => { if (canEdit) (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--pri-l)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; }}
                  />
                ))}
              </div>

              {filteredMedia.length > 120 && (
                <div style={{ fontSize: '.6rem', color: 'var(--t3)', textAlign: 'center', marginTop: '.5rem' }}>
                  Näytetään 120 / {filteredMedia.length} — tarkenna hakua
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ========== CENTER: CANVAS PREVIEW ========== */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1rem', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.75rem', flexWrap: 'wrap', gap: '.5rem' }}>
          <div>
            <input
              className="input"
              value={draft.name}
              onChange={e => updateDesign('name', e.target.value)}
              placeholder="Suunnitelman nimi"
              style={{ fontSize: '.82rem', fontWeight: 600, border: 'none', background: 'transparent', padding: 0, minWidth: 160 }}
            />
            <div style={{ fontSize: '.65rem', color: 'var(--t3)' }}>
              {template.label} · {template.w}×{template.h} px
              {draft.slides.length > 1 && <span style={{ marginLeft: '.4rem', color: 'var(--pri-l)', fontWeight: 600 }}>· Karuselli ({draft.slides.length} slaidia)</span>}
              {template.tip && <span style={{ marginLeft: '.4rem', color: 'var(--pri-l)' }}>· {template.tip}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => openMediaPickerFor('overlay')} title="Lisää kuva editoriin mediapankista">
              Mediapankki
            </button>
            {canEdit && <button className="btn btn-ghost btn-sm" onClick={saveDesign} title="Tallenna luonnos (jää editoriin muokattavaksi)">Tallenna luonnos</button>}
            {draft.slides.length > 1 ? (
              <button className="btn btn-ghost btn-sm" onClick={exportAll} title="Lataa kaikki slaidit PNG-tiedostoina">Lataa PNG ({draft.slides.length})</button>
            ) : (
              <button className="btn btn-ghost btn-sm" onClick={exportCurrent} title="Lataa PNG-tiedostona">Lataa PNG</button>
            )}
            {canEdit && (
              <button
                className="btn btn-primary btn-sm"
                onClick={openPublishModal}
                title="Tallenna Julkaisut-välilehdelle ja kalenteriin"
                style={{ fontWeight: 700 }}
              >
                Julkaise →
              </button>
            )}
          </div>
        </div>

        {/* Canvas — aspect-ratio locked wrapper with pointer interaction */}
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
          <div
            ref={canvasWrapperRef}
            onPointerDown={onCanvasPointerDown}
            onPointerMove={onCanvasPointerMove}
            onPointerUp={onCanvasPointerUp}
            onPointerCancel={onCanvasPointerUp}
            style={{
              maxWidth: '100%',
              maxHeight: 560,
              aspectRatio: `${template.w} / ${template.h}`,
              width: template.w > template.h ? '100%' : 'auto',
              height: template.h >= template.w ? '100%' : 'auto',
              boxShadow: '0 8px 40px rgba(0,0,0,.4)',
              borderRadius: 4,
              overflow: 'hidden',
              position: 'relative',
              cursor: dragState.current ? 'grabbing' : 'default',
              touchAction: 'none',
            }}
          >
            <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%', pointerEvents: 'none' }} />

            {/* Image loading overlay — näkyy kun kuvaa ladataan mediapankista */}
            {imageLoadingCount > 0 && (
              <div
                aria-live="polite"
                aria-label="Ladataan kuvaa"
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '.75rem',
                  background: 'rgba(10, 5, 25, .55)',
                  backdropFilter: 'blur(3px)',
                  WebkitBackdropFilter: 'blur(3px)',
                  pointerEvents: 'none',
                  zIndex: 20,
                  animation: 'fadeIn .15s ease-out',
                }}
              >
                <div
                  style={{
                    width: 52,
                    height: 52,
                    border: '4px solid rgba(255,255,255,.22)',
                    borderTopColor: '#FBD1E4',
                    borderRightColor: '#E8A5C5',
                    borderRadius: '50%',
                    animation: 'editorSpin .85s linear infinite',
                  }}
                />
                <div
                  style={{
                    color: '#fff',
                    fontSize: '.72rem',
                    fontWeight: 600,
                    letterSpacing: '.06em',
                    textTransform: 'uppercase',
                    fontFamily: "'DM Sans', sans-serif",
                    textShadow: '0 1px 6px rgba(0,0,0,.6)',
                  }}
                >
                  Ladataan kuvaa{imageLoadingCount > 1 ? ` (${imageLoadingCount})` : ''}
                </div>
              </div>
            )}

            {/* Selected overlay highlight — dashed border showing what's selected */}
            {selectedOverlay && (() => {
              const img = overlayCache.current.get(selectedOverlay.src);
              if (!img) return null;
              const ovAspect = img.width / img.height;
              // Compute size in % of canvas
              const widthPct = selectedOverlay.widthPct;
              // Height in canvas pixels
              const ovPxH = (img.height / img.width) * (template.w * widthPct / 100);
              const heightPct = (ovPxH / template.h) * 100;
              return (
                <div style={{
                  position: 'absolute',
                  left: `${selectedOverlay.x - widthPct / 2}%`,
                  top: `${selectedOverlay.y - heightPct / 2}%`,
                  width: `${widthPct}%`,
                  height: `${heightPct}%`,
                  border: '2px dashed #3788b2',
                  borderRadius: 2,
                  pointerEvents: 'none',
                  transform: selectedOverlay.rotation ? `rotate(${selectedOverlay.rotation}deg)` : undefined,
                  transformOrigin: 'center',
                }} />
              );
            })()}
          </div>
        </div>

        {/* ============ KARUSELLI-STRIPI ============ */}
        {canEdit && (
          <div style={{
            marginTop: '.75rem',
            paddingTop: '.75rem',
            borderTop: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.5rem' }}>
              <div style={{ fontSize: '.62rem', fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                Slaidit ({draft.slides.length}) — karuselli
              </div>
              <div style={{ display: 'flex', gap: '.3rem' }}>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => addSlide({ duplicate: true })}
                  title="Monista nykyinen slaide"
                  style={{ fontSize: '.64rem', padding: '.25rem .55rem' }}
                >⎘ Monista</button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => addSlide()}
                  title="Lisää tyhjä slaide"
                  style={{ fontSize: '.64rem', padding: '.25rem .55rem' }}
                >+ Uusi slaide</button>
              </div>
            </div>
            <div style={{
              display: 'flex', gap: '.5rem',
              overflowX: 'auto', padding: '.25rem .1rem',
            }}>
              {draft.slides.map((slide, idx) => {
                const isActive = idx === safeSlideIndex;
                return (
                  <div
                    key={slide.id}
                    onClick={() => { setCurrentSlideIndex(idx); setSelectedOverlayId(null); }}
                    style={{
                      position: 'relative',
                      width: 80,
                      aspectRatio: `${template.w} / ${template.h}`,
                      flexShrink: 0,
                      background: slide.bgValue || '#000',
                      border: isActive ? '2px solid var(--pri)' : '2px solid var(--border)',
                      borderRadius: 4,
                      cursor: 'pointer',
                      overflow: 'hidden',
                      transition: 'border-color .15s',
                    }}
                  >
                    {/* Mini thumbnail — uses a separate per-slide canvas */}
                    <SlideThumb
                      slide={slide}
                      template={template}
                      draw={drawSlide}
                      version={imgCacheVersion}
                    />
                    <div style={{
                      position: 'absolute', top: 2, left: 2,
                      background: 'rgba(0,0,0,.7)', color: '#fff',
                      fontSize: '.55rem', padding: '.1rem .35rem',
                      borderRadius: 3, fontWeight: 700,
                    }}>{idx + 1}</div>
                    {draft.slides.length > 1 && isActive && (
                      <button
                        onClick={e => { e.stopPropagation(); removeSlide(idx); }}
                        title="Poista slaide"
                        style={{
                          position: 'absolute', top: 2, right: 2,
                          background: 'rgba(239,107,107,.9)', color: '#fff',
                          border: 'none', borderRadius: 3,
                          width: 16, height: 16,
                          fontSize: '.6rem', fontWeight: 800,
                          cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          padding: 0,
                        }}
                      >×</button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
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
                onClick={() => mutateSlide(s => p.apply(s))}
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
            <button onClick={() => update('bgType', 'color')} className={`cal-view-btn ${currentSlide.bgType === 'color' ? 'act' : ''}`} style={{ flex: 1, fontSize: '.68rem' }}>Väri</button>
            <button onClick={() => update('bgType', 'image')} className={`cal-view-btn ${currentSlide.bgType === 'image' ? 'act' : ''}`} style={{ flex: 1, fontSize: '.68rem' }}>Kuva</button>
          </div>
          {currentSlide.bgType === 'color' && (
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
                    border: currentSlide.bgValue === c.value ? '2px solid var(--pri)' : '2px solid var(--border)',
                  }}
                />
              ))}
              <input type="color" value={currentSlide.bgValue} onChange={e => update('bgValue', e.target.value)} style={{ width: '100%', height: 28, borderRadius: 4, gridColumn: 'span 4', border: '1px solid var(--border)', marginTop: '.25rem' }} />
            </div>
          )}
          {currentSlide.bgType === 'image' && (
            <>
              <div style={{ display: 'flex', gap: '.25rem', marginBottom: '.4rem' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => openMediaPickerFor('background')} style={{ flex: 1, fontSize: '.66rem', padding: '.3rem' }}>Mediapankki</button>
                <button className="btn btn-ghost btn-sm" onClick={() => uploadRef.current?.click()} style={{ flex: 1, fontSize: '.66rem', padding: '.3rem' }}>Lataa</button>
                <input ref={uploadRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleBgUpload} />
              </div>
              {currentSlide.bgType === 'image' && currentSlide.bgValue && (
                <div style={{ marginTop: '.4rem' }}>
                  <label style={{ fontSize: '.62rem', color: 'var(--t3)' }}>Tummennus: {Math.round(currentSlide.bgOpacity * 100)}%</label>
                  <input type="range" min={0} max={0.8} step={0.05} value={currentSlide.bgOpacity} onChange={e => update('bgOpacity', parseFloat(e.target.value))} style={{ width: '100%' }} />
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
          <input className="input" value={currentSlide.caption} onChange={e => update('caption', e.target.value)} placeholder="Esim. Muutos esityspaikkaan!" style={{ fontSize: '.78rem' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.35rem', marginTop: '.35rem' }}>
            <div>
              <label style={{ fontSize: '.58rem', color: 'var(--t3)' }}>Koko: {currentSlide.captionSizePct.toFixed(1)}%</label>
              <input type="range" min={1.5} max={6} step={0.25} value={currentSlide.captionSizePct} onChange={e => update('captionSizePct', parseFloat(e.target.value))} style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: '.58rem', color: 'var(--t3)' }}>Y-sijainti: {currentSlide.captionY}%</label>
              <input type="range" min={2} max={95} step={1} value={currentSlide.captionY} onChange={e => update('captionY', parseInt(e.target.value))} style={{ width: '100%' }} />
            </div>
          </div>
          <input type="color" value={currentSlide.captionColor} onChange={e => update('captionColor', e.target.value)} style={{ width: 36, height: 28, border: 'none', background: 'none', padding: 0, cursor: 'pointer', marginTop: '.35rem' }} />
        </div>

        {/* Title */}
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '.5rem' }}>Otsikko</div>
          <textarea className="input" value={currentSlide.title} onChange={e => update('title', e.target.value)} placeholder="Julkaisun otsikko" rows={2} style={{ fontSize: '.78rem', resize: 'vertical', minHeight: 44, fontFamily: '"DM Sans", system-ui, sans-serif' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.35rem', marginTop: '.35rem' }}>
            <div>
              <label style={{ fontSize: '.58rem', color: 'var(--t3)' }}>Koko: {currentSlide.titleSizePct.toFixed(1)}%</label>
              <input type="range" min={2} max={14} step={0.25} value={currentSlide.titleSizePct} onChange={e => update('titleSizePct', parseFloat(e.target.value))} style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: '.58rem', color: 'var(--t3)' }}>Y-sijainti: {currentSlide.titleY}%</label>
              <input type="range" min={5} max={95} step={1} value={currentSlide.titleY} onChange={e => update('titleY', parseInt(e.target.value))} style={{ width: '100%' }} />
            </div>
          </div>
          <div style={{ marginTop: '.35rem' }}>
            <label style={{ fontSize: '.58rem', color: 'var(--t3)' }}>Paksuus: {currentSlide.titleWeight}</label>
            <input type="range" min={400} max={800} step={100} value={currentSlide.titleWeight} onChange={e => update('titleWeight', parseInt(e.target.value))} style={{ width: '100%' }} />
          </div>
          <div style={{ display: 'flex', gap: '.25rem', marginTop: '.35rem' }}>
            <input type="color" value={currentSlide.titleColor} onChange={e => update('titleColor', e.target.value)} style={{ width: 36, height: 28, border: 'none', background: 'none', padding: 0, cursor: 'pointer' }} />
            {(['left','center','right'] as const).map(a => (
              <button key={a} onClick={() => update('titleAlign', a)} className={`cal-view-btn ${currentSlide.titleAlign === a ? 'act' : ''}`} style={{ fontSize: '.62rem', padding: '.2rem .4rem', flex: 1 }}>
                {a === 'left' ? 'Vas' : a === 'center' ? 'Kesk' : 'Oik'}
              </button>
            ))}
          </div>
        </div>

        {/* Subtitle */}
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '.5rem' }}>Alaotsikko</div>
          <input className="input" value={currentSlide.subtitle} onChange={e => update('subtitle', e.target.value)} placeholder="Alaotsikko" style={{ fontSize: '.78rem', fontFamily: '"DM Sans", system-ui, sans-serif' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.35rem', marginTop: '.35rem' }}>
            <div>
              <label style={{ fontSize: '.58rem', color: 'var(--t3)' }}>Koko: {currentSlide.subtitleSizePct.toFixed(1)}%</label>
              <input type="range" min={1} max={8} step={0.25} value={currentSlide.subtitleSizePct} onChange={e => update('subtitleSizePct', parseFloat(e.target.value))} style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: '.58rem', color: 'var(--t3)' }}>Y-sijainti: {currentSlide.subtitleY}%</label>
              <input type="range" min={5} max={95} step={1} value={currentSlide.subtitleY} onChange={e => update('subtitleY', parseInt(e.target.value))} style={{ width: '100%' }} />
            </div>
          </div>
          <div style={{ marginTop: '.35rem' }}>
            <label style={{ fontSize: '.58rem', color: 'var(--t3)' }}>Paksuus: {currentSlide.subtitleWeight}</label>
            <input type="range" min={400} max={800} step={100} value={currentSlide.subtitleWeight} onChange={e => update('subtitleWeight', parseInt(e.target.value))} style={{ width: '100%' }} />
          </div>
          <input type="color" value={currentSlide.subtitleColor} onChange={e => update('subtitleColor', e.target.value)} style={{ width: 36, height: 28, border: 'none', background: 'none', padding: 0, cursor: 'pointer', marginTop: '.35rem' }} />
        </div>

        {/* Kuvat (overlays) — mediapankista tai local upload */}
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.5rem' }}>
            <div style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
              Kuvat ({currentSlide.overlays.length})
            </div>
          </div>
          <div style={{ display: 'flex', gap: '.25rem', marginBottom: '.5rem' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => openMediaPickerFor('overlay')} style={{ flex: 1, fontSize: '.64rem', padding: '.3rem' }}>+ Mediapankista</button>
            <button className="btn btn-ghost btn-sm" onClick={() => overlayUploadRef.current?.click()} style={{ flex: 1, fontSize: '.64rem', padding: '.3rem' }}>+ Lataa</button>
            <input ref={overlayUploadRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleOverlayUpload} />
          </div>

          {/* Overlay list */}
          {currentSlide.overlays.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.2rem', marginBottom: '.5rem' }}>
              {[...currentSlide.overlays].sort((a, b) => b.z - a.z).map(ov => {
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
              <button key={l.id} onClick={() => update('logoId', l.id)} className={`cal-view-btn ${currentSlide.logoId === l.id ? 'act' : ''}`} style={{ fontSize: '.62rem', padding: '.3rem' }}>
                {l.label}
              </button>
            ))}
          </div>
          {currentSlide.logoId !== 'none' && (
            <>
              <label style={{ fontSize: '.58rem', color: 'var(--t3)' }}>Koko: {currentSlide.logoSizePct}%</label>
              <input type="range" min={3} max={40} step={1} value={currentSlide.logoSizePct} onChange={e => update('logoSizePct', parseInt(e.target.value))} style={{ width: '100%' }} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, marginTop: '.4rem' }}>
                {(['top-left','top-center','top-right','center','center','center','bottom-left','bottom-center','bottom-right'] as LogoPosition[]).map((p, i) => {
                  // Only keep valid position buttons (not duplicates)
                  if ((i === 4 || i === 5) && p === 'center') return <div key={i} />;
                  const active = currentSlide.logoPos === p;
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
                    border: (pickerTarget === 'background' && currentSlide.bgValue === f.url) ? '2px solid var(--pri)' : '2px solid transparent',
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

      {/* ========== PUBLISH MODAL ========== */}
      {showPublishModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={() => !publishing && setShowPublishModal(false)}
        >
          <div
            style={{
              background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)',
              padding: '1.75rem', width: 560, maxWidth: '95vw', maxHeight: '92vh', overflowY: 'auto',
              animation: 'scaleIn .15s ease-out',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ marginBottom: '1.25rem' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 500, marginBottom: '.3rem' }}>
                Julkaise kuva
              </h3>
              <div style={{ fontSize: '.72rem', color: 'var(--t3)' }}>
                Tallennetaan Julkaisut-välilehdelle ja lisätään viestinnän kalenteriin
              </div>
            </div>

            {/* Preview */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem' }}>
              <div
                style={{
                  width: 120, aspectRatio: `${template.w} / ${template.h}`, flexShrink: 0,
                  background: draft.slides[0]?.bgValue || '#000',
                  borderRadius: 'var(--r)', overflow: 'hidden',
                  border: '1px solid var(--border)',
                }}
              >
                <SlideThumb
                  slide={draft.slides[0]}
                  template={template}
                  draw={drawSlide}
                  version={imgCacheVersion}
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '.7rem', color: 'var(--t3)', marginBottom: '.2rem', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600 }}>Sisältö</div>
                <div style={{ fontSize: '.85rem', fontWeight: 600, marginBottom: '.2rem' }}>
                  {draft.name || 'Nimetön suunnitelma'}
                </div>
                <div style={{ fontSize: '.7rem', color: 'var(--t3)' }}>
                  {template.label} · {template.w}×{template.h}px
                  {draft.slides.length > 1 && ` · ${draft.slides.length} slaidia`}
                </div>
              </div>
            </div>

            {/* Category */}
            <div className="field">
              <label>Kategoria</label>
              <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
                {[
                  { id: 'some', label: 'Sosiaalinen media' },
                  { id: 'press', label: 'Lehdistö' },
                  { id: 'partner', label: 'Kumppanit' },
                  { id: 'internal', label: 'Sisäinen' },
                ].map(c => (
                  <button
                    key={c.id}
                    type="button"
                    className={`btn btn-sm ${publishCategory === c.id ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setPublishCategory(c.id)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Title */}
            <div className="field">
              <label>Otsikko *</label>
              <input
                className="input"
                value={publishTitle}
                onChange={e => setPublishTitle(e.target.value)}
                placeholder="Julkaisun otsikko"
                autoFocus
              />
            </div>

            {/* Body */}
            <div className="field">
              <label>Kuvateksti</label>
              <textarea
                className="input"
                value={publishBody}
                onChange={e => setPublishBody(e.target.value)}
                placeholder="Julkaisun teksti (caption)…"
                rows={4}
                style={{ resize: 'vertical', minHeight: 80, fontFamily: 'inherit' }}
              />
            </div>

            {/* Channels — yhdistää org.channels + viestintäsuunnitelman kanavamatriisi */}
            <div className="field">
              <label>Missä julkaistaan? *</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem' }}>
                {unifiedChannels(normalizeCommsPlan(rawCommsPlan), org.channels).map(ch => (
                  <button
                    key={ch.name}
                    type="button"
                    className={`btn btn-sm ${publishChannels.includes(ch.name) ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => togglePublishChannel(ch.name)}
                  >
                    {ch.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Date + status */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
              <div className="field">
                <label>Milloin julkaistaan?</label>
                <input
                  type="date"
                  className="input"
                  value={publishDate}
                  onChange={e => setPublishDate(e.target.value)}
                />
                <div style={{ fontSize: '.62rem', color: 'var(--t3)', marginTop: '.25rem' }}>
                  Jätä tyhjäksi jos et tiedä vielä
                </div>
              </div>
              <div className="field">
                <label>Tila</label>
                <select
                  className="input"
                  value={publishStatus}
                  onChange={e => setPublishStatus(e.target.value as 'draft' | 'ready')}
                >
                  <option value="ready">Valmis</option>
                  <option value="draft">Luonnos</option>
                </select>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
              <button
                className="btn btn-ghost"
                onClick={() => setShowPublishModal(false)}
                disabled={publishing}
              >
                Peruuta
              </button>
              <button
                className="btn btn-primary"
                onClick={confirmPublish}
                disabled={publishing || !publishTitle.trim() || publishChannels.length === 0}
              >
                {publishing ? 'Tallennetaan…' : 'Tallenna julkaisu'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== SlideThumb: mini canvas joka renderöi yhden slaiden karuselli-stripin thumbnailiksi =====
interface SlideThumbProps {
  slide: Slide;
  template: Template;
  draw: (canvas: HTMLCanvasElement, slide: Slide, forExport?: boolean) => void;
  version: number; // re-render trigger when image cache updates
}

function SlideThumb({ slide, template, draw, version }: SlideThumbProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) draw(ref.current, slide, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide, template, version]);
  return (
    <canvas
      ref={ref}
      style={{ display: 'block', width: '100%', height: '100%', pointerEvents: 'none' }}
    />
  );
}
