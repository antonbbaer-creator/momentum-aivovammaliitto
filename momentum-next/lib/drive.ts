'use client';

import { useEffect, useState } from 'react';
import { GoogleAuthProvider, signInWithPopup, reauthenticateWithPopup } from 'firebase/auth';
import { doc, getDoc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase';

// Skoopit jotka pyydetään käyttäjältä:
// - drive.file: vain käyttäjän valitsemat / Momentumin luomat tiedostot
// - drive.metadata.readonly: kansiorakenteen selailu (vain metatiedot, ei sisältöä)
export const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
];

export interface DriveTokenDoc {
  accessToken: string;
  expiresAt: number;          // ms epoch
  scopes: string[];
  email?: string;
  connectedAt: number;
}

// Firestore-polku per käyttäjä
const tokenDocRef = (uid: string) => doc(db, 'users', uid, 'integrations', 'google');

/**
 * Yhdistä Google Drive nykyiselle käyttäjälle. Avaa popupin ja pyytää drive-skoopit.
 * Jos käyttäjä on jo kirjautunut Googlella, käytetään reauthenticate-popupia jotta
 * Firebase-istunto ei katkea. Muille (esim. sähköposti+salasana) käytetään
 * signInWithPopup ja accountit linkitetään jos sähköposti täsmää.
 */
export async function connectDrive(): Promise<DriveTokenDoc> {
  const user = auth.currentUser;
  if (!user) throw new Error('Et ole kirjautunut sisään.');

  const provider = new GoogleAuthProvider();
  DRIVE_SCOPES.forEach(s => provider.addScope(s));
  // Esitäytä popup nykyisen käyttäjän sähköpostilla jotta he eivät vahingossa
  // valitse väärää Google-tiliä (joka aiheuttaisi auth/user-mismatch -virheen).
  const customParams: Record<string, string> = {
    prompt: 'consent',
    include_granted_scopes: 'true',
  };
  if (user.email) customParams.login_hint = user.email;
  provider.setCustomParameters(customParams);

  const isGoogleUser = user.providerData.some(p => p.providerId === 'google.com');
  let result;
  try {
    result = isGoogleUser
      ? await reauthenticateWithPopup(user, provider)
      : await signInWithPopup(auth, provider);
  } catch (e: any) {
    // user-mismatch: käyttäjä valitsi popupissa eri Google-tilin kuin Momentumin oma
    if (e?.code === 'auth/user-mismatch') {
      throw new Error(
        `Google-tilien törmäys: olet kirjautunut Momentumiin tilillä ${user.email || 'tuntematon'}, mutta popupissa valitsit eri tilin. Yhdistä uudelleen ja valitse popupissa sama tili.`
      );
    }
    if (e?.code === 'auth/popup-closed-by-user' || e?.code === 'auth/cancelled-popup-request') {
      throw new Error('Yhdistäminen peruttiin.');
    }
    throw e;
  }

  const credential = GoogleAuthProvider.credentialFromResult(result);
  const accessToken = credential?.accessToken;
  if (!accessToken) throw new Error('Google ei palauttanut access-tokenia.');

  // Google access tokens elävät yleensä 3600s. Tarkka expiry tulee tokeninfo-rajapinnasta.
  let expiresIn = 3600;
  try {
    const info = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${accessToken}`).then(r => r.json());
    if (typeof info.expires_in === 'number') expiresIn = info.expires_in;
  } catch { /* käytetään defaulttia */ }

  const tokenDoc: DriveTokenDoc = {
    accessToken,
    expiresAt: Date.now() + expiresIn * 1000,
    scopes: DRIVE_SCOPES,
    email: result.user?.email || undefined,
    connectedAt: Date.now(),
  };

  await setDoc(tokenDocRef(user.uid), tokenDoc);
  return tokenDoc;
}

/** Katkaise Drive-yhteys: poista talletettu token. (Käyttäjän on revoke-attava skooppi
 *  manuaalisesti Googlen tilihallinnasta jos haluaa peruuttaa täysin.) */
export async function disconnectDrive(): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  await deleteDoc(tokenDocRef(user.uid));
}

/** Lue talletettu token Firestoresta. Palauttaa null jos ei yhdistetty tai vanhentunut. */
export async function getDriveToken(): Promise<DriveTokenDoc | null> {
  const user = auth.currentUser;
  if (!user) return null;
  const snap = await getDoc(tokenDocRef(user.uid));
  if (!snap.exists()) return null;
  const data = snap.data() as DriveTokenDoc;
  if (data.expiresAt <= Date.now()) return null;  // vanhentunut → frontti pyytää reconnectia
  return data;
}

/** Hae tuore voimassa oleva access token tai null. Kutsuvan koodin pitää tarjota
 *  käyttäjälle reconnect-mahdollisuus jos null. */
export async function getDriveAccessToken(): Promise<string | null> {
  const tok = await getDriveToken();
  return tok?.accessToken || null;
}

export interface DriveStatus {
  connected: boolean;
  email?: string;
  expiresAt?: number;
  scopes?: string[];
  loading: boolean;
}

/** Reactiivinen hook joka seuraa Drive-yhteyden tilaa Firestoresta. */
export function useDriveStatus(): DriveStatus {
  const [state, setState] = useState<DriveStatus>({ connected: false, loading: true });

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setState({ connected: false, loading: false });
      return;
    }
    const unsub = onSnapshot(tokenDocRef(user.uid), snap => {
      if (!snap.exists()) {
        setState({ connected: false, loading: false });
        return;
      }
      const data = snap.data() as DriveTokenDoc;
      const valid = data.expiresAt > Date.now();
      setState({
        connected: valid,
        email: data.email,
        expiresAt: data.expiresAt,
        scopes: data.scopes,
        loading: false,
      });
    }, () => {
      setState({ connected: false, loading: false });
    });
    return unsub;
  }, []);

  return state;
}

/** Apuri Drive REST API -kutsuihin. Heittää 401 jos token on vanhentunut. */
export async function driveFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getDriveAccessToken();
  if (!token) throw new Error('Drive ei ole yhdistetty tai token on vanhentunut.');
  const url = path.startsWith('http')
    ? path
    : `https://www.googleapis.com/drive/v3/${path.replace(/^\//, '')}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
  return res;
}

// ─── Drive REST -helperit ─────────────────────────────────────────────────────

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  iconLink?: string;
  thumbnailLink?: string;
  modifiedTime?: string;
  size?: string;
  parents?: string[];
}

