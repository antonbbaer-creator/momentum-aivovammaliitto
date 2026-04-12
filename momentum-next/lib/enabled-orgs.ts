/*
 * Väliaikainen rajoitus: vain LLFF on aktiivinen työtila
 *
 * Keskitymme rakentamaan LLFF-pohjaa. AVL ja Hetki Company ovat edelleen
 * Firestoressa (data ei ole kadonnut) mutta ne on suodatettu pois käyttäjän
 * näkymästä.
 *
 * Kun haluat aktivoida muita työtiloja, lisää ne tähän listaan:
 *   ['llff', 'avl']
 *
 * Admin-paneeli (/admin) näkee kaikki orgit tietokannasta aina.
 */
export const ENABLED_ORG_SLUGS = ['llff', 'avl', 'juhlatoimikunta'];

export const isOrgEnabled = (orgId: string): boolean => ENABLED_ORG_SLUGS.includes(orgId);
