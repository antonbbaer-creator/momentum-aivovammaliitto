// Chat/messaging model — kanavat, viestit, DMit, lukumerkinnät
// Tallennusstrategia: hybrid via useOrgData
//   /organizations/{orgId}/data/chat_channels         → kaikki kanavameta
//   /organizations/{orgId}/data/chat_messages_{cid}  → yhden kanavan viimeiset ~500 viestiä
//   /organizations/{orgId}/data/chat_state_{uid}     → käyttäjän lukumerkinnät + pinned + muted
//
// V1 rajat:
//   - 500 viestiä per kanava arrayssa → ~250 kB, mahtuu Firestoren 1 MB rajaan
//   - Pitempi historia myöhemmin via archive-dokumentti

import { OrgTeam, OrgTeamMember } from './team-shared';

export type ChannelType = 'team' | 'public' | 'private' | 'dm' | 'group';

export interface Channel {
  id: string;
  name: string;              // 'viestinta', 'yleinen' — ei-uniikki slug
  displayName: string;       // '# viestintä', 'Anton Baer' (DMissä toisen nimi)
  description?: string;
  type: ChannelType;
  teamId?: string;           // linkki OrgTeamiin kun type='team'
  memberIds: string[];       // OrgTeamMember.id:t. Erityisarvo 'all' = org-wide
  createdBy: string;         // OrgTeamMember.id tai user.uid fallback
  createdAt: number;
  archived?: boolean;
  lastMessageAt?: number;    // sidebarin järjestystä + preview varten
  lastMessagePreview?: string;
  lastMessageAuthor?: string;
  color?: string;            // team-kanavan värissä käytetään OrgTeamin väriä
  icon?: string;
}

export interface Attachment {
  id: string;
  name: string;
  url: string;               // R2 CDN
  size: number;
  ext: string;
  isImage: boolean;
}

export interface Reaction {
  emoji: string;             // '▲' '♥' '✓' jne. (ei unicode-emoji — käytetään symboleja)
  userIds: string[];         // OrgTeamMember.id:t jotka ovat reagoineet
}

export interface Message {
  id: string;
  channelId: string;
  authorId: string;          // OrgTeamMember.id, tai user.uid jos ei jäsen
  authorName: string;        // snapshotattu näyttöä varten
  authorAvatar?: string;
  text: string;
  mentions?: string[];       // OrgTeamMember.id:t + erityisarvot 'all', 'here'
  attachments?: Attachment[];
  createdAt: number;
  editedAt?: number;
  deletedAt?: number;        // soft delete — viesti korvataan "viesti poistettu"
  threadId?: string;         // parent message id jos tämä on thread-vastaus
  replyCount?: number;       // lasketaan parentista
  reactions?: Reaction[];
}

export interface UserChatState {
  userId: string;            // OrgTeamMember.id
  // Lukumerkinnät per kanava: timestamp ms
  lastReadAt: Record<string, number>;
  // Pinned kanavat (järjestetty sidebarissa ensin)
  pinned?: string[];
  // Muted kanavat (ei notifikaatioita)
  muted?: string[];
  // Viimeksi avattu kanava (open-on-mount)
  activeChannelId?: string;
  // Browser push -lupa kysytty
  pushAsked?: boolean;
}

// ========== HELPERS ==========

export const MESSAGE_LIMIT_PER_CHANNEL = 500;

export function channelStorageKey(channelId: string): string {
  return `chat_messages_${channelId}`;
}

export function userStateStorageKey(userId: string): string {
  return `chat_state_${userId}`;
}

// Kanavavalmistajat
export function teamChannel(team: OrgTeam, memberIds: string[]): Channel {
  return {
    id: `ch_team_${team.id}`,
    name: team.id,
    displayName: `# ${team.name.toLowerCase().replace(/\s+/g, '-')}`,
    description: team.description || '',
    type: 'team',
    teamId: team.id,
    memberIds,
    createdBy: 'system',
    createdAt: Date.now(),
    color: team.color,
    icon: team.icon,
  };
}

export function generalChannel(): Channel {
  return {
    id: 'ch_yleinen',
    name: 'yleinen',
    displayName: '# yleinen',
    description: 'Kaikille yhteinen kanava',
    type: 'public',
    memberIds: ['all'],
    createdBy: 'system',
    createdAt: Date.now(),
    icon: '◉',
  };
}