/** Lue tiedoston sisältö tekstinä. Google Docs -dokumentit exportataan markdowniksi
 *  jotta sisältö säilyttää muotoiluja. Plain-text/markdown ladataan sellaisenaan. */
export async function getFileContent(fileId: string, mimeType: string): Promise<string> {
  // Google Docs → export markdowniksi
  if (mimeType === 'application/vnd.google-apps.document') {
    const res = await driveFetch(`files/${fileId}/export?mimeType=text%2Fmarkdown`);
    if (!res.ok) throw new Error(`Drive export epäonnistui: ${res.status}`);
    return await res.text();
  }
  // Tekstitiedostot ladataan suoraan
  const res = await driveFetch(`files/${fileId}?alt=media`);
  if (!res.ok) throw new Error(`Drive download epäonnistui: ${res.status}`);
  return await res.text();
}

/** Luo uusi Google Docs -dokumentti annetulla nimellä ja sisällöllä. Palauttaa
 *  tiedoston metatiedot mukaan lukien webViewLink Driveen. Käyttää
 *  multipart-uploadia jotta voimme samalla kertaa luoda metatiedot ja sisällön. */
export async function exportToDoc(name: string, markdownOrText: string): Promise<DriveFile> {
  const boundary = `momentum_${Math.random().toString(36).slice(2)}`;
  const metadata = {
    name,
    mimeType: 'application/vnd.google-apps.document',
  };
  // Lähetetään tekstinä (mimeType: text/markdown). Google Drive konvertoi
  // automaattisesti Google Docs -muotoon koska target mimeType on docs.
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: text/markdown; charset=UTF-8',
    '',
    markdownOrText,
    `--${boundary}--`,
  ].join('\r\n');

  const res = await driveFetch(
    `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink,iconLink`,
    {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    }
  );
  if (!res.ok) throw new Error(`Drive-vienti epäonnistui: ${res.status}`);
  return await res.json();
}

/** Listaa kansion sisältö (kuvat, videot, dokumentit). Vaatii että käyttäjä on
 *  joko valinnut kansion Pickerillä (drive.file kattaa lapset) tai että
 *  drive.metadata.readonly -skooppi on myönnetty. */
export async function listFolderChildren(folderId: string, opts: { mimeStartsWith?: string; pageSize?: number } = {}): Promise<DriveFile[]> {
  const q: string[] = [`'${folderId}' in parents`, 'trashed = false'];
  if (opts.mimeStartsWith) q.push(`mimeType contains '${opts.mimeStartsWith}'`);
  const params = new URLSearchParams({
    q: q.join(' and '),
    fields: 'files(id,name,mimeType,webViewLink,iconLink,thumbnailLink,modifiedTime,size,parents)',
    pageSize: String(opts.pageSize || 100),
    orderBy: 'modifiedTime desc',
  });
  const res = await driveFetch(`files?${params.toString()}`);
  if (!res.ok) throw new Error(`Drive-listaus epäonnistui: ${res.status}`);
  const data = await res.json();
  return (data.files || []) as DriveFile[];
}

/** Hae yksittäisen tiedoston metatiedot. */
export async function getFileMeta(fileId: string): Promise<DriveFile> {
  const fields = 'id,name,mimeType,webViewLink,iconLink,thumbnailLink,modifiedTime,size,parents';
  const res = await driveFetch(`files/${fileId}?fields=${fields}`);
  if (!res.ok) throw new Error(`Drive-meta epäonnistui: ${res.status}`);
  return await res.json();
}
