"use strict";
// Backfill-skripti: ajetaan kerran kun syncAssignedTasks-funktio deployataan.
// Iteroi kaikkien organisaatioiden yli ja kutsuu recomputeOrgMirror.
//
// Käyttö (paikallisesti, GOOGLE_APPLICATION_CREDENTIALS asetettu):
//   npm run build && node lib/scripts/backfillAssignedTasks.js
//
// Tai emulaattorissa:
//   firebase emulators:start --only firestore,functions
//   FIRESTORE_EMULATOR_HOST=localhost:8080 node lib/scripts/backfillAssignedTasks.js
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
const admin = __importStar(require("firebase-admin"));
const syncAssignedTasks_1 = require("../syncAssignedTasks");
if (admin.apps.length === 0)
    admin.initializeApp();
async function main() {
    const orgs = await admin.firestore().collection('organizations').listDocuments();
    console.log(`Found ${orgs.length} organizations`);
    for (const orgRef of orgs) {
        console.log(`Recomputing mirror for ${orgRef.id}...`);
        try {
            await (0, syncAssignedTasks_1.recomputeOrgMirror)(orgRef.id);
            console.log(`  done`);
        }
        catch (e) {
            console.error(`  FAILED for ${orgRef.id}:`, e);
        }
    }
    console.log('Backfill complete');
}
main().then(() => process.exit(0)).catch((e) => {
    console.error(e);
    process.exit(1);
});
