// AI-Hetki — studion (elokuvastudio-agentti Mac Minillä) jaetut tyypit.
// Eristetty ilman riippuvuuksia muihin moduuleihin. Sama tietomalli on
// kopioitu studion puolelle (elokuvastudio/src/momentum.ts).
//
// Firestore-avaimet (org-skoopattu, useOrgData):
//   Studio kirjoittaa:   aihetki_studio, aihetki_projektit, aihetki_projekti_{id}
//                        + screenplays / screenplay_doc_{id} / screenplay_versions_{id}
//   Momentum kirjoittaa: aihetki_ohjaus, aihetki_kommentit_{id}
// Kirjoittajat on erotettu avaimittain, jotta Mac Mini ja selain eivät kirjoita
// samaa dokumenttia päällekkäin.

export type AiRooli = 'tuottaja' | 'kehitys' | 'kirjoittaja' | 'dramaturgi' | 'ohjaaja' | 'lukija' | 'studio';

export const AI_ROOLIT: Record<AiRooli, { nimi: string; titteli: string; vari: string; kirjain: string }> = {
  tuottaja:    { nimi: 'Tuottaja',         titteli: 'vastaava tuottaja',  vari: '#d9a441', kirjain: 'T' },
  kehitys:     { nimi: 'Kehityspäällikkö', titteli: 'kehitys',            vari: '#6fb1d6', kirjain: 'K' },
  kirjoittaja: { nimi: 'Käsikirjoittaja',  titteli: 'käsikirjoittaja',    vari: '#9b7cf6', kirjain: 'C' },
  dramaturgi:  { nimi: 'Dramaturgi',       titteli: 'script editor',      vari: '#5fb389', kirjain: 'D' },
  ohjaaja:     { nimi: 'Ohjaaja',          titteli: 'ohjaaja',            vari: '#e0707a', kirjain: 'O' },
  lukija:      { nimi: 'Lukija',           titteli: 'ulkopuolinen lukija', vari: '#8f8f8f', kirjain: 'L' },
  studio:      { nimi: 'Studio',           titteli: 'järjestelmä',        vari: '#444444', kirjain: 'S' },
};

export type AiAskel =
  | 'pitchit' | 'valinta'
  | 'treatment' | 'treatment_palaute' | 'treatment_v2'
  | 'kohtausluettelo' | 'kohtausluettelo_palaute' | 'kohtausluettelo_v2'
  | 'luonnos' | 'lukija' | 'ohjaaja_palaute' | 'dramaturgi_palaute'
  | 'uudelleenkirjoitus_suunnitelma' | 'uudelleenkirjoitus' | 'paatos'
  | 'valmis' | 'keskeytetty';

export const AI_ASKELEET: { id: AiAskel; nimi: string; lyhyt: string }[] = [
  { id: 'pitchit',                        nimi: 'Pitchit',                     lyhyt: 'Pitchit' },
  { id: 'valinta',                        nimi: 'Tuottajan valinta',           lyhyt: 'Valinta' },
  { id: 'treatment',                      nimi: 'Treatment',                   lyhyt: 'Treatment' },
  { id: 'treatment_palaute',              nimi: 'Dramaturgin palaute',         lyhyt: 'Palaute' },
  { id: 'treatment_v2',                   nimi: 'Treatment v2',                lyhyt: 'Treatment 2' },
  { id: 'kohtausluettelo',                nimi: 'Kohtausluettelo',             lyhyt: 'Kohtaukset' },
  { id: 'kohtausluettelo_palaute',        nimi: 'Palaute kohtausluettelosta',  lyhyt: 'Palaute' },
  { id: 'kohtausluettelo_v2',             nimi: 'Kohtausluettelo v2',          lyhyt: 'Kohtaukset 2' },
  { id: 'luonnos',                        nimi: '1. luonnos',                  lyhyt: 'Luonnos 1' },
  { id: 'lukija',                         nimi: 'Lukijalausunto',              lyhyt: 'Lukija' },
  { id: 'ohjaaja_palaute',                nimi: 'Ohjaajan palaute',            lyhyt: 'Ohjaaja' },
  { id: 'dramaturgi_palaute',             nimi: 'Dramaturgin palaute',         lyhyt: 'Dramaturgi' },
  { id: 'uudelleenkirjoitus_suunnitelma', nimi: 'Uudelleenkirjoitussuunnitelma', lyhyt: 'Suunnitelma' },
  { id: 'uudelleenkirjoitus',             nimi: '2. luonnos',                  lyhyt: 'Luonnos 2' },
  { id: 'paatos',                         nimi: 'Tuottajan päätös',            lyhyt: 'Päätös' },
];

