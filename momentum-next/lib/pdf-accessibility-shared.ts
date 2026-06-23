// PDF-saavutettavuusmoduulin jaettu tietomalli ja apufunktiot.
// Tallennus: /organizations/{orgId}/data/pdf_documents  (muoto { v, ts, updatedBy })
// Putki: lataus -> Adobe Auto-Tag -> metatiedot+linkit -> alt-tekstit -> validointi -> valmis.

export const PDF_DOCS_KEY = 'pdf_documents';

export type PdfDocStatus =
  | 'uploaded'    // alkuperäinen ladattu Storageen
  | 'tagging'     // Adobe Auto-Tag käynnissä
  | 'tagged'      // tagattu, odottaa korjauksia
  | 'needs-alt'   // metatiedot+linkit tehty, alt-tekstit puuttuvat
  | 'validating'  // veraPDF-validointi käynnissä
  | 'done'        // valmis ladattavaksi
  | 'error';

export interface PdfFigure {
  id: string;
  page: number;            // 1-pohjainen
  bbox: [number, number, number, number]; // [x1,y1,x2,y2] PDF-pisteinä
  alt: string;             // käyttäjän hyväksymä vaihtoehtoinen teksti
  decorative: boolean;     // true = koriste -> merkitään artefaktiksi
}

export interface PdfValidation {
  failedBefore: number;
  failedAfter: number;
  byCategory: Record<string, number>; // esim. { '7.18': 1, '7.21': 3 }
  ranAt: number;
}

export interface PdfDocument {
  id: string;
  filename: string;
  status: PdfDocStatus;
  error?: string;
  storage: {
    original?: string;   // Storage-polku
    tagged?: string;
    final?: string;
    originalUrl?: string; // ladattava URL
    taggedUrl?: string;
    finalUrl?: string;
  };
  fonts?: { embedded: boolean; issues: string[] };
  figures?: PdfFigure[];
  validation?: PdfValidation;
  uploadedBy: string;
  uploadedByName?: string;
  uploadedAt: number;
}

export const STATUS_LABELS: Record<PdfDocStatus, string> = {
  uploaded: 'Ladattu',
  tagging: 'Tagataan…',
  tagged: 'Tagattu',
  'needs-alt': 'Alt-tekstit puuttuvat',
  validating: 'Validoidaan…',
  done: 'Valmis',
  error: 'Virhe',
};

// Vaiheen väri Momentumin tila-väreillä (vrt. globals.css --green/--yellow/--red).
export function statusTone(status: PdfDocStatus): 'green' | 'yellow' | 'red' | 'gray' {
  if (status === 'done') return 'green';
  if (status === 'error') return 'red';
  if (status === 'tagging' || status === 'validating') return 'yellow';
  return 'gray';
}

// Kevyt yksilöllinen tunnus ilman ulkoisia riippuvuuksia.
export function makePdfId(): string {
  return 'pdf_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

export function storageBase(orgId: string, docId: string): string {
  return `organizations/${orgId}/pdf-accessibility/${docId}`;
}

export interface SelfCheckSummary {
  figures: { total: number; withAlt: number };
  links: { total: number; withContents: number };
  title: boolean;
  lang: boolean;
  displayDocTitle: boolean;
  pdfuaMetadata: boolean;
}

/** Luonnos saavutettavuusselosteeksi itsetarkistuksen pohjalta. Tarkista ja täydennä ennen julkaisua. */
export function buildAccessibilityStatement(opts: {
  title: string;
  check: SelfCheckSummary;
  orgName: string;
  date: string;
}): string {
  const { title, check, orgName, date } = opts;
  const figMissing = check.figures.total - check.figures.withAlt;
  const linkMissing = check.links.total - check.links.withContents;
  const puutteet: string[] = [];
  if (figMissing > 0) puutteet.push(`- ${figMissing} kuvalta puuttuu vaihtoehtoinen teksti.`);
  if (linkMissing > 0) puutteet.push(`- ${linkMissing} linkiltä puuttuu kuvaus.`);
  if (!check.title) puutteet.push('- Dokumentin otsikko puuttuu.');
  if (!check.lang) puutteet.push('- Dokumentin kieltä ei ole määritelty.');
  puutteet.push('- Mahdolliset upottamattomat fontit ja monimutkaisen taiton lukujärjestys on tarkistettava erikseen.');

  return [
    `# Saavutettavuusseloste (LUONNOS)`,
    ``,
    `Tämä seloste koskee dokumenttia "${title}", julkaisija ${orgName}.`,
    `Laadittu: ${date}. Perustuu työkalun automaattiseen itsetarkistukseen — täydennä ja vahvista ennen julkaisua.`,
    ``,
    `## Vaatimustenmukaisuus`,
    `Dokumentti täyttää saavutettavuusvaatimukset (WCAG 2.1 AA) osittain. Alla luetellut puutteet voivat heikentää saavutettavuutta.`,
    ``,
    `## Saavutettava sisältö`,
    `- Dokumentti on tagattu (rakenne, otsikot, lukujärjestys).`,
    `- ${check.figures.withAlt}/${check.figures.total} kuvalla on vaihtoehtoinen teksti.`,
    `- ${check.links.withContents}/${check.links.total} linkillä on kuvaus.`,
    `- Dokumentin kieli ${check.lang ? 'on määritelty' : 'puuttuu'}; otsikko ${check.title ? 'on asetettu' : 'puuttuu'}.`,
    ``,
    `## Ei-saavutettava sisältö`,
    ...puutteet,
    ``,
    `## Palaute`,
    `Jos huomaat saavutettavuuspuutteen, ota yhteyttä: [täydennä yhteystiedot].`,
  ].join('\n');
}
