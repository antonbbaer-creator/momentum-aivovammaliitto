/*
 * Aktiiviset työtilat — käyttäjille näkyvät orgit.
 *
 * Kun haluat aktivoida tai poistaa työtilan käyttäjänäkymästä, muokkaa tätä listaa.
 * Admin-paneeli (/admin) näkee kaikki orgit tietokannasta aina.
 */
export const ENABLED_ORG_SLUGS = ['llff', 'avl', 'juhlatoimikunta', 'luuri', 'ihaa', 'hetki-company'];

export const isOrgEnabled = (orgId: string): boolean => ENABLED_ORG_SLUGS.includes(orgId);
