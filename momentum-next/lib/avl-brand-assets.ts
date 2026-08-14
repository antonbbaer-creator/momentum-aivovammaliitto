// Aivovammaliiton graafisen ohjeiston staattiset ladattavat assetit.
// Yksi totuuslähde sekä org-sivulle (/[orgSlug]/graafinen) että julkiselle
// jaettavalle sivulle (/graafinen-ohje). Tiedostot ovat public/brand/avl/.

export type AvlLogoVariant = {
  id: string;
  title: string;
  pngTransparent: string; // läpinäkyvä tausta
  pngWhite: string;       // valkoinen tausta
};

export const AVL_LOGO_VARIANTS: AvlLogoVariant[] = [
  { id: 'avl-vaaka', title: 'Vaakalogo', pngTransparent: '/brand/avl/logo-vaaka.png', pngWhite: '/brand/avl/logo-vaaka-valkoinen.png' },
  { id: 'avl-keskitetty', title: 'Pystylogo (keskitetty)', pngTransparent: '/brand/avl/logo-keskitetty.png', pngWhite: '/brand/avl/logo-keskitetty-valkoinen.png' },
  { id: 'avl-tunnus', title: 'Tunnus', pngTransparent: '/brand/avl/logo-tunnus.png', pngWhite: '/brand/avl/logo-tunnus-valkoinen.png' },
];

export type AvlFont = { family: string; bundle: string; weights: string[]; note?: string };

export const AVL_FONTS: AvlFont[] = [
  {
    family: 'Outfit',
    bundle: '/brand/avl/fonts/Outfit.zip',
    weights: ['Light', 'Regular', 'Medium', 'SemiBold', 'Bold', 'Black'],
  },
  {
    family: 'Avenir',
    bundle: '/brand/avl/fonts/Avenir.zip',
    weights: ['Light', 'Roman', 'Medium', 'Black', 'Oblique', 'Black Oblique'],
  },
];

export type AvlTemplate = {
  id: string;
  title: string;
  description: string;
  file: string;
  format: string; // esim. 'PPTX'
  sizeLabel?: string; // esim. '70 Mt'
};

export const AVL_TEMPLATES: AvlTemplate[] = [
  {
    id: 'avl-ppt-pohja',
    title: 'PowerPoint-esityspohja',
    description: 'Aivovammaliiton graafisen ilmeen mukainen esityspohja valmiine diamalleineen. Sisältää mm. kansi-, sisältö- ja teemadiat liiton väreissä ja fonteissa.',
    file: '/brand/avl/pohjat/powerpoint-pohja.pptx',
    format: 'PPTX',
    sizeLabel: '70 Mt',
  },
  {
    id: 'avl-kirjelomake',
    title: 'Kirjelomake',
    description: 'Aivovammaliiton virallinen kirjelomakepohja (2026) kirjeisiin, lausuntoihin ja muihin asiakirjoihin. Word-tiedosto, jossa liiton tunnus ja yhteystiedot valmiina.',
    file: '/brand/avl/pohjat/kirjelomake.docx',
    format: 'DOCX',
    sizeLabel: '140 kt',
  },
];

// Valmiit esitteet — saavutettava nettiversio ja painoversio samassa paikassa.
// Tiedostot public/brand/avl/esitteet/. Uusi esite = uusi rivi tähän listaan.
export type AvlBrochure = {
  id: string;
  title: string;
  description?: string;
  webPdf?: string;   // saavutettava nettiversio
  printPdf?: string; // painoversio
};

export const AVL_BROCHURES: AvlBrochure[] = [
  {
    id: 'avl-esite-avh',
    title: 'Perustietoa aivoverenkiertohäiriöistä',
    webPdf: '/brand/avl/esitteet/perustietoa-aivoverenkiertohairioista-netti.pdf',
    printPdf: '/brand/avl/esitteet/perustietoa-aivoverenkiertohairioista-paino.pdf',
  },
  {
    id: 'avl-esite-afasia',
    title: 'Perustietoa afasiasta',
    webPdf: '/brand/avl/esitteet/perustietoa-afasiasta-netti.pdf',
    printPdf: '/brand/avl/esitteet/perustietoa-afasiasta-paino.pdf',
  },
];

export const AVL_GUIDE_PDF = '/brand/avl/graafinen-ohjeisto.pdf';
export const AVL_GUIDE_TOTAL_PAGES = 17;

// Julkinen, salasanasuojattu jakelusivu (ei vaadi kirjautumista).
// Literaali reitti app/avl/graafinenohje/ — org-layoutin auth-gate ei päde siihen.
export const AVL_PUBLIC_GUIDE_PATH = '/avl/graafinenohje';
export const AVL_PUBLIC_GUIDE_PASSWORD = 'AVL2026';

// Julkinen, salasanasuojattu esitesivu (sama salasana kuin ohjeistolla).
// Literaali reitti app/avl/esitteet/ — listaa valmiit esitteet ladattavaksi.
export const AVL_PUBLIC_BROCHURES_PATH = '/avl/esitteet';
export const AVL_PUBLIC_BROCHURES_PASSWORD = AVL_PUBLIC_GUIDE_PASSWORD;
