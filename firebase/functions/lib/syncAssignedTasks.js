"use strict";
// Cloud Function: synkronoi org-tehtävät käyttäjäkohtaiseen mirror-kokoelmaan.
//
// Trigger: kun /organizations/{orgId}/data/{key} muuttuu, parsii uuden v-JSON:in
// ja päivittää users/{uid}/assignedTasks/{compositeId} jokaiselle nimetylle tekijälle.
// Mirror-dokumentti poistetaan kun tehtävä on done, deletedAt tai assignee tyhjä.
//
// Huom: yksinkertaisuuden vuoksi koko mirrorin recompute orgille tehdään diffin sijaan.
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
exports.syncAssignedTasks = void 0;
exports.recomputeOrgMirror = recomputeOrgMirror;
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-functions/v2/firestore");
const types_1 = require("./types");
if (admin.apps.length === 0)
    admin.initializeApp();
const db = admin.firestore();
// Tunnistetaan tehtäväavaimet — tasks, projects, ja grant-tyyppiset (alkavat 'grants' tai 'apurahat').
const isTaskKey = (key) => key === 'tasks' ||
    key === 'projects' ||
    key.startsWith('grants') ||
    key.startsWith('apurahat');
const norm = (s) => s.toLowerCase().trim();
const firstName = (s) => s.split(/\s+/)[0] || s;
/** Resolvoi nimi → uid org-jäsenistön ja users-kollektion email-mappauksen kautta. */
async function buildNameToUid(orgId) {
    const map = {};
    // Lue orgTeamMembers
    const membersSnap = await db.doc(`organizations/${orgId}/data/orgTeamMembers`).get();
    if (!membersSnap.exists)
        return map;
    let members = [];
    try {
        const v = membersSnap.data()?.v;
        members = v ? JSON.parse(v) : [];
    }
    catch {
        return map;
    }
    // Kokoa mahdolliset emailit
    const emailSet = new Set();
    for (const m of members) {
        if (m.email)
            emailSet.add(norm(m.email));
        for (const e of m.linkedUserEmails || [])
            emailSet.add(norm(e));
    }
    if (emailSet.size === 0)
        return map;
    // Hae uid kullekin emailille users-kokoelmasta (yksi query per email — pieni n)
    const emailToUid = {};
    await Promise.all(Array.from(emailSet).map(async (email) => {
        const q = await db
            .collection('users')
            .where('email', '==', email)
            .limit(1)
            .get();
        if (!q.empty)
            emailToUid[email] = q.docs[0].id;
    }));
    // Mappaa member.name → uid
    for (const m of members) {
        if (!m.name)
            continue;
        const candidates = [];
        if (m.email)
            candidates.push(norm(m.email));
        for (const e of m.linkedUserEmails || [])
            candidates.push(norm(e));
        let uid;
        for (const c of candidates) {
            if (emailToUid[c]) {
                uid = emailToUid[c];
                break;
            }
        }
        if (uid) {
            map[norm(m.name)] = uid;
            map[norm(firstName(m.name))] = uid;
        }
    }
    return map;
}
/** Kerää orgin kaikki tehtävät tasks/projects/grants/apurahat-avaimista. */
async function collectOrgTasks(orgId) {
    const out = [];
    const dataSnap = await db.collection(`organizations/${orgId}/data`).get();
    for (const doc of dataSnap.docs) {
        const key = doc.id;
        if (!isTaskKey(key))
            continue;
        let parsed;
        try {
            parsed = JSON.parse(doc.data().v);
        }
        catch {
            continue;
        }
        if (!Array.isArray(parsed))
            continue;
        if (key === 'tasks') {
            for (const t of parsed)
                out.push({ task: t, sourceType: 'task' });
        }
        else if (key === 'projects') {
            for (const p of parsed) {
                if (p.deletedAt || p.archived)
                    continue;
                for (const t of p.tasks || [])
                    out.push({ task: t, sourceType: 'projectTask', sourceId: p.id });
            }
        }
        else {
            // grants tai apurahat
            for (const g of parsed) {
                if (g.deletedAt)
                    continue;
                for (const s of g.subtasks || [])
                    out.push({ task: s, sourceType: 'grantSubtask', sourceId: g.id });
            }
        }
    }
    return out;
}
const compositeId = (orgId, sourceType, sourceId, taskId) => `${orgId}__${sourceType}__${sourceId || 'root'}__${taskId}`;
/**
 * Recompute koko mirror tälle orgille. Kirjoita kaikki avoimet tehtävät uid:lle,
 * poista sellaiset jotka eivät enää kuulu mirrorille (perustuu compositeId-prefixiin).
 */
