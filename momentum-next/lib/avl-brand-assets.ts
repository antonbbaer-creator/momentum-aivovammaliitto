// Aivovammaliiton graafisen ohjeiston staattiset ladattavat assetit.
// Yksi totuuslähde sekä org-sivulle (/[orgSlug]/graafinen) että julkiselle
// jaettavalle sivulle (/graafinen-ohje). Tiedostot ovat public/brand/avl/.

export type AvlLogoVariant = {
  id: string;
  title: string;
  preview: string; // PNG-esikatselu (läpinäkyvä tausta)
  svg: string;     // vektori (painotuotteet, skaalautuva käyttö)
  jpg: string;     // rasteri (nopea verkkokäyttö)
};

export const AVL_LOGO_VARIANTS: AvlLogoVariant[] = [
  { id: 'avl-vaaka', title: 'Vaakalogo', preview: '/brand/avl/logo-vaaka.png', svg: '/brand/avl/logo-vaaka.svg', jpg: '/brand/avl/logo-vaaka.jpg' },
  { id: 'avl-keskitetty', title: 'Pystylogo (keskitetty)', preview: '/brand/avl/logo-keskitetty.png', svg: '/brand/avl/logo-keskitetty.svg', jpg: '/brand/avl/logo-keskitetty.jpg' },
  { id: 'avl-tunnus', title: 'Tunnus', preview: '/brand/avl/logo-tunnus.png', svg: '/brand/avl/logo-tunnus.svg', jpg: '/brand/avl/logo-tunnus.jpg' },
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
