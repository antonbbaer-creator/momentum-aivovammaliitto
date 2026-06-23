// PDF-korjausmoottori (pdf-lib). Toimii sekä selaimessa että Nodessa (ei DOM-riippuvuutta).
// Vastaa pilotin Java-työkaluja: Figure-enumerointi, /Alt, /Contents (linkit), PDF/UA-metatiedot.

import {
  PDFDocument, PDFName, PDFDict, PDFArray, PDFRef, PDFNumber, PDFString, PDFBool,
} from 'pdf-lib';
import type { PdfFigure } from './pdf-accessibility-shared';

const FIGURE = PDFName.of('Figure');
const K = PDFName.of('K');
const S = PDFName.of('S');
const PG = PDFName.of('Pg');
const A = PDFName.of('A');
const BBOX = PDFName.of('BBox');
const ALT = PDFName.of('Alt');

type Ctx = PDFDocument['context'];

function resolve(ctx: Ctx, obj: unknown): unknown {
  return obj instanceof PDFRef ? ctx.lookup(obj) : obj;
}

function pageIndexMap(doc: PDFDocument): Map<string, number> {
  const m = new Map<string, number>();
  doc.getPages().forEach((p, i) => m.set(p.ref.toString(), i));
  return m;
}

function findBBox(ctx: Ctx, el: PDFDict): [number, number, number, number] | null {
  const a = resolve(ctx, el.get(A));
  const dicts: PDFDict[] = [];
  if (a instanceof PDFDict) dicts.push(a);
  else if (a instanceof PDFArray) {
    for (const it of a.asArray()) { const r = resolve(ctx, it); if (r instanceof PDFDict) dicts.push(r); }
  }
  for (const d of dicts) {
    const bb = resolve(ctx, d.get(BBOX));
    if (bb instanceof PDFArray && bb.size() >= 4) {
      const n = (i: number) => { const v = resolve(ctx, bb.get(i)); return v instanceof PDFNumber ? v.asNumber() : 0; };
      return [n(0), n(1), n(2), n(3)];
    }
  }
  return null;
}

// Käy struct-puu järjestyksessä ja kutsuu cb jokaiselle Figure-elementille (sama järjestys kuin pilotissa).
function walkFigures(ctx: Ctx, node: unknown, pages: Map<string, number>, cb: (el: PDFDict, page: number) => void): void {
  const resolved = resolve(ctx, node);
  if (resolved instanceof PDFArray) { for (const el of resolved.asArray()) walkFigures(ctx, el, pages, cb); return; }
  if (!(resolved instanceof PDFDict)) return;
  if (resolved.get(S) === FIGURE) {
    const pgRef = resolved.get(PG);
    const page = pgRef instanceof PDFRef ? (pages.get(pgRef.toString()) ?? -1) : -1;
    cb(resolved, page);
  }
  const kids = resolved.get(K);
  if (kids !== undefined) walkFigures(ctx, kids, pages, cb);
}

function structRootKids(doc: PDFDocument): unknown {
  const root = doc.catalog.lookup(PDFName.of('StructTreeRoot'), PDFDict);
  return root?.get(K);
}

/** Luettele tagatun PDF:n Figure-elementit (sivu, bbox, mahdollinen olemassa oleva alt). */
export async function enumerateFigures(bytes: Uint8Array): Promise<PdfFigure[]> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const ctx = doc.context;
  const pages = pageIndexMap(doc);
  const figures: PdfFigure[] = [];
  let i = 0;
  walkFigures(ctx, structRootKids(doc), pages, (el, page) => {
    const existing = el.get(ALT);
    const alt = existing instanceof PDFString ? existing.asString() : '';
    figures.push({
      id: `fig_${i}`,
      page: page + 1,
      bbox: findBBox(ctx, el) ?? [0, 0, 0, 0],
      alt,
      decorative: false,
    });
    i++;
  });
  return figures;
}

