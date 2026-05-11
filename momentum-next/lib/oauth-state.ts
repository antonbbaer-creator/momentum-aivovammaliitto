// HMAC-allekirjoitettu OAuth state -tokeni.
//
// Estää CSRF-hyökkäyksen jossa hyökkääjä rakentaisi linkin
// `/api/oauth/google/start?uid=victim-uid` ja saisi joko tallennettua
// uhrin tokenit hyökkääjän dokumenttiin tai päinvastoin.
//
// Toimintatapa:
// 1. Start-reitti todentaa Firebase-istunnon (Authorization-header tai cookie)
// 2. signOAuthState(uid) tuottaa allekirjoitetun stringin joka sidotaan tähän uid:iin
// 3. State lähetetään Googlelle/Microsoftille redirectin mukana
// 4. Callback-reitti vastaanottaa staten, kutsuu verifyOAuthState()
// 5. Vain verifioitu uid päätyy tokenien tallennuspolkuun

import crypto from 'node:crypto';

const STATE_TTL_MS = 5 * 60_000;
const VERSION = '1';

function getSecret(): string {
  const s = process.env.OAUTH_STATE_SECRET;
  // 32 merkkiä = 256 bittiä, suositeltu HMAC-SHA256 -avaimen pituus.
  // Tätä lyhyemmät altistuvat heikoille avaimille (esim. dictionary-pohjaiset).
  if (!s || s.length < 32) {
    throw new Error('OAUTH_STATE_SECRET puuttuu tai on liian lyhyt (vähintään 32 merkkiä). Generoi: openssl rand -base64 48');
  }
  return s;
}

/**
 * Allekirjoita OAuth-state. Palauttaa rakenteen `v.uid.nonce.expiresAt.hmac`.
 * Jokainen kenttä on URL-safe (ei sisällä erottimia).
 */
export function signOAuthState(uid: string): string {
  if (!uid || uid.includes('.')) {
    throw new Error('Virheellinen uid');
  }
  const nonce = crypto.randomBytes(16).toString('hex');
  const expiresAt = String(Date.now() + STATE_TTL_MS);
  const payload = `${VERSION}.${uid}.${nonce}.${expiresAt}`;
  const hmac = crypto
    .createHmac('sha256', getSecret())
    .update(payload)
    .digest('hex');
  return `${payload}.${hmac}`;
}

/**
 * Verifioi state. Palauttaa { uid } onnistuessa, null jos allekirjoitus,
 * versio tai vanhentumisaika ei kelpaa.
 */
export function verifyOAuthState(state: string | null | undefined): { uid: string } | null {
  if (!state) return null;
  const parts = state.split('.');
  if (parts.length !== 5) return null;
  const [version, uid, nonce, expiresAtStr, providedHmac] = parts;
  if (version !== VERSION) return null;
  if (!uid || !nonce || !expiresAtStr || !providedHmac) return null;

  const payload = `${version}.${uid}.${nonce}.${expiresAtStr}`;
  let expectedHmac: string;
  try {
    expectedHmac = crypto
      .createHmac('sha256', getSecret())
      .update(payload)
      .digest('hex');
  } catch {
    return null;
  }

  // Time-safe vertailu
  const a = Buffer.from(providedHmac, 'hex');
  const b = Buffer.from(expectedHmac, 'hex');
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;

  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;

  return { uid };
}
