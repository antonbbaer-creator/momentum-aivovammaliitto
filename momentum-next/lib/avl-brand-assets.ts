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
