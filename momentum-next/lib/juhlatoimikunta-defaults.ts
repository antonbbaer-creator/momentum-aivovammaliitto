// Juhlatoimikunta — Sirpan 70v syntymapaivajahlien jarjestelytiimi
// Erillinen ja irrallinen tyotila Momentumissa

import { OrgTeam, OrgTeamMember } from './team-shared';
import type { CommsPlan } from './comms-plan-shared';
import type { YearPhase } from './yearwheel-shared';

export const DEFAULT_JUHLATOIMIKUNTA_TEAMS: OrgTeam[] = [
  {
    id: 'juhlatoimikunta',
    name: 'Juhlatoimikunta',
    color: '#9b7cf6',
    icon: '★',
    description: 'Sirpan 70-vuotisjuhlien jarjestelytiimi.',
    leadId: 'sonja',
  },
];

export const DEFAULT_JUHLATOIMIKUNTA_TEAM_MEMBERS: OrgTeamMember[] = [
  {
    id: 'sonja',
    name: 'Sonja Baer',
    role: 'Juhlatoimikunnan vetaja',
    teamId: 'juhlatoimikunta',
    type: 'permanent',
    avatar: 'S',
    email: 'baerhelle@gmail.com',
    linkedUserEmails: ['baerhelle@gmail.com'],
    responsibilities: [],
    channels: [],
  },
  {
    id: 'raisa',
    name: 'Raisa Baer',
    role: 'Jasen',
    teamId: 'juhlatoimikunta',
    type: 'permanent',
    avatar: 'R',
    responsibilities: [],
    channels: [],
  },
  {
    id: 'elina',
    name: 'Elina Savo',
    role: 'Jasen',
    teamId: 'juhlatoimikunta',
    type: 'permanent',
    avatar: 'E',
    responsibilities: [],
    channels: [],
  },
  {
    id: 'anton',
    name: 'Anton Baer',
    role: 'Jasen',
    teamId: 'juhlatoimikunta',
    type: 'permanent',
    avatar: 'A',
    email: 'anton@hetkicompany.com',
    linkedUserEmails: ['anton@hetkicompany.com', 'anton.baer@gmail.com'],
    responsibilities: [],
    channels: [],
  },
];

export const DEFAULT_JUHLATOIMIKUNTA_YEARWHEEL: YearPhase[] = [];

export const DEFAULT_JUHLATOIMIKUNTA_COMMS_PLAN: CommsPlan = {
  id: 'juhlatoimikunta-2026-commsplan',
  year: 2026,
  festivalName: 'Sirpan 70v juhlat',
  festivalDates: '25.4.2026',
  summary: 'Sirpan 70-vuotissyntymapaivajahlat jarjestetaan lauantaina 25.4.2026 Tyttojen talolla Kalliossa (Hameentie 13 A, 00530 Helsinki).',
  mission: 'Jarjestaa Sirpalle ikimuistoiset ja lamminhenkiset 70-vuotisjuhlat.',
  visitorGoal: 0,
  visitorBaseline: 0,
  volunteerGoal: 0,
  volunteerBaseline: 0,
  responsibleMemberId: 'sonja',
  responsibleTeamId: 'juhlatoimikunta',
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
  channels: ['WhatsApp', 'Sahkoposti'],
  updatedAt: 0,
};
