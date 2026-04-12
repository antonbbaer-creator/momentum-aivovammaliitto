// AVL (Aivovammaliitto) — org-kohtaiset oletusarvot
// Tiimi ja rakenne seed-data.ts:n AVL_ORG.team-pohjalta

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

// ── AVL Vuosikello 2026 — viestinnän ja vaikuttamisen vaiheet ──

export const DEFAULT_AVL_YEARWHEEL: YearPhase[] = [
  {
    id: 'avl-yw1', name: 'Vuosisuunnittelu ja budjetointi', category: 'planning', team: 'hallinto',
    startMonth: 1, endMonth: 2, startDate: '2026-01-01', endDate: '2026-02-28',
    color: '#056b9f', icon: '◇',
    desc: 'Viestintasuunnitelman paivitys, STEA-raportointi edelliselta vuodelta, budjetin vahvistus.',
    tasks: [
      { id: 'avl-t1', text: 'Viestintasuunnitelma 2026 valmis', month: 1, done: true, owner: 'Pia Kilpelainen' },
      { id: 'avl-t2', text: 'STEA-raportti edelliselta vuodelta', month: 1, done: true, owner: 'Paivi Hakkarainen' },
      { id: 'avl-t3', text: 'Sisaltokalenterin pohja Q1', month: 1, done: true, owner: 'Jani Saarinen' },
    ],
  },
  {
    id: 'avl-yw2', name: 'Aivoitus 1/2026: Stop vakivallalle', category: 'production', team: 'viestinta',
    startMonth: 1, endMonth: 2, startDate: '2026-01-15', endDate: '2026-02-15',
    color: '#9b7cf6', icon: '▣',
    desc: 'Aivoitus-lehden 1/2026 numeron tuotanto ja jakelu. Teema: Stop vakivallalle.',
    tasks: [
      { id: 'avl-t4', text: 'Aivoitus 1/2026 materiaali valmis', month: 1, done: true, owner: 'Pia Kilpelainen' },
      { id: 'avl-t5', text: 'Painoon ja jakeluun', month: 2, done: true, owner: 'Pia Kilpelainen' },
    ],
  },
  {
    id: 'avl-yw3', name: 'Aivovammatietoisuuden kuukausi + Aivoviikko', category: 'execution', team: 'viestinta',
    startMonth: 3, endMonth: 3, startDate: '2026-03-01', endDate: '2026-03-31',
    color: '#e45c81', icon: '★',
    desc: 'Maaliskuu: aivovammatietoisuuden kuukausi. Aivoviikko vko 11 (Brain Awareness Week). Tietoisuuskampanja kaikissa kanavissa.',
    tasks: [
      { id: 'avl-t6', text: 'Aivoviikko-sisallot valmiina (FB, IG, TT)', month: 2, done: true, owner: 'Jani Saarinen' },
      { id: 'avl-t7', text: 'Aivoviikko-tapahtumat ja luennot', month: 3, done: true, owner: 'Pia Kilpelainen' },
      { id: 'avl-t8', text: 'Tietoisuuskampanja: nakymaton vamma', month: 3, done: true, owner: 'Jani Saarinen' },
      { id: 'avl-t9', text: 'Uutiskirje 2/2026', month: 3, done: true, owner: 'Pia Kilpelainen' },
    ],
  },
  {
    id: 'avl-yw4', name: 'Kippista kohtuudella -kampanja', category: 'execution', team: 'viestinta',
    startMonth: 4, endMonth: 4, startDate: '2026-04-13', endDate: '2026-04-30',
    color: '#f1b434', icon: '★',
    desc: 'Ennaltaehkaisykampanja EHYT ry:n kanssa ennen vappua. Alkoholin kohtuukaytto, aivovammojen ehkaisy.',
    tasks: [
      { id: 'avl-t10', text: 'Kampanjamateriaalit valmiina', month: 4, done: false, owner: 'Jani Saarinen' },
      { id: 'avl-t11', text: 'Tapahtumien koordinointi EHYT ry', month: 4, done: false, owner: 'Pia Kilpelainen' },
      { id: 'avl-t12', text: 'Jasenkirje huhtikuu', month: 4, done: false, owner: 'Pia Kilpelainen' },
    ],
  },
  {
    id: 'avl-yw5', name: 'Aivoitus 2/2026 + Selvana liikenteessa', category: 'production', team: 'viestinta',
    startMonth: 4, endMonth: 5, startDate: '2026-04-01', endDate: '2026-05-31',
    color: '#9b7cf6', icon: '▣',
    desc: 'Aivoitus-lehden 2/2026 (Aivoterveyden asialla) tuotanto. Selvana liikenteessa -kampanja toukokuussa.',
    tasks: [
      { id: 'avl-t13', text: 'Aivoitus 2/2026 materiaali valmis', month: 4, done: false, owner: 'Pia Kilpelainen' },
      { id: 'avl-t14', text: 'Selvana liikenteessa -sisallot', month: 5, done: false, owner: 'Jani Saarinen' },
      { id: 'avl-t15', text: 'Uutiskirje 3/2026', month: 5, done: false, owner: 'Pia Kilpelainen' },
    ],
  },
  {
    id: 'avl-yw6', name: 'Kesa: Elama jatkuu + vertaistukisisallot', category: 'production', team: 'viestinta',
    startMonth: 6, endMonth: 7, startDate: '2026-06-01', endDate: '2026-07-31',
    color: '#2a8a86', icon: '▣',
    desc: 'Kesan sisaltopainopiste: Elama jatkuu -tarinakampanja, vertaistukisisallot, Toivo-sovelluksen nosto. Kevyempi julkaisutahti.',
    tasks: [
      { id: 'avl-t16', text: 'Elama jatkuu -tarinat kesakaudelle', month: 6, done: false, owner: 'Jani Saarinen' },
      { id: 'avl-t17', text: 'Ajastettu kesa-sisalto (some)', month: 6, done: false, owner: 'Jani Saarinen' },
    ],
  },
  {
    id: 'avl-yw7', name: 'Aivoitus 3/2026: Elaman rytmi', category: 'production', team: 'viestinta',
    startMonth: 7, endMonth: 8, startDate: '2026-07-15', endDate: '2026-08-15',
    color: '#9b7cf6', icon: '▣',
    desc: 'Aivoitus-lehden 3/2026 numeron tuotanto. Teema: Elaman rytmi.',
    tasks: [
      { id: 'avl-t18', text: 'Aivoitus 3/2026 materiaali valmis', month: 7, done: false, owner: 'Pia Kilpelainen' },
      { id: 'avl-t19', text: 'Painoon ja jakeluun', month: 8, done: false, owner: 'Pia Kilpelainen' },
    ],
  },
  {
    id: 'avl-yw8', name: 'Syksy: vaikuttamisviestinta ja eduskuntavaalit', category: 'planning', team: 'hallinto',
    startMonth: 9, endMonth: 10, startDate: '2026-09-01', endDate: '2026-10-31',
    color: '#056b9f', icon: '◇',
    desc: 'Vaikuttamisviestinnan intensiteetti kasvaa: eduskuntavaalit 2027 lahestyvat. Kannanotot, lausunnot, kuntoutusoikeudet.',
    tasks: [
      { id: 'avl-t20', text: 'Vaikuttamisviestinnan avainviestit 2027', month: 9, done: false, owner: 'Paivi Hakkarainen' },
      { id: 'avl-t21', text: 'Kansanedustajatapaamisten suunnittelu', month: 9, done: false, owner: 'Paivi Hakkarainen' },
      { id: 'avl-t22', text: 'LinkedIn-kampanja: kuntoutusoikeudet', month: 10, done: false, owner: 'Paivi Hakkarainen' },
      { id: 'avl-t23', text: 'Uutiskirje 4/2026', month: 9, done: false, owner: 'Pia Kilpelainen' },
    ],
  },
  {
    id: 'avl-yw9', name: 'Aivoitus 4/2026: Toivoa tulevaan', category: 'production', team: 'viestinta',
    startMonth: 10, endMonth: 11, startDate: '2026-10-15', endDate: '2026-11-15',
    color: '#9b7cf6', icon: '▣',
    desc: 'Aivoitus-lehden 4/2026 numeron tuotanto. Teema: Toivoa tulevaan. Vuoden viimeinen numero.',
    tasks: [
      { id: 'avl-t24', text: 'Aivoitus 4/2026 materiaali valmis', month: 10, done: false, owner: 'Pia Kilpelainen' },
      { id: 'avl-t25', text: 'Painoon ja jakeluun', month: 11, done: false, owner: 'Pia Kilpelainen' },
    ],
  },
  {
    id: 'avl-yw10', name: 'Nettisivuuudistus ja saavutettavuus', category: 'production', team: 'viestinta',
    startMonth: 3, endMonth: 12, startDate: '2026-03-01', endDate: '2026-12-31',
    color: '#f09a52', icon: '▣',
    desc: 'Jatkuva projekti: aivovammaliitto.fi uudistus, digipalvelulain saavutettavuusvaatimukset (28.6.2025 kiristyneet). Erityisen tarkeaa kohderyhmalle.',
    tasks: [
      { id: 'avl-t26', text: 'Saavutettavuusauditointi', month: 3, done: false, owner: 'Anton Baer' },
      { id: 'avl-t27', text: 'Sisaltorakenne uudistettu', month: 6, done: false, owner: 'Anton Baer' },
      { id: 'avl-t28', text: 'Uudet sivut julkaistu', month: 10, done: false, owner: 'Anton Baer' },
    ],
  },
  {
    id: 'avl-yw11', name: 'Loppuvuoden raportointi ja 2027 suunnittelu', category: 'reflection', team: 'hallinto',
    startMonth: 11, endMonth: 12, startDate: '2026-11-15', endDate: '2026-12-31',
    color: '#185e5b', icon: '○',
    desc: 'Vuoden viestintatoimien arviointi, STEA-vaikuttavuusraportin valmistelu, 2027 viestintasuunnitelman pohja.',
    tasks: [
      { id: 'avl-t29', text: 'Kanavien vuosianalyysi', month: 11, done: false, owner: 'Jani Saarinen' },
      { id: 'avl-t30', text: 'STEA-raportin valmistelu', month: 12, done: false, owner: 'Paivi Hakkarainen' },
      { id: 'avl-t31', text: 'Viestintasuunnitelma 2027 pohja', month: 12, done: false, owner: 'Pia Kilpelainen' },
    ],
  },
];

