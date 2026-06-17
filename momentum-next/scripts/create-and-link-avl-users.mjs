#!/usr/bin/env node
// Luo Firebase Auth -tilit annetuille sähköposteille ja liittää ne avl-orgiin
// (userOrgs + members + orgTeamMembers.linkedUserEmails). Kertaluontoinen
// provisiointiskripti — ajetaan Claude Code -shellistä, ei tuotanto-UI:sta.
//
// Auth-tilit: Identity Toolkit REST (web-API-avain) — ei vaadi service accountia.
// Firestore-kirjoitus: firebase-tools OAuth-token (owner, ohittaa säännöt).
//
// Käyttö:
//   node scripts/create-and-link-avl-users.mjs validate   # vain luku, ei muutoksia
//   node scripts/create-and-link-avl-users.mjs run         # luo tilit + linkitykset

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const MODE = process.argv[2] || 'validate';
if (!['validate', 'run'].includes(MODE)) {
  console.error('Käyttö: node scripts/create-and-link-avl-users.mjs <validate|run>');
  process.exit(1);
}

const PROJECT_ID = 'momentum-69262';
const WEB_API_KEY = 'AIzaSyB6MGUyOveOl1zaV_1c0TdBVldZM09Sm8E';
const ORG_ID = 'avl';
const ROLE = 'member';

// firebase-tools OAuth (julkiset, well-known credentialit)
const FB_CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const FB_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

const USERS = [
  { email: 'pia.kilpelainen@aivovammaliitto.fi', displayName: 'Pia Kilpeläinen', matchName: 'Pia Kilpeläinen' },
  { email: 'jani.saarinen@aivovammaliitto.fi',  displayName: 'Jani Saarinen',  matchName: 'Jani Saarinen' },
];

const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const norm = (s) => (s || '').toLowerCase().trim();

// ── OAuth: refresh firebase-tools access token ──────────────────────────────
async function getFirestoreToken() {
  const p = path.join(os.homedir(), '.config/configstore/firebase-tools.json');
  const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
  const refreshToken = data?.tokens?.refresh_token;
  if (!refreshToken) throw new Error('refresh_token puuttuu firebase-tools.json:sta');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: FB_CLIENT_ID,
      client_secret: FB_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const j = await res.json();
  if (!res.ok || !j.access_token) throw new Error('Token-refresh epäonnistui: ' + JSON.stringify(j));
  return j.access_token;
}

// ── Firestore typed-value helpers ───────────────────────────────────────────
function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === 'object') return { mapValue: { fields: toFields(v) } };
  throw new Error('Tuntematon arvotyyppi: ' + typeof v);
}
function toFields(obj) {
  const f = {};
  for (const [k, val] of Object.entries(obj)) f[k] = toValue(val);
  return f;
}
function fromValue(v) {
  if (!v) return undefined;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromValue);
  if ('mapValue' in v) return fromFields(v.mapValue.fields || {});
  return undefined;
}
function fromFields(fields) {
  const o = {};
  for (const [k, val] of Object.entries(fields)) o[k] = fromValue(val);
  return o;
}

