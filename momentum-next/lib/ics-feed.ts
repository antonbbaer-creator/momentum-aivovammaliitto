// ICS (iCalendar / RFC 5545) -generaattori henkilökohtaisen viikkokalenterin
// tapahtumista. Käytetään yksisuuntaisessa Momentum → Apple Calendar -synkassa
// (subscription URL). Tukee RRULEa toistoille, joten Apple näyttää
// ikuiset rutiinit ilman että reitti laajentaisi esiintymiä manuaalisesti.

import { TimeBlock, PersonalCategory, parseLocalDateTime } from './personal-shared';

const TZID = 'Europe/Helsinki';
const PRODID = '-//Hetki//Momentum//FI';

/** Pakkaa Date -> 'YYYYMMDDTHHMMSS' paikallisesti (TZID-mukaan). */
function fmtLocal(dt: Date): string {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  const hh = String(dt.getHours()).padStart(2, '0');
  const mm = String(dt.getMinutes()).padStart(2, '0');
  const ss = String(dt.getSeconds()).padStart(2, '0');
  return `${y}${m}${d}T${hh}${mm}${ss}`;
}

/** UTC-aikaleima 'YYYYMMDDTHHMMSSZ' (DTSTAMP-kentälle). */
function fmtUtc(dt: Date): string {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  const hh = String(dt.getUTCHours()).padStart(2, '0');
  const mm = String(dt.getUTCMinutes()).padStart(2, '0');
  const ss = String(dt.getUTCSeconds()).padStart(2, '0');
  return `${y}${m}${d}T${hh}${mm}${ss}Z`;
}

/** Päivä 'YYYY-MM-DD' -> 'YYYYMMDD' (UNTIL-kentälle DATE-arvoa varten). */
function dateOnlyCompact(yyyymmdd: string): string {
  return yyyymmdd.replace(/-/g, '');
}

/** TEXT-arvon escape (RFC 5545 §3.3.11). */
function escText(s: string): string {
  return (s || '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

/** Taita rivi 75 oktettiin (RFC 5545 §3.1). Yksinkertainen oletus: ascii-mittaus. */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const out: string[] = [];
  let i = 0;
  out.push(line.slice(0, 75));
  i = 75;
  while (i < line.length) {
    out.push(' ' + line.slice(i, i + 74));
    i += 74;
  }
  return out.join('\r\n');
}

const RECUR_TO_RRULE: Record<string, string> = {
  daily: 'FREQ=DAILY',
  weekly: 'FREQ=WEEKLY',
  biweekly: 'FREQ=WEEKLY;INTERVAL=2',
  monthly: 'FREQ=MONTHLY',
};

export interface BuildIcsOptions {
  /** Käyttäjän nimi tai sähköposti — näytetään kalenterin nimessä. */
  ownerLabel?: string;
}

/**
 * Rakenna ICS-merkkijono käyttäjän TimeBlockeista. Toistuvat lohkot menevät
 * RRULE:nä, ei laajennettuina esiintyminä. Domain UID-jälkiliitteessä
 * varmistaa että saman lohkon päivitykset tunnistetaan samaksi tapahtumaksi.
 */
export function buildIcsFeed(
  blocks: TimeBlock[],
  categories: PersonalCategory[],
  uid: string,
  opts: BuildIcsOptions = {},
): string {
  const now = new Date();
  const dtstamp = fmtUtc(now);
  const catById = new Map(categories.map(c => [c.id, c]));
  const calName = opts.ownerLabel
    ? `Momentum — ${opts.ownerLabel}`
    : 'Momentum';

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escText(calName)}`,
    `X-WR-TIMEZONE:${TZID}`,
    'X-PUBLISHED-TTL:PT1H',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    // Vakio VTIMEZONE Europe/Helsinki (EET/EEST). Apple osaa ilman tätä mutta
    // tämä takaa että ankkurit ovat oikein muissakin asiakkaissa.
    'BEGIN:VTIMEZONE',
    `TZID:${TZID}`,
    'BEGIN:STANDARD',
    'DTSTART:19701025T040000',
    'TZOFFSETFROM:+0300',
    'TZOFFSETTO:+0200',
    'TZNAME:EET',
    'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
    'END:STANDARD',
    'BEGIN:DAYLIGHT',
    'DTSTART:19700329T030000',
    'TZOFFSETFROM:+0200',
    'TZOFFSETTO:+0300',
    'TZNAME:EEST',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
    'END:DAYLIGHT',
    'END:VTIMEZONE',
  ];

  for (const b of blocks) {
    let start: Date;
    let end: Date;
    try {
      start = parseLocalDateTime(b.start);
      end = parseLocalDateTime(b.end);
    } catch {
      continue;
    }
    if (!(start instanceof Date) || isNaN(start.getTime())) continue;
    if (!(end instanceof Date) || isNaN(end.getTime())) continue;
    if (end <= start) continue;

    const cat = b.categoryId ? catById.get(b.categoryId) : undefined;
    const uid_ = `${uid}-${b.id}@momentum.hetkicompany.com`;
    const recur = b.recurrence ?? 'none';

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${uid_}`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART;TZID=${TZID}:${fmtLocal(start)}`);
    lines.push(`DTEND;TZID=${TZID}:${fmtLocal(end)}`);
    lines.push(`SUMMARY:${escText(b.title || '(ei otsikkoa)')}`);

    if (cat) {
      lines.push(`CATEGORIES:${escText(cat.name)}`);
      lines.push(`COLOR:${escText(cat.color)}`);
    }

    if (b.locked || b.done) {
      const status = b.done ? 'Valmis' : 'Lukittu';
      lines.push(`DESCRIPTION:${escText(status)}`);
    }

    if (recur !== 'none' && RECUR_TO_RRULE[recur]) {
      let rrule = RECUR_TO_RRULE[recur];
      if (b.recurrenceUntil) {
        // UNTIL pitää olla UTC tai DATE — käytetään päivätarkkuutta loppupäivän
        // lopussa, jotta koko päivä mahtuu mukaan.
        rrule += `;UNTIL=${dateOnlyCompact(b.recurrenceUntil)}T235959Z`;
      }
      lines.push(`RRULE:${rrule}`);

      const exclusions = b.recurrenceExclusions ?? [];
      if (exclusions.length > 0) {
        // EXDATE tarvitsee saman kellonajan kuin DTSTART.
        const hh = String(start.getHours()).padStart(2, '0');
        const mm = String(start.getMinutes()).padStart(2, '0');
        const ss = String(start.getSeconds()).padStart(2, '0');
        const exVals = exclusions
          .map(d => `${dateOnlyCompact(d)}T${hh}${mm}${ss}`)
          .join(',');
        lines.push(`EXDATE;TZID=${TZID}:${exVals}`);
      }
    }

    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
