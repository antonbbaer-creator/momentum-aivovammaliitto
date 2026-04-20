/*
 * Nordic Frames -pohja — ensimmäinen konkreettinen slot-pohja editorille.
 *
 * Rakenne: 4:5 full-bleed taustakuva (slotti hero_image) + 4 lukittua text-band
 * overlayta, jotka muodostavat "NORDICFRAMESNORDICFRAMES…" -kehyksen.
 * Käyttäjä vaihtaa vain taustakuvan; kehys on ei-valittavissa täyttäjän tilassa.
 *
 * Kun festivaalin oma brändi saadaan, kloonataan tämä tiedosto ja vaihdetaan
 * teksti/fontti/väri — runko on sama.
 */

// Tyyppimääritykset kopioitu paikallisesti jotta tämä tiedosto ei riipu
// EditorSection.tsx:stä (joka on 3000+ rivin komponentti). Kenttien on
// vastattava EditorSection.tsx:n Design/Slide/ImageOverlay-tyyppejä.
interface ImageOverlaySeed {
  id: string;
  src: string;
  name?: string;
  x: number;
  y: number;
  widthPct: number;
  opacity: number;
  rotation: number;
  z: number;
  locked?: boolean;
  kind?: 'image' | 'text-band';
  textBand?: {
    text: string;
    repeat: number;
    fontFamily: string;
    fontWeight: number;
    fontSizePct: number;
    color: string;
    side: 'top' | 'right' | 'bottom' | 'left';
  };
}

interface SlotSeed {
  id: string;
  role: 'hero_image' | 'headline' | 'subheadline' | 'caption' | 'logo' | 'image' | null;
  label: string;
  hint?: string;
  required?: boolean;
  aspect?: number;
}

interface SlideSeed {
  id: string;
  bgType: 'color' | 'image';
  bgValue: string;
  bgOpacity: number;
  overlays: ImageOverlaySeed[];
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
  logoPos: string;
  logoSizePct: number;
  slots?: SlotSeed[];
}

interface DesignSeed {
  id: string;
  name: string;
  templateId: string;
  slides: SlideSeed[];
  createdAt: number;
  updatedAt: number;
  isTemplate?: boolean;
  templateMeta?: {
    title: string;
    description?: string;
    channels?: string[];
    aspectLabel?: string;
  };
}

const NF_TEXT = 'NORDICFRAMES';
const NF_COLOR = '#FFFFFF';
const NF_FONT = 'DM Sans';
const NF_WEIGHT = 700;
const NF_SIZE_PCT = 3.2;

const nfBand = (
  side: 'top' | 'right' | 'bottom' | 'left',
  idSuffix: string,
  z: number
): ImageOverlaySeed => ({
  id: 'nf_band_' + idSuffix,
  src: '',
  name: `NORDICFRAMES — ${side}`,
  // Text-bandin x/y ei ole käytössä renderöinnissä (sijainti johdetaan reunasta),
  // mutta arvot 50/50 ovat sopivat oletukset jos jonkun täytyy myöhemmin selata.
  x: 50,
  y: 50,
  widthPct: 100,
  opacity: 1,
  rotation: 0,
  z,
  locked: true,
  kind: 'text-band',
  textBand: {
    text: NF_TEXT,
    repeat: 0,           // 0 = auto, täyttää reunan
    fontFamily: NF_FONT,
    fontWeight: NF_WEIGHT,
    fontSizePct: NF_SIZE_PCT,
    color: NF_COLOR,
    side,
  },
});

const blankNfSlide = (): SlideSeed => ({
  id: 'slide_nf_' + Math.random().toString(36).slice(2, 9),
  bgType: 'color',
  bgValue: '#1a1a1a',
  bgOpacity: 0,
  overlays: [
    nfBand('top',    'top',    10),
    nfBand('right',  'right',  11),
    nfBand('bottom', 'bottom', 12),
    nfBand('left',   'left',   13),
  ],
  caption: '',
  captionColor: '#FFFFFF',
  captionSizePct: 3.5,
  captionY: 18,
  title: '',
  titleColor: '#FFFFFF',
  titleSizePct: 7,
  titleY: 50,
  titleAlign: 'center',
  titleWeight: 700,
  subtitle: '',
  subtitleColor: '#FFFFFF',
  subtitleSizePct: 3.5,
  subtitleY: 62,
  subtitleWeight: 500,
  logoId: 'none',
  logoPos: 'bottom-center',
  logoSizePct: 18,
});

/**
 * NF — Kuva (4:5): taustakuva + marquee-kehys. Yksi slot: hero_image.
 */
export function createNordicFramesImageTemplate(): DesignSeed {
  const now = Date.now();
  const slide = blankNfSlide();
  slide.slots = [
    {
      id: 'bg',
      role: 'hero_image',
      label: 'Taustakuva',
      hint: '4:5 pystysuhde — valaistu hyvin, kehys jättää tilaa ~3 % reunoille',
      required: true,
      aspect: 4 / 5,
    },
  ];
  return {
    id: 'tpl_nf_image_' + now,
    name: 'Nordic Frames — Kuva',
    templateId: 'ig-portrait',
    slides: [slide],
    createdAt: now,
    updatedAt: now,
    isTemplate: true,
    templateMeta: {
      title: 'Nordic Frames — Kuva',
      description: 'Valokuva + lukittu NORDICFRAMES-kehys. Vaihda vain taustakuva.',
      channels: ['instagram-post'],
      aspectLabel: '4:5',
    },
  };
}

/**
 * NF — CTA (4:5): taustakuva + kehys + keskiotsikko. Slotit: hero_image, headline.
 */
export function createNordicFramesCtaTemplate(): DesignSeed {
  const now = Date.now();
  const slide = blankNfSlide();
  slide.title = 'OTSIKKO TÄHÄN';
  slide.titleColor = '#FFFFFF';
  slide.titleSizePct = 7.4;
  slide.titleY = 50;
  slide.titleAlign = 'center';
  slide.titleWeight = 700;
  slide.slots = [
    {
      id: 'bg',
      role: 'hero_image',
      label: 'Taustakuva',
      hint: '4:5 pystysuhde — tumma/rauhallinen kuva niin otsikko erottuu',
      required: true,
      aspect: 4 / 5,
    },
    {
      id: 'title',
      role: 'headline',
      label: 'Otsikko',
      hint: 'Maks. 3 riviä, isolla kirjoitettuna',
      required: false,
    },
  ];
  return {
    id: 'tpl_nf_cta_' + now,
    name: 'Nordic Frames — CTA',
    templateId: 'ig-portrait',
    slides: [slide],
    createdAt: now,
    updatedAt: now,
    isTemplate: true,
    templateMeta: {
      title: 'Nordic Frames — CTA',
      description: 'Valokuva + kehys + iso keskiotsikko. Esim. avoin haku tai ilmoitus.',
      channels: ['instagram-post'],
      aspectLabel: '4:5',
    },
  };
}

export function createNordicFramesTemplates(): DesignSeed[] {
  return [createNordicFramesImageTemplate(), createNordicFramesCtaTemplate()];
}
