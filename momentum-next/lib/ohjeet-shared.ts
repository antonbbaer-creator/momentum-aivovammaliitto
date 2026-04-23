// Ohjeet-moduuli — valokuvalliset työohjeet
//
// Yksittäinen ohje on sarja askelia. Jokaisessa askeleessa on teksti ja valinnainen
// valokuva. Käyttötapaus: "Moottorin käynnistys", "Purjeen nosto", "Mistä löytyy
// jakoavaimet", "Rungon pesuaineen annostelu" — käytännön tieto jaettavaksi tiimille.

export interface OhjeStep {
  id: string;
  text: string;
  photoUrl?: string;   // R2 tai muu julkinen URL
  photoThumb?: string; // valinnainen pienennetty kuva listoissa
  photoKey?: string;   // R2-avain — tarvitaan jos halutaan myöhemmin poistaa R2:sta
}

export interface Ohje {
  id: string;
  title: string;
  description?: string;       // lyhyt kuvaus / alaotsikko
  category?: string;          // vapaa teksti, esim. "Moottori", "Työkalut", "Purjeet"
  coverPhotoUrl?: string;     // valinnainen kansikuva (muuten käytetään ensimmäisen askeleen kuvaa)
  coverPhotoThumb?: string;
  coverPhotoKey?: string;
  steps: OhjeStep[];
  tags?: string[];
  createdAt: number;
  createdBy?: string;         // uid
  createdByName?: string;
  updatedAt: number;
  deletedAt?: number;
}

export function createEmptyOhje(uid: string, createdByName?: string): Ohje {
  const now = Date.now();
  return {
    id: 'oh_' + now + '_' + Math.random().toString(36).slice(2, 6),
    title: '',
    steps: [],
    createdAt: now,
    createdBy: uid,
    createdByName,
    updatedAt: now,
  };
}

export function createEmptyStep(): OhjeStep {
  return {
    id: 's_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    text: '',
  };
}

// Palauttaa kansikuvan URL:n — joko coverPhoto tai ensimmäisen askeleen kuva.
export function getOhjeCover(ohje: Ohje): { url?: string; thumb?: string } {
  if (ohje.coverPhotoUrl) return { url: ohje.coverPhotoUrl, thumb: ohje.coverPhotoThumb };
  const firstWithPhoto = ohje.steps.find(s => s.photoUrl);
  if (firstWithPhoto) return { url: firstWithPhoto.photoUrl, thumb: firstWithPhoto.photoThumb };
  return {};
}
