// Juhlatoimikunta — Sirpan 70v syntymäpäiväjuhlien järjestelytiimi
// Erillinen ja irrallinen työtila Momentumissa

import { OrgTeam, OrgTeamMember } from './team-shared';
import type { CommsPlan } from './comms-plan-shared';
import type { YearPhase } from './yearwheel-shared';

export const DEFAULT_JUHLATOIMIKUNTA_TEAMS: OrgTeam[] = [
  {
    id: 'juhlatoimikunta',
    name: 'Juhlatoimikunta',
    color: '#9b7cf6',
    icon: '★',
    description: 'Sirpan 70-vuotisjuhlien järjestelytiimi.',
    leadId: 'sonja',
  },
];

export const DEFAULT_JUHLATOIMIKUNTA_TEAM_MEMBERS: OrgTeamMember[] = [
  {
    id: 'sonja',
    name: 'Sonja Baer',
    role: 'Juhlatoimikunnan vetäjä',
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
    role: 'Jäsen',
    teamId: 'juhlatoimikunta',
    type: 'permanent',
    avatar: 'R',
    responsibilities: [],
    channels: [],
  },
  {
    id: 'elina',
    name: 'Elina Savo',
    role: 'Jäsen',
    teamId: 'juhlatoimikunta',
    type: 'permanent',
    avatar: 'E',
    responsibilities: [],
    channels: [],
  },
  {
    id: 'anton',
    name: 'Anton Baer',
    role: 'Jäsen',
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
  summary: 'Sirpan 70-vuotissyntymäpäiväjuhlat järjestetään lauantaina 25.4.2026 Tyttöjen talolla Kalliossa (Hämeentie 13 A, 00530 Helsinki).',
  mission: 'Järjestää Sirpalle ikimuistoiset ja lämminhenkiset 70-vuotisjuhlat.',
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
  channels: ['WhatsApp', 'Sähköposti'],
  updatedAt: 0,
};
