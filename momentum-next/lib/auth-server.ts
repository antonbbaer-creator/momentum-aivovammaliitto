// Verifioi Firebase ID-token Authorization-headerista API-routeissa.

import { getAuth } from 'firebase-admin/auth';
import { adminDb } from './firebase-admin';

// adminDb-init alustaa appin samalla kerralla
export async function getUidFromRequest(req: Request): Promise<string | null> {
  adminDb(); // alusta app
  const auth = getAuth();
  const authHeader = req.headers.get('authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  try {
    const decoded = await auth.verifyIdToken(match[1]);
    return decoded.uid;
  } catch (e) {
    console.warn('verifyIdToken failed:', e);
    return null;
  }
}
