// AVL (Aivovammaliitto) — org-kohtaiset oletusarvot
// Tiimi ja rakenne seed-data.ts:n AVL_ORG.team-pohjalta
// Vuosikello + viestintästrategia 2026 lähteenä:
//   - 2026_VIESTINNÄN VUOSIKELLO.docx
//   - 2026_LUONNOS_Aivovammaliiton viestintästrategia.docx (strategia 2026–2030)

import { OrgTeam, OrgTeamMember } from './team-shared';
import type { CommsPlan } from './comms-plan-shared';
import type { YearPhase } from './yearwheel-shared';

export const DEFAULT_AVL_TEAMS: OrgTeam[] = [
  {
    id: 'viestinta',
    name: 'Viestintätiimi',
    color: '#056b9f',
    icon: '▶',
    description: 'Viestinnän suunnittelu, toteutus ja kanavahallinta.',
    leadId: 'pia',
  },
  {
    id: 'johto',
    name: 'Johto',
    color: '#185e5b',
    icon: '◉',
    description: 'Toiminnanjohtaja, hallinto ja strateginen ohjaus.',
    leadId: 'paivi',
  },
];

export const DEFAULT_AVL_TEAM_MEMBERS: OrgTeamMember[] = [
  {
    id: 'pia',
    name: 'Pia Kilpeläinen',
    role: 'Viestintävastaava / Aivoitus-lehden päätoimittaja',
    teamId: 'viestinta',
    type: 'permanent',
    avatar: 'P',
    responsibilities: ['Viestinnän koordinointi', 'Aivoitus-lehti', 'Jäsenkirjeet', 'Nettisivujen päivitykset', 'Tapahtumajärjestelyt'],
    channels: ['Facebook', 'Nettisivut', 'Aivoitus-lehti', 'Jäsenkirje'],
  },
  {
    id: 'anton',
    name: 'Anton Baer',
    role: 'Viestinnän suunnittelija',
    teamId: 'viestinta',
    type: 'permanent',
    avatar: 'A',
    email: 'anton@hetkicompany.com',
    linkedUserEmails: ['anton@hetkicompany.com', 'anton.baer@gmail.com'],
    responsibilities: ['Visuaalinen viestintä', 'Nettisivujen ilme ja uudistus', 'Esitteiden taitto', 'YouTube-videot', 'Momentum-alusta'],
    channels: ['Nettisivut', 'YouTube', 'Esitteet'],
  },
  {
    id: 'jani',
    name: 'Jani Saarinen',
    role: 'Sisällöntuottaja',
    teamId: 'viestinta',
    type: 'permanent',
    avatar: 'J',
    responsibilities: ['Some-sisällöntuotanto (Facebook, Instagram, TikTok)', 'Somekanavien analytiikka', 'Sisältökalenterin ylläpito'],
    channels: ['Facebook', 'Instagram', 'TikTok'],
  },
  {
    id: 'paivi',
    name: 'Päivi Hakkarainen',
    role: 'Toiminnanjohtaja',
    teamId: 'johto',
    type: 'permanent',
    avatar: 'P',
    responsibilities: ['LinkedIn-sisällöt', 'Lehdistötiedotteet', 'Kannanotot', 'Lausunnot', 'Kriisiviestintä', 'Vaikuttamisviestintä'],
    channels: ['LinkedIn', 'Lehdistötiedotteet'],
  },
];

// ── AVL Vuosikello 2026 ────────────────────────────────────────
// Lähde: 2026_VIESTINNÄN VUOSIKELLO.docx (kuukausittainen painopiste,
// tapahtumat, kampanjat ja Aivoitus-lehden tuotantorytmi).

