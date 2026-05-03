// Graafinen ohjeisto — yhteinen datamalli kaikille orgeille.
// Tallennetaan Firestoreen avaimella 'brandGuide' (useOrgData).

export interface BrandColor {
  id: string;
  name: string;
  hex: string;
  cmyk?: string;
  rgb?: string;
  theme?: string;        // esim. "Aivovammat", "Läheiset" — käytetään lisävärin teemaluokituksena
  description?: string;
}

export interface BrandFont {
  id: string;
  role: 'heading' | 'body';
  family: string;
  source?: string;       // esim. "Google Fonts" tai "Adobe Fonts"
  weights?: string;      // esim. "Light, Regular, Medium, Semibold, Bold"
  fallback?: string;     // korvaava fontti (esim. "Arial")
  description?: string;
}

export interface BrandAsset {
  id: string;
  name: string;
  url: string;
  storagePath?: string;  // Firebase Storage -polku poistoa varten
  mimeType?: string;
  description?: string;
}

export interface BrandImageryBlock {
  id: string;
  title: string;          // "Valokuvat", "Kuvituskuvat", "Graafit"
  description: string;
  examples: BrandAsset[]; // esimerkkikuvat
}

export interface BrandMaterial {
  id: string;
  title: string;          // "Esitteet", "PowerPoint-pohjat", "Roll-upit", "Sosiaalinen media"
  description: string;
  files: BrandAsset[];    // ladattavat pohjat
}

export interface BrandContact {
  organization?: string;
  phone?: string;
  email?: string;
  notes?: string;
}

export interface BrandGuide {
  intro: {
    title: string;       // esim. "Aivovammaliiton graafinen ohjeisto"
    subtitle?: string;
    lastUpdated?: string;
  };
  logo: {
    description: string;
    assets: BrandAsset[];
  };
  colors: {
    primary: BrandColor[];
    accent: BrandColor[];
    description?: string;
  };
  typography: {
    fonts: BrandFont[];
    description?: string;
  };
  imagery: BrandImageryBlock[];
  materials: BrandMaterial[];
  accessibility: {
    description?: string;
    points: string[];
  };
  contact: BrandContact;
}

export const EMPTY_BRAND_GUIDE: BrandGuide = {
  intro: { title: 'Graafinen ohjeisto', subtitle: '', lastUpdated: '' },
  logo: { description: '', assets: [] },
  colors: { primary: [], accent: [], description: '' },
  typography: { fonts: [], description: '' },
  imagery: [],
  materials: [],
  accessibility: { description: '', points: [] },
  contact: {},
};

// Pieni id-helperi — UI:n inline-lisäykset eivät tarvitse uuid-pakettia.
export function brandId(prefix = 'b'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

// Org-spesifinen oletus — AVL saa täytetyn pohjan, muut tyhjän.
// Tuodaan dynaamisesti jotta AVL-data ei lataudu muille orgeille turhaan.
export function getDefaultBrandGuide(orgSlug: string): BrandGuide {
  if (orgSlug === 'avl') {
    // require-import: avl-brand-guide-defaults pidetään tyyppisuojattuna mutta
    // tuodaan top-level eikä dynaamisesti, koska tiedosto on triviaali ja
    // olemassa-oleva *-defaults-tiedostokuvio (esim. avl-defaults.ts) tekee samoin.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { AVL_BRAND_GUIDE } = require('./avl-brand-guide-defaults') as typeof import('./avl-brand-guide-defaults');
    return AVL_BRAND_GUIDE;
  }
  return EMPTY_BRAND_GUIDE;
}
