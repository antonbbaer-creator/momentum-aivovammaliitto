// Aivojen vienti markdown-vaultiksi (zip): sama rakenne kuin tuonnissa, aukeaa Obsidianissa.
//   <Osio>/<Nimi>.md        frontmatter (ominaisuudet) + runko, [[wikilinkit]] sellaisenaan
//   Ehdotukset/<Otsikko>.md sovelluksessa syntyneet ehdotukset (tila, alue, vaikutus, kiire)
//   Mallit/<Nimi>.md        pohjat
//   Päätösloki.md           taulukko, jos aivoissa ei ole samannimistä muistiinpanoa
//   _momentum/*.json        tavoitteet, toteumat ja kirjaukset koneluettavina (varmuuskopio)

import JSZip from 'jszip';
import { adminDb } from './firebase-admin';
import { col } from './brain-server';
import {
  BRAIN_COLLECTIONS as C, serializeFrontmatter, safeFileName, nameKey,
  type BrainNote, type BrainSection, type BrainProposal, type BrainDecision, type BrainTemplate,
} from './brain-shared';

export async function buildVaultZip(orgId: string, vaultName: string): Promise<Uint8Array> {
  const db = adminDb();
  const [sections, notes, proposals, decisions, templates, goals, metrics, inbox] = await Promise.all([
    col(db, orgId, C.sections).get(), col(db, orgId, C.notes).get(), col(db, orgId, C.proposals).get(),
    col(db, orgId, C.decisions).get(), col(db, orgId, C.templates).get(), col(db, orgId, C.goals).get(),
    col(db, orgId, C.metrics).get(), col(db, orgId, C.inbox).get(),
  ]);
  const zip = new JSZip();
  const root = zip.folder(safeFileName(vaultName)) || zip;
  const secs = sections.docs.map(d => d.data() as BrainSection);
  const secBySlug = new Map(secs.map(s => [s.slug, s]));
  const folderOf = (slug: string): string => {
    const s = secBySlug.get(slug);
    if (!s) return 'Muut';
    const parent = s.parentSlug ? folderOf(s.parentSlug) + '/' : '';
    return parent + safeFileName(s.title);
  };
  const used = new Set<string>();
  const uniquePath = (p: string) => {
    let out = p;
    let n = 2;
    while (used.has(out.toLowerCase())) out = p.replace(/\.md$/, ` (${n++}).md`);
    used.add(out.toLowerCase());
    return out;
  };

  const noteNames = new Set<string>();
  for (const d of notes.docs) {
    const n = d.data() as BrainNote;
    noteNames.add(nameKey(n.name));
    const path = n.sourcePath && /\.md$/i.test(n.sourcePath) && !n.sourcePath.includes('..')
      ? n.sourcePath
      : `${folderOf(n.sectionSlug)}/${safeFileName(n.name)}.md`;
    root.file(uniquePath(path), serializeFrontmatter(n.properties || {}) + (n.bodyMd || ''));
  }

  for (const d of proposals.docs) {
    const p = d.data() as BrainProposal;
    if (p.noteSlug) continue; // teksti on jo muistiinpanona
    const props = { tila: p.status, alue: p.area, vaikutus: p.impact, kiire: p.urgency, tekijä: p.createdBy, luotu: new Date(p.createdAt).toISOString().slice(0, 10) };
    const sources = p.sources?.length ? `\n\n## Lähteet\n\n${p.sources.map(s => `- ${/^https?:/.test(s) ? s : `[[${s}]]`}`).join('\n')}\n` : '';
    root.file(uniquePath(`Ehdotukset/${safeFileName(p.title)}.md`), serializeFrontmatter(props) + `# ${p.title}\n\n${p.bodyMd || ''}${sources}`);
  }

  for (const d of templates.docs) {
    const t = d.data() as BrainTemplate;
    root.file(uniquePath(`Mallit/${safeFileName(t.name)}.md`), serializeFrontmatter(t.propertiesTemplate || {}) + (t.bodyMd || ''));
  }

  if (!decisions.empty && !noteNames.has(nameKey('Päätösloki'))) {
    const rows = decisions.docs.map(d => d.data() as BrainDecision).sort((a, b) => String(a.decidedOn).localeCompare(String(b.decidedOn)));
    const esc = (s: unknown) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
    const table = ['| Päivä | Päätös | Alue | Perustelu |', '|---|---|---|---|', ...rows.map(r => `| ${esc(r.decidedOn)} | ${esc(r.decision)} | ${esc(r.area)} | ${esc(r.rationale)} |`)];
    root.file(uniquePath('Päätösloki.md'), `# Päätösloki\n\n${table.join('\n')}\n`);
  }

  const data = zip.folder('_momentum');
  const json = (x: unknown) => JSON.stringify(x, null, 2);
  data?.file('tavoitteet.json', json(goals.docs.map(d => d.data())));
  data?.file('toteumat.json', json(metrics.docs.map(d => d.data())));
  data?.file('kirjaukset.json', json(inbox.docs.map(d => d.data())));
  data?.file('paatokset.json', json(decisions.docs.map(d => d.data())));
  data?.file('ehdotukset.json', json(proposals.docs.map(d => d.data())));
  data?.file('LUEMINUT.txt', 'Momentumin aivojen vienti. Markdown-tiedostot avautuvat Obsidianissa vaultina. Tämä kansio sisältää rakenteisen datan varmuuskopiona.\n');

  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