export const DEFAULT_AVL_YEARWHEEL: YearPhase[] = [
  {
    id: 'avl-yw1', name: 'Tarjonta näkyväksi + STOP väkivallalle', category: 'execution', team: 'viestinta',
    startMonth: 1, endMonth: 2, startDate: '2026-01-01', endDate: '2026-02-28',
    color: '#e45c81', icon: '★',
    desc: 'Alkuvuoden painopiste: vuoden tarjonta ammattilaisille näkyväksi ja väkivallan vastainen teema. Pysy pystyssä -kampanja (kasvona Annina Hakala). Tapaturmapäivä 13.2. Helmikuussa kokemustiedon viikko ja Aivoitus 1/26 ilmestyy.',
    tasks: [
      { id: 'avl-t101', text: 'Uutiskirje: vuoden tarjonta ammattilaisille', month: 1, done: false, owner: 'Pia Kilpeläinen' },
      { id: 'avl-t102', text: 'Jäsenkirje: kohderyhmän laajentuminen', month: 1, done: false, owner: 'Pia Kilpeläinen' },
      { id: 'avl-t103', text: 'Aivoitus 1/2026: STOP väkivallalle (jakeluun)', month: 2, done: false, owner: 'Pia Kilpeläinen' },
      { id: 'avl-t104', text: 'Pysy pystyssä -kampanja (Annina Hakala)', month: 1, done: false, owner: 'Jani Saarinen' },
      { id: 'avl-t105', text: 'Tapaturmapäivä 13.2. — nostot ja viestit', month: 2, done: false, owner: 'Jani Saarinen' },
      { id: 'avl-t106', text: 'Koululuento Tampereen teknillisellä lukiolla', month: 1, done: false, owner: 'Pia Kilpeläinen' },
      { id: 'avl-t107', text: 'Koululuento Limingan koulukodilla', month: 2, done: false, owner: 'Pia Kilpeläinen' },
      { id: 'avl-t108', text: 'Aivovammaensitietopäivä Oulussa', month: 2, done: false, owner: 'Pia Kilpeläinen' },
      { id: 'avl-t109', text: 'Video kohderyhmän laajentumisesta (3 AVH-videota kuvattu, julkaisuaikataulu + some-nostot)', month: 2, done: false, owner: 'Jani Saarinen' },
      { id: 'avl-t110', text: 'Kokemustiedon viikko — nostot ajankohtaisissa ja somessa', month: 2, done: false, owner: 'Jani Saarinen' },
      { id: 'avl-t111', text: 'Webinaari', month: 2, done: false, owner: 'Pia Kilpeläinen' },
    ],
  },
  {
    id: 'avl-yw2', name: 'Brändi- ja verkkosivu-uudistuksen käynnistys', category: 'planning', team: 'viestinta',
    startMonth: 1, endMonth: 6, startDate: '2026-01-15', endDate: '2026-06-30',
    color: '#f09a52', icon: '◇',
    desc: 'Brändiuudistuksen ja verkkosivu-uudistuksen käynnistys alkuvuodesta. Saavutettavuus, kohderyhmälähtöinen sisältörakenne ja päivitetty graafinen ilme.',
    tasks: [
      { id: 'avl-t201', text: 'Brändiuudistus käyntiin — suunta ja työnjako', month: 1, done: false, owner: 'Anton Baer' },
      { id: 'avl-t202', text: 'Verkkosivu-uudistuksen aloitus (rakenne, saavutettavuus)', month: 2, done: false, owner: 'Anton Baer' },
      { id: 'avl-t203', text: 'AVH-lehdistötiedote STT:n kautta (joulukuussa jo)', month: 1, done: true, owner: 'Päivi Hakkarainen' },
    ],
  },
  {
    id: 'avl-yw3', name: 'Aivovammatietoisuuden kuukausi + Aivoviikko — Näe näkymätön', category: 'execution', team: 'viestinta',
    startMonth: 3, endMonth: 3, startDate: '2026-03-01', endDate: '2026-03-31',
    color: '#e45c81', icon: '★',
    desc: 'Maaliskuun teema: Näe näkymätön. Somekampanja, 4 kokemustarinaa (kasvoina mm. Sakke Pihlaja ja AVH-puolelta Kaj Kunnas, yksi läheinen, oireesta tarina/video, aivoterveysnosto). Webinaari (Jaana Sarajuuri), lähiluento Tampereella (Matti Vartiainen), kannanotto rahoituksesta, lehdistötiedotteet.',
    tasks: [
      { id: 'avl-t301', text: 'Somekampanja: 4 kokemustarinaa (Sakke Pihlaja, Kaj Kunnas, läheinen, oire, aivoterveys)', month: 3, done: false, owner: 'Jani Saarinen' },
      { id: 'avl-t302', text: 'Ajankohtaiset uutiset Aivovammatietoisuuden kuukaudesta ja Aivoviikosta', month: 3, done: false, owner: 'Pia Kilpeläinen' },
      { id: 'avl-t303', text: 'Lehdistötiedotteet', month: 3, done: false, owner: 'Päivi Hakkarainen' },
      { id: 'avl-t304', text: 'Kannanotto rahoituksesta — räätälöity medialle ja kansanedustajille', month: 3, done: false, owner: 'Päivi Hakkarainen' },
      { id: 'avl-t305', text: 'Aivoitus-jutut netti-Aivoitukseen + some-nostot', month: 3, done: false, owner: 'Pia Kilpeläinen' },
      { id: 'avl-t306', text: 'Webinaari (Jaana Sarajuuri)', month: 3, done: false, owner: 'Pia Kilpeläinen' },
      { id: 'avl-t307', text: 'Lähiluento Tampereella (Matti Vartiainen)', month: 3, done: false, owner: 'Pia Kilpeläinen' },
      { id: 'avl-t308', text: 'Koululuennot Tampereen teknillinen lukio + Kouvolan koulukoti', month: 3, done: false, owner: 'Pia Kilpeläinen' },
      { id: 'avl-t309', text: 'Tapaturmapäivä 13.3. (SPR:n webinaari, Pia luennoi) — mainostus alkukuusta', month: 3, done: false, owner: 'Pia Kilpeläinen' },
      { id: 'avl-t310', text: 'Uutiskirje (loppupuolella maaliskuuta)', month: 3, done: false, owner: 'Pia Kilpeläinen' },
      { id: 'avl-t311', text: 'Jäsenkirje', month: 3, done: false, owner: 'Pia Kilpeläinen' },
      { id: 'avl-t312', text: 'Yhdistystiedote (?)', month: 3, done: false, owner: 'Pia Kilpeläinen' },
      { id: 'avl-t313', text: '26.3. AVH-ensitietopäivä OYSissa klo 12–16', month: 3, done: false, owner: 'Pia Kilpeläinen' },
      { id: 'avl-t314', text: 'Pyöräilykypärä — some-tietoiskun ja tiedotteen valmistelu', month: 3, done: false, owner: 'Jani Saarinen' },
    ],
  },
  {
    id: 'avl-yw4', name: 'Aivoitus 2 + Kippistä kohtuudella', category: 'production', team: 'viestinta',
    startMonth: 4, endMonth: 4, startDate: '2026-04-01', endDate: '2026-04-30',
    color: '#9b7cf6', icon: '▣',
    desc: 'Huhtikuu: Aivoitus 2 (Aivoterveyden asialla) — artikkelit ja taitto, tiisereitä lehdestä someen. Pyöräilykypärä-tiedotteen toteutus. Kippistä kohtuudella -kampanja vappuviikolla. Kevätliittokokous ja kannanoton valmistelu. Vesiturvallisuuswebinaari YouTubeen tekstitettynä.',
    tasks: [
      { id: 'avl-t401', text: 'Aivoitus 2: Aivoterveyden asialla — artikkelit ja taitto', month: 4, done: false, owner: 'Pia Kilpeläinen' },
      { id: 'avl-t402', text: 'Tiisereitä Aivoitus-lehdestä someen', month: 4, done: false, owner: 'Jani Saarinen' },
      { id: 'avl-t403', text: 'Pyöräilykypärä — some-tietoiskun ja tiedotteen toteutus', month: 4, done: false, owner: 'Jani Saarinen' },
      { id: 'avl-t404', text: 'Jäsenkirje', month: 4, done: false, owner: 'Pia Kilpeläinen' },
      { id: 'avl-t405', text: 'Kippistä kohtuudella — tapahtumat, ajankohtainen, lehdistötiedote, some-nostot vappuviikolla', month: 4, done: false, owner: 'Jani Saarinen' },
      { id: 'avl-t406', text: 'Kevätliittokokous — kannanoton valmistelu ja lähetys', month: 4, done: false, owner: 'Päivi Hakkarainen' },
      { id: 'avl-t407', text: 'Edellisvuoden vesiturvallisuuswebinaari tekstitettynä YouTubeen + nostot', month: 4, done: false, owner: 'Anton Baer' },
      { id: 'avl-t408', text: 'Vapputervehdys Kippistä korkeintaan kohtuudella -hengessä', month: 4, done: false, owner: 'Jani Saarinen' },
    ],
  },
  {
    id: 'avl-yw5', name: 'Aivoitus 2 ilmestyy + AVH-ensitietopäivät', category: 'execution', team: 'viestinta',
    startMonth: 5, endMonth: 5, startDate: '2026-05-01', endDate: '2026-05-31',
    color: '#056b9f', icon: '▶',
    desc: 'Toukokuu: Aivoitus 2 ilmestyy, Aivoitus-nostot netti-Aivoitukseen ja someen loppukuusta. AVH-/aivoterveysluento (Laura? Pia kysyy). 20.5. AVH-ensitietopäivä OYSissa, 21.5. koulukotiluento Pietarsaaressa.',
    tasks: [
      { id: 'avl-t501', text: 'Uutiskirje', month: 5, done: false, owner: 'Pia Kilpeläinen' },
      { id: 'avl-t502', text: 'AVH-/aivoterveysluento (Laura? Pia kysyy)', month: 5, done: false, owner: 'Pia Kilpeläinen' },
      { id: 'avl-t503', text: 'Aivoitus 2 ilmestyy', month: 5, done: false, owner: 'Pia Kilpeläinen' },
      { id: 'avl-t504', text: 'Aivoitus-nostot netti-Aivoitukseen ja someen (loppukuusta)', month: 5, done: false, owner: 'Jani Saarinen' },
      { id: 'avl-t505', text: 'Jäsenkirje', month: 5, done: false, owner: 'Pia Kilpeläinen' },
      { id: 'avl-t506', text: '20.5. Aivovammaensitietopäivä OYSissa', month: 5, done: false, owner: 'Pia Kilpeläinen' },
      { id: 'avl-t507', text: '21.5. Koulukotiluento Pietarsaaressa', month: 5, done: false, owner: 'Pia Kilpeläinen' },
    ],
  },
  {
    id: 'avl-yw6', name: 'Kesä — Aivoitus 3 valmistelu (Elämän rytmi)', category: 'production', team: 'viestinta',
    startMonth: 6, endMonth: 7, startDate: '2026-06-01', endDate: '2026-07-31',
    color: '#2a8a86', icon: '◐',
    desc: 'Kesä- ja heinäkuu: kevyempi julkaisutahti. Aivoitus 3 (Elämän rytmi) haastattelut valmiiksi ennen kesälomia, aineistopäivä 27.7., jonka jälkeen alkaa juttujen kirjoitus.',
    tasks: [
      { id: 'avl-t601', text: 'Uutiskirje (toiminnanjohtajan kiitos)', month: 6, done: false, owner: 'Päivi Hakkarainen' },
      { id: 'avl-t602', text: 'Jäsenkirje', month: 6, done: false, owner: 'Pia Kilpeläinen' },
      { id: 'avl-t603', text: 'Aivoitus 3 — haastattelut valmiiksi ennen kesälomia', month: 6, done: false, owner: 'Pia Kilpeläinen' },
      { id: 'avl-t604', text: 'Aivoitus 3 aineistopäivä 27.7. ja juttujen kirjoitus käyntiin', month: 7, done: false, owner: 'Pia Kilpeläinen' },
    ],
  },
  {
    id: 'avl-yw7', name: 'Aivoitus 3 taittoon ja jakeluun', category: 'production', team: 'viestinta',
    startMonth: 8, endMonth: 8, startDate: '2026-08-01', endDate: '2026-08-31',
    color: '#9b7cf6', icon: '▣',
    desc: 'Elokuu: 6.8. Aivoitus 3 taittoon. Uutiskirjeessä syksyn tapahtumat ja muu ajankohtainen. Aivoitus 3 ilmestyy elokuun loppupuolella.',
    tasks: [
      { id: 'avl-t701', text: '6.8. Aivoitus 3 taittoon', month: 8, done: false, owner: 'Pia Kilpeläinen' },
      { id: 'avl-t702', text: 'Uutiskirje (syksyn tapahtumat ja muu ajankohtainen)', month: 8, done: false, owner: 'Pia Kilpeläinen' },
      { id: 'avl-t703', text: 'Jäsenkirje', month: 8, done: false, owner: 'Pia Kilpeläinen' },
      { id: 'avl-t704', text: 'Aivoitus 3 ilmestyy elokuun loppupuolella', month: 8, done: false, owner: 'Pia Kilpeläinen' },
    ],
  },
  {
    id: 'avl-yw8', name: 'Aivotärähdys + yhteistyö Migreeniyhdistyksen kanssa', category: 'execution', team: 'viestinta',
    startMonth: 9, endMonth: 9, startDate: '2026-09-01', endDate: '2026-09-30',
    color: '#e45c81', icon: '★',
    desc: 'Syyskuu: Aivoitus 3:n juttujen nostot netti-Aivoitukseen ja someen. 18.9. Aivotärähdystietoisuuden päivä (ajankohtainen uutinen, some, lehdistötiedote, Lauralta materiaalia). Yhteiset webinaarit Migreeniyhdistyksen kanssa.',
    tasks: [
      { id: 'avl-t801', text: 'Netti-Aivoitus ja some-nostot Aivoitus 3:n jutuista', month: 9, done: false, owner: 'Jani Saarinen' },
      { id: 'avl-t802', text: 'Jäsenkirje', month: 9, done: false, owner: 'Pia Kilpeläinen' },
      { id: 'avl-t803', text: '18.9. Aivotärähdystietoisuuden päivä — uutinen, some, lehdistötiedote (Lauralta materiaalia)', month: 9, done: false, owner: 'Pia Kilpeläinen' },
      { id: 'avl-t804', text: 'Yhteiset webinaarit Migreeniyhdistyksen kanssa', month: 9, done: false, owner: 'Pia Kilpeläinen' },
    ],
  },
  {
    id: 'avl-yw9', name: 'AVH-tietoisuuden kuukausi + Maailman AVH-päivä', category: 'execution', team: 'viestinta',
    startMonth: 10, endMonth: 10, startDate: '2026-10-01', endDate: '2026-10-31',
    color: '#e45c81', icon: '★',
    desc: 'Lokakuu: Aivoverenkiertohäiriötietoisuuden kuukausi. 2.10. väkivallattomuuden päivä, 8.10. AVH-ensitietopäivä Oulussa, 10.10. Puhevammaviikon afasiapäivä, 29.10. Maailman AVH-päivä (teema?). AVH-päivän nimissä webinaari afasiasta (Pirjo Laine). Syysliittokokous + mahdollinen kannanotto. Aivoitus 4 (Toivoa tulevaan) — haastattelut ja aineistopäivä 26.10.',
    tasks: [
      { id: 'avl-t901', text: '2.10. Väkivallattomuuden päivä — nosto', month: 10, done: false, owner: 'Jani Saarinen' },
      { id: 'avl-t902', text: '8.10. AVH-ensitietopäivä Oulussa', month: 10, done: false, owner: 'Pia Kilpeläinen' },
      { id: 'avl-t903', text: '10.10. Puhevammaviikon afasiapäivä', month: 10, done: false, owner: 'Pia Kilpeläinen' },
      { id: 'avl-t904', text: 'Uutiskirje', month: 10, done: false, owner: 'Pia Kilpeläinen' },
      { id: 'avl-t905', text: '29.10. Maailman AVH-päivä — teeman lukitus + viestit', month: 10, done: false, owner: 'Pia Kilpeläinen' },
      { id: 'avl-t906', text: 'AVH-päivän webinaari afasiasta (Pirjo Laine) + nostot ja lehdistötiedotteet', month: 10, done: false, owner: 'Pia Kilpeläinen' },
      { id: 'avl-t907', text: 'Syysliittokokous + mahdollinen kannanotto', month: 10, done: false, owner: 'Päivi Hakkarainen' },
      { id: 'avl-t908', text: 'Aivoitus 4 (Toivoa tulevaan) — haastattelut', month: 10, done: false, owner: 'Pia Kilpeläinen' },
      { id: 'avl-t909', text: 'Aivoitus 4 aineistopäivä 26.10. — juttujen kirjoitus käyntiin', month: 10, done: false, owner: 'Pia Kilpeläinen' },
    ],
  },
  {
    id: 'avl-yw10', name: 'Aivovammaviikko (vk 46) + Aivoitus 4', category: 'execution', team: 'viestinta',
    startMonth: 11, endMonth: 11, startDate: '2026-11-09', endDate: '2026-11-15',
    color: '#e45c81', icon: '★',
    desc: 'Marraskuu: Aivovammaviikko 9.–15.11. (vk 46). Teema-ajatus: Näkymätön näkyväksi tai uusi. Sisältö someen: 2 kokemustarinaa ja 2 teemajulkaisua — painotus näkymättömissä oireissa ja kohtaamisissa, läheisten rooli ja aivoterveys. Webinaari läheisten tukemisesta (Julia Lindlöf tai Inkeri Hutri). 13.11. Tapaturmapäivä. Aivoitus 4 ilmestyy. Mahdollisesti aivovammaensitietopäivä OYSissa.',
    tasks: [
      { id: 'avl-t1001', text: 'Mahdollinen aivovammaensitietopäivä OYSissa', month: 11, done: false, owner: 'Pia Kilpeläinen' },
      { id: 'avl-t1002', text: 'Aivovammaviikko vk 46 (9.–15.11.) — ajankohtainen uutinen, some-nostot, lehdistötiedote, tapahtumat', month: 11, done: false, owner: 'Pia Kilpeläinen' },
      { id: 'avl-t1003', text: 'Some-sisältö: 2 kokemustarinaa + 2 teemajulkaisua (näkymättömät oireet, kohtaaminen, läheiset, aivoterveys)', month: 11, done: false, owner: 'Jani Saarinen' },
      { id: 'avl-t1004', text: 'Webinaari läheisten tukemisesta (Julia Lindlöf / Inkeri Hutri)', month: 11, done: false, owner: 'Pia Kilpeläinen' },
      { id: 'avl-t1005', text: '13.11. Tapaturmapäivä', month: 11, done: false, owner: 'Jani Saarinen' },
      { id: 'avl-t1006', text: 'Jäsenkirje', month: 11, done: false, owner: 'Pia Kilpeläinen' },
      { id: 'avl-t1007', text: 'Aivoitus 4 ilmestyy', month: 11, done: false, owner: 'Pia Kilpeläinen' },
    ],
  },
  {
    id: 'avl-yw11', name: 'Joulukuu — vuoden päätös ja teemapäivät', category: 'reflection', team: 'viestinta',
    startMonth: 12, endMonth: 12, startDate: '2026-12-01', endDate: '2026-12-31',
    color: '#185e5b', icon: '○',
    desc: 'Joulukuu: 3.12. Kansainvälinen vammaisten päivä, 5.12. Kansainvälinen vapaaehtoistoiminnan päivä, 6.12. Itsenäisyyspäivä. Aivoitus 4:n jutut netti-Aivoitukseen ja nostot someen. Vuoden koonti somessa tai joulukalenteri. Joulu- ja uudenvuoden tervehdykset.',
    tasks: [
      { id: 'avl-t1101', text: '3.12. Kansainvälinen vammaisten päivä', month: 12, done: false, owner: 'Jani Saarinen' },
      { id: 'avl-t1102', text: '5.12. Kansainvälinen vapaaehtoistoiminnan päivä', month: 12, done: false, owner: 'Jani Saarinen' },
      { id: 'avl-t1103', text: '6.12. Itsenäisyyspäivä — tervehdys', month: 12, done: false, owner: 'Jani Saarinen' },
      { id: 'avl-t1104', text: 'Aivoitus 4 -jutut netti-Aivoitukseen ja nostot someen', month: 12, done: false, owner: 'Jani Saarinen' },
      { id: 'avl-t1105', text: 'Uutiskirje', month: 12, done: false, owner: 'Pia Kilpeläinen' },
      { id: 'avl-t1106', text: 'Vuoden koonti somessa / joulukalenteri', month: 12, done: false, owner: 'Jani Saarinen' },
      { id: 'avl-t1107', text: 'Joulu- ja uudenvuoden tervehdys', month: 12, done: false, owner: 'Pia Kilpeläinen' },
    ],
  },
  {
    id: 'avl-yw12', name: 'Läpi vuoden: some, ajankohtaiset, kouluvierailut', category: 'production', team: 'viestinta',
    startMonth: 1, endMonth: 12, startDate: '2026-01-01', endDate: '2026-12-31',
    color: '#056b9f', icon: '▶',
    desc: 'Jatkuvasti läpi vuoden: somekanavat (myös LinkedIn), ajankohtaiset uutiset ja netti-Aivoitus, kouluvierailut pyyntöjen mukaan, osasta Aivoitus-haastatteluja video, esitteet.',
    tasks: [
      { id: 'avl-t1201', text: 'Some-julkaiseminen — myös LinkedIn', month: 1, done: false, owner: 'Jani Saarinen' },
      { id: 'avl-t1202', text: 'Ajankohtaiset uutiset ja netti-Aivoitus', month: 1, done: false, owner: 'Pia Kilpeläinen' },
      { id: 'avl-t1203', text: 'Kouluvierailut pyyntöjen mukaan', month: 1, done: false, owner: 'Pia Kilpeläinen' },
      { id: 'avl-t1204', text: 'Aivoitus-haastatteluista videoita', month: 1, done: false, owner: 'Anton Baer' },
      { id: 'avl-t1205', text: 'Esitteiden ylläpito ja päivitys', month: 1, done: false, owner: 'Anton Baer' },
    ],
  },
];

