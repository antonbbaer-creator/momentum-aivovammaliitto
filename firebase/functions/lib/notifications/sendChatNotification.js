"use strict";
// Cloud Function: lähetä push-notifikaatio kun chat_messages_{cid}-dokumentti
// päivittyy. Triggeroituu jokaisesta `organizations/{orgId}/data/{key}` -kirjoituksesta;
// jos key alkaa 'chat_messages_', diff vanha vs uusi viestilista ja lähetä jokaisesta
// UUDESTA viestistä push relevanteille käyttäjille.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendChatNotification = void 0;
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-functions/v2/firestore");
const sendPush_1 = require("./lib/sendPush");
if (admin.apps.length === 0)
    admin.initializeApp();
const db = admin.firestore();
const CHAT_PREFIX = 'chat_messages_';
const norm = (s) => (s || '').toLowerCase().trim();
function parseV(snap, fallback) {
    if (!snap || !snap.exists)
        return fallback;
    const v = snap.data()?.v;
    if (typeof v !== 'string')
        return fallback;
    try {
        return JSON.parse(v);
    }
    catch {
        return fallback;
    }
}
async function buildMemberMaps(orgId) {
    const membersSnap = await db.doc(`organizations/${orgId}/data/orgTeamMembers`).get();
    const members = parseV(membersSnap, []);
    const emailSet = new Set();
    for (const m of members) {
        if (m.email)
            emailSet.add(norm(m.email));
        for (const e of m.linkedUserEmails || [])
            emailSet.add(norm(e));
    }
    const emailToUid = {};
    await Promise.all(Array.from(emailSet).map(async (email) => {
        const q = await db.collection('users').where('email', '==', email).limit(1).get();
        if (!q.empty)
            emailToUid[email] = q.docs[0].id;
    }));
    const memberIdToUid = {};
    for (const m of members) {
        const candidates = [];
        if (m.email)
            candidates.push(norm(m.email));
        for (const e of m.linkedUserEmails || [])
            candidates.push(norm(e));
        for (const c of candidates) {
            const uid = emailToUid[c];
            if (uid) {
                memberIdToUid[m.id] = uid;
                break;
            }
        }
    }
    // Kaikki orgin uid:t — userOrgs-collectionGroupin sijaan käytetään
    // memberIdToUid:n arvoja, koska kanavajäsenyys perustuu OrgTeamMembereihin.
    // ('all' kanavalle = kaikki team-jäsenet joilla on linkattu uid)
    const allOrgUids = Array.from(new Set(Object.values(memberIdToUid)));
    return { memberIdToUid, allOrgUids, members };
}
/** Hae notifPrefs ja chat_state_{uid}*MAP rinnakkain. */
async function loadRecipientCtx(orgId, uids) {
    const out = {};
    await Promise.all(uids.map(async (uid) => {
        const [prefsSnap, stateSnap] = await Promise.all([
            db.doc(`users/${uid}/meta/notifPrefs`).get(),
            db.doc(`organizations/${orgId}/data/chat_state_${uid}`).get(),
        ]);
        const prefs = prefsSnap.exists
            ? { enabled: false, chatMessages: 'all', tasks: true, ...prefsSnap.data() }
            : { enabled: false, chatMessages: 'all', tasks: true };
        const state = parseV(stateSnap, null);
        out[uid] = { uid, prefs, state };
    }));
    return out;
}
/** Päättele sallitaanko notif tällä käyttäjällä tälle viestille. */
function shouldNotify(ctx, channel, msg, isMentioned) {
    if (!ctx.prefs.enabled)
        return false;
    if (ctx.state?.muted?.includes(channel.id))
        return false;
    // Per-kanava override voittaa default-tason
    const level = ctx.prefs.perChannel?.[channel.id] || ctx.prefs.chatMessages || 'all';
    if (level === 'none')
        return false;
    if (level === 'mentions') {
        // DMissä jokainen viesti rinnastetaan mentioniksi (vain 2 osallistujaa)
        if (channel.type === 'dm')
            return true;
        return isMentioned;
    }
    // level === 'all'
    return true;
}
function diffNewMessages(before, after) {
    if (after.length === 0)
        return [];
    const beforeIds = new Set(before.map(m => m.id));
    return after.filter(m => !beforeIds.has(m.id) && !m.deletedAt);
}
function buildNotificationLink(orgId, channelId) {
    // Keskitetty syvälinkki — UI navigoi avoimeen kanavaan kun avataan tämä polku.
    // Org-slug pitää resolvoida — mutta orgId on jo slug nykyisessä mallissa.
    return `/${orgId}/chat?channel=${encodeURIComponent(channelId)}`;
}
function previewText(msg) {
    const t = (msg.text || '').replace(/\s+/g, ' ').trim();
    if (t.length <= 140)
        return t;
    return t.slice(0, 137) + '…';
}
exports.sendChatNotification = (0, firestore_1.onDocumentWritten)('organizations/{orgId}/data/{key}', async (event) => {
    const orgId = event.params.orgId;
    const key = event.params.key;
    if (!key.startsWith(CHAT_PREFIX))
        return;
    const channelId = key.slice(CHAT_PREFIX.length);
    const before = parseV(event.data?.before, []);
    const after = parseV(event.data?.after, []);
    const newMessages = diffNewMessages(before, after);
    if (newMessages.length === 0)
        return;
    // Hae kanavameta + jäsenresoluutio rinnakkain
    const channelsSnap = await db.doc(`organizations/${orgId}/data/chat_channels`).get();
    const channels = parseV(channelsSnap, []);
    const channel = channels.find(c => c.id === channelId);
    if (!channel || channel.archived)
        return;
    const memberMaps = await buildMemberMaps(orgId);
    // Vastaanottajat OrgTeamMember-id:istä → uid
    const targetUids = new Set();
    if (channel.memberIds.includes('all')) {
        for (const uid of memberMaps.allOrgUids)
            targetUids.add(uid);
    }
    else {
        for (const memberId of channel.memberIds) {
            const uid = memberMaps.memberIdToUid[memberId];
            if (uid)
                targetUids.add(uid);
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
        const mentionUids = new Set();
        const hasGlobalMention = (msg.mentions || []).some(m => m === 'all' || m === 'here');
        for (const m of msg.mentions || []) {
            if (m === 'all' || m === 'here')
                continue;
            const uid = memberMaps.memberIdToUid[m];
            if (uid)
                mentionUids.add(uid);
        }
        const recipients = [];
        for (const uid of targetUids) {
            if (uid === authorUid)
                continue; // ei pushia itselle
            const ctx = ctxByUid[uid];
            if (!ctx)
                continue;
            const isMentioned = hasGlobalMention || mentionUids.has(uid);
            if (shouldNotify(ctx, channel, msg, isMentioned))
                recipients.push(uid);
        }
        if (recipients.length === 0)
            continue;
        const channelLabel = channel.type === 'dm' ? msg.authorName : `${channel.displayName || channel.name}`;
        const title = channel.type === 'dm' ? msg.authorName : channelLabel;
        const body = channel.type === 'dm'
            ? previewText(msg)
            : `${msg.authorName}: ${previewText(msg)}`;
        try {
            await (0, sendPush_1.sendPushToUsers)(recipients, {
                title,
                body,
                link: buildNotificationLink(orgId, channelId),
                tag: `chat:${channelId}`,
                data: {
                    kind: 'chat',
                    orgId,
                    channelId,
                    messageId: msg.id,
                },
            });
        }
        catch (err) {
            console.error(`[sendChatNotification] push failed channel=${channelId} msg=${msg.id}`, err);
        }
    }
});
