'use client';

import { useEffect, useRef } from 'react';
import { getDriveAccessToken } from '@/lib/drive';

// Google Picker globaalit (ladataan dynaamisesti)
declare global {
  interface Window {
    gapi?: any;
    google?: any;
  }
}

let pickerLoaded: Promise<void> | null = null;

function loadPickerSDK(): Promise<void> {
  if (pickerLoaded) return pickerLoaded;
  pickerLoaded = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('SSR'));
    // Lataa gapi clientti
    const ensureGapi = () =>
      new Promise<void>((res, rej) => {
        if (window.gapi) return res();
        const s = document.createElement('script');
        s.src = 'https://apis.google.com/js/api.js';
        s.async = true;
        s.onload = () => res();
        s.onerror = () => rej(new Error('gapi-skripti epäonnistui'));
        document.head.appendChild(s);
      });
    ensureGapi()
      .then(() => new Promise<void>((res, rej) =>
        window.gapi.load('picker', { callback: () => res(), onerror: () => rej(new Error('Picker-API:n lataus epäonnistui')) })
      ))
      .then(() => resolve())
      .catch(reject);
  });
  return pickerLoaded;
}

export type DrivePickerMode = 'file' | 'doc' | 'image' | 'folder';

export interface DrivePickerProps {
  mode: DrivePickerMode;
  multi?: boolean;
  onPick: (files: PickedItem[]) => void;
  onCancel?: () => void;
  /** Käynnistäjä: nostaa kun true -> avaa picker, nollaa false:ksi ulkoisesti */
  open: boolean;
  setOpen: (v: boolean) => void;
}

export interface PickedItem {
  id: string;
  name: string;
  mimeType: string;
  url?: string;
  iconUrl?: string;
  thumbnailUrl?: string;
  isFolder: boolean;
  sizeBytes?: number;
}

export default function DrivePicker({ mode, multi, onPick, onCancel, open, setOpen }: DrivePickerProps) {
  const launchedRef = useRef(false);

  useEffect(() => {
    if (!open) { launchedRef.current = false; return; }
    if (launchedRef.current) return;
    launchedRef.current = true;
    let cancelled = false;

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
    const appId = process.env.NEXT_PUBLIC_GOOGLE_APP_ID;
    if (!apiKey || !appId) {
      alert(
        'Google Picker ei ole konfiguroitu. Lisää env-muuttujat:\n' +
        'NEXT_PUBLIC_GOOGLE_API_KEY = (Google Cloud Console → Credentials → API key)\n' +
        'NEXT_PUBLIC_GOOGLE_APP_ID = (Cloud Console projektin numero)'
      );
      setOpen(false);
      return;
    }

    (async () => {
      try {
        const token = await getDriveAccessToken();
        if (!token) {
          alert('Yhdistä Google Drive ensin Asetukset-sivulta.');
          setOpen(false);
          return;
        }
        await loadPickerSDK();
        if (cancelled) return;

        const g = window.google;
        const builder = new g.picker.PickerBuilder()
          .setOAuthToken(token)
          .setDeveloperKey(apiKey)
          .setAppId(appId)
          .enableFeature(g.picker.Feature.SUPPORT_DRIVES)
          .setCallback((data: any) => {
            if (data.action === g.picker.Action.PICKED) {
              const docs = (data.docs || []) as any[];
              const items: PickedItem[] = docs.map(d => ({
                id: d.id,
                name: d.name,
                mimeType: d.mimeType,
                url: d.url,
                iconUrl: d.iconUrl,
                thumbnailUrl: d.thumbnails?.[0]?.url,
                isFolder: d.mimeType === 'application/vnd.google-apps.folder',
                sizeBytes: typeof d.sizeBytes === 'number' ? d.sizeBytes : undefined,
              }));
              onPick(items);
              setOpen(false);
            } else if (data.action === g.picker.Action.CANCEL) {
              onCancel?.();
              setOpen(false);
            }
          });

        if (multi) builder.enableFeature(g.picker.Feature.MULTISELECT_ENABLED);

        // Näkymät moodin mukaan
        switch (mode) {
          case 'doc': {
            const view = new g.picker.DocsView(g.picker.ViewId.DOCUMENTS);
            view.setMode(g.picker.DocsViewMode.LIST);
            view.setIncludeFolders(true);
            builder.addView(view);
            break;
          }
          case 'image': {
            const view = new g.picker.DocsView(g.picker.ViewId.DOCS_IMAGES_AND_VIDEOS);
            view.setIncludeFolders(true);
            builder.addView(view);
            break;
          }
          case 'folder': {
            // Näytä kaikki sisältö (kansiot + kuvat) jotta käyttäjä näkee mitä kansiossa on,
            // mutta sallitaan valita vain kansio. Mimetype-rajoitusta EI laiteta —
            // muuten kuvat eivät näy ja käyttäjä luulee kansion olevan tyhjä.
            const view = new g.picker.DocsView(g.picker.ViewId.DOCS);
            view.setIncludeFolders(true);
            view.setSelectFolderEnabled(true);
            view.setMode(g.picker.DocsViewMode.LIST);
            builder.addView(view);
            // Lisätään ohje-otsikko Pickeriin
            builder.setTitle('Valitse Drive-kansio (klikkaa kansio ja paina Select)');
            break;
          }
          case 'file':
          default: {
            const view = new g.picker.DocsView(g.picker.ViewId.DOCS);
            view.setIncludeFolders(true);
            builder.addView(view);
            break;
          }
        }

        const picker = builder.build();
        picker.setVisible(true);
      } catch (e: any) {
        console.error('DrivePicker error:', e);
        alert(`Drive Picker -virhe: ${e?.message || e}`);
        setOpen(false);
      }
    })();

    return () => { cancelled = true; };
  }, [open, mode, multi, onPick, onCancel, setOpen]);

  return null;
}
