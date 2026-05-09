// Cloud Function: lähetä push-notifikaatio kun chat_messages_{cid}-dokumentti
// päivittyy. Triggeroituu jokaisesta `organizations/{orgId}/data/{key}` -kirjoituksesta;
// jos key alkaa 'chat_messages_', diff vanha vs uusi viestilista ja lähetä jokaisesta
// UUDESTA viestistä push relevanteille käyttäjille.

import * as admin from 'firebase-admin';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import {
  Channel,
  ChatMessage,
  ChatNotifLevel,
  NotifPrefs,
  OrgTeamMember,
  UserChatState,
} from '../types';
import { sendPushToUsers } from './lib/sendPush';

if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

const CHAT_PREFIX = 'chat_messages_';

const norm = (s: string) => (s || '').toLowerCase().trim();

function parseV<T>(snap: FirebaseFirestore.DocumentSnapshot | undefined, fallback: T): T {
  if (!snap || !snap.exists) return fallback;
  const v = snap.data()?.v;
  if (typeof v !== 'string') return fallback;
  try { return JSON.parse(v) as T; } catch { return fallback; }
}

interface MemberMaps {
  // OrgTeamMember.id -> uid (jos email-mappauksen kautta löytyy)
  memberIdToUid: Record<string, string>;
  // Kaikki uid:t orgissa (käytetään 'all'-jäsenyyteen)
  allOrgUids: string[];
  members: OrgTeamMember[];
}

async function buildMemberMaps(orgId: string): Promise<MemberMaps> {
  const membersSnap = await db.doc(`organizations/${orgId}/data/orgTeamMembers`).get();
  const members = parseV<OrgTeamMember[]>(membersSnap, []);

  const emailSet = new Set<string>();
  for (const m of members) {
    if (m.email) emailSet.add(norm(m.email));
    for (const e of m.linkedUserEmails || []) emailSet.add(norm(e));
  }

  const emailToUid: Record<string, string> = {};
  await Promise.all(
    Array.from(emailSet).map(async (email) => {
      const q = await db.collection('users').where('email', '==', email).limit(1).get();
      if (!q.empty) emailToUid[email] = q.docs[0].id;
    }),
  );

  const memberIdToUid: Record<string, string> = {};
  for (const m of members) {
    const candidates: string[] = [];
    if (m.email) candidates.push(norm(m.email));
    for (const e of m.linkedUserEmails || []) candidates.push(norm(e));
    for (const c of candidates) {
      const uid = emailToUid[c];
      if (uid) { memberIdToUid[m.id] = uid; break; }
    }
  }

  // Kaikki orgin uid:t — userOrgs-collectionGroupin sijaan käytetään
  // memberIdToUid:n arvoja, koska kanavajäsenyys perustuu OrgTeamMembereihin.
  // ('all' kanavalle = kaikki team-jäsenet joilla on linkattu uid)
  const allOrgUids = Array.from(new Set(Object.values(memberIdToUid)));

  return { memberIdToUid, allOrgUids, members };
}

interface RecipientCtx {
  uid: string;
  prefs: NotifPrefs;
  state: UserChatState | null;
}

/** Hae notifPrefs ja chat_state_{uid}*MAP rinnakkain. */
async function loadRecipientCtx(orgId: string, uids: string[]): Promise<Record<string, RecipientCtx>> {
  const out: Record<string, RecipientCtx> = {};
  await Promise.all(uids.map(async (uid) => {
    const [prefsSnap, stateSnap] = await Promise.all([
      db.doc(`users/${uid}/meta/notifPrefs`).get(),
      db.doc(`organizations/${orgId}/data/chat_state_${uid}`).get(),
    ]);
    const prefs: NotifPrefs = prefsSnap.exists
      ? { enabled: false, chatMessages: 'all', tasks: true, ...(prefsSnap.data() as Partial<NotifPrefs>) }
      : { enabled: false, chatMessages: 'all', tasks: true };
    const state = parseV<UserChatState | null>(stateSnap, null);
    out[uid] = { uid, prefs, state };
  }));
  return out;
}

/** Päättele sallitaanko notif tällä käyttäjällä tälle viestille. */
function shouldNotify(
  ctx: RecipientCtx,
  channel: Channel,
  msg: ChatMessage,
  isMentioned: boolean,
): boolean {
  if (!ctx.prefs.enabled) return false;
  if (ctx.state?.muted?.includes(channel.id)) return false;

  // Per-kanava override voittaa default-tason
  const level: ChatNotifLevel =
    ctx.prefs.perChannel?.[channel.id] || ctx.prefs.chatMessages || 'all';

  if (level === 'none') return false;
  if (level === 'mentions') {
    // DMissä jokainen viesti rinnastetaan mentioniksi (vain 2 osallistujaa)
    if (channel.type === 'dm') return true;
    return isMentioned;
  }
  // level === 'all'
  return true;
}

