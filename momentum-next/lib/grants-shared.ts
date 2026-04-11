/*
 * LLFF Apurahavuosikello — datamalli ja oletusarvot
 *
 * Lähde: Kino_Lapinlahti_Apurahavuosikello_2026_v9.xlsx
 * Sisältää 4 välilehden tiedot yhdistettynä:
 *   1. Festivaali rahoitus (status varmistunut/haettu/haetaan/hylätty)
 *   2. Toisin nähty rahoitus
 *   3. Rahoittajat jaoteltuna (potentiaaliset)
 *   4. Hakuajat (deadline)
 */

export type GrantStatus = 'confirmed' | 'applied' | 'planning' | 'rejected';
export type GrantProject = 'festival' | 'workshops' | 'both';
export type GrantPriority = 'critical' | 'high' | 'medium' | 'international' | 'backup' | 'existing';

export interface Grant {
  id: string;
  year: number;              // budjettivuosi (2026 / 2027 / ...)
  funder: string;            // e.g., "Koneen Säätiö"
  grantName: string;         // e.g., "Toiminta-apuraha", "Tammikuun haku"
  amount: number;            // sovellettava EUR — 0 jos vain potentiaali
  amountText?: string;       // human readable like "5-50k €" if range or unknown
  status: GrantStatus;
  project: GrantProject;
  priority: GrantPriority;
  deadline?: string;         // ISO 'YYYY-MM-DD' if known, omit if continuous
  deadlineText?: string;     // e.g., "16.2.2026 klo 15:59", "Jatkuva", "~Kesäkuu 2026"
  decisionDate?: string;     // when decision expected (free text)
  responsibleId?: string;    // OrgTeamMember id
  url?: string;
  notes?: string;
  deletedAt?: number;        // ms since epoch — jos asetettu, apuraha on roskakorissa
}

export interface GrantsSettings {
  yearTargets: Record<string, number>;  // '2026': 100000, '2027': 120000 jne.
  defaultYear?: number;                   // mikä vuosi näytetään ensin
}

export const DEFAULT_GRANTS_SETTINGS: GrantsSettings = {
  yearTargets: {
    '2026': 100000,
    '2027': 100000,
  },
  defaultYear: 2026,
};

// Normalize a grant loaded from Firestore — backfill year if missing
export const normalizeGrant = (g: Grant): Grant => ({
  ...g,
  year: g.year || 2026,
  deletedAt: typeof g.deletedAt === 'number' ? g.deletedAt : undefined,
});

// Normalize settings — handle migration from old single-yearTarget shape
export const normalizeGrantsSettings = (s: any): GrantsSettings => {
  if (s && typeof s.yearTargets === 'object') {
    return s as GrantsSettings;
  }
  // Migrate from old shape { yearTarget: number, year: number }
  const oldTarget = (s && s.yearTarget) || 100000;
  const oldYear = (s && s.year) || 2026;
  return {
    yearTargets: { [String(oldYear)]: oldTarget, '2027': 100000 },
    defaultYear: oldYear,
  };
};

// Get target for a specific year, with fallback
export const getYearTarget = (settings: GrantsSettings, year: number): number => {
  return settings.yearTargets[String(year)] ?? 100000;
};

export const STATUS_DEFS: Record<GrantStatus, { label: string; color: string; bg: string; icon: string; order: number }> = {
  confirmed: { label: 'Varmistunut',     color: '#22c55e', bg: 'rgba(34,197,94,.12)',  icon: '●', order: 1 },
  applied:   { label: 'Haettu',          color: '#f1b434', bg: 'rgba(241,180,52,.12)', icon: '◐', order: 2 },
  planning:  { label: 'Haetaan',         color: '#3788b2', bg: 'rgba(55,136,178,.12)', icon: '○', order: 3 },
  rejected:  { label: 'Hylätty',         color: '#ef6b6b', bg: 'rgba(239,107,107,.12)', icon: '✕', order: 4 },
};

