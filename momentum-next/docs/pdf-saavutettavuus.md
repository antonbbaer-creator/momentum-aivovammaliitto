# PDF-saavutettavuusmoduuli — suunnitelma ja tilanne

Päivitetty: 2026-06-22 · Haara: `pdf-saavutettavuus` · Tila: viipaleet 1–2 koodattu, ei committia

AVL:n työkalu, joka tekee verkkoon julkaistavasta valmiista, taitetusta PDF-esitteestä
saavutettavan (WCAG 2.1 AA / PDF/UA) ohjatulla puoliautomaatilla.

---

## 1. Tavoite ja keskeiset päätökset

- **Mitä:** lataa valmis taitettu PDF → auto-tagaus → metatiedot + linkit (auto) → alt-tekstit (ohjattu, ihminen) → validointi → valmis saavutettava PDF + raportti.
- **Taso:** tekninen WCAG / PDF/UA. Selkokieli ei painopisteenä.
- **Käyttäjä:** aluksi vain Aivovammaliitto (AVL).
- **Rehellinen lupausraja (tärkein periaate):** työkalu **ei takaa** täydellistä saavutettavuutta. Alt-tekstien sisältö ja vaikeat lähde-PDF:n virheet (esim. upottamattomat fontit) vaativat ihmisen arvion. Tuotelupaus: *"vie 80 % matkasta automaattisesti, ohjaa loput"* — ei *"takaa saavutettavan PDF:n"*.

## 2. Lakitausta (varmennettu deep-research, 2026)

- AVL todennäköisesti **digipalvelulain (306/2019)** piirissä, jos yli puolet rahoituksesta on julkista (kolmen kriteerin kokonaisarvio, ei automaattinen). **AVAUS: vahvista AVL:n 2026 julkisen rahoituksen osuus.**
- Lakitaso: **WCAG 2.1 A + AA** (49 kriteeriä). PDF/UA (ISO 14289) = tekninen toteutustapa, ei laissa nimetty pakko. Saavutettavuusseloste vaaditaan.
- Konevalidointi (esim. veraPDF) kattaa vain Matterhorn-protokollan koneellisen osajoukon (~89/134); loput vaativat ihmisarvion.

## 3. Arkkitehtuuri

**Keskeinen rajoite:** Momentum pyörii **Netlifyssä (Node), ei JVM:ää**. Siksi ydin tehdään puhtaana JS:nä; vain veraPDF-validointi vaatii erillisen palvelun.

| Vaihe | Ajoympäristö | Toteutus |
|---|---|---|
| Lataus | Selain → Firebase Storage | `uploadBytes` |
| Auto-tagaus | Netlify API-reitti → Adobe REST | `app/api/pdf/autotag/route.ts` |
| Metatiedot + linkit + alt | Selain (pdf-lib) | `lib/pdf-figures.ts` |
| Kuvien pikkukuvat | Selain (pdf.js) | `lib/pdf-render.ts` |
| Validointi | **Erillinen Cloud Run (veraPDF, JVM)** — vielä rakentamatta | tuleva |

**Moottori on TODISTETTU:** `lib/pdf-figures.ts` ajettiin Nodessa pilotin oikeaa Adobe-tagattua AVH-esitettä vasten → löysi samat 9 Figureä samoilla bboxeilla ja tuotti **identtisen veraPDF-tuloksen (37 virhettä)** kuin pilotin Java-putki.

## 4. Mitä on rakennettu (viipaleet 1–2)

| Tiedosto | Sisältö |
|---|---|
| `lib/modules.ts` | Moduuli `saavutettavuus` rekisteröity (registry + order + `AVL_MODULES`) |
| `lib/pdf-accessibility-shared.ts` | Tietomalli `PdfDocument`, statukset, apufunktiot. Firestore-avain `pdf_documents` |
| `app/[orgSlug]/saavutettavuus/page.tsx` | Sivu (AppShell + sektio) |
| `components/sections/PdfAccessibilitySection.tsx` | Lataus, dokumenttilista, tagaus-nappi, lataukset, alt-editorin kytkentä |
| `app/api/pdf/autotag/route.ts` | Adobe-token (OAuth Server-to-Server) + Auto-Tag REST → palauttaa tagatut tavut |
| `lib/pdf-figures.ts` | **Korjausmoottori:** `enumerateFigures` + `applyRemediation` (/Alt, linkkien /Contents, PDF/UA-metatiedot) |
| `lib/pdf-render.ts` | pdf.js-pikkukuvat kuva-alueista |
| `components/sections/PdfAltEditor.tsx` | Alt-editori: näyttää kuvat, kerää alt-tekstit, koriste-merkintä, soveltaa moottorilla, tallentaa final.pdf:n |

