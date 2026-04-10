// Organizational teams for Hetki Momentum — distinct from yearwheel functional TEAMS.
// This is for people groups ("who does what"), yearwheel TEAMS is for functional phase categorization.

export interface OrgTeam {
  id: string;
  name: string;
  color: string;
  icon: string;
  description: string;
  leadId?: string; // member id of team lead
}

export interface OrgTeamMember {
  id: string;
  name: string;
  role: string;
  teamId: string; // refers to OrgTeam.id
  type: 'permanent' | 'project' | 'external';
  email?: string;                    // primary contact email
  linkedUserEmails?: string[];       // kaikki Firebase-tilit jotka on linkitetty t\u00e4h\u00e4n j\u00e4seneen
  phone?: string;
  avatar?: string;
  responsibilities?: string[];
  channels?: string[];
  currentTasks?: string[];
  note?: string;
}

// Default LLFF organizational teams (2026)
export const DEFAULT_LLFF_TEAMS: OrgTeam[] = [
  {
    id: 'executive',
    name: 'Executive Team',
    color: '#9b7cf6',
    icon: '◉', // ◉
    description: 'Johtoryhmä — taiteellinen johto, tuotannon vastuu ja tuotanto.',
    leadId: 'sveta',
  },
  {
    id: 'elokuva',
    name: 'Elokuva Tiimi',
    color: '#3788b2',
    icon: '▷', // ▷
    description: 'Ohjelmiston valinta, kuratointi ja lyhytelokuvat.',
    leadId: 'hanna',
  },
  {
    id: 'viestinta',
    name: 'Viestinnän Tiimi',
    color: '#e45c81',
    icon: '▶', // ▶
    description: 'Ulkoinen viestintä, markkinointi, grafiikka ja brändi.',
    leadId: 'lasse',
  },
  {
    id: 'tekninen',
    name: 'Tekninen Tiimi',
    color: '#2a8a86',
    icon: '⚙', // ⚙
    description: 'Esitystekniikka, rigaus ja tuotantoteknologia.',
    leadId: 'lili',
  },
];

export const DEFAULT_LLFF_TEAM_MEMBERS: OrgTeamMember[] = [
  // === Executive Team ===
  { id: 'sveta',  name: 'Svetlana Romanova', role: 'Vastaava tuottaja',  teamId: 'executive', type: 'permanent', avatar: 'S' },
  { id: 'anton',  name: 'Anton Baer',        role: 'Taiteellinen johtaja', teamId: 'executive', type: 'permanent', avatar: 'A', email: 'anton@hetkicompany.com', linkedUserEmails: ['anton@hetkicompany.com', 'anton.baer@gmail.com'] },
  { id: 'anna',   name: 'Anna Lehtonen',     role: 'Tuottaja',            teamId: 'executive', type: 'permanent', avatar: 'A' },

  // === Elokuva Tiimi ===
  { id: 'hanna',  name: 'Hanna Hovitie',     role: 'Ohjelmistovastaava',  teamId: 'elokuva',   type: 'permanent', avatar: 'H' },
  { id: 'siiri',  name: 'Siiri Siltala',     role: 'Kuraattori',          teamId: 'elokuva',   type: 'permanent', avatar: 'S' },
  { id: 'moriz',  name: 'Moriz Müller', role: 'Lyhytelokuvat',       teamId: 'elokuva',   type: 'project',   avatar: 'M' },
  { id: 'nellie', name: 'Nellie Rajala',     role: 'Lyhytelokuvat',       teamId: 'elokuva',   type: 'project',   avatar: 'N' },

  // === Viestinnän Tiimi ===
  { id: 'lasse',  name: 'Lars "Lasse" Hulden', role: 'Viestinnän vastaava', teamId: 'viestinta', type: 'permanent', avatar: 'L' },
  { id: 'jutta',  name: 'Jutta Kivilompolo',   role: 'Graafikko',               teamId: 'viestinta', type: 'permanent', avatar: 'J' },

  // === Tekninen Tiimi ===
  { id: 'lili',   name: 'Lili Eweis',          role: 'Tekninen vastaava',       teamId: 'tekninen',  type: 'permanent', avatar: 'L' },
];

// Helper: get team by id
export const getTeam = (teams: OrgTeam[], teamId: string): OrgTeam | undefined =>
  teams.find(t => t.id === teamId);

// Helper: get members of a team
export const getTeamMembers = (members: OrgTeamMember[], teamId: string): OrgTeamMember[] =>
  members.filter(m => m.teamId === teamId);

// Fallback color for members without team
export const DEFAULT_TEAM_COLOR = '#888888';

/**
 * Resolve a Firebase user → OrgTeamMember.
 * Tarkistaa s\u00e4hk\u00f6postit (linkedUserEmails + email) ja nimen,
 * sis\u00e4lt\u00e4en varminta l\u00f6ysint\u00e4 matchia: etunimi.
 */
export const resolveUserMember = (
  members: OrgTeamMember[],
  user: { email?: string | null; displayName?: string | null } | null
): OrgTeamMember | undefined => {
  if (!user) return undefined;
  const email = user.email?.toLowerCase().trim() || '';
  const name = user.displayName?.trim() || '';

  // 1. Exact email match (linkedUserEmails OR primary email)
  if (email) {
    const byEmail = members.find(m =>
      (m.linkedUserEmails || []).some(e => e.toLowerCase().trim() === email) ||
      (m.email && m.email.toLowerCase().trim() === email)
    );
    if (byEmail) return byEmail;
  }

  // 2. Exact name match
  if (name) {
    const byName = members.find(m => m.name === name);
    if (byName) return byName;
  }

  // 3. Fuzzy first-name match (last resort for users who changed display name)
  if (name) {
    const firstName = name.split(' ')[0].toLowerCase();
    const byFirstName = members.find(m =>
      m.name.toLowerCase().split(' ')[0] === firstName
    );
    if (byFirstName) return byFirstName;
  }

  return undefined;
};
