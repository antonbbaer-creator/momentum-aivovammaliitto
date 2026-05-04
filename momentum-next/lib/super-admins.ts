// Super-adminit — yhden totuuden lähde sähköposteille jotka saavat
// yliemo-oikeudet alustalla (admin-paneeli, kaikkien orgien luku-/kirjoitusoikeus).
//
// ⚠ HUOMIO: synkkaa tämä lista myös `firestore.rules`-tiedoston `isSuperAdmin()`-
// funktion sähköposteihin. Säännöissä ei voi importata.

export const SUPER_ADMIN_EMAILS = [
  'anton@hetkicompany.com',
  'anton.baer@gmail.com',
  'anton.b.baer@gmail.com',
  'anton.baer@kinolapinlahti.fi',
  'claude-test@hetkicompany.com',
] as const;

const NORMALIZED = SUPER_ADMIN_EMAILS.map(s => s.toLowerCase());

export function isSuperAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return NORMALIZED.includes(email.toLowerCase());
}