// Minimaalinen tyhjä viestintäsuunnitelma AVL:lle — täytetään käyttöliittymässä
export const DEFAULT_AVL_COMMS_PLAN: CommsPlan = {
  id: 'avl-2026-commsplan',
  year: 2026,
  festivalName: 'Aivovammaliitto',
  festivalDates: '',
  summary: '',
  mission: 'Levitämme aivovauriotietoutta ja tuemme vertaisuutta niin, että jokainen aivovaurion kokenut ja läheinen saa tarvitsemansa tiedon ja tuen.',
  visitorGoal: 0,
  visitorBaseline: 0,
  volunteerGoal: 0,
  volunteerBaseline: 0,
  responsibleMemberId: 'pia',
  responsibleTeamId: 'viestinta',
  activeFrom: '2026-01-01',
  visualIdentityDeadline: '',
  kickoffNote: '',
  strategicMoves: [],
  kpis: [],
  audienceMix: [],
  brandPillars: [],
  milestones: [],
  monthTargets: [],
  phases: [],
  campaigns: [],
  channelMatrix: [],
  contentPillars: [],
  channels: ['Facebook', 'Instagram', 'LinkedIn', 'TikTok', 'YouTube', 'Nettisivut', 'Uutiskirje', 'Jäsenkirje', 'Aivoitus-lehti', 'Lehdistötiedotteet', 'Esitteet'],
  updatedAt: 0,
};