Riippuvuudet lisätty: `pdf-lib`, `pdfjs-dist` (+ `tsx` dev-testaukseen). Koko projekti **tsc-puhdas (0 virhettä)**.

**Toimiva ketju nyt:** lataa → tagaa (Adobe) → "Lisää alt-tekstit" (näe kuvat, kirjoita, merkitse koristeet) → "Valmis (lataa)".

## 5. Mitä on rakennettu (viipale 3 osittain + AI)

Lisätty tiedostoihin:
- `app/api/pdf/alt-suggest/route.ts` — **AI-alt-ehdotukset** (Anthropic vision, `claude-haiku-4-5`). Editorissa "Ehdota (AI)" per kuva + "Ehdota kaikille". Tunnistaa koristekuvat (palauttaa KORISTE). **Vaatii `ANTHROPIC_API_KEY`:n** Next-ympäristöön.
- `lib/pdf-figures.ts` → `checkRemediation()` — **JS-itsetarkistus ilman JVM:ää** (varmistaa /Alt, /Contents, metatiedot). Todistettu Nodessa: 9/9 alt, 28/28 linkkikuvaus, metatiedot ok.
- `lib/pdf-accessibility-shared.ts` → `buildAccessibilityStatement()` — **saavutettavuusselosteen luonnos**.
- `components/sections/PdfAccessibilitySection.tsx` → "Tarkista"-nappi + `CheckPanel` (tarkistuslista + seloste, kopioitavissa).
- `app/api/pdf/autotag/route.ts` → `PDF_SERVICES_ACCESS_TOKEN`-fallback live-testiin (24 h token ilman client_secretiä).

## 6. Mitä puuttuu / seuraavat viipaleet

1. **Täysi validointi (viipale 3 loppuun):** veraPDF Cloud Run -palvelu + `app/api/pdf/validate/route.ts` + raportti-UI. JS-itsetarkistus on jo, mutta se EI korvaa veraPDF:ää. Vaatii GCP Cloud Run -deployn.
2. **Fonttitarkistus (viipale 4):** varoita jo latausvaiheessa upottamattomista fonteista (kova lattia — ohjaa korjaamaan taitossa).
3. **Koristekuvien artefaktointi:** nyt koriste saa lyhyen alt-tekstin; oikeaoppisesti merkittäisiin artefaktiksi (sisältövirran muokkaus).
4. **AI-avain:** `ANTHROPIC_API_KEY` Next-ympäristöön jotta AI-ehdotukset toimivat.

## 7. Avoimet asiat / mitä Antonilta tarvitaan

- **Adobe Client Secret** (OAuth Server-to-Server) tuotantoon, jotta palvelin uusii tokenin automaattisesti. Tähän mennessä saatu vain 24 h access token (toimii live-testiin, jos reittiin lisätään `PDF_SERVICES_ACCESS_TOKEN`-fallback). Client ID: `8f81c936717b48d693d65bcbb4a78721`.
- **Lakistatus:** AVL:n 2026 julkisen rahoituksen osuus (yli/alle 50 %).
- **AI-reitin valinta:** worker-vision vai oma Next-reitti + `ANTHROPIC_API_KEY`.
- **Cloud Run -deploy** veraPDF-validointiin (GCP-projekti `momentum-69262`).

## 8. Pilotti (paikallinen referenssitoteutus)

Kansio: `~/Desktop/Hetki Paltform/avl-pdf-pilot/` (poistettavissa). Sisältää paikallisen JDK 21 + veraPDF + OpenDataLoader + PDFBox + Adobe-skriptit ja Java-työkalut (`ListFigures`, `RenderRegion`, `SetAlt`, `SetLinkContents`), jotka ovat `lib/pdf-figures.ts`:n referenssilogiikka.

**Pilotin tulos AVH-esitteellä:** 631 → 37 koneellista virhettä (Adobe + metatiedot + alt + linkit). Jäljelle jää: linkki-rakenne 1, tagaamaton sisältö/rakenne 33, fontit 3 (vaativat lähde-PDF:n uudelleenviennin). Ilmainen OpenDataLoader-reitti hylättiin (rikkoi tiedoston); Adobe Auto-Tag valittu moottoriksi.

## 9. Näin jatkat / testaat

1. Live-testi: lisää `momentum-next/.env.local`: `PDF_SERVICES_CLIENT_ID` + `PDF_SERVICES_CLIENT_SECRET` (tai lisää reittiin token-fallback), aja `npm run dev`, avaa AVL-työtilan **Saavutettavuus**-moduuli.
2. Tyypintarkistus: `npx tsc --noEmit` (pitää olla 0 virhettä).
3. Moottorin testi Nodessa: ks. pilotin `output/` ja `npx tsx` -ajo (poistettu väliaikaistiedosto, helppo luoda uudelleen).