function diffNewMessages(before: ChatMessage[], after: ChatMessage[]): ChatMessage[] {
  if (after.length === 0) return [];
  const beforeIds = new Set(before.map(m => m.id));
  return after.filter(m => !beforeIds.has(m.id) && !m.deletedAt);
}

function buildNotificationLink(orgId: string, channelId: string, messageId?: string): string {
  // Keskitetty syvälinkki — UI navigoi avoimeen kanavaan kun avataan tämä polku.
  // ChatLayout lukee `?ch=` (kanava) ja `?m=` (viesti, scroll + korostus).
  const base = `/${orgId}/viestit?ch=${encodeURIComponent(channelId)}`;
  return messageId ? `${base}&m=${encodeURIComponent(messageId)}` : base;
}

function previewText(msg: ChatMessage): string {
  const t = (msg.text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= 140) return t;
  return t.slice(0, 137) + '…';
}

export const sendChatNotification = onDocumentWritten(
  'organizations/{orgId}/data/{key}',
  async (event) => {
    const orgId = event.params.orgId as string;
    const key = event.params.key as string;
    if (!key.startsWith(CHAT_PREFIX)) return;

    const channelId = key.slice(CHAT_PREFIX.length);
    const before = parseV<ChatMessage[]>(event.data?.before, []);
    const after = parseV<ChatMessage[]>(event.data?.after, []);

    const newMessages = diffNewMessages(before, after);
    if (newMessages.length === 0) return;

    // Hae kanavameta + jäsenresoluutio rinnakkain
    const channelsSnap = await db.doc(`organizations/${orgId}/data/chat_channels`).get();
    const channels = parseV<Channel[]>(channelsSnap, []);
    const channel = channels.find(c => c.id === channelId);
    if (!channel || channel.archived) return;

    const memberMaps = await buildMemberMaps(orgId);

    // Vastaanottajat OrgTeamMember-id:istä → uid
    const targetUids = new Set<string>();
    if (channel.memberIds.includes('all')) {
      for (const uid of memberMaps.allOrgUids) targetUids.add(uid);
    } else {
      for (const memberId of channel.memberIds) {
        const uid = memberMaps.memberIdToUid[memberId];
        if (uid) targetUids.add(uid);
      }
    }

    if (targetUids.size === 0) {
      console.log(`[sendChatNotification] no recipients for channel=${channelId}`);
      return;
    }

    // Lataa per-vastaanottaja-konteksti (prefs + chat-state)
    const ctxByUid = await loadRecipientCtx(orgId, Array.from(targetUids));

    for (const msg of newMessages) {
      // Lähettäjän uid: authorId voi olla joko OrgTeamMember.id tai user.uid
      const authorUid = memberMaps.memberIdToUid[msg.authorId] || msg.authorId;

      // Mention-resoluutio: mentions-array sisältää OrgTeamMember.id:t + 'all'/'here'
      const mentionUids = new Set<string>();
      const hasGlobalMention = (msg.mentions || []).some(m => m === 'all' || m === 'here');
      for (const m of msg.mentions || []) {
        if (m === 'all' || m === 'here') continue;
        const uid = memberMaps.memberIdToUid[m];
        if (uid) mentionUids.add(uid);
      }

      const recipients: string[] = [];
      for (const uid of targetUids) {
        if (uid === authorUid) continue;       // ei pushia itselle
        const ctx = ctxByUid[uid];
        if (!ctx) continue;
        const isMentioned = hasGlobalMention || mentionUids.has(uid);
        if (shouldNotify(ctx, channel, msg, isMentioned)) recipients.push(uid);
      }

      if (recipients.length === 0) continue;

      const channelLabel =
        channel.type === 'dm' ? msg.authorName : `${channel.displayName || channel.name}`;
      const isThreadReply = !!msg.threadId;
      const title = channel.type === 'dm'
        ? msg.authorName
        : isThreadReply ? `↩ ${channelLabel}` : channelLabel;
      const body = channel.type === 'dm'
        ? previewText(msg)
        : `${msg.authorName}${isThreadReply ? ' threadissa' : ''}: ${previewText(msg)}`;
      const linkMessageId = isThreadReply && msg.threadId ? msg.threadId : msg.id;

      try {
        await sendPushToUsers(recipients, {
          title,
          body,
          link: buildNotificationLink(orgId, channelId, linkMessageId),
          tag: isThreadReply ? `thread:${msg.threadId}` : `chat:${channelId}`,
          data: {
            kind: isThreadReply ? 'thread' : 'chat',
            orgId,
            channelId,
            messageId: msg.id,
            ...(msg.threadId ? { threadId: msg.threadId } : {}),
          },
        });
      } catch (err) {
        console.error(`[sendChatNotification] push failed channel=${channelId} msg=${msg.id}`, err);
      }
    }
  },
);