function buildXmp(title: string): string {
  const t = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
        xmlns:dc="http://purl.org/dc/elements/1.1/"
        xmlns:pdfuaid="http://www.aiim.org/pdfua/ns/id/">
      <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${t}</rdf:li></rdf:Alt></dc:title>
      <pdfuaid:part>1</pdfuaid:part>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

export interface RemediationInput {
  figures: { alt: string; decorative: boolean }[]; // järjestyksessä kuten enumerateFigures
  title: string;
  lang: string;
  linkContents?: string[]; // linkkien /Contents järjestyksessä; puuttuvat johdetaan URI:sta
}

/** Aseta /Alt kuviin, /Contents linkkeihin ja PDF/UA-metatiedot. Palauttaa korjatut tavut. */
export async function applyRemediation(bytes: Uint8Array, input: RemediationInput): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const ctx = doc.context;

  // 1) Alt-tekstit (järjestyksessä)
  const pages = pageIndexMap(doc);
  let fi = 0;
  walkFigures(ctx, structRootKids(doc), pages, (el) => {
    const f = input.figures[fi];
    if (f) el.set(ALT, PDFString.of(f.alt || ''));
    fi++;
  });

  // 2) Linkkien /Contents
  let li = 0;
  for (const page of doc.getPages()) {
    const annots = page.node.Annots();
    if (!annots) continue;
    for (const ref of annots.asArray()) {
      const an = resolve(ctx, ref);
      if (!(an instanceof PDFDict)) continue;
      if (an.get(PDFName.of('Subtype')) !== PDFName.of('Link')) continue;
      let contents = input.linkContents?.[li];
      if (!contents) {
        const act = resolve(ctx, an.get(A));
        if (act instanceof PDFDict) {
          const uri = resolve(ctx, act.get(PDFName.of('URI')));
          if (uri instanceof PDFString) {
            const u = uri.asString();
            contents = u.startsWith('mailto:') ? `Lähetä sähköpostia osoitteeseen ${u.slice(7)}` : `Avaa linkki: ${u}`;
          }
        }
        if (!contents) contents = 'Siirry esitteen kohtaan';
      }
      an.set(PDFName.of('Contents'), PDFString.of(contents));
      li++;
    }
  }

  // 3) Metatiedot
  doc.setTitle(input.title, { showInWindowTitleBar: true });
  doc.setLanguage(input.lang);
  doc.catalog.set(PDFName.of('Lang'), PDFString.of(input.lang));
  let vp = doc.catalog.lookup(PDFName.of('ViewerPreferences'));
  if (!(vp instanceof PDFDict)) { vp = ctx.obj({}); doc.catalog.set(PDFName.of('ViewerPreferences'), vp); }
  (vp as PDFDict).set(PDFName.of('DisplayDocTitle'), PDFBool.True);

  const metaStream = ctx.stream(buildXmp(input.title), { Type: 'Metadata', Subtype: 'XML' });
  doc.catalog.set(PDFName.of('Metadata'), ctx.register(metaStream));

  return doc.save();
}

export interface PdfSelfCheck {
  figures: { total: number; withAlt: number };
  links: { total: number; withContents: number };
  title: boolean;
  lang: boolean;
  displayDocTitle: boolean;
  pdfuaMetadata: boolean;
}

/**
 * Kevyt itsetarkistus (ei JVM/veraPDF): varmistaa että työkalun korjaukset on tehty.
 * EI korvaa täyttä PDF/UA-validointia — kertoo vain mitä tämä työkalu asetti.
 */
export async function checkRemediation(bytes: Uint8Array): Promise<PdfSelfCheck> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const ctx = doc.context;
  const pages = pageIndexMap(doc);

  let figTotal = 0, figWithAlt = 0;
  walkFigures(ctx, structRootKids(doc), pages, (el) => {
    figTotal++;
    const a = el.get(ALT);
    if (a instanceof PDFString && a.asString().trim().length > 0) figWithAlt++;
  });

  let linkTotal = 0, linkWithContents = 0;
  for (const page of doc.getPages()) {
    const annots = page.node.Annots();
    if (!annots) continue;
    for (const ref of annots.asArray()) {
      const an = resolve(ctx, ref);
      if (!(an instanceof PDFDict)) continue;
      if (an.get(PDFName.of('Subtype')) !== PDFName.of('Link')) continue;
      linkTotal++;
      const c = an.get(PDFName.of('Contents'));
      if (c instanceof PDFString && c.asString().trim().length > 0) linkWithContents++;
    }
  }

  const title = (doc.getTitle() || '').trim().length > 0;
  const lang = doc.catalog.get(PDFName.of('Lang')) instanceof PDFString;
  const vp = doc.catalog.lookup(PDFName.of('ViewerPreferences'));
  const displayDocTitle = vp instanceof PDFDict && vp.get(PDFName.of('DisplayDocTitle')) === PDFBool.True;
  const pdfuaMetadata = doc.catalog.get(PDFName.of('Metadata')) !== undefined;

  return {
    figures: { total: figTotal, withAlt: figWithAlt },
    links: { total: linkTotal, withContents: linkWithContents },
    title, lang, displayDocTitle, pdfuaMetadata,
  };
}
