// Shared types, constants and helpers for the Yearwheel + Calendar sections

export interface YearPhase {
  id: string;
  name: string;
  startMonth: number;        // 1-12, kept for backward compat + fallback
  endMonth: number;
  startDate?: string;        // UUSI: 'YYYY-MM-DD', authoritative when present
  endDate?: string;          // UUSI: 'YYYY-MM-DD'
  startWeek?: number;
  endWeek?: number;
  color: string;
  icon: string;
  desc: string;
  tasks: YearTask[];
  category: 'planning' | 'production' | 'execution' | 'reflection';
  team: string;
  isFestival?: boolean;
}

export interface YearTask {
  id: string;
  text: string;
  month: number;
  week?: number;
  done: boolean;
  owner?: string;
}

// Category definitions — color + icon symbol (for category-based visual coding)
export const categoryColors: Record<
  YearPhase['category'],
  { bg: string; color: string; label: string; icon: string }
> = {
  planning:   { bg: 'rgba(5,107,159,.15)',  color: '#3788b2', label: 'Suunnittelu', icon: '◇' }, // diamond
  production: { bg: 'rgba(241,180,52,.15)', color: '#f1b434', label: 'Tuotanto',    icon: '▣' }, // square
  execution:  { bg: 'rgba(228,92,129,.15)', color: '#e45c81', label: 'Toteutus',    icon: '★' }, // star
  reflection: { bg: 'rgba(24,94,91,.15)',   color: '#2a8a86', label: 'Reflektio',   icon: '○' }, // circle
};

// Order used for concentric ring layering in the wheel (outer → inner)
export const categoryOrder: YearPhase['category'][] = ['planning', 'production', 'execution', 'reflection'];

// Team registry — color + icon + label for phase team filtering
export const TEAMS: Record<string, { label: string; color: string; icon: string }> = {
  viestinta:     { label: 'Viestintä',    color: '#056b9f', icon: '▶' },
  ohjelmisto:    { label: 'Ohjelmisto',   color: '#9b7cf6', icon: '◐' },
  tuotanto:      { label: 'Tuotanto',     color: '#f1b434', icon: '▣' },
  tekniikka:     { label: 'Tekniikka',    color: '#2a8a86', icon: '◉' },
  vieraat:       { label: 'Vieraat',      color: '#f09a52', icon: '◆' },
  vapaaehtoiset: { label: 'Vapaaehtoiset',color: '#e45c81', icon: '◇' },
  hallinto:      { label: 'Hallinto',     color: '#185e5b', icon: '◌' },
};

export const months     = ['Tam', 'Hel', 'Maa', 'Huh', 'Tou', 'Kes', 'Hei', 'Elo', 'Syy', 'Lok', 'Mar', 'Jou'];
export const monthsLong = ['Tammikuu', 'Helmikuu', 'Maaliskuu', 'Huhtikuu', 'Toukokuu', 'Kesäkuu', 'Heinäkuu', 'Elokuu', 'Syyskuu', 'Lokakuu', 'Marraskuu', 'Joulukuu'];

// Fallback team assignment based on category — for phases loaded from older data
export const defaultTeamForCategory = (cat: YearPhase['category']): string => {
  switch (cat) {
    case 'planning':   return 'ohjelmisto';
    case 'production': return 'tuotanto';
    case 'execution':  return 'tuotanto';
    case 'reflection': return 'hallinto';
    default:           return 'tuotanto';
  }
};

// Normalize a phase loaded from Firestore — ensures team field exists
export const normalizePhase = (p: YearPhase): YearPhase => ({
  ...p,
  team: p.team || defaultTeamForCategory(p.category),
});

// --- Date helpers (bridge month-based and date-based phases) ---

/** Parse a YYYY-MM-DD string as a LOCAL date (not UTC). */
export const parseLocalDate = (s: string): Date => {
  const [y, m, d] = s.split('-').map(n => parseInt(n, 10));
  return new Date(y, m - 1, d);
};