async function recomputeOrgMirror(orgId) {
    const [orgDoc, nameToUid, taskRefs] = await Promise.all([
        db.doc(`organizations/${orgId}`).get(),
        buildNameToUid(orgId),
        collectOrgTasks(orgId),
    ]);
    const orgName = orgDoc.data()?.name || orgId;
    // Halutut mirror-dokumentit (uid → compositeId → mirror)
    const desired = {};
    for (const ref of taskRefs) {
        const t = ref.task;
        if (!t || !t.id || t.deletedAt || t.done)
            continue;
        const status = (0, types_1.effectiveStatus)(t);
        const assignees = (0, types_1.getAssignees)(t);
        if (assignees.length === 0)
            continue;
        for (const name of assignees) {
            const uid = nameToUid[norm(name)] || nameToUid[norm(firstName(name))];
            if (!uid)
                continue;
            const cid = compositeId(orgId, ref.sourceType, ref.sourceId, t.id);
            if (!desired[uid])
                desired[uid] = {};
            desired[uid][cid] = {
                compositeId: cid,
                orgId,
                orgName,
                sourceType: ref.sourceType,
                sourceId: ref.sourceId,
                taskId: t.id,
                text: t.text,
                deadline: t.deadline,
                status,
                done: !!t.done,
                deletedAt: t.deletedAt,
                assignedBy: t.assignedBy,
                updatedAt: Date.now(),
            };
        }
    }
    // Hae nykyiset mirror-dokumentit kaikilta käyttäjiltä joilla saattaa olla osumia
    // (kaikki uid:t joilla on tämän orgin etuliitteellä alkava mirror — käytä collectionGroup).
    const stale = await db
        .collectionGroup('assignedTasks')
        .where('orgId', '==', orgId)
        .get();
    // Ryhmittele staleit uid:n mukaan path-segmentistä
    const existingByUid = {};
    for (const doc of stale.docs) {
        const segments = doc.ref.path.split('/');
        // path: users/{uid}/assignedTasks/{compositeId}
        const uid = segments[1];
        if (!existingByUid[uid])
            existingByUid[uid] = new Set();
        existingByUid[uid].add(doc.id);
    }
    // Yhdistä uid-joukko (uudet + olemassaolevat)
    const allUids = new Set([...Object.keys(desired), ...Object.keys(existingByUid)]);
    // Batch operaatiot
    const writer = db.bulkWriter();
    for (const uid of allUids) {
        const want = desired[uid] || {};
        const have = existingByUid[uid] || new Set();
        // Kirjoita / päivitä halutut
        for (const [cid, mirror] of Object.entries(want)) {
            writer.set(db.doc(`users/${uid}/assignedTasks/${cid}`), mirror);
        }
        // Poista vanhentuneet (have \ want), mutta vain nämä jotka kuuluvat tälle orgille
        for (const cid of have) {
            if (!cid.startsWith(`${orgId}__`))
                continue;
            if (!want[cid]) {
                writer.delete(db.doc(`users/${uid}/assignedTasks/${cid}`));
            }
        }
    }
    await writer.close();
}
exports.syncAssignedTasks = (0, firestore_1.onDocumentWritten)('organizations/{orgId}/data/{key}', async (event) => {
    const orgId = event.params.orgId;
    const key = event.params.key;
    if (!isTaskKey(key) && key !== 'orgTeamMembers')
        return;
    try {
        await recomputeOrgMirror(orgId);
    }
    catch (err) {
        console.error(`syncAssignedTasks failed for ${orgId}/${key}:`, err);
        throw err;
    }
});