export const PROJECT_DEFS: Record<GrantProject, { label: string; color: string; icon: string }> = {
  festival:  { label: 'Festivaali',   color: '#9b7cf6', icon: '★' },
  workshops: { label: 'Toisin nähty', color: '#f09a52', icon: '◇' },
  both:      { label: 'Molemmat',     color: '#2a8a86', icon: '◉' },
};

export const PRIORITY_DEFS: Record<GrantPriority, { label: string; color: string }> = {
  critical:      { label: 'Kriittinen',     color: '#ef6b6b' },
  high:          { label: 'Korkea',         color: '#f1b434' },
  medium:        { label: 'Keskitaso',      color: '#3788b2' },
  international: { label: 'Kansainvälinen', color: '#9b7cf6' },
  backup:        { label: 'Varavaihtoehto', color: '#94a3b8' },
  existing:      { label: 'Jo rahoittaja',  color: '#22c55e' },
};

// =============================================================================
// LLFF 2026 SEED — kaikki Excelistä saadut apurahat
// =============================================================================
export const LLFF_GRANTS_2026: Grant[] = [
  // ============ VARMISTUNUT (62 000 €) ============
  {
    id: 'g_kone_2026',
    year: 2026,
    funder: 'Koneen Säätiö',
    grantName: 'Toiminta-apuraha',
    amount: 50000,
    status: 'confirmed',
    project: 'festival',
    priority: 'critical',
    deadlineText: 'Syksy (vuosittain)',
    url: 'https://kfrtr.co/',
    notes: 'Päärahoittaja',
  },
  {
    id: 'g_hki_kehit_2026',
    year: 2026,
    funder: 'Helsingin kaupunki',
    grantName: 'Kehittämisavustus',
    amount: 12000,
    status: 'confirmed',
    project: 'festival',
    priority: 'high',
    url: 'https://avustukset.hel.fi/',
  },

  // ============ HAETTU (odottaa päätöstä) ============
  {
    id: 'g_skr_jan_2026',
    year: 2026,
    funder: 'Suomen Kulttuurirahasto',
    grantName: 'Tammikuun haku',
    amount: 36000,
    amountText: '5–50k €',
    status: 'applied',
    project: 'both',
    priority: 'high',
    deadline: '2026-02-06',
    deadlineText: '6.2.2026 klo 16',
    decisionDate: 'Huhti–touko 2026',
    url: 'https://skr.fi/',
  },
  {
    id: 'g_norden_2026',
    year: 2026,
    funder: 'Norden 0–30',
    grantName: 'Hankerahoitus / Nuorten hankkeet',
    amount: 30000,
    amountText: 'Max 50k €',
    status: 'applied',
    project: 'festival',
    priority: 'critical',
    deadline: '2026-02-16',
    deadlineText: '16.2.2026 klo 15:59',
    decisionDate: 'Kevät 2026',
    url: 'https://www.nkk.org/',
    notes: 'HAETAAN NYT — DL 16.2.2026',
  },
  {
    id: 'g_kordelin_workshops_2026',
    year: 2026,
    funder: 'Alfred Kordelinin säätiö',
    grantName: 'Suuret kulttuurihankkeet (2-vuotinen)',
    amount: 250000,
    amountText: '100–300k €',
    status: 'applied',
    project: 'workshops',
    priority: 'high',
    deadline: '2026-01-31',
    deadlineText: '31.1.2026 klo 16',
    decisionDate: 'Toukokuu 2026',
    url: 'https://kordelin.fi/',
    notes: '2-vuotinen, 125k/vuosi',
  },

  // ============ HAETAAN (suunnitteilla) ============
  {
    id: 'g_nordisk_film_tv',
    year: 2026,
    funder: 'Nordisk Film & TV Fond',
    grantName: 'Hankerahoitus',
    amount: 5000,
    status: 'planning',
    project: 'festival',
    priority: 'existing',
    deadlineText: 'Jatkuva',
    url: 'https://nordiskfilmogtvfond.com/',
  },
  {
    id: 'g_yle_2026',
    year: 2026,
    funder: 'Yle',
    grantName: 'Sponsorointi',
    amount: 5000,
    status: 'planning',
    project: 'festival',
    priority: 'medium',
    deadlineText: 'Neuvoteltava',
    url: 'https://yle.fi/',
  },

  // ============ HYLÄTTY (2026 syklin alkupuolella) ============
  {
    id: 'g_ses_fest_rejected',
    year: 2026,
    funder: 'Suomen elokuvasäätiö (SES)',
    grantName: 'Festivaalituki',
    amount: 20000,
    amountText: 'Osa 600k€/v',
    status: 'rejected',
    project: 'festival',
    priority: 'critical',
    deadlineText: '~Tammikuu 2026',
    url: 'https://www.ses.fi/',
    notes: 'Hylätty 2026 — yritetään uudestaan',
  },
  {
    id: 'g_hki_proj_rejected',
    year: 2026,
    funder: 'Helsingin kaupunki',
    grantName: 'Projektiavustus',
    amount: 20000,
    status: 'rejected',
    project: 'festival',
    priority: 'high',
    url: 'https://avustukset.hel.fi/',
  },
  {
    id: 'g_hki_toim_rejected',
    year: 2026,
    funder: 'Helsingin kaupunki',
    grantName: 'Toiminta-avustus',
    amount: 20000,
    status: 'rejected',
    project: 'festival',
    priority: 'high',
    url: 'https://avustukset.hel.fi/',
  },

  // ============ HAKUAJAT 2026 — TULEVAT HAUT (HAETAAN/SUUNNITTEILLA) ============
  {
    id: 'g_screen_brussels',
    year: 2026,
    funder: 'Screen Brussels',
    grantName: 'Yhteistuotantotuki',
    amount: 0,
    amountText: 'Vaihtelee',
    status: 'planning',
    project: 'both',
    priority: 'international',
    deadline: '2026-01-17',
    deadlineText: '17.1.2026',
    url: 'https://screen.brussels/',
  },
  {
    id: 'g_whickers',
    year: 2026,
    funder: 'The Whickers Award',
    grantName: 'Dokumenttipalkinto',
    amount: 0,
    amountText: '£120 000',
    status: 'planning',
    project: 'workshops',
    priority: 'international',
    deadline: '2026-01-30',
    deadlineText: '30.1.2026',
    url: 'https://whfrankfurts.com/',
  },
  {
    id: 'g_ncp_verkosto',
    year: 2026,
    funder: 'Nordic Culture Point',
    grantName: 'Verkostoyhteistyö',
    amount: 0,
    amountText: 'Max 100k €',
    status: 'planning',
    project: 'both',
    priority: 'high',
    deadline: '2026-02-09',
    deadlineText: '9.2.2026',
    url: 'https://www.nkk.org/',
  },
  {
    id: 'g_idfa_bertha',
    year: 2026,
    funder: 'IDFA Bertha Fund',
    grantName: 'Dokumenttituki',
    amount: 0,
    amountText: 'Vaihtelee',
    status: 'planning',
    project: 'workshops',
    priority: 'international',
    deadline: '2026-02-10',
    deadlineText: '10.2.2026',
    url: 'https://www.idfa.nl/',
  },
  {
    id: 'g_ncf_helmi',
    year: 2026,
    funder: 'Nordic Culture Fund',
    grantName: 'Hankerahoitus (kevät)',
    amount: 0,
    amountText: 'Max 500k DKK',
    status: 'planning',
    project: 'both',
    priority: 'high',
    deadline: '2026-02-13',
    deadlineText: '13.2.2026',
    url: 'https://nordiskkulturfond.org/',
  },
  {
    id: 'g_taike_alueet',
    year: 2026,
    funder: 'Taike',
    grantName: 'Alueiden apurahat',
    amount: 0,
    amountText: 'Vaihtelee',
    status: 'planning',
    project: 'workshops',
    priority: 'medium',
    deadline: '2026-03-11',
    deadlineText: '11.3.2026',
    url: 'https://www.taike.fi/',
  },
  {
    id: 'g_skr_maalis',
    year: 2026,
    funder: 'Suomen Kulttuurirahasto',
    grantName: 'Maaliskuun haku',
    amount: 0,
    amountText: 'Kuluapuraha',
    status: 'planning',
    project: 'both',
    priority: 'medium',
    deadline: '2026-03-31',
    deadlineText: '31.3.2026 klo 16',
    url: 'https://skr.fi/',
  },
  {
    id: 'g_wihuri_2026',
    year: 2026,
    funder: 'Jenny ja Antti Wihurin rahasto',
    grantName: 'Yleinen haku',
    amount: 0,
    amountText: '5–100k+ €',
    status: 'planning',
    project: 'both',
    priority: 'high',
    deadline: '2026-05-31',
    deadlineText: '~31.5.2026',
    url: 'https://wihurinrahasto.fi/',
  },
  {
    id: 'g_torino_film_lab',
    year: 2026,
    funder: 'Torino Film Lab',
    grantName: 'Workshop + tuotantotuki',
    amount: 0,
    amountText: 'Tuotantotuki',
    status: 'planning',
    project: 'workshops',
    priority: 'international',
    deadline: '2026-06-15',
    deadlineText: '~Kesäkuu 2026',
    url: 'https://www.torinofilmlab.it/',
  },
  {
    id: 'g_kordelin_syys',
    year: 2026,
    funder: 'Alfred Kordelinin säätiö',
    grantName: 'Syyshaku',
    amount: 0,
    amountText: 'Vaihtelee',
    status: 'planning',
    project: 'workshops',
    priority: 'medium',
    deadline: '2026-08-31',
    deadlineText: '31.8.2026 klo 16',
    url: 'https://kordelin.fi/',
  },
  {
    id: 'g_hki_toim_2027',
    year: 2026,
    funder: 'Helsingin kaupunki',
    grantName: 'Toiminta-avustus 2027',
    amount: 0,
    amountText: 'Vaihtelee',
    status: 'planning',
    project: 'festival',
    priority: 'high',
    deadline: '2026-09-01',
    deadlineText: '~1.9.2026',
    url: 'https://avustukset.hel.fi/',
  },
  {
    id: 'g_ncf_syys',
    year: 2026,
    funder: 'Nordic Culture Fund',
    grantName: 'Syyshaku',
    amount: 0,
    amountText: 'Max 500k DKK',
    status: 'planning',
    project: 'both',
    priority: 'high',
    deadline: '2026-09-04',
    deadlineText: '~4.9.2026',
    url: 'https://nordiskkulturfond.org/',
  },
  {
    id: 'g_skr_loka',
    year: 2026,
    funder: 'Suomen Kulttuurirahasto',
    grantName: 'Lokakuun haku',
    amount: 0,
    amountText: '5–50k €',
    status: 'planning',
    project: 'both',
    priority: 'high',
    deadline: '2026-10-31',
    deadlineText: '~31.10.2026',
    url: 'https://skr.fi/',
  },
  {
    id: 'g_taike_fest',
    year: 2026,
    funder: 'Taike',
    grantName: 'Festivaaliavustukset',
    amount: 0,
    amountText: 'Vaihtelee',
    status: 'planning',
    project: 'festival',
    priority: 'backup',
    deadline: '2026-11-07',
    deadlineText: '~7.11.2026',
    url: 'https://haeavustuksia.fi/',
  },
  {
    id: 'g_taike_kohde',
    year: 2026,
    funder: 'Taike',
    grantName: 'Kohdeapurahat 2027–28',
    amount: 0,
    amountText: 'Vaihtelee',
    status: 'planning',
    project: 'workshops',
    priority: 'high',
    deadline: '2026-12-03',
    deadlineText: '~3.12.2026',
    url: 'https://www.taike.fi/',
  },
  {
    id: 'g_hki_proj_q1_2027',
    year: 2026,
    funder: 'Helsingin kaupunki',
    grantName: 'Projektiavustus Q1/27',
    amount: 0,
    amountText: 'Vaihtelee',
    status: 'planning',
    project: 'festival',
    priority: 'high',
    deadline: '2026-12-08',
    deadlineText: '8.12.2026 klo 16',
    url: 'https://avustukset.hel.fi/',
  },

  // ============ JATKUVAT HAUT ============
  {
    id: 'g_jaes',
    year: 2026,
    funder: 'Jane ja Aatos Erkon säätiö',
    grantName: 'Suuret hankkeet',
    amount: 0,
    amountText: '50–500k+ €',
    status: 'planning',
    project: 'both',
    priority: 'high',
    deadlineText: 'Jatkuva',
    url: 'https://jaes.fi/',
  },
  {
    id: 'g_avek',
    year: 2026,
    funder: 'AVEK',
    grantName: 'AV-kulttuuri / koulutusapurahat',
    amount: 0,
    amountText: '3–55k €',
    status: 'planning',
    project: 'both',
    priority: 'high',
    deadlineText: 'Jatkuva',
    url: 'https://kopiosto.fi/AVEK/',
  },
  {
    id: 'g_creative_europe',
    year: 2026,
    funder: 'Creative Europe MEDIA',
    grantName: 'EU festivaalituki',
    amount: 0,
    amountText: '20–75k €',
    status: 'planning',
    project: 'festival',
    priority: 'international',
    deadlineText: 'Jatkuva (kevät)',
    url: 'https://ec.europa.eu/',
  },
  {
    id: 'g_eurimages',
    year: 2026,
    funder: 'Eurimages',
    grantName: 'Yhteistuotanto',
    amount: 0,
    amountText: '~27.5M€/v budj.',
    status: 'planning',
    project: 'both',
    priority: 'international',
    deadlineText: 'Jatkuva (3x/vuosi)',
    url: 'https://www.coe.int/eurimages',
  },
  {
    id: 'g_norwegian_film_inst',
    year: 2026,
    funder: 'Norwegian Film Institute',
    grantName: 'Yhteistuotanto',
    amount: 0,
    amountText: '50–300k €',
    status: 'planning',
    project: 'both',
    priority: 'international',
    deadlineText: 'Jatkuva',
    url: 'https://www.nfi.no/',
  },
  {
    id: 'g_berlinale_wcf',
    year: 2026,
    funder: 'Berlinale World Cinema Fund',
    grantName: 'Tuotantotuki',
    amount: 0,
    amountText: 'Max 60k €',
    status: 'planning',
    project: 'workshops',
    priority: 'international',
    deadlineText: 'Jatkuva (useita)',
    url: 'https://www.berlinale.de/wcf/',
  },
];