export function askelIndeksi(askel: AiAskel): number {
  if (askel === 'valmis' || askel === 'keskeytetty') return AI_ASKELEET.length;
  const i = AI_ASKELEET.findIndex(a => a.id === askel);
  return i < 0 ? 0 : i;
}

export function askelNimi(askel: AiAskel): string {
  if (askel === 'valmis') return 'Valmis';
  if (askel === 'keskeytetty') return 'Keskeytetty';
  return AI_ASKELEET.find(a => a.id === askel)?.nimi ?? askel;
}

/** Studion tila — Mac Mini päivittää joka kierroksella (heartbeat). */
export interface AiStudioTila {
  syke: number;                 // viimeisin heartbeat (ms)
  tila: 'kaynnissa' | 'tauolla' | 'odottaa';
  malli: string;
  aktiivinenProjektiId?: string;
  aktiivinenOtsikko?: string;
  nykyinenAskel?: AiAskel;
  tyoskentelee?: AiRooli;       // kuka agentti tekee töitä juuri nyt
  tyonKuvaus?: string;          // esim. "kirjoittaa osaa 3/7"
  kustannusTanaanUsd: number;
  kustannusYhteensaUsd: number;
  projektejaTanaan: number;
  kaytetytSiemenet: string[];   // aihetki_ohjaus.siemenet[].id jotka on otettu käyttöön
  muisti: string;               // studion muisti.md sellaisenaan
  viimeisinVirhe?: string;
}

/** Projekti-indeksin rivi (kevyt, listanäkymälle). */
export interface AiProjektiMeta {
  id: string;
  otsikko: string;
  luotu: number;
  paivitetty: number;
  askel: AiAskel;
  formaatti?: string;
  genre?: string;
  logline?: string;
  tagline?: string;
  lukijaSuositus?: 'PASS' | 'CONSIDER' | 'RECOMMEND';
  lukijaArvosana?: number;
  paatos?: 'tuotantoon' | 'jatkokehitykseen' | 'arkistoon';
  kustannusUsd: number;
  screenplayId?: string;        // Käsikirjoitus-moduulin id, kun luonnos on viety
  siemenId?: string;            // jos projekti lähti Antonin lähtökohdasta
  huomio?: string;
}

/** Yksi puheenvuoro projektin ketjussa — agentin tuotos tietyssä askeleessa. */
export interface AiViesti {
  id: string;
  at: number;
  rooli: AiRooli;
  askel: AiAskel;
  otsikko: string;
  teksti: string;               // markdown-tyylinen teksti
  liite?: { tyyppi: 'kasikirjoitus'; screenplayId: string; nimi: string };
  kustannusUsd?: number;
}

/** Projektin koko dokumentti. */
export interface AiProjekti {
  meta: AiProjektiMeta;
  viestit: AiViesti[];
  kasitellytKommentit: string[]; // kommentti-id:t, jotka studio on jo syöttänyt agenteille
}

/** Antonin (tai muun jäsenen) kommentti projektin ketjuun. */
export interface AiKommentti {
  id: string;
  at: number;
  kirjoittaja: string;
  uid?: string;
  teksti: string;
}

/** Studion ohjaus Momentumista käsin. */
export interface AiOhjaus {
  tauko: boolean;
  siemenet: { id: string; teksti: string; luotu: number; kirjoittaja: string }[];
}

export const EMPTY_OHJAUS: AiOhjaus = { tauko: false, siemenet: [] };

export function aiId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Onko studio hengissä: heartbeat alle 10 min vanha. */
export function studioElossa(tila: AiStudioTila | null | undefined): boolean {
  return !!tila && Date.now() - tila.syke < 10 * 60 * 1000;
}
