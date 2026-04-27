"use strict";
// Cloud Function: lähetä push-notifikaatio kun käyttäjälle tulee uusi tehtävä
// tai sen status muuttuu. Triggeroituu users/{uid}/assignedTasks/{cid}-mirrorin
// muutoksesta — mirror on jo ylläpidetty syncAssignedTasks:ssa.
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
exports.sendTaskNotification = void 0;
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-functions/v2/firestore");
const sendPush_1 = require("./lib/sendPush");
if (admin.apps.length === 0)
    admin.initializeApp();
const db = admin.firestore();
async function loadPrefs(uid) {
    const snap = await db.doc(`users/${uid}/meta/notifPrefs`).get();
    if (!snap.exists)
        return { enabled: false, chatMessages: 'all', tasks: true };
    return {
        enabled: false,
        chatMessages: 'all',
        tasks: true,
        ...snap.data(),
    };
}
function previewText(s) {
    const t = (s || '').replace(/\s+/g, ' ').trim();
    if (t.length <= 140)
        return t;
    return t.slice(0, 137) + '…';
}
exports.sendTaskNotification = (0, firestore_1.onDocumentWritten)('users/{uid}/assignedTasks/{cid}', async (event) => {
    const uid = event.params.uid;
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    // Vain create tai status-muutos kiinnostaa
    let kind = null;
    let title = '';
    let body = '';
    if (!before && after && !after.done && !after.deletedAt) {
        kind = 'new';
        title = 'Uusi tehtävä';
        body = previewText(after.text);
    }
    else if (before && after && before.status !== after.status && !after.done && !after.deletedAt) {
        kind = 'status';
        const map = {
            accepted: 'Tehtäväsi hyväksyttiin',
            rejected: 'Tehtäväsi hylättiin',
            pending: 'Tehtävän tila muuttui odottavaksi',
        };
        title = map[after.status] || 'Tehtäväsi tila päivittyi';
        body = previewText(after.text);
    }
    if (!kind || !after)
        return;
    const prefs = await loadPrefs(uid);
    if (!prefs.enabled || !prefs.tasks)
        return;
    const orgId = after.orgId;
    const link = `/${orgId}/tyonjako`;
    try {
        await (0, sendPush_1.sendPushToUsers)([uid], {
            title,
            body,
            link,
            tag: `task:${after.compositeId}`,
            data: {
                kind: 'task',
                orgId,
                taskId: after.taskId,
                compositeId: after.compositeId,
                changeKind: kind,
            },
        });
    }
    catch (err) {
        console.error(`[sendTaskNotification] push failed uid=${uid} cid=${after.compositeId}`, err);
    }
});