// =============================================================================
// LLFF 2027 SEED — tärkeimmät toistuvat apurahat 2026:n syklin pohjalta
// Sisältää käytännössä kaikki vuosittain toistuvat haut sekä uudet kohdat 2027:lle
// =============================================================================
export const LLFF_GRANTS_2027: Grant[] = [
  // ============ FESTIVAALIN PÄÄRAHOITUS — TOISTUVAT 2026 STA ============
  {
    id: 'g_kone_2027',
    year: 2027,
    funder: 'Koneen Säätiö',
    grantName: 'Toiminta-apuraha 2027',
    amount: 50000,
    status: 'planning',
    project: 'festival',
    priority: 'critical',
    deadline: '2027-09-15',
    deadlineText: '~Syksy 2027',
    url: 'https://kfrtr.co/',
    notes: 'Päärahoittaja — vuosittainen jatko 2026 myönnetylle',
  },
  {
    id: 'g_ses_fest_2027',
    year: 2027,
    funder: 'Suomen elokuvasäätiö (SES)',
    grantName: 'Festivaalituki — uusi yritys',
    amount: 25000,
    amountText: 'Osa 600k€/v',
    status: 'planning',
    project: 'festival',
    priority: 'critical',
    deadline: '2027-01-15',
    deadlineText: '~Tammikuu 2027',
    url: 'https://www.ses.fi/',
    notes: '2026 hylätty — vahvistettava hakemus 2027:lle',
  },
  {
    id: 'g_hki_kehit_2027',
    year: 2027,
    funder: 'Helsingin kaupunki',
    grantName: 'Kehittämisavustus 2027',
    amount: 12000,
    status: 'planning',
    project: 'festival',
    priority: 'high',
    deadlineText: '~Tammikuu 2027',
    url: 'https://avustukset.hel.fi/',
    notes: '2026 myönnetty — uusi haku 2027:lle',
  },
  {
    id: 'g_hki_toim_2028',
    year: 2027,
    funder: 'Helsingin kaupunki',
    grantName: 'Toiminta-avustus 2028',
    amount: 0,
    amountText: 'Vaihtelee',
    status: 'planning',
    project: 'festival',
    priority: 'high',
    deadline: '2027-09-01',
    deadlineText: '~1.9.2027',
    url: 'https://avustukset.hel.fi/',
  },
  {
    id: 'g_hki_proj_q1_2028',
    year: 2027,
    funder: 'Helsingin kaupunki',
    grantName: 'Projektiavustus Q1/2028',
    amount: 0,
    amountText: 'Vaihtelee',
    status: 'planning',
    project: 'festival',
    priority: 'high',
    deadline: '2027-12-08',
    deadlineText: '~8.12.2027 klo 16',
    url: 'https://avustukset.hel.fi/',
  },

  // ============ SUOMEN KULTTUURIRAHASTO — KAIKKI 3 VUOSITTAISTA HAKUA ============
  {
    id: 'g_skr_jan_2027',
    year: 2027,
    funder: 'Suomen Kulttuurirahasto',
    grantName: 'Tammikuun haku',
    amount: 36000,
    amountText: '5–50k €',
    status: 'planning',
    project: 'both',
    priority: 'high',
    deadline: '2027-02-06',
    deadlineText: '~6.2.2027 klo 16',
    decisionDate: 'Huhti–touko 2027',
    url: 'https://skr.fi/',
  },
  {
    id: 'g_skr_maalis_2027',
    year: 2027,
    funder: 'Suomen Kulttuurirahasto',
    grantName: 'Maaliskuun haku',
    amount: 0,
    amountText: 'Kuluapuraha',
    status: 'planning',
    project: 'both',
    priority: 'medium',
    deadline: '2027-03-31',
    deadlineText: '~31.3.2027 klo 16',
    url: 'https://skr.fi/',
  },
  {
    id: 'g_skr_loka_2027',
    year: 2027,
    funder: 'Suomen Kulttuurirahasto',
    grantName: 'Lokakuun haku',
    amount: 0,
    amountText: '5–50k €',
    status: 'planning',
    project: 'both',
    priority: 'high',
    deadline: '2027-10-31',
    deadlineText: '~31.10.2027',
    url: 'https://skr.fi/',
  },

  // ============ POHJOISMAINEN — VUOSITTAISET ============
  {
    id: 'g_norden_2027',
    year: 2027,
    funder: 'Norden 0–30',
    grantName: 'Hankerahoitus / Nuorten hankkeet',
    amount: 30000,
    amountText: 'Max 50k €',
    status: 'planning',
    project: 'festival',
    priority: 'critical',
    deadline: '2027-02-16',
    deadlineText: '~16.2.2027 klo 15:59',
    decisionDate: 'Kevät 2027',
    url: 'https://www.nkk.org/',
  },
  {
    id: 'g_ncf_helmi_2027',
    year: 2027,
    funder: 'Nordic Culture Fund',
    grantName: 'Hankerahoitus (kevät)',
    amount: 0,
    amountText: 'Max 500k DKK',
    status: 'planning',
    project: 'both',
    priority: 'high',
    deadline: '2027-02-13',
    deadlineText: '~13.2.2027',
    url: 'https://nordiskkulturfond.org/',
  },
  {
    id: 'g_ncf_syys_2027',
    year: 2027,
    funder: 'Nordic Culture Fund',
    grantName: 'Syyshaku',
    amount: 0,
    amountText: 'Max 500k DKK',
    status: 'planning',
    project: 'both',
    priority: 'high',
    deadline: '2027-09-04',
    deadlineText: '~4.9.2027',
    url: 'https://nordiskkulturfond.org/',
  },
  {
    id: 'g_ncp_verkosto_2027',
    year: 2027,
    funder: 'Nordic Culture Point',
    grantName: 'Verkostoyhteistyö',
    amount: 0,
    amountText: 'Max 100k €',
    status: 'planning',
    project: 'both',
    priority: 'high',
    deadline: '2027-02-09',
    deadlineText: '~9.2.2027',
    url: 'https://www.nkk.org/',
  },

  // ============ KORDELIN — TOISIN NÄHTY JATKUU ============
  {
    id: 'g_kordelin_workshops_2027',
    year: 2027,
    funder: 'Alfred Kordelinin säätiö',
    grantName: 'Suuret kulttuurihankkeet (vuoden 2 osuus)',
    amount: 125000,
    amountText: '125k/vuosi',
    status: 'planning',
    project: 'workshops',
    priority: 'critical',
    deadlineText: '2-vuotinen jatko (jos 2026 myönnettiin)',
    url: 'https://kordelin.fi/',
    notes: 'Riippuu 2026 hyväksynnästä — Toisin nähty hankkeen 2. vuosi',
  },
  {
    id: 'g_kordelin_jan_2027',
    year: 2027,
    funder: 'Alfred Kordelinin säätiö',
    grantName: 'Suuret kulttuurihankkeet (uusi haku)',
    amount: 0,
    amountText: '100–300k €',
    status: 'planning',
    project: 'workshops',
    priority: 'high',
    deadline: '2027-01-31',
    deadlineText: '~31.1.2027 klo 16',
    decisionDate: 'Toukokuu 2027',
    url: 'https://kordelin.fi/',
  },
  {
    id: 'g_kordelin_syys_2027',
    year: 2027,
    funder: 'Alfred Kordelinin säätiö',
    grantName: 'Syyshaku',
    amount: 0,
    amountText: 'Vaihtelee',
    status: 'planning',
    project: 'workshops',
    priority: 'medium',
    deadline: '2027-08-31',
    deadlineText: '~31.8.2027 klo 16',
    url: 'https://kordelin.fi/',
  },

  // ============ TAIKE — VUOSITTAISET ============
  {
    id: 'g_taike_fest_2027',
    year: 2027,
    funder: 'Taike',
    grantName: 'Festivaaliavustukset',
    amount: 0,
    amountText: 'Vaihtelee',
    status: 'planning',
    project: 'festival',
    priority: 'backup',
    deadline: '2027-11-07',
    deadlineText: '~7.11.2027',
    url: 'https://haeavustuksia.fi/',
  },
  {
    id: 'g_taike_kohde_2027',
    year: 2027,
    funder: 'Taike',
    grantName: 'Kohdeapurahat 2028–29',
    amount: 0,
    amountText: 'Vaihtelee',
    status: 'planning',
    project: 'workshops',
    priority: 'high',
    deadline: '2027-12-03',
    deadlineText: '~3.12.2027',
    url: 'https://www.taike.fi/',
  },

  // ============ WIHURI — VUOSITTAINEN ============
  {
    id: 'g_wihuri_2027',
    year: 2027,
    funder: 'Jenny ja Antti Wihurin rahasto',
    grantName: 'Yleinen haku',
    amount: 0,
    amountText: '5–100k+ €',
    status: 'planning',
    project: 'both',
    priority: 'high',
    deadline: '2027-05-31',
    deadlineText: '~31.5.2027',
    url: 'https://wihurinrahasto.fi/',
  },

  // ============ KANSAINVÄLISET — VUOSITTAISET ============
  {
    id: 'g_whickers_2027',
    year: 2027,
    funder: 'The Whickers Award',
    grantName: 'Dokumenttipalkinto',
    amount: 0,
    amountText: '£120 000',
    status: 'planning',
    project: 'workshops',
    priority: 'international',
    deadline: '2027-01-30',
    deadlineText: '~30.1.2027',
    url: 'https://whfrankfurts.com/',
  },
  {
    id: 'g_idfa_bertha_2027',
    year: 2027,
    funder: 'IDFA Bertha Fund',
    grantName: 'Dokumenttituki',
    amount: 0,
    amountText: 'Vaihtelee',
    status: 'planning',
    project: 'workshops',
    priority: 'international',
    deadline: '2027-02-10',
    deadlineText: '~10.2.2027',
    url: 'https://www.idfa.nl/',
  },
  {
    id: 'g_torino_2027',
    year: 2027,
    funder: 'Torino Film Lab',
    grantName: 'Workshop + tuotantotuki',
    amount: 0,
    amountText: 'Tuotantotuki',
    status: 'planning',
    project: 'workshops',
    priority: 'international',
    deadline: '2027-06-15',
    deadlineText: '~Kesäkuu 2027',
    url: 'https://www.torinofilmlab.it/',
  },
  {
    id: 'g_creative_europe_2027',
    year: 2027,
    funder: 'Creative Europe MEDIA',
    grantName: 'EU festivaalituki',
    amount: 0,
    amountText: '20–75k €',
    status: 'planning',
    project: 'festival',
    priority: 'international',
    deadline: '2027-04-01',
    deadlineText: '~Kevät 2027',
    url: 'https://ec.europa.eu/',
  },

  // ============ JATKUVAT (vuosittain mahdollista hakea) ============
  {
    id: 'g_jaes_2027',
    year: 2027,
    funder: 'Jane ja Aatos Erkon säätiö',
    grantName: 'Suuret hankkeet',
    amount: 0,
    amountText: '50–500k+ €',
    status: 'planning',
    project: 'both',
    priority: 'high',
    deadlineText: 'Jatkuva',
    url: 'https://jaes.fi/',
  },
  {
    id: 'g_avek_2027',
    year: 2027,
    funder: 'AVEK',
    grantName: 'AV-kulttuuri / koulutusapurahat',
    amount: 0,
    amountText: '3–55k €',
    status: 'planning',
    project: 'both',
    priority: 'high',
    deadlineText: 'Jatkuva',
    url: 'https://kopiosto.fi/AVEK/',
  },
];

// Yhdistetty seed-data (default Firestoreen)
export const LLFF_GRANTS_DEFAULT: Grant[] = [...LLFF_GRANTS_2026, ...LLFF_GRANTS_2027];

// Helper: parse "YYYY-MM-DD" → Date safely
export const parseGrantDeadline = (s?: string): Date | null => {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(n => parseInt(n, 10));
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};

// Days from now to deadline (negative = passed)
export const daysUntilDeadline = (g: Grant): number | null => {
  const d = parseGrantDeadline(g.deadline);
  if (!d) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
};

// Counts grants in each status
export const getStatusTotals = (grants: Grant[]) => {
  const totals = {
    confirmed: 0,
    applied: 0,
    planning: 0,
    rejected: 0,
  };
  grants.forEach(g => {
    totals[g.status] += g.amount || 0;
  });
  return totals;
};
