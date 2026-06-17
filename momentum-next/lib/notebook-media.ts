'use client';

import { workerFetch } from './worker-fetch';

// Muistikirjojen kuva- ja tarra-upload: pakkaa kuvan selaimessa ja vie
// workerin /media/upload-endpointtiin (R2). Jos worker ei vastaa,
// palataan pieneen data-URL:iin — huom. Firestore-docin 1 Mt raja,
// joten fallback pakataan tiukasti.

const R2_CDN = 'https://pub-f3aa3f94aaf8436da08a8ee775b44349.r2.dev';

/** Pakkaa kuvatiedoston JPEG:ksi annettuun maksimimittaan. */
const compressImage = (file: File, maxDim: number, quality: number): Promise<Blob | null> =>
  new Promise((resolve) => {
    if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
      resolve(file);
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
      };
      img.onerror = () => resolve(null);
      img.src = ev.target!.result as string;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

/**
 * Lataa kuvan R2:een ja palauttaa julkisen URL:n.
 * Fallback: pieni data-URL jos worker ei ole tavoitettavissa.
 */
export async function uploadNotebookImage(file: File, orgId: string): Promise<string | null> {
  // PNG (esim. piirrokset) säilytetään sellaisenaan läpinäkyvyyden takia,
  // kunhan koko pysyy kohtuullisena; muut pakataan JPEG:ksi.
  const keepPng = file.type === 'image/png' && file.size < 2 * 1024 * 1024;
  const compressed = keepPng ? file : (await compressImage(file, 1400, 0.8)) || file;
  try {
    const form = new FormData();
    const name = file.name.replace(/\.[^.]+$/, '') + (compressed.type === 'image/jpeg' ? '.jpg' : '');
    form.append('file', new File([compressed], name || file.name, { type: compressed.type }));
    form.append('folder', 'notebooks');
    const res = await workerFetch('/media/upload', { method: 'POST', body: form, orgId });
    if (res.ok) {
      const data = await res.json();
      return data.publicUrl || `${R2_CDN}/${data.key}`;
    }
  } catch {
    /* fallback alla */
  }
  // Fallback: tiukasti pakattu data-URL suoraan sivun sisältöön
  if (file.type === 'image/png') return blobToDataUrl(file);
  const small = await compressImage(file, 700, 0.65);
  if (!small) return null;
  return blobToDataUrl(small);
}

/**
 * Oikolukee sivun HTML-sisällön workerin /api/chat-endpointilla.
 * Korjaa vain kirjoitusvirheet — sanajärjestys, tyyli, sisältö ja
 * HTML-rakenne säilyvät ennallaan. Palauttaa null jos kutsu epäonnistuu.
 */
export async function proofreadHtml(html: string, orgId: string): Promise<string | null> {
  const system = [
    'Olet tarkka oikolukija. Saat HTML-katkelman muistikirjan sivulta.',
    'Korjaa VAIN kirjoitusvirheet: lyöntivirheet, väärin kirjoitetut sanat,',
    'puuttuvat tai ylimääräiset kirjaimet sekä selvät yhdyssana- ja välimerkkivirheet.',
    'ÄLÄ muuta sanajärjestystä, sanavalintoja, tyyliä, sisältöä tai rivityksiä.',
    'ÄLÄ lisää tai poista mitään. Säilytä kaikki HTML-tagit ja attribuutit',
    'täsmälleen ennallaan ja samoilla paikoillaan.',
    'Palauta PELKKÄ korjattu HTML ilman selityksiä, kommentteja tai koodiaitoja.',
    'Jos virheitä ei ole, palauta sisältö täsmälleen sellaisenaan.',
  ].join(' ');
  try {
    const res = await workerFetch('/api/chat', {
      method: 'POST',
      orgId,
      body: JSON.stringify({
        messages: [{ role: 'user', content: html }],
        system,
        max_tokens: 4000,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.error) return null;
    const out = (data.response || '')
      .trim()
      .replace(/^```(?:html)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();
    return out || null;
  } catch {
    return null;
  }
}