let FS_TOKEN = null;
async function fsGet(docPath) {
  const res = await fetch(`${FS_BASE}/${docPath}`, { headers: { Authorization: `Bearer ${FS_TOKEN}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore GET ${docPath} -> ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return fromFields(j.fields || {});
}
async function fsPatch(docPath, obj, fieldPaths) {
  let url = `${FS_BASE}/${docPath}`;
  if (fieldPaths) url += '?' + fieldPaths.map(fp => `updateMask.fieldPaths=${encodeURIComponent(fp)}`).join('&');
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${FS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: toFields(obj) }),
  });
  if (!res.ok) throw new Error(`Firestore PATCH ${docPath} -> ${res.status}: ${await res.text()}`);
}

// ── Identity Toolkit: auth-user helpers ─────────────────────────────────────
async function authLookupByEmail(email) {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${WEB_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: [email] }),
  });
  const j = await res.json();
  if (j.users && j.users.length) return j.users[0].localId;
  return null;
}
async function authCreateUser(email, password, displayName) {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${WEB_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, displayName, returnSecureToken: false }),
  });
  const j = await res.json();
  if (!res.ok) {
    const msg = j?.error?.message || JSON.stringify(j);
    return { error: msg };
  }
  return { uid: j.localId };
}
function genPassword() {
  // 18 merkkiä: kirjaimet+numerot+pari symbolia, helppo välittää
  const bytes = crypto.randomBytes(24).toString('base64').replace(/[^A-Za-z0-9]/g, '');
  return bytes.slice(0, 14) + 'Aa9!';
}

// ── Per-user provisiointi ───────────────────────────────────────────────────
async function provision(u, orgName, dryRun) {
  const log = [];
  const warn = [];

  // 1. Auth user
  let uid = await authLookupByEmail(u.email);
  let password = null;
  if (uid) {
    log.push(`auth-tili on jo (uid ${uid}) — salasanaa ei vaihdeta`);
  } else if (dryRun) {
    log.push('auth-tiliä EI ole — luotaisiin run-tilassa');
  } else {
    password = genPassword();
    const r = await authCreateUser(u.email, password, u.displayName);
    if (r.error) { warn.push(`auth-tilin luonti epäonnistui: ${r.error}`); return { log, warn, uid: null, password: null }; }
    uid = r.uid;
    log.push(`+ auth-tili luotu (uid ${uid})`);
  }
  if (!uid) return { log, warn, uid: null, password };

  // 2. users/{uid}
  if (dryRun) {
    const cur = await fsGet(`users/${uid}`);
    log.push(`users/${uid} ${cur ? 'on jo' : 'puuttuu (luotaisiin)'}`);
  } else {
    await fsPatch(`users/${uid}`, { email: u.email, displayName: u.displayName }, ['email', 'displayName']);
    log.push(`✓ users/${uid} (email, displayName)`);
  }

  // 3. userOrgs/{uid} — merge, älä clobberaa muita orgeja
  const curUO = (await fsGet(`userOrgs/${uid}`)) || { orgs: [], orgIds: [] };
  const orgs = Array.isArray(curUO.orgs) ? curUO.orgs : [];
  const orgIds = Array.isArray(curUO.orgIds) ? curUO.orgIds : [];
  if (orgIds.includes(ORG_ID)) {
    log.push(`userOrgs sisältää jo ${ORG_ID}`);
  } else if (dryRun) {
    log.push(`userOrgs: lisättäisiin ${ORG_ID} (${ROLE})`);
  } else {
    const nextOrgs = [...orgs, { orgId: ORG_ID, role: ROLE, name: orgName }];
    const nextIds = [...orgIds, ORG_ID];
    await fsPatch(`userOrgs/${uid}`, { orgs: nextOrgs, orgIds: nextIds }, ['orgs', 'orgIds']);
    log.push(`✓ userOrgs += ${ORG_ID} (${ROLE})`);
  }

  // 4. organizations/avl/members/{uid}
  const curMember = await fsGet(`organizations/${ORG_ID}/members/${uid}`);
  if (curMember) {
    log.push(`members/${uid} on jo (role ${curMember.role})`);
  } else if (dryRun) {
    log.push(`members/${uid}: luotaisiin (${ROLE})`);
  } else {
    await fsPatch(`organizations/${ORG_ID}/members/${uid}`, {
      role: ROLE, joinedAt: new Date().toISOString(),
      displayName: u.displayName, email: u.email, photoURL: '',
    });
    log.push(`✓ members/${uid} (${ROLE})`);
  }

  // 5. orgTeamMembers.linkedUserEmails
  const otmPath = `organizations/${ORG_ID}/data/orgTeamMembers`;
  const otm = await fsGet(otmPath);
  if (!otm || typeof otm.v !== 'string') {
    warn.push('orgTeamMembers-dokumentti puuttuu tai ei ole odotetussa muodossa — linkitys ohitettu');
  } else {
    let members;
    try { members = JSON.parse(otm.v); } catch { members = null; }
    if (!Array.isArray(members)) {
      warn.push('orgTeamMembers.v ei ole validia JSON-taulukkoa');
    } else {
      const target = norm(u.matchName);
      const targetFirst = target.split(' ')[0];
      let idx = members.findIndex(m => norm(m.name) === target);
      if (idx < 0) idx = members.findIndex(m => norm(m.name).split(' ')[0] === targetFirst);
      if (idx < 0) {
        warn.push(`tiimijäsentä "${u.matchName}" ei löytynyt. Olemassa: ${members.map(m => m.name).join(', ')}`);
      } else {
        const m = members[idx];
        const linked = Array.isArray(m.linkedUserEmails) ? m.linkedUserEmails.slice() : [];
        if (linked.map(norm).includes(norm(u.email))) {
          log.push(`linkedUserEmails: "${m.name}" sisältää jo ${u.email}`);
        } else if (dryRun) {
          log.push(`linkedUserEmails: lisättäisiin ${u.email} -> "${m.name}"`);
        } else {
          linked.push(u.email);
          members[idx] = { ...m, linkedUserEmails: linked, email: m.email || u.email };
          await fsPatch(otmPath, { v: JSON.stringify(members), ts: Date.now(), updatedBy: 'script:create-and-link-avl-users' }, ['v', 'ts', 'updatedBy']);
          log.push(`✓ linkedUserEmails: "${m.name}" += ${u.email}`);
        }
      }
    }
  }

  return { log, warn, uid, password };
}

// ── Main ────────────────────────────────────────────────────────────────────
(async () => {
  const dryRun = MODE === 'validate';
  console.log(`\n=== ${dryRun ? 'VALIDATE (vain luku)' : 'RUN (luo + linkittää)'} — org ${ORG_ID} ===\n`);
  FS_TOKEN = await getFirestoreToken();
  console.log('Firestore-token: OK (refreshattu)\n');

  const org = await fsGet(`organizations/${ORG_ID}`);
  if (!org) { console.error(`Organisaatiota "${ORG_ID}" ei löydy Firestoresta`); process.exit(2); }
  const orgName = org.name || ORG_ID;
  console.log(`Org: ${ORG_ID} -> "${orgName}"\n`);

  // Pre-flight: varmista että tiimijäsenet löytyvät live-orgTeamMembersista
  const otmPre = await fsGet(`organizations/${ORG_ID}/data/orgTeamMembers`);
  if (!otmPre || typeof otmPre.v !== 'string') {
    console.log('! orgTeamMembers-dokumentti puuttuu tai väärä muoto — linkitys ei toimisi\n');
  } else {
    let mem = []; try { mem = JSON.parse(otmPre.v); } catch {}
    console.log('orgTeamMembers-esitarkistus:');
    for (const u of USERS) {
      const t = norm(u.matchName), tf = t.split(' ')[0];
      const m = mem.find(x => norm(x.name) === t) || mem.find(x => norm(x.name).split(' ')[0] === tf);
      const linked = m && Array.isArray(m.linkedUserEmails) ? m.linkedUserEmails : [];
      console.log(`  "${u.matchName}" -> ${m ? `löytyi (id ${m.id}), linkedUserEmails: [${linked.join(', ')}]` : 'EI LÖYTYNYT'}`);
    }
    console.log('');
  }

  const creds = [];
  for (const u of USERS) {
    console.log(`--- ${u.displayName} <${u.email}> ---`);
    const r = await provision(u, orgName, dryRun);
    for (const s of r.log) console.log('  ' + s);
    for (const w of r.warn) console.log('  ! ' + w);
    if (r.password) creds.push({ email: u.email, password: r.password });
    console.log('');
  }

  if (!dryRun && creds.length) {
    console.log('=== UUDET SALASANAT (välitä Pialle ja Janille turvallisesti) ===');
    for (const c of creds) console.log(`  ${c.email}  ->  ${c.password}`);
    console.log('');
  }
  console.log(dryRun ? '> Validointi valmis. Aja "run" tehdäksesi muutokset.' : '> Valmis.');
  process.exit(0);
})().catch(e => { console.error('FAIL:', e); process.exit(3); });
