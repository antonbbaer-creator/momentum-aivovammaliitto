// EnlightenedBits — yritys-/tuoteprojekti. Tiimi: Anton, Maximilian Rehn ja
// Juhani Lindh. Kaikki kirjautuvat omalla Gmail-tunnuksellaan.

import type { OrgTeam, OrgTeamMember } from './team-shared';
import type { CommsPlan } from './comms-plan-shared';
import type { YearPhase } from './yearwheel-shared';

export const DEFAULT_ENLIGHTENEDBITS_TEAMS: OrgTeam[] = [
  {
    id: 'ydin',
    name: 'Ydintiimi',
    color: '#1f1f1f',
    icon: '◈',
    description: 'EnlightenedBitsin ydintiimi.',
    leadId: 'anton',
  },
];

export const DEFAULT_ENLIGHTENEDBITS_TEAM_MEMBERS: OrgTeamMember[] = [
  {
    id: 'anton',
    name: 'Anton Baer',
    role: 'Perustaja',
    teamId: 'ydin',
    type: 'permanent',
    avatar: 'A',
    email: 'anton.b.baer@gmail.com',
    linkedUserEmails: ['anton@hetkicompany.com', 'anton.baer@gmail.com', 'anton.b.baer@gmail.com'],
    isManager: true,
    responsibilities: [],
  },
  {
    id: 'maximilian',
    name: 'Maximilian Rehn',
    role: 'Perustaja',
    teamId: 'ydin',
    type: 'permanent',
    avatar: 'M',
    email: 'maximilian.rehn@gmail.com',
    linkedUserEmails: ['maximilian.rehn@gmail.com'],
    responsibilities: [],
  },
  {
    id: 'juhani',
    name: 'Juhani Lindh',
    role: 'Perustaja',
    teamId: 'ydin',
    type: 'permanent',
    avatar: 'J',
    email: 'juhani.lindh@gmail.com',
    linkedUserEmails: ['juhani.lindh@gmail.com'],
    responsibilities: [],
  },
];

export const DEFAULT_ENLIGHTENEDBITS_COMMS_PLAN: CommsPlan = {
  id: 'enlightenedbits-commsplan',
  year: new Date().getFullYear(),
  festivalName: 'EnlightenedBits',
  festivalDates: '',
  summary: '',
  mission: '',
  visitorGoal: 0,
  visitorBaseline: 0,
  volunteerGoal: 0,
  volunteerBaseline: 0,
  responsibleMemberId: 'anton',
  responsibleTeamId: 'ydin',
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
  channels: ['LinkedIn', 'Nettisivut'],
};

export const DEFAULT_ENLIGHTENEDBITS_YEARWHEEL: YearPhase[] = [];
