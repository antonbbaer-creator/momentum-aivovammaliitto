# Momentum Cloud Functions

## syncAssignedTasks

Trigger: `onDocumentWritten('organizations/{orgId}/data/{key}')` kun `key` on `tasks`, `projects`, `grants*`, `apurahat*` tai `orgTeamMembers`.

Mitä tekee: parsii orgin tehtävät, resolvoi assignee-nimet uid:eihin org-jäsenistön + `users.email`-mappauksen kautta, ja kirjoittaa mirror-dokumentit polulle `users/{uid}/assignedTasks/{compositeId}`. Vanhentuneet poistetaan automaattisesti.

## Käyttöönotto

```bash
cd firebase/functions
npm install
npm run build
firebase deploy --only functions
```

## Backfill

Kerran deployin jälkeen aja olemassa olevan datan synkkaus:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json \
  node lib/scripts/backfillAssignedTasks.js
```

Tai paikallinen emulaattori:

```bash
firebase emulators:start --only firestore,functions
FIRESTORE_EMULATOR_HOST=localhost:8080 node lib/scripts/backfillAssignedTasks.js
```
