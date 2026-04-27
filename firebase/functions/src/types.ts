// Tyypit jaetaan Cloud Functionissa (kopio momentum-next:in keskeisistä rakenteista —
// emme importtaa Next.js-paketista jotta function-build pysyy itsenäisenä).

export interface OrgTeamMember {
  id: string;
  name: string;
  email?: string;
  linkedUserEmails?: string[];
}

export interface Assignable {
  assignees?: string[];
  assignee?: string;
  assignedBy?: string;
  status?: 'pending' | 'accepted' | 'rejected';
  rejectedAt?: number;
  completedAt?: number;
}

export interface Task extends Assignable {
  id: string;
  text: string;
  done?: boolean;
  deadline?: string;
  deletedAt?: number;
}

export interface Project {
  id: string;
  t?: string;            // title
  tasks?: Task[];
  archived?: boolean;
  deletedAt?: number;
}

export interface Grant {
  id: string;
  name?: string;
  subtasks?: Task[];
  deletedAt?: number;
}

export interface AssignedTaskMirror {
  compositeId: string;
  orgId: string;
  orgName?: string;
  sourceType: 'task' | 'projectTask' | 'grantSubtask';
  sourceId?: string;
  taskId: string;
  text: string;
  deadline?: string;
  status: 'pending' | 'rejected' | 'accepted' | 'done';
  done: boolean;
  deletedAt?: number;
  assignedBy?: string;
  updatedAt: number;
}

export const getAssignees = (t: Assignable): string[] => {
  if (Array.isArray(t.assignees) && t.assignees.length > 0) return t.assignees;
  if (t.assignee) return [t.assignee];
  return [];
};

export const effectiveStatus = (t: Assignable): 'pending' | 'accepted' | 'rejected' => {
  if (!t.status) return 'accepted';
  return t.status;
};

// ========== Chat ==========

export type ChannelType = 'team' | 'public' | 'private' | 'dm' | 'group';

export interface Channel {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  type: ChannelType;
  teamId?: string;
  memberIds: string[];      // OrgTeamMember.id:t. Erityisarvo 'all' = org-wide.
  archived?: boolean;
}

export interface ChatMessage {
  id: string;
  channelId: string;
  authorId: string;
  authorName: string;
  text: string;
  mentions?: string[];
  createdAt: number;
  editedAt?: number;
  deletedAt?: number;
  threadId?: string;
}

export interface UserChatState {
  userId: string;
  lastReadAt?: Record<string, number>;
  pinned?: string[];
  muted?: string[];
}

export type ChatNotifLevel = 'all' | 'mentions' | 'none';

export interface NotifPrefs {
  enabled: boolean;
  chatMessages: ChatNotifLevel;
  perChannel?: Record<string, ChatNotifLevel>;
  tasks: boolean;
}