export function dmChannel(a: OrgTeamMember, b: OrgTeamMember): Channel {
  // Stable id — alfabeettisesti järjestetty pari
  const ids = [a.id, b.id].sort();
  return {
    id: `ch_dm_${ids[0]}_${ids[1]}`,
    name: `dm-${ids[0]}-${ids[1]}`,
    displayName: '', // näytetään runtimella "toisen" nimi
    type: 'dm',
    memberIds: ids,
    createdBy: a.id,
    createdAt: Date.now(),
  };
}

export function groupDmChannel(members: OrgTeamMember[], creatorId: string): Channel {
  const ids = [...new Set(members.map(m => m.id))].sort();
  return {
    id: `ch_group_${ids.join('_')}`,
    name: `group-${ids.join('-')}`,
    displayName: members.map(m => m.name.split(' ')[0]).join(', '),
    type: 'group',
    memberIds: ids,
    createdBy: creatorId,
    createdAt: Date.now(),
  };
}

// Auto-luo kanavat annetusta tiimidatasta — palauttaa vain ne jotka puuttuvat current-listasta
export function missingDefaultChannels(
  current: Channel[],
  orgTeams: OrgTeam[],
  teamMembers: OrgTeamMember[],
): Channel[] {
  const existing = new Set(current.map(c => c.id));
  const out: Channel[] = [];

  // #yleinen
  if (!existing.has('ch_yleinen')) {
    out.push(generalChannel());
  }

  // Per-team kanavat
  for (const team of orgTeams) {
    const channelId = `ch_team_${team.id}`;
    if (!existing.has(channelId)) {
      const memberIds = teamMembers.filter(m => m.teamId === team.id).map(m => m.id);
      out.push(teamChannel(team, memberIds));
    }
  }
  return out;
}

// Onko käyttäjä kanavan jäsen?
export function isMember(channel: Channel, userId: string | null): boolean {
  if (!userId) return false;
  if (channel.memberIds.includes('all')) return true;
  return channel.memberIds.includes(userId);
}

// Voiko käyttäjä kirjoittaa kanavaan?
// - public/team: kuka tahansa kirjautunut (ei tarvitse olla tiimin virallinen jäsen)
// - private/dm/group: vain eksplisiittiset jäsenet
export function canPostInChannel(channel: Channel, userId: string | null): boolean {
  if (!userId) return false;
  if (channel.type === 'public' || channel.type === 'team') return true;
  return isMember(channel, userId);
}

// Näkyvät kanavat: public/team kaikille, private+dm+group vain jäsenille
export function visibleChannels(channels: Channel[], userId: string | null): Channel[] {
  return channels.filter(ch => {
    if (ch.archived) return false;
    if (ch.type === 'public' || ch.type === 'team') return true;
    return isMember(ch, userId);
  });
}

export function displayNameFor(ch: Channel, currentUserId: string | null, members: OrgTeamMember[]): string {
  if (ch.type === 'dm') {
    // Näytä toisen osapuolen nimi
    const otherId = ch.memberIds.find(id => id !== currentUserId);
    if (otherId === 'momentum-bot' || otherId === 'claude-bot') return 'Momentum';
    const other = otherId ? members.find(m => m.id === otherId) : null;
    return other?.name || ch.displayName || 'Tuntematon';
  }
  if (ch.type === 'group' && !ch.displayName) {
    return ch.memberIds
      .filter(id => id !== currentUserId)
      .map(id => members.find(m => m.id === id)?.name.split(' ')[0] || '?')
      .join(', ');
  }
  return ch.displayName || ch.name;
}

// Message-helperit
export function newMessage(partial: Partial<Message> & Pick<Message, 'channelId' | 'authorId' | 'authorName' | 'text'>): Message {
  return {
    id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    createdAt: Date.now(),
    mentions: [],
    attachments: [],
    reactions: [],
    ...partial,
  };
}

// Lisää viesti kanavan arrayhin + pidä max MESSAGE_LIMIT_PER_CHANNEL
export function appendMessage(existing: Message[], msg: Message): Message[] {
  const next = [...(existing || []), msg];
  if (next.length > MESSAGE_LIMIT_PER_CHANNEL) {
    return next.slice(next.length - MESSAGE_LIMIT_PER_CHANNEL);
  }
  return next;
}

