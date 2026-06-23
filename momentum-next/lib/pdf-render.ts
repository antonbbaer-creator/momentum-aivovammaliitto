'use client';

// Selainpuolen apuri: renderöi tagatun PDF:n Figure-alueet pikkukuviksi (pdf.js).
// Käytetään alt-editorissa jotta käyttäjä näkee minkä kuvan alt-tekstiä hän kirjoittaa.

import type { PdfFigure } from './pdf-accessibility-shared';

let workerReady = false;
async function ensureWorker() {
  if (workerReady) return;
  const pdfjs = await import('pdfjs-dist');
  // Webpack-yhteensopiva worker-URL
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();
  workerReady = true;
}

/** Palauttaa kartan figure.id -> data-URL (PNG) kustakin kuva-alueesta. */
export async function renderFigureThumbnails(
  bytes: Uint8Array,
  figures: PdfFigure[],
  maxPx = 260,
): Promise<Map<string, string>> {
  await ensureWorker();
  const pdfjs = await import('pdfjs-dist');
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  const pageCache = new Map<number, { canvas: HTMLCanvasElement; viewport: any }>();
  const result = new Map<string, string>();

  for (const fig of figures) {
    try {
      if (fig.page < 1) continue;
      let cached = pageCache.get(fig.page);
      if (!cached) {
        const page = await doc.getPage(fig.page);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext('2d')!;
        await page.render({ canvasContext: ctx, viewport } as any).promise;
        cached = { canvas, viewport };
        pageCache.set(fig.page, cached);
      }
      const [bx1, by1, bx2, by2] = fig.bbox;
      const r = cached.viewport.convertToViewportRectangle([bx1, by1, bx2, by2]);
      const left = Math.max(0, Math.min(r[0], r[2]));
      const top = Math.max(0, Math.min(r[1], r[3]));
      const w = Math.abs(r[2] - r[0]);
      const h = Math.abs(r[3] - r[1]);
      if (w < 2 || h < 2) continue;
      const scale = Math.min(1, maxPx / Math.max(w, h));
      const out = document.createElement('canvas');
      out.width = Math.max(1, Math.round(w * scale));
      out.height = Math.max(1, Math.round(h * scale));
      const octx = out.getContext('2d')!;
      octx.drawImage(cached.canvas, left, top, w, h, 0, 0, out.width, out.height);
      result.set(fig.id, out.toDataURL('image/png'));
    } catch {
      /* ohita yksittäisen kuvan virhe */
    }
  }
  return result;
}