/** Format a Date as YYYY-MM-DD in local time. */
export const formatLocalDate = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/** Derive the start Date of a phase. Uses startDate if present, else falls back to first of startMonth. */
export const phaseStartDate = (p: YearPhase, year: number): Date => {
  if (p.startDate) return parseLocalDate(p.startDate);
  return new Date(year, p.startMonth - 1, 1);
};

/** Derive the end Date of a phase. Uses endDate if present, else falls back to last day of endMonth. */
export const phaseEndDate = (p: YearPhase, year: number): Date => {
  if (p.endDate) return parseLocalDate(p.endDate);
  // day 0 of the next month = last day of endMonth
  return new Date(year, p.endMonth, 0);
};

/** Return a new phase with updated startDate/endDate AND synced startMonth/endMonth. */
export const phaseWithDates = (p: YearPhase, newStart: Date, newEnd: Date): YearPhase => ({
  ...p,
  startDate:  formatLocalDate(newStart),
  endDate:    formatLocalDate(newEnd),
  startMonth: newStart.getMonth() + 1,
  endMonth:   newEnd.getMonth()   + 1,
});

/** Default LLFF yearwheel — festival phases based on hankesuunnitelma 2026 */
export const defaultLlffYearwheel: YearPhase[] = [
  {
    id: 'yw1', name: 'Teeman lukitus ja suunnittelu', category: 'planning', team: 'ohjelmisto',
    startMonth: 1, endMonth: 2, color: '#9b7cf6', icon: '◈',
    desc: 'Festivaalin taiteellisten sisältöjen suunnittelu, vuoden teeman lukitseminen työryhmän ja taiteellisen johtajan johdolla.',
    tasks: [
      { id: 't1', text: 'Vuoden teeman määrittely ja lukitseminen', month: 1, done: false, owner: 'Anton Baer' },
      { id: 't2', text: 'Taiteellisten sisältöjen suunnittelun aloitus', month: 1, done: false, owner: 'Anton Baer' },
      { id: 't3', text: 'Tärkeimpien yhteistyökumppaneiden kartoitus', month: 2, done: false, owner: 'Svetlana Romanova' },
    ],
  },
  {
    id: 'yw2', name: 'Festivaalivierailut ja verkostoituminen', category: 'planning', team: 'ohjelmisto',
    startMonth: 1, endMonth: 3, color: '#7c63d4', icon: '◇',
    desc: 'Vierailut pohjoismaisille ja eurooppalaisille elokuvafestivaaleille. Inspiraatio ja verkostoituminen.',
    tasks: [
      { id: 't4', text: 'IFFR Rotterdam', month: 1, done: false, owner: 'Siiri Siltala' },
      { id: 't5', text: 'Göteborg Film Festival', month: 1, done: false, owner: 'Hanna Hovitie' },
      { id: 't6', text: 'Berlinale', month: 2, done: false, owner: 'Anton Baer' },
      { id: 't7', text: 'CPH:DOX Kööpenhamina', month: 3, done: false, owner: 'Hanna Hovitie' },
    ],
  },
  {
    id: 'yw3', name: 'Lanseeraus ja viestintä alkaa', category: 'planning', team: 'viestinta',
    startMonth: 2, endMonth: 3, color: '#056b9f', icon: '▶',
    desc: 'Tapahtuman lanseeraus viestintäkanavissa. Vuoden teeman julkistus yleisölle.',
    tasks: [
      { id: 't8', text: 'Viestintäsuunnitelma 2026 valmiiksi', month: 2, done: false, owner: 'Arttu Uuranmäki' },
      { id: 't9', text: 'Teeman julkistus somessa', month: 3, done: false, owner: 'Arttu Uuranmäki' },
      { id: 't10', text: 'Verkkosivujen päivitys 2026', month: 3, done: false, owner: 'Arttu Uuranmäki' },
    ],
  },
  {
    id: 'yw4', name: 'Nordic Frames avoin haku', category: 'planning', team: 'ohjelmisto',
    startMonth: 2, endMonth: 4, color: '#b89df0', icon: '◐',
    desc: 'Nordic Frames -sarjan avoimen haun avaaminen ja hakemusten kerääminen.',
    tasks: [
      { id: 't11', text: 'Avoimen haun lanseeraus', month: 2, done: false, owner: 'Hanna Hovitie' },
      { id: 't12', text: 'Hakemusten vastaanotto', month: 3, done: false, owner: 'Hanna Hovitie' },
      { id: 't13', text: 'Haun sulkeminen ja arviointi', month: 4, done: false, owner: 'Hanna Hovitie' },
    ],
  },
  {
    id: 'yw5', name: 'Ohjelmiston tuotanto', category: 'production', team: 'ohjelmisto',
    startMonth: 4, endMonth: 6, color: '#6b48c4', icon: '▣',
    desc: '~20 pitkän elokuvan valinta ohjelmistoon. Avoimen haun lyhytelokuvien karsinta ~40 teokseen.',
    tasks: [
      { id: 't14', text: 'Teemaohjelmiston lukitus', month: 4, done: false, owner: 'Siiri Siltala' },
      { id: 't15', text: 'Nordic Frames -valinnat', month: 5, done: false, owner: 'Hanna Hovitie' },
      { id: 't16', text: 'Esityslisenssit ja sopimukset', month: 5, done: false, owner: 'Svetlana Romanova' },
      { id: 't17', text: 'Ohjelmiston julkistus', month: 5, done: false, owner: 'Arttu Uuranmäki' },
    ],
  },
  {
    id: 'yw6', name: 'Tekijävieraat ja yhteistyöt', category: 'production', team: 'vieraat',
    startMonth: 4, endMonth: 7, color: '#f09a52', icon: '◆',
    desc: 'Tekijävieraiden ja yhteiskunnallisten toimijoiden kutsuminen festivaaliin.',
    tasks: [
      { id: 't18', text: 'Päävieraan kutsuminen ja sopiminen', month: 4, done: false, owner: 'Anton Baer' },
      { id: 't19', text: 'Nordic Frames -tekijävieraiden kutsut (~5)', month: 5, done: false, owner: 'Hanna Hovitie' },
      { id: 't20', text: 'Keskustelijoiden ja puhujien vahvistukset', month: 6, done: false, owner: 'Anton Baer' },
      { id: 't21', text: 'Matkajärjestelyt ja majoitus', month: 7, done: false, owner: 'Svetlana Romanova' },
    ],
  },
  {
    id: 'yw7', name: 'Lippuvaraus ja markkinointi', category: 'production', team: 'viestinta',
    startMonth: 6, endMonth: 8, color: '#3788b2', icon: '▷',
    desc: 'Lippuvarausjärjestelmän avautuminen ja aktiivinen markkinointi.',
    tasks: [
      { id: 't22', text: 'Fienta-lippuvarauksen pystytys', month: 6, done: false, owner: 'Svetlana Romanova' },
      { id: 't23', text: 'Lippuvarauksen avautuminen', month: 7, done: false, owner: 'Arttu Uuranmäki' },
      { id: 't24', text: 'Some-kampanja ja maksullinen markkinointi', month: 7, done: false, owner: 'Arttu Uuranmäki' },
      { id: 't25', text: 'Lehdistötiedote ja mediat', month: 7, done: false, owner: 'Arttu Uuranmäki' },
    ],
  },
  {
    id: 'yw8', name: 'Vapaaehtoisten rekrytointi ja koulutus', category: 'production', team: 'vapaaehtoiset',
    startMonth: 5, endMonth: 8, color: '#e45c81', icon: '◉',
    desc: 'Vapaaehtoisten (~50 henkilöä) rekrytointi, roolitus ja koulutus festivaaliviikolle.',
    tasks: [
      { id: 't26', text: 'Vapaaehtoishaku auki', month: 5, done: false, owner: 'Svetlana Romanova' },
      { id: 't27', text: 'Vapaaehtoisten vuorolistat', month: 7, done: false, owner: 'Svetlana Romanova' },
      { id: 't28', text: 'Koulutustilaisuus', month: 8, done: false, owner: 'Svetlana Romanova' },
    ],
  },
  {
    id: 'yw12', name: 'Tekninen tuotanto ja rigaus', category: 'production', team: 'tekniikka',
    startMonth: 5, endMonth: 8, color: '#2a8a86', icon: '◉',
    desc: 'Elokuvaprojektorit, äänentoisto, valaistus ja puutarhateltta. Kivipihan ulkoilmanäytöksien tekniikka ja rigaus.',
    tasks: [
      { id: 'tt1', text: 'Laitevuokrauksien varaus', month: 5, done: false, owner: 'Tekninen tiimi' },
      { id: 'tt2', text: 'Projektoritestit ja kalibrointi', month: 7, done: false, owner: 'Tekninen tiimi' },
      { id: 'tt3', text: 'Ulkoilmarigauksen pystytys', month: 8, done: false, owner: 'Tekninen tiimi' },
      { id: 'tt4', text: 'Puutarhateltan pystytys ja varustelu', month: 8, done: false, owner: 'Tekninen tiimi' },
    ],
  },
  {
    id: 'yw9', name: 'Festivaaliviikko', category: 'execution', team: 'tuotanto', isFestival: true,
    startMonth: 8, endMonth: 8, color: '#ef6b6b', icon: '★',
    startDate: '2026-08-20', endDate: '2026-08-26',
    desc: 'Viikon mittainen festivaali 20.–26.8.2026. Ma–Ti Oodin Kino Regina, Pe–Su Lapinlahti (Puutarhateltta, Auditorio, Kivipiha, Omenapuutalo).',
    tasks: [
      { id: 't29', text: 'Avajaisnäytös (Oodi Kino Regina)', month: 8, done: false, owner: 'Anton Baer' },
      { id: 't30', text: 'NØW-työpaja käynnissä (Auditorio)', month: 8, done: false, owner: 'Anna Lehtonen' },
      { id: 't31', text: 'Päiväohjelmat ja keskustelut (Lapinlahti)', month: 8, done: false, owner: 'Svetlana Romanova' },
      { id: 't32', text: 'Päätösnäytös + NØW-esitykset', month: 8, done: false, owner: 'Anton Baer' },
    ],
  },
  {
    id: 'yw10', name: 'Jälkituotanto ja raportointi', category: 'reflection', team: 'hallinto',
    startMonth: 9, endMonth: 10, color: '#185e5b', icon: '◌',
    desc: 'Jälkituotanto, kävijäpalautteen kerääminen, rahoittajien raportointi.',
    tasks: [
      { id: 't33', text: 'Kävijäpalautteen analysointi', month: 9, done: false, owner: 'Svetlana Romanova' },
      { id: 't34', text: 'Mediaseuranta ja näkyvyysraportti', month: 9, done: false, owner: 'Arttu Uuranmäki' },
      { id: 't35', text: 'Rahoittajien raportit (Kone, Yle, Helsinki)', month: 10, done: false, owner: 'Svetlana Romanova' },
    ],
  },
  {
    id: 'yw11', name: 'Kehitystyö ja seuraava vuosi', category: 'reflection', team: 'hallinto',
    startMonth: 10, endMonth: 12, color: '#2d5a57', icon: '◇',
    desc: 'Tapahtuman kehitystyö, seuraavan vuoden teeman valinta, rahoituksen varmistaminen.',
    tasks: [
      { id: 't36', text: 'Tiimin reflektiotyöpaja', month: 10, done: false, owner: 'Anton Baer' },
      { id: 't37', text: 'Seuraavan vuoden teema-ajatukset', month: 11, done: false, owner: 'Anton Baer' },
      { id: 't38', text: 'Rahoitushakemukset 2028', month: 12, done: false, owner: 'Svetlana Romanova' },
    ],
  },
];