// ── AVL Viestintästrategia 2026–2030 ───────────────────────────
// Lähde: 2026_LUONNOS_Aivovammaliiton viestintästrategia.docx
// Strategiset tavoitteet (strategicMoves), arvot (brandPillars),
// kohderyhmät (audienceMix) ja kanavat poimittu suoraan dokumentista.

export const DEFAULT_AVL_COMMS_PLAN: CommsPlan = {
  id: 'avl-2026-commsplan',
  year: 2026,
  festivalName: 'Aivovammaliitto',
  festivalDates: '',
  summary:
    'Aivovammaliiton viestintästrategia 2026–2030. Viestintä on keskeinen osa liiton perustehtävää, ' +
    'vaikuttamistyötä sekä asiakas- ja jäsenpalvelua. Strategia rakentuu kolmen tavoitteen varaan: ' +
    'Kukaan ei jää yksin, Ennakoiva asiantuntija ja yhteistyötaho sekä Näkymätön näkyväksi. ' +
    'Vuoden 2026 painopisteinä ovat brändi- ja verkkosivu-uudistus, aivovammatietoisuuden kuukausi (maaliskuu), ' +
    'Aivoviikko, Aivovammaviikko (marraskuu) sekä neljä Aivoitus-lehden numeroa.',

  mission:
    'Aivovammaliitto edistää aivovamman, aivoverenkiertohäiriön tai muun aivovaurion saaneiden ihmisten ' +
    'sekä heidän läheistensä hyvinvointia, osallisuutta ja yhdenvertaisuutta yhteiskunnassa. Lisäksi ' +
    'liitto tukee ammattilaisia, jotka kohtaavat työssään aivovaurion kokeneita ihmisiä. Viestintämme ' +
    'on saavutettavaa, selkeää, vuorovaikutteista, oikea-aikaista, luotettavaa, yhdenvertaista ja kohderyhmälähtöistä.',

  visitorGoal: 0,
  visitorBaseline: 0,
  volunteerGoal: 0,
  volunteerBaseline: 0,

  responsibleMemberId: 'pia',
  responsibleTeamId: 'viestinta',
  activeFrom: '2026-01-01',
  visualIdentityDeadline: '2026-06-30',
  kickoffNote:
    'Viestintävastaava Pia Kilpeläinen koordinoi viestinnän toiminnanjohtajan (Päivi Hakkarainen) ja ' +
    'viestinnän työntekijöiden (Anton Baer, Jani Saarinen) kanssa. Brändi- ja verkkosivu-uudistus ' +
    'käynnistyy alkuvuodesta — saavutettavuus, kohderyhmälähtöisyys ja päivitetty graafinen ilme keskiössä.',

  strategicMoves: [
    {
      id: 'avl-move-1',
      order: 1,
      title: 'Kukaan ei jää yksin',
      tagline: 'Tieto, vertaistuki ja osallisuus matalalla kynnyksellä.',
      description:
        'Viestintä tarjoaa tietoa, vertaistukea ja osallisuuden kokemuksia aivovaurion kokeneille ja ' +
        'heidän läheisilleen matalalla kynnyksellä sekä akuutti- että sopeutumisvaiheissa. Viestintä auttaa ' +
        'löytämään palveluiden, tuen ja vertaistukiyhteisöjen piiriin.',
      icon: '◉',
      color: '#056b9f',
    },
    {
      id: 'avl-move-2',
      order: 2,
      title: 'Ennakoiva asiantuntija ja yhteistyötaho',
      tagline: 'Luotettava asiantuntija julkisessa keskustelussa ja verkostoissa.',
      description:
        'Aivovammaliitto näkyy luotettavana asiantuntijana julkisessa keskustelussa ja ammattilaisten ' +
        'verkostoissa. Viestintä lisää tietoa aivovaurioista, kuntoutuksesta, ennaltaehkäisystä ja aivoterveydestä.',
      icon: '▶',
      color: '#185e5b',
    },
    {
      id: 'avl-move-3',
      order: 3,
      title: 'Näkymätön näkyväksi',
      tagline: 'Ymmärrystä näkymättömistä oireista, vähemmän stigmaa.',
      description:
        'Viestintä lisää ymmärrystä aivovaurioiden näkymättömistä oireista, vähentää stigmaa ja vahvistaa ' +
        'yhdenvertaisuutta yhteiskunnassa.',
      icon: '★',
      color: '#e45c81',
    },
  ],

  kpis: [],

  audienceMix: [
    {
      id: 'avl-aud-1',
      label: 'Aivovaurion kokeneet ihmiset',
      weight2025: 35,
      weight2026: 35,
      trend: 'flat',
      description:
        'Aivovamman, aivoverenkiertohäiriön tai muun aivovaurion (mm. aivokuume, aivokasvaimen jälkitila) ' +
        'saaneet ihmiset — sekä akuutti- että sopeutumisvaiheissa.',
    },
    {
      id: 'avl-aud-2',
      label: 'Läheiset',
      weight2025: 20,
      weight2026: 20,
      trend: 'flat',
      description:
        'Aivovaurion kokeneiden läheiset: puolisot, vanhemmat, sisarukset, ystävät ja muut tukihenkilöt.',
    },
    {
      id: 'avl-aud-3',
      label: 'Paikallisyhdistykset ja jäsenet',
      weight2025: 20,
      weight2026: 20,
      trend: 'flat',
      description:
        'Paikallisyhdistykset ja niiden jäsenet — vertaistuen ja järjestötoiminnan ytimessä.',
    },
    {
      id: 'avl-aud-4',
      label: 'Sosiaali- ja terveysalan ammattilaiset',
      weight2025: 20,
      weight2026: 25,
      trend: 'up',
      description:
        'Aivovaurion kokeneita työssään kohtaavat ammattilaiset. Vuonna 2026 kohderyhmä laajenee ja ' +
        'saa enemmän painoarvoa — heidän asiantuntemustaan hyödynnetään myös koulutuksissa ja sisällöissä.',
    },
  ],

  brandPillars: [
    {
      id: 'avl-pillar-inhimillinen',
      title: 'Inhimillinen',
      subtitle: 'Human',
      description:
        'Viestimme ymmärrettävästi, empaattisesti ja helposti lähestyttävästi. Kohtaamme ihmiset ' +
        'yksilöinä ja kunnioitamme erilaisia elämäntilanteita ja -kokemuksia.',
    },
    {
      id: 'avl-pillar-asiantunteva',
      title: 'Asiantunteva',
      subtitle: 'Expert',
      description:
        'Tarjoamme ajankohtaista, tutkittuun tietoon perustuvaa luotettavaa sisältöä. Toimimme aktiivisesti ' +
        'yhteistyössä ammattilaisten, tutkijoiden ja verkostojen kanssa.',
    },
    {
      id: 'avl-pillar-oikeudenmukainen',
      title: 'Oikeudenmukainen',
      subtitle: 'Just',
      description:
        'Viestintämme on saavutettavaa, avointa ja yhdenvertaista. Huomioimme eri kohderyhmien tarpeet, ' +
        'toimintakyvyn ja viestinnälliset erityistarpeet.',
    },
    {
      id: 'avl-pillar-rohkea',
      title: 'Rohkea',
      subtitle: 'Brave',
      description:
        'Nostamme esiin epäkohtia, vaikutamme yhteiskunnalliseen keskusteluun ja puolustamme aktiivisesti ' +
        'kohderyhmämme oikeuksia. Teemme näkymättömät oireet näkyviksi.',
    },
  ],

  milestones: [
    { id: 'avl-ms-1',  title: 'Aivoitus 1/2026: STOP väkivallalle ilmestyy', date: '2026-02-15', ownerId: 'pia',   status: 'upcoming', category: 'publish', description: 'Vuoden ensimmäinen Aivoitus-lehti — teema: STOP väkivallalle.' },
    { id: 'avl-ms-2',  title: 'Tapaturmapäivä 13.2.',                          date: '2026-02-13', ownerId: 'jani',  status: 'upcoming', category: 'publish', description: 'Some-nostot ja viestit tapaturmien ehkäisystä.' },
    { id: 'avl-ms-3',  title: 'Aivovammatietoisuuden kuukausi + Aivoviikko',   date: '2026-03-01', ownerId: 'pia',   status: 'upcoming', category: 'launch',  description: 'Maaliskuun pääkampanja: Näe näkymätön. 4 kokemustarinaa, webinaari (Jaana Sarajuuri), lähiluento.' },
    { id: 'avl-ms-4',  title: '26.3. AVH-ensitietopäivä OYSissa',              date: '2026-03-26', ownerId: 'pia',   status: 'upcoming', category: 'production', description: 'Ensitietopäivä OYSissa klo 12–16.' },
    { id: 'avl-ms-5',  title: 'Kippistä kohtuudella — vappuviikko',            date: '2026-04-27', ownerId: 'jani',  status: 'upcoming', category: 'launch',  description: 'Ennaltaehkäisykampanja vappuviikolla.' },
    { id: 'avl-ms-6',  title: 'Aivoitus 2/2026: Aivoterveyden asialla',        date: '2026-05-15', ownerId: 'pia',   status: 'upcoming', category: 'publish', description: 'Aivoitus-lehden 2/2026 ilmestyminen.' },
    { id: 'avl-ms-7',  title: '20.5. AVH-ensitietopäivä OYSissa',              date: '2026-05-20', ownerId: 'pia',   status: 'upcoming', category: 'production', description: 'Ensitietopäivä OYSissa.' },
    { id: 'avl-ms-8',  title: 'Aivoitus 3 aineistopäivä',                      date: '2026-07-27', ownerId: 'pia',   status: 'upcoming', category: 'production', description: 'Aivoitus 3:n aineistopäivä — juttujen kirjoitus käyntiin.' },
    { id: 'avl-ms-9',  title: 'Aivoitus 3 taittoon',                           date: '2026-08-06', ownerId: 'pia',   status: 'upcoming', category: 'production', description: 'Aivoitus 3 taittoon.' },
    { id: 'avl-ms-10', title: 'Aivoitus 3/2026: Elämän rytmi ilmestyy',        date: '2026-08-25', ownerId: 'pia',   status: 'upcoming', category: 'publish', description: 'Elokuun loppupuolella.' },
    { id: 'avl-ms-11', title: '18.9. Aivotärähdystietoisuuden päivä',          date: '2026-09-18', ownerId: 'pia',   status: 'upcoming', category: 'launch',  description: 'Uutinen, some, lehdistötiedote — materiaalia Lauralta.' },
    { id: 'avl-ms-12', title: '29.10. Maailman AVH-päivä',                     date: '2026-10-29', ownerId: 'pia',   status: 'upcoming', category: 'launch',  description: 'Webinaari afasiasta (Pirjo Laine) + nostot ja lehdistötiedotteet.' },
    { id: 'avl-ms-13', title: 'Aivoitus 4 aineistopäivä',                      date: '2026-10-26', ownerId: 'pia',   status: 'upcoming', category: 'production', description: 'Aivoitus 4 (Toivoa tulevaan) — aineistopäivä.' },
    { id: 'avl-ms-14', title: 'Aivovammaviikko vk 46',                         date: '2026-11-09', ownerId: 'pia',   status: 'upcoming', category: 'festival', description: '9.–15.11. Aivovammaviikko — somekampanja, webinaari, tapahtumat.' },
    { id: 'avl-ms-15', title: '13.11. Tapaturmapäivä',                         date: '2026-11-13', ownerId: 'jani',  status: 'upcoming', category: 'publish', description: 'Tapaturmapäivän nostot.' },
    { id: 'avl-ms-16', title: 'Aivoitus 4/2026: Toivoa tulevaan ilmestyy',     date: '2026-11-15', ownerId: 'pia',   status: 'upcoming', category: 'publish', description: 'Vuoden viimeinen Aivoitus.' },
  ],

  monthTargets: [
    { month: 1,  postsMin: 12, postsMax: 18, channels: ['Facebook', 'Instagram', 'LinkedIn', 'Uutiskirje', 'Jäsenkirje'],                       focus: 'Vuoden tarjonta ammattilaisille + brändi- ja verkkosivu-uudistuksen käynnistys',  intensity: 'medium' },
    { month: 2,  postsMin: 16, postsMax: 22, channels: ['Facebook', 'Instagram', 'LinkedIn', 'TikTok', 'Aivoitus-lehti', 'Uutiskirje'],         focus: 'STOP väkivallalle (Aivoitus 1/26) + Tapaturmapäivä 13.2. + kokemustiedon viikko',  intensity: 'high' },
    { month: 3,  postsMin: 22, postsMax: 30, channels: ['Facebook', 'Instagram', 'LinkedIn', 'TikTok', 'Lehdistötiedotteet', 'Uutiskirje', 'Jäsenkirje'], focus: 'Aivovammatietoisuuden kuukausi + Aivoviikko — Näe näkymätön (4 kokemustarinaa, webinaari, kannanotto)', intensity: 'peak' },
    { month: 4,  postsMin: 14, postsMax: 20, channels: ['Facebook', 'Instagram', 'LinkedIn', 'YouTube', 'Lehdistötiedotteet', 'Jäsenkirje'],    focus: 'Aivoitus 2 taittoon + Kippistä kohtuudella vappuviikolla + vesiturvallisuuswebinaari',  intensity: 'high' },
    { month: 5,  postsMin: 12, postsMax: 18, channels: ['Facebook', 'Instagram', 'LinkedIn', 'Aivoitus-lehti', 'Uutiskirje', 'Jäsenkirje'],     focus: 'Aivoitus 2 ilmestyy + AVH-/aivoterveysluento + ensitietopäivät',  intensity: 'medium' },
    { month: 6,  postsMin: 6,  postsMax: 10, channels: ['Facebook', 'Instagram', 'LinkedIn', 'Uutiskirje', 'Jäsenkirje'],                       focus: 'Kesän hiljaisempi tahti — Aivoitus 3 haastattelut ennen kesälomia',                   intensity: 'low' },
    { month: 7,  postsMin: 4,  postsMax: 8,  channels: ['Facebook', 'Instagram', 'LinkedIn'],                                                    focus: 'Aivoitus 3 aineistopäivä 27.7. — kirjoitus käyntiin',                                  intensity: 'low' },
    { month: 8,  postsMin: 10, postsMax: 16, channels: ['Facebook', 'Instagram', 'LinkedIn', 'Aivoitus-lehti', 'Uutiskirje', 'Jäsenkirje'],     focus: 'Aivoitus 3 taittoon 6.8., ilmestyy elokuun loppupuolella',                             intensity: 'medium' },
    { month: 9,  postsMin: 12, postsMax: 18, channels: ['Facebook', 'Instagram', 'LinkedIn', 'Lehdistötiedotteet', 'Jäsenkirje'],               focus: 'Aivotärähdystietoisuuden päivä 18.9. + yhteiset webinaarit Migreeniyhdistyksen kanssa',  intensity: 'medium' },
    { month: 10, postsMin: 18, postsMax: 26, channels: ['Facebook', 'Instagram', 'LinkedIn', 'TikTok', 'Lehdistötiedotteet', 'Uutiskirje'],     focus: 'AVH-tietoisuuden kuukausi — Maailman AVH-päivä 29.10. + Aivoitus 4 haastattelut',     intensity: 'peak' },
    { month: 11, postsMin: 20, postsMax: 28, channels: ['Facebook', 'Instagram', 'LinkedIn', 'TikTok', 'Aivoitus-lehti', 'Lehdistötiedotteet', 'Jäsenkirje'], focus: 'Aivovammaviikko vk 46 (9.–15.11.) + Aivoitus 4 ilmestyy + Tapaturmapäivä 13.11.',     intensity: 'peak' },
    { month: 12, postsMin: 10, postsMax: 16, channels: ['Facebook', 'Instagram', 'LinkedIn', 'Uutiskirje'],                                     focus: 'Vuoden koonti / joulukalenteri + teemapäivät (3.12., 5.12., 6.12.) + Aivoitus 4 -nostot', intensity: 'medium' },
  ],

  phases: [
    { id: 'avl-phase-1', order: 1, title: 'Vuosi käyntiin — STOP väkivallalle',         months: 'Tammi–helmikuu', monthRange: [1, 2],   focus: 'Tarjonta ammattilaisille, brändi- ja verkkosivu-uudistuksen käynnistys, Aivoitus 1, Tapaturmapäivä, kokemustiedon viikko.', channels: 'Aivoitus-lehti, some, uutiskirje, jäsenkirje, koulut ja ensitietopäivät' },
    { id: 'avl-phase-2', order: 2, title: 'Aivovammatietoisuuden kuukausi — Näe näkymätön', months: 'Maaliskuu',   monthRange: [3],      focus: 'Aivoviikko, 4 kokemustarinaa, webinaari, lähiluento, kannanotto rahoituksesta, lehdistötiedotteet, AVH-ensitietopäivä.', channels: 'Some, lehdistö, netti-Aivoitus, webinaari, jäsen- ja yhdistystiedote' },
    { id: 'avl-phase-3', order: 3, title: 'Aivoitus 2 + ennaltaehkäisy',                months: 'Huhti–toukokuu', monthRange: [4, 5],   focus: 'Aivoitus 2 (Aivoterveyden asialla), Kippistä kohtuudella vappuviikolla, kevätliittokokous + kannanotto, ensitietopäivät, vesiturvallisuuswebinaari YouTubeen.', channels: 'Aivoitus-lehti, some, YouTube, lehdistö, jäsenkirje' },
    { id: 'avl-phase-4', order: 4, title: 'Kesä — taustatyö ja Aivoitus 3',             months: 'Kesä–heinäkuu', monthRange: [6, 7],   focus: 'Kevyempi rytmi. Aivoitus 3 (Elämän rytmi) haastattelut ennen lomia, aineistopäivä 27.7.',  channels: 'Some (ajastettu), uutiskirje, jäsenkirje' },
    { id: 'avl-phase-5', order: 5, title: 'Aivoitus 3 ja syksyn käynnistys',            months: 'Elo–syyskuu',   monthRange: [8, 9],   focus: 'Aivoitus 3 taittoon 6.8., ilmestyy elokuun loppupuolella. Aivotärähdystietoisuuden päivä 18.9. ja Migreeniyhdistys-yhteistyö.', channels: 'Aivoitus-lehti, some, lehdistö, webinaari, jäsenkirje' },
    { id: 'avl-phase-6', order: 6, title: 'AVH-tietoisuuden kuukausi + Aivovammaviikko', months: 'Loka–marraskuu', monthRange: [10, 11], focus: 'Maailman AVH-päivä 29.10., webinaari afasiasta (Pirjo Laine), Syysliittokokous, Aivoitus 4 haastattelut + aineistopäivä 26.10. Aivovammaviikko vk 46 ja Aivoitus 4 ilmestyy.', channels: 'Some, lehdistö, netti-Aivoitus, Aivoitus-lehti, webinaari, jäsenkirje' },
    { id: 'avl-phase-7', order: 7, title: 'Vuoden päätös ja koonti',                    months: 'Joulukuu',       monthRange: [12],     focus: 'Teemapäivät (3.12., 5.12., 6.12.), Aivoitus 4 -nostot, vuoden koonti / joulukalenteri, tervehdykset.', channels: 'Some, uutiskirje, jäsenkirje' },
  ],

  campaigns: [
    { id: 'avl-camp-1',  order: 1,  title: 'STOP väkivallalle (Aivoitus 1)',         type: 'brand-storytelling', audience: 'Aivovaurion kokeneet, läheiset, ammattilaiset, suuri yleisö', channels: ['Aivoitus-lehti', 'Facebook', 'Instagram', 'LinkedIn', 'Lehdistötiedotteet'], formats: ['Lehtinumero', 'Kokemustarina', 'Some-nostot'], tone: 'Rohkea, asiantunteva', phaseId: 'avl-phase-1', note: 'Aivoitus 1/26 — vuoden ensimmäinen lehtinumero ja teema.' },
    { id: 'avl-camp-2',  order: 2,  title: 'Pysy pystyssä',                          type: 'brand-awareness',    audience: 'Suuri yleisö, ikäihmiset',                          channels: ['Facebook', 'Instagram', 'TikTok', 'LinkedIn'],                              formats: ['Some-video', 'Kasvokuvat (Annina Hakala)'], tone: 'Inhimillinen, rohkaiseva', phaseId: 'avl-phase-1', note: 'Kampanjan kasvona Annina Hakala.' },
    { id: 'avl-camp-3',  order: 3,  title: 'Kohderyhmän laajentuminen (3 AVH-videota)', type: 'audience-expansion', audience: 'AVH:n kokeneet, läheiset, ammattilaiset',         channels: ['Facebook', 'Instagram', 'YouTube', 'LinkedIn'],                             formats: ['Video', 'Some-nosto'], tone: 'Inhimillinen, asiantunteva', phaseId: 'avl-phase-1', note: 'Helmikuussa kuvattu 3 AVH-videota — julkaisuaikataulu erikseen, mahdollisesti maksettua some-markkinointia.' },
    { id: 'avl-camp-4',  order: 4,  title: 'Aivovammatietoisuuden kuukausi — Näe näkymätön', type: 'brand-awareness', audience: 'Suuri yleisö, ammattilaiset, päättäjät',         channels: ['Facebook', 'Instagram', 'LinkedIn', 'TikTok', 'Lehdistötiedotteet', 'Nettisivut'], formats: ['Kokemustarinat (4 kpl)', 'Video', 'Webinaari', 'Lehdistötiedote'], tone: 'Rohkea, inhimillinen', phaseId: 'avl-phase-2', note: 'Maaliskuun pääkampanja — myös Aivoviikko.' },
    { id: 'avl-camp-5',  order: 5,  title: 'Kannanotto rahoituksesta',               type: 'brand-awareness',    audience: 'Media, kansanedustajat, päättäjät',                  channels: ['Lehdistötiedotteet', 'LinkedIn'],                                          formats: ['Räätälöity kannanotto'], tone: 'Rohkea, asiantunteva', phaseId: 'avl-phase-2', note: 'Räätälöity medialle ja kansanedustajille.' },
    { id: 'avl-camp-6',  order: 6,  title: 'Pyöräilykypärä',                          type: 'brand-awareness',    audience: 'Suuri yleisö, pyöräilijät',                          channels: ['Facebook', 'Instagram', 'TikTok', 'Lehdistötiedotteet'],                    formats: ['Some-tietoisku', 'Tiedote'], tone: 'Asiantunteva, kannustava', phaseId: 'avl-phase-3', note: 'Valmistelu maaliskuussa, toteutus huhtikuussa.' },
    { id: 'avl-camp-7',  order: 7,  title: 'Aivoitus 2: Aivoterveyden asialla',      type: 'brand-storytelling', audience: 'Aivovaurion kokeneet, läheiset, ammattilaiset',     channels: ['Aivoitus-lehti', 'Facebook', 'Instagram', 'LinkedIn'],                      formats: ['Lehtinumero', 'Tiiserit someen'], tone: 'Asiantunteva, inhimillinen', phaseId: 'avl-phase-3', note: 'Tiisereitä lehdestä someen.' },
    { id: 'avl-camp-8',  order: 8,  title: 'Kippistä kohtuudella',                   type: 'brand-awareness',    audience: 'Suuri yleisö',                                       channels: ['Facebook', 'Instagram', 'LinkedIn', 'TikTok', 'Lehdistötiedotteet'],         formats: ['Tapahtumat', 'Some-nostot', 'Tiedote', 'Vapputervehdys'], tone: 'Inhimillinen, kannustava', phaseId: 'avl-phase-3', note: 'Vappua edeltävä viikko.' },
    { id: 'avl-camp-9',  order: 9,  title: 'Vesiturvallisuus (YouTube)',             type: 'brand-awareness',    audience: 'Suuri yleisö',                                       channels: ['YouTube', 'Facebook', 'Instagram', 'LinkedIn'],                             formats: ['Webinaaritallenne tekstitettynä'], tone: 'Asiantunteva, kannustava', phaseId: 'avl-phase-3', note: 'Edellisvuoden vesiturvallisuuswebinaari tekstitettynä YouTubeen.' },
    { id: 'avl-camp-10', order: 10, title: 'Aivoitus 3: Elämän rytmi',               type: 'brand-storytelling', audience: 'Aivovaurion kokeneet, läheiset',                    channels: ['Aivoitus-lehti', 'Facebook', 'Instagram', 'LinkedIn'],                      formats: ['Lehtinumero', 'Some-nostot'], tone: 'Inhimillinen, asiantunteva', phaseId: 'avl-phase-5', note: 'Aineistopäivä 27.7., taittoon 6.8., ilmestyy elokuun loppupuolella.' },
    { id: 'avl-camp-11', order: 11, title: 'Aivotärähdys (18.9.)',                   type: 'brand-awareness',    audience: 'Suuri yleisö, urheiluyhteisöt, ammattilaiset',       channels: ['Facebook', 'Instagram', 'LinkedIn', 'Lehdistötiedotteet'],                  formats: ['Uutinen', 'Some-nostot', 'Tiedote'], tone: 'Asiantunteva', phaseId: 'avl-phase-5', note: 'Materiaalia Lauralta.' },
    { id: 'avl-camp-12', order: 12, title: 'Maailman AVH-päivä 29.10.',              type: 'brand-awareness',    audience: 'AVH:n kokeneet, läheiset, ammattilaiset, suuri yleisö', channels: ['Facebook', 'Instagram', 'LinkedIn', 'Lehdistötiedotteet'],                 formats: ['Webinaari (Pirjo Laine, afasia)', 'Some-nostot', 'Lehdistötiedotteet'], tone: 'Asiantunteva, inhimillinen', phaseId: 'avl-phase-6', note: 'Teema lukitaan myöhemmin.' },
    { id: 'avl-camp-13', order: 13, title: 'Aivovammaviikko vk 46',                  type: 'brand-storytelling', audience: 'Aivovaurion kokeneet, läheiset, suuri yleisö',       channels: ['Facebook', 'Instagram', 'LinkedIn', 'TikTok', 'Lehdistötiedotteet'],         formats: ['2 kokemustarinaa', '2 teemajulkaisua', 'Tapahtumat', 'Webinaari'], tone: 'Rohkea, inhimillinen', phaseId: 'avl-phase-6', note: '9.–15.11. Painotus näkymättömissä oireissa, kohtaaminen, läheisten rooli, aivoterveys. Webinaari läheisten tukemisesta (Julia Lindlöf / Inkeri Hutri).' },
    { id: 'avl-camp-14', order: 14, title: 'Aivoitus 4: Toivoa tulevaan',            type: 'brand-storytelling', audience: 'Aivovaurion kokeneet, läheiset, ammattilaiset',     channels: ['Aivoitus-lehti', 'Facebook', 'Instagram', 'LinkedIn'],                      formats: ['Lehtinumero', 'Netti-Aivoitus', 'Some-nostot'], tone: 'Toiveikas, inhimillinen', phaseId: 'avl-phase-6', note: 'Aineistopäivä 26.10., ilmestyy marraskuussa.' },
    { id: 'avl-camp-15', order: 15, title: 'Vuoden koonti / joulukalenteri',         type: 'post-event',         audience: 'Jäsenet, suuri yleisö',                              channels: ['Facebook', 'Instagram', 'LinkedIn', 'Uutiskirje'],                          formats: ['Some-koonti tai joulukalenteri', 'Tervehdys'], tone: 'Lämmin, inhimillinen', phaseId: 'avl-phase-7' },
  ],

  channelMatrix: [
    { id: 'avl-ch-aivoitus',     name: 'Aivoitus-lehti',         function: 'Pääjulkaisu — kokemustarinat, asiantuntijatieto, teema per numero', frequency: '4 numeroa / vuosi (helmi, touko, elo, marras)', primaryAudience: 'Jäsenet, ammattilaiset, läheiset', responsible: 'Pia Kilpeläinen (päätoimittaja)' },
    { id: 'avl-ch-netti',        name: 'Netti-Aivoitus',          function: 'Aivoitus-juttujen verkkoversio + ajankohtaiset',                    frequency: 'Jatkuva',                                       primaryAudience: 'Suuri yleisö, kohderyhmä',         responsible: 'Pia Kilpeläinen' },
    { id: 'avl-ch-fb',           name: 'Facebook',                function: 'Pääsomekanava — kokemustarinat, ajankohtaiset, tapahtumat',         frequency: '3–5/vk',                                        primaryAudience: 'Kohderyhmä, läheiset, jäsenet',     responsible: 'Jani Saarinen' },
    { id: 'avl-ch-ig',           name: 'Instagram',               function: 'Visuaalinen tarinankerronta, Reels, Stories',                       frequency: '2–4/vk',                                        primaryAudience: 'Nuorempi yleisö, kohderyhmä',       responsible: 'Jani Saarinen' },
    { id: 'avl-ch-li',           name: 'LinkedIn',                function: 'Asiantuntijuus, vaikuttaminen, ammattilaiset',                      frequency: '1–2/vk',                                        primaryAudience: 'Ammattilaiset, päättäjät, media',   responsible: 'Päivi Hakkarainen' },
    { id: 'avl-ch-tt',           name: 'TikTok',                  function: 'Lyhyet kampanjavideot, tietoiskut',                                  frequency: 'Kampanjoittain',                                 primaryAudience: 'Nuorempi yleisö',                    responsible: 'Jani Saarinen' },
    { id: 'avl-ch-yt',           name: 'YouTube',                  function: 'Webinaarit, haastattelut, kampanjavideot — tekstitettynä',          frequency: 'Kampanjoittain',                                 primaryAudience: 'Kohderyhmä, ammattilaiset',         responsible: 'Anton Baer' },
    { id: 'avl-ch-www',          name: 'aivovammaliitto.fi',       function: 'Liiton pääsivusto — tieto, palvelut, ajankohtaiset',                frequency: 'Jatkuva päivitys',                               primaryAudience: 'Kaikki kohderyhmät',                 responsible: 'Anton Baer + Pia Kilpeläinen', isNew2026: true },
    { id: 'avl-ch-uutiskirje',   name: 'Uutiskirje',              function: 'Ammattilaiset ja sidosryhmät — ajankohtaiset, kampanjat',           frequency: 'Noin kerran kuussa',                             primaryAudience: 'Ammattilaiset, sidosryhmät',         responsible: 'Pia Kilpeläinen' },
    { id: 'avl-ch-jasenkirje',   name: 'Jäsenkirje',              function: 'Jäsenet — yhdistystoiminta, edut, tapahtumat',                       frequency: 'Noin kerran kuussa',                             primaryAudience: 'Jäsenet, paikallisyhdistykset',     responsible: 'Pia Kilpeläinen' },
    { id: 'avl-ch-lehdisto',     name: 'Lehdistötiedotteet',      function: 'Vaikuttaminen, mediasuhteet — STT:n kautta tarvittaessa',           frequency: 'Tarpeen mukaan + teemapäivät',                   primaryAudience: 'Media',                              responsible: 'Päivi Hakkarainen' },
    { id: 'avl-ch-esitteet',     name: 'Esitteet',                function: 'Painettu materiaali — ensitietopäivät, tapahtumat, ammattilaiset',  frequency: 'Päivitys vuosittain',                            primaryAudience: 'Kohderyhmä, ammattilaiset',         responsible: 'Anton Baer' },
    { id: 'avl-ch-webinaarit',   name: 'Webinaarit',              function: 'Asiantuntijaluennot — Aivoviikko, AVH-päivä, läheisten tuki, Migreeniyhdistys',  frequency: 'Kampanjoittain',                                 primaryAudience: 'Kohderyhmä, ammattilaiset',         responsible: 'Pia Kilpeläinen' },
    { id: 'avl-ch-koulutukset',  name: 'Koulutukset ja koululuennot', function: 'Koululaiset, opettajat, ammattilaiset — ennaltaehkäisy ja tieto', frequency: 'Pyyntöjen mukaan',                               primaryAudience: 'Koululaiset, ammattilaiset',         responsible: 'Pia Kilpeläinen' },
  ],

  contentPillars: [
    { id: 'avl-cp-1', label: 'Kokemustarinat',        weekday: 'Ma', platforms: ['Facebook', 'Instagram', 'Aivoitus-lehti'],     ownerRole: 'Sisällöntuottaja',  description: 'Aivovaurion kokeneiden ja läheisten omat tarinat — voimaannuttavia ja vertaistukea tarjoavia.' },
    { id: 'avl-cp-2', label: 'Asiantuntijatieto',     weekday: 'Ke', platforms: ['LinkedIn', 'Facebook', 'Nettisivut'],            ownerRole: 'Viestintävastaava', description: 'Tutkittuun tietoon perustuvaa sisältöä — kuntoutus, ennaltaehkäisy, aivoterveys.' },
    { id: 'avl-cp-3', label: 'Vaikuttaminen ja kannanotot', weekday: 'To', platforms: ['LinkedIn', 'Lehdistötiedotteet'],            ownerRole: 'Toiminnanjohtaja',  description: 'Yhteiskunnallinen keskustelu, kuntoutusoikeudet, rahoitus, päättäjien suuntaan viestiminen.' },
    { id: 'avl-cp-4', label: 'Tapahtumat ja webinaarit',    weekday: 'Ti', platforms: ['Facebook', 'Instagram', 'LinkedIn', 'Uutiskirje'], ownerRole: 'Viestintävastaava', description: 'Webinaarit, ensitietopäivät, lähiluennot, kampanjatapahtumat.' },
    { id: 'avl-cp-5', label: 'Aivoterveys ja ennaltaehkäisy', weekday: 'Pe', platforms: ['Facebook', 'Instagram', 'TikTok'],          ownerRole: 'Sisällöntuottaja',  description: 'Pyöräilykypärä, Kippistä kohtuudella, vesiturvallisuus, tapaturmien ehkäisy.' },
    { id: 'avl-cp-6', label: 'Näkymätön näkyväksi',   weekday: 'La', platforms: ['Facebook', 'Instagram', 'TikTok'],                ownerRole: 'Sisällöntuottaja',  description: 'Näkymättömät oireet, kohtaaminen, stigman vähentäminen.' },
  ],

  channels: ['Facebook', 'Instagram', 'LinkedIn', 'TikTok', 'YouTube', 'Nettisivut', 'Uutiskirje', 'Jäsenkirje', 'Aivoitus-lehti', 'Lehdistötiedotteet', 'Esitteet'],
  updatedAt: 0,
};
