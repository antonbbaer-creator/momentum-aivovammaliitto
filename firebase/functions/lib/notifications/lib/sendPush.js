"use strict";
// Yhteinen push-helper Cloud Functioneille. Kerää tokenit annetuille uid:ille,
// lähettää FCM:n kautta multicastina ja siivoaa vanhentuneet tokenit Firestoresta.
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
exports.sendPushToUsers = sendPushToUsers;
const admin = __importStar(require("firebase-admin"));
if (admin.apps.length === 0)
    admin.initializeApp();
const db = admin.firestore();
const messaging = admin.messaging();
async function collectDevices(uids) {
    if (uids.length === 0)
        return [];
    const out = [];
    await Promise.all(uids.map(async (uid) => {
        try {
            const snap = await db.collection(`users/${uid}/devices`).get();
            for (const d of snap.docs) {
                const data = d.data();
                if (data && data.fcmToken)
                    out.push({ uid, deviceId: d.id, token: data.fcmToken });
            }
        }
        catch (e) {
            console.warn(`[sendPush] device fetch failed for ${uid}`, e);
        }
    }));
    return out;
}
/**
 * Lähettää push-notifikaation kaikille annettujen uid:ien laitteille.
 * Palauttaa onnistuneiden lukumäärän.
 */
async function sendPushToUsers(uids, payload) {
    // Suodata duplikaatit
    const unique = Array.from(new Set(uids)).filter(Boolean);
    if (unique.length === 0)
        return 0;
    const devices = await collectDevices(unique);
    if (devices.length === 0) {
        console.log(`[sendPush] no devices for uids=${unique.join(',')}`);
        return 0;
    }
    const tokens = devices.map(d => d.token);
    const link = payload.link || '/';
    const data = { link, ...(payload.data || {}) };
    if (payload.tag)
        data.tag = payload.tag;
    // FCM:n sendEachForMulticast palauttaa per-token onnistumisen — käyttäen sitä
    // saamme tarkat virhekoodit, joiden perusteella siivoamme vanhentuneet tokenit.
    const res = await messaging.sendEachForMulticast({
        tokens,
        notification: { title: payload.title, body: payload.body },
        data,
        webpush: {
            fcmOptions: { link },
            notification: {
                icon: '/icons/icon-192.png',
                badge: '/icons/icon-192.png',
                tag: payload.tag,
                renotify: !!payload.tag,
            },
        },
    });
    // Siivous: invalid-argument tai registration-token-not-registered → poista
    const removals = [];
    res.responses.forEach((r, i) => {
        if (r.success)
            return;
        const code = r.error?.code || '';
        const remove = code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token' ||
            code === 'messaging/invalid-argument';
        if (remove) {
            const dev = devices[i];
            console.log(`[sendPush] removing stale token uid=${dev.uid} device=${dev.deviceId} code=${code}`);
            removals.push(db.doc(`users/${dev.uid}/devices/${dev.deviceId}`).delete().catch(() => undefined));
        }
        else if (r.error) {
            console.warn('[sendPush] non-recoverable error', code, r.error.message);
        }
    });
    if (removals.length)
        await Promise.all(removals);
    console.log(`[sendPush] sent=${res.successCount} failed=${res.failureCount} of ${tokens.length}`);
    return res.successCount;
}
