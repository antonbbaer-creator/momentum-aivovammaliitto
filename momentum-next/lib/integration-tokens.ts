// Server-side: hae access-token kullekin käyttäjälle, refreshaa tarvittaessa.
// Palautetaan validi access-token tai null (jos integraatio ei toimi).

import { adminDb } from './firebase-admin';
import { googleOAuthConfig, microsoftOAuthConfig } from './oauth-config';
import { CalendarProvider, IntegrationDoc, isExpired } from './integrations-shared';

interface TokenRefreshResult {
  accessToken: string;
  expiresAt: number;
}

async function refreshGoogle(refreshToken: string): Promise<TokenRefreshResult> {
  const cfg = googleOAuthConfig();
  const res = await fetch(cfg.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google refresh failed: ${body}`);
  }
  const data = await res.json() as { access_token: string; expires_in: number };
  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

async function refreshMicrosoft(refreshToken: string): Promise<TokenRefreshResult> {
  const cfg = microsoftOAuthConfig();
  const res = await fetch(cfg.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: cfg.scopes.join(' '),
    }).toString(),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Microsoft refresh failed: ${body}`);
  }
  const data = await res.json() as { access_token: string; expires_in: number };
  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

/**
 * Lue integraatio-doc, refreshaa token jos vanhentunut, palauta validi access-token.
 * Päivittää myös Firestoreen uuden tokenin.
 */
export async function getValidAccessToken(
  uid: string,
  provider: CalendarProvider,
): Promise<{ accessToken: string; doc: IntegrationDoc } | null> {
  const db = adminDb();
  const ref = db.doc(`users/${uid}/integrations/${provider}`);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const doc = snap.data() as IntegrationDoc;
  if (!doc.refreshToken) return null;

  if (!isExpired({ expiresAt: doc.expiresAt })) {
    return { accessToken: doc.accessToken, doc };
  }

  try {
    const refreshed = provider === 'google'
      ? await refreshGoogle(doc.refreshToken)
      : await refreshMicrosoft(doc.refreshToken);
    await ref.update({
      accessToken: refreshed.accessToken,
      expiresAt: refreshed.expiresAt,
    });
    return { accessToken: refreshed.accessToken, doc: { ...doc, ...refreshed } };
  } catch (e) {
    console.error(`Token refresh failed for ${uid}/${provider}:`, e);
    await ref.update({ lastSyncError: String(e) });
    return null;
  }
}
