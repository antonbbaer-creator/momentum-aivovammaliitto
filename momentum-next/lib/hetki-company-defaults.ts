// Hetki Company — viestintätoimiston työtila
// Hallitaan asiakkuuksiin liittyviä projekteja sekä yrityksen sisäisiä töitä.

import type { OrgTeam, OrgTeamMember } from './team-shared';
import type { CommsPlan } from './comms-plan-shared';
import type { YearPhase } from './yearwheel-shared';

export const DEFAULT_HETKI_COMPANY_TEAMS: OrgTeam[] = [
  {
    id: 'core',
    name: 'Hetki',
    color: '#9b7cf6',
    icon: '◉',
    description: 'Hetki Companyn ydintiimi — asiakastyö ja yrityksen pyörittäminen.',
    leadId: 'anton',
  },
];

export const DEFAULT_HETKI_COMPANY_TEAM_MEMBERS: OrgTeamMember[] = [
  {
    id: 'anton',
    name: 'Anton Baer',
    role: 'Omistaja / Viestinnän suunnittelija',
    teamId: 'core',
    type: 'permanent',
    avatar: 'A',
    email: 'anton@hetkicompany.com',
    linkedUserEmails: ['anton@hetkicompany.com', 'anton.baer@gmail.com'],
    isManager: true,
    responsibilities: [
      'Asiakastyö ja asiakkuuksien hallinta',
      'Visuaalinen viestintä ja brändi',
      'Yrityksen pyörittäminen (hallinto, talous, sopimukset)',
    ],
    channels: ['LinkedIn', 'Instagram', 'Nettisivut'],
  },
];

export const DEFAULT_HETKI_COMPANY_COMMS_PLAN: CommsPlan = {
  id: 'hetki-company-commsplan',
  year: new Date().getFullYear(),
  festivalName: 'Hetki Company',
  festivalDates: '',
  summary: '',
  mission: '',
  visitorGoal: 0,
  visitorBaseline: 0,
  volunteerGoal: 0,
  volunteerBaseline: 0,
  responsibleMemberId: 'anton',
  responsibleTeamId: 'core',
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
  channels: ['LinkedIn', 'Instagram', 'Nettisivut', 'Uutiskirje'],
};

export const DEFAULT_HETKI_COMPANY_YEARWHEEL: YearPhase[] = [];
