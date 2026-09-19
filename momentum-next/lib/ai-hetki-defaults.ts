// AI-Hetki — itsenäinen tuotantoyhtiösimulaatio. Tiimi koostuu Claude-agenteista,
// jotka pyörivät Mac Minillä (elokuvastudio). Anton on studion omistaja ja
// kommentoi projekteja Studio-moduulissa.

import type { OrgTeam, OrgTeamMember } from './team-shared';
import type { CommsPlan } from './comms-plan-shared';
import type { YearPhase } from './yearwheel-shared';

export const DEFAULT_AI_HETKI_TEAMS: OrgTeam[] = [
  {
    id: 'studio',
    name: 'Studio',
    color: '#9b7cf6',
    icon: '✶',
    description: 'AI-Hetkin kehitys- ja käsikirjoitustiimi. Kuusi agenttia ja yksi ihminen.',
    leadId: 'anton',
  },
];

export const DEFAULT_AI_HETKI_TEAM_MEMBERS: OrgTeamMember[] = [
  {
    id: 'anton',
    name: 'Anton Baer',
    role: 'Studion omistaja',
    teamId: 'studio',
    type: 'permanent',
    avatar: 'A',
    email: 'anton@hetkicompany.com',
    linkedUserEmails: ['anton@hetkicompany.com', 'anton.baer@gmail.com', 'anton.b.baer@gmail.com'],
    isManager: true,
    responsibilities: ['Kommentoi projekteja', 'Antaa lähtökohtia', 'Päättää studion linjasta'],
  },
  { id: 'tuottaja',    name: 'Tuottaja',         role: 'Vastaava tuottaja ja studion johtaja', teamId: 'studio', type: 'permanent', avatar: 'T',
    responsibilities: ['Valitsee pitchit', 'Ohjeistaa kirjoittajan', 'Tekee lopullisen päätöksen'] },
  { id: 'kehitys',     name: 'Kehityspäällikkö', role: 'Kehityspäällikkö', teamId: 'studio', type: 'permanent', avatar: 'K',
    responsibilities: ['Kehittää pitchit', 'Seuraa studion muistia ja linjaa'] },
  { id: 'kirjoittaja', name: 'Käsikirjoittaja',  role: 'Käsikirjoittaja', teamId: 'studio', type: 'permanent', avatar: 'C',
    responsibilities: ['Treatment', 'Kohtausluettelo', 'Luonnokset Fountain-muodossa'] },
  { id: 'dramaturgi',  name: 'Dramaturgi',       role: 'Script editor', teamId: 'studio', type: 'permanent', avatar: 'D',
    responsibilities: ['Rakenne, henkilöt, teema', 'Palaute joka vaiheessa'] },
  { id: 'ohjaaja',     name: 'Ohjaaja',          role: 'Ohjaaja', teamId: 'studio', type: 'permanent', avatar: 'O',
    responsibilities: ['Kuvallinen ja tuotannollinen palaute'] },
  { id: 'lukija',      name: 'Lukija',           role: 'Ulkopuolinen lukija', teamId: 'studio', type: 'external', avatar: 'L',
    responsibilities: ['Lukijalausunto ensimmäisestä luonnoksesta'] },
];

export const DEFAULT_AI_HETKI_COMMS_PLAN: CommsPlan = {
  id: 'ai-hetki-commsplan',
  year: new Date().getFullYear(),
  festivalName: 'AI-Hetki',
  festivalDates: '',
  summary: '',
  mission: '',
  visitorGoal: 0,
  visitorBaseline: 0,
  volunteerGoal: 0,
  volunteerBaseline: 0,
  responsibleMemberId: 'anton',
  responsibleTeamId: 'studio',
  activeFrom: '',
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
  channels: [],
};

export const DEFAULT_AI_HETKI_YEARWHEEL: YearPhase[] = [];
