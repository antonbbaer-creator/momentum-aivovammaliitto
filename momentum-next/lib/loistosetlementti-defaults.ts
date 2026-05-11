// Loistosetlementti ry — org-kohtaiset oletusarvot.
// Järjestötoiminta — käytetään AVL:n tyyliä pohjana (jatkuva viestintätyö,
// ei tapahtumatuotantoa). Tiimi ja yearwheel täytetään käyttöliittymässä.

import type { OrgTeam, OrgTeamMember } from './team-shared';
import type { CommsPlan } from './comms-plan-shared';
import type { YearPhase } from './yearwheel-shared';

export const DEFAULT_LOISTOSETLEMENTTI_TEAMS: OrgTeam[] = [
  {
    id: 'viestinta',
    name: 'Viestintätiimi',
    color: '#9b7cf6',
    icon: '▶',
    description: 'Viestinnän suunnittelu, toteutus ja kanavahallinta.',
    leadId: 'anna',
  },
  {
    id: 'momentum',
    name: 'Momentum-tiimi',
    color: '#2a8a86',
    icon: '◐',
    description: 'Momentum-alustan tekninen tuki ja kehitys.',
    leadId: 'anton',
  },
];

export const DEFAULT_LOISTOSETLEMENTTI_TEAM_MEMBERS: OrgTeamMember[] = [
  {
    id: 'anna',
    name: 'Anna Lahtonen',
    role: 'Viestinnän vastaava',
    teamId: 'viestinta',
    type: 'permanent',
    avatar: 'A',
    isManager: true,
    responsibilities: ['Viestinnän koordinointi', 'Kanavahallinta', 'Strategiaviestintä'],
    channels: ['Facebook', 'Instagram', 'LinkedIn', 'Nettisivut', 'Uutiskirje'],
  },
  {
    id: 'anton',
    name: 'Anton Baer',
    role: 'Tekninen tuki',
    teamId: 'momentum',
    type: 'external',
    avatar: 'A',
    email: 'anton@hetkicompany.com',
    linkedUserEmails: ['anton@hetkicompany.com', 'anton.baer@gmail.com'],
    responsibilities: ['Momentum-alustan tekninen tuki', 'Käyttöönotto ja koulutus'],
    channels: [],
  },
];

export const DEFAULT_LOISTOSETLEMENTTI_COMMS_PLAN: CommsPlan = {
  id: 'loistosetlementti-commsplan',
  year: 2026,
  festivalName: 'Loisto',
  festivalDates: '',
  summary:
    'Strategia 2026–2029. Loiston strategian ytimessä on ajatus siitä, että yksikään nuori ei jää yksin. Tavoitteena on rakentaa nuorille turvaa, toivoa ja toimijuutta maailmassa, joka tuntuu monelle epävarmalta ja kuormittavalta.',
  mission:
    'Nuoret ovat Loistossa rakentamassa turvallisia yhteisöjä, joissa he tulevat nähdyiksi, kuulluiksi ja kohdatuiksi. Visio: luoda yhteisöjä, joissa jokainen nuori voi kasvaa, vaikuttaa ja loistaa.',
  visitorGoal: 0,
  visitorBaseline: 0,
  volunteerGoal: 0,
  volunteerBaseline: 0,
  responsibleMemberId: 'anna',
  responsibleTeamId: 'viestinta',
  activeFrom: '2026-01-01',
  visualIdentityDeadline: '',
  kickoffNote:
    'Sosiaalisen nuorisotyön perustana sukupuoli-, kulttuuri- ja traumasensitiiviset työotteet. Viestinnässä korostuu saavutettavuus, monikielisyys ja nuorten oman äänen kuuluminen.',
  strategicMoves: [
    {
      id: 'osallisuus',
      order: 1,
      title: 'Osallisuuden vahvistuminen',
      tagline: 'Rinnalla kulkemista, läsnäoloa, kuuntelemista',
      description:
        'Nuoren arjen turva ja tulevaisuudenusko. Saavutettavuus, monikielinen viestintä, turvalliset ja esteettömät tilat sekä yhteistyö yksiköiden välillä.',
      icon: '◉',
      color: '#9b7cf6',
    },
    {
      id: 'moninaisuus',
      order: 2,
      title: 'Nuoren moninaiset mahdollisuudet',
      tagline: 'Jokainen nuori kohdataan omana itsenään',
      description:
        'Moninaisuus voimavarana. Yhdenvertaisuuden, saavutettavuuden ja osallisuuden periaatteet. Nuorten ääni näkyy toiminnan kehittämisessä, aitoja vaikuttamismahdollisuuksia.',
      icon: '▶',
      color: '#e45c81',
    },
    {
      id: 'vastuullisuus',
      order: 3,
      title: 'Vastuullinen vaikuttaminen',
      tagline: 'Kestävyysajattelu koko organisaatiossa',
      description:
        'Kestävyys ja vastuullisuus näkyvät päätöksenteossa, johtamisessa, taloudessa ja henkilöstörakenteissa. Ympäristöohjelma ja Ekokompassi, osaamisen vahvistaminen, työhyvinvointi, pitkäjänteinen talouden suunnittelu.',
      icon: '◆',
      color: '#2a8a86',
    },
    {
      id: 'kokeilut',
      order: 4,
      title: 'Rohkeat ja innovatiiviset kokeilut',
      tagline: 'Kokeilukulttuuri, yhdessä oppiminen, kumppanuudet',
      description:
        'Vastaa nopeasti muuttuvaan toimintaympäristöön. Uusia toimintamalleja ideoidaan, pilotoidaan ja testataan matalalla kynnyksellä. Digitaalisuus ja kumppanuudet keskiössä.',
      icon: '★',
      color: '#f1b434',
    },
  ],
  kpis: [],
  audienceMix: [],
  brandPillars: [
    {
      id: 'toivo',
      title: 'Toivo ja ilo',
      subtitle: 'Hope and joy',
      description:
        'Loistossa rakennetaan toivoa nuorille, jotka elävät epävarmassa ja kuormittavassa maailmassa. Ilo on osa kohtaamista.',
    },
    {
      id: 'yhteisollisyys',
      title: 'Yhteisöllisyys ja rinnalla kulkeminen',
      subtitle: 'Community and walking alongside',
      description:
        'Kohtaaminen, läsnäolo ja luottamuksen rakentaminen. Nuori ei jää yksin — joku kulkee rinnalla.',
    },
    {
      id: 'yhdenvertaisuus',
      title: 'Yhdenvertaisuus ja tasa-arvo',
      subtitle: 'Equity and equality',
      description:
        'Jokaisella nuorella on oikeus tulla kohdatuksi omana itsenään ja osallistua yhdenvertaisesti. Sukupuoli-, kulttuuri- ja traumasensitiiviset työotteet ohjaavat kohtaamisia.',
    },
  ],
  milestones: [],
  monthTargets: [],
  phases: [],
  campaigns: [],
  channelMatrix: [],
  contentPillars: [],
  channels: ['Facebook', 'Instagram', 'LinkedIn', 'Nettisivut', 'Uutiskirje', 'Sukupuolisensitiivisyys.fi', 'Tyttöjen Talo', 'Poikien Talo', 'Sua varten somessa'],
};

export const DEFAULT_LOISTOSETLEMENTTI_YEARWHEEL: YearPhase[] = [];