// Muotoile aikaleima: tänään → klo, viime viikko → ti 14:30, muuten → 5.4. 14:30
export function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (sameDay) return hm;
  const daysAgo = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (daysAgo < 7) {
    const wd = ['su', 'ma', 'ti', 'ke', 'to', 'pe', 'la'][d.getDay()];
    return `${wd} ${hm}`;
  }
  return `${d.getDate()}.${d.getMonth() + 1}. ${hm}`;
}

// Date-divider -etiketti: "Tänään", "Eilen", "Maanantai 5.4."
export function formatDateDivider(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return 'Tänään';
  const yesterday = new Date(now.getTime() - 86400000);
  if (d.toDateString() === yesterday.toDateString()) return 'Eilen';
  const daysAgo = Math.floor((now.getTime() - d.getTime()) / 86400000);
  const wd = ['sunnuntai', 'maanantai', 'tiistai', 'keskiviikko', 'torstai', 'perjantai', 'lauantai'][d.getDay()];
  if (daysAgo < 7) return wd.charAt(0).toUpperCase() + wd.slice(1);
  return `${wd.charAt(0).toUpperCase() + wd.slice(1)} ${d.getDate()}.${d.getMonth() + 1}.`;
}

// Ryhmittele viestit päivän mukaan divider-etiketeille
export interface MessageGroup {
  dateLabel: string;
  messages: Message[];
}

export function groupMessagesByDay(messages: Message[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  let currentLabel = '';
  for (const m of messages) {
    const label = formatDateDivider(m.createdAt);
    if (label !== currentLabel) {
      groups.push({ dateLabel: label, messages: [] });
      currentLabel = label;
    }
    groups[groups.length - 1].messages.push(m);
  }
  return groups;
}

// Unread count per kanava
export function unreadCount(
  channelId: string,
  messages: Message[],
  state: UserChatState | null,
  currentUserId: string | null,
): number {
  if (!state) return 0;
  const lastRead = state.lastReadAt?.[channelId] || 0;
  return messages.filter(m => m.createdAt > lastRead && m.authorId !== currentUserId).length;
}

// Onko kanavassa maininta minusta sen jälkeen kun viimeksi olin lukenut?
export function hasUnreadMention(
  channelId: string,
  messages: Message[],
  state: UserChatState | null,
  currentUserId: string | null,
): boolean {
  if (!state || !currentUserId) return false;
  const lastRead = state.lastReadAt?.[channelId] || 0;
  return messages.some(m =>
    m.createdAt > lastRead &&
    m.authorId !== currentUserId &&
    ((m.mentions || []).includes(currentUserId) ||
     (m.mentions || []).includes('all') ||
     (m.mentions || []).includes('here'))
  );
}

// Sidebarin järjestys: pinned ensin, sitten viimeksi aktiivisin
export function sortChannelsForSidebar(
  channels: Channel[],
  state: UserChatState | null,
): Channel[] {
  const pinnedSet = new Set(state?.pinned || []);
  return [...channels].sort((a, b) => {
    const aPin = pinnedSet.has(a.id);
    const bPin = pinnedSet.has(b.id);
    if (aPin && !bPin) return -1;
    if (!aPin && bPin) return 1;
    return (b.lastMessageAt || b.createdAt) - (a.lastMessageAt || a.createdAt);
  });
}

// Erottele DMt ja ryhmä-DMt vs. kanavat
export function partitionChannels(channels: Channel[]): {
  teams: Channel[];
  publics: Channel[];
  privates: Channel[];
  dms: Channel[];
  groups: Channel[];
} {
  const teams: Channel[] = [];
  const publics: Channel[] = [];
  const privates: Channel[] = [];
  const dms: Channel[] = [];
  const groups: Channel[] = [];
  for (const ch of channels) {
    if (ch.type === 'team') teams.push(ch);
    else if (ch.type === 'public') publics.push(ch);
    else if (ch.type === 'private') privates.push(ch);
    else if (ch.type === 'dm') dms.push(ch);
    else if (ch.type === 'group') groups.push(ch);
  }
  return { teams, publics, privates, dms, groups };
}
