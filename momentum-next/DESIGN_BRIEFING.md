# Hetki Momentum — design-brief

Tämä dokumentti on perehdytys design-sessiolle (frontend/visuaalinen Claude). Tässä on kaikki oleellinen siitä mikä Hetki Momentum on, kenelle se on, miltä sen pitää näyttää ja missä kohdissa sinun työsi alkaa ja loppuu.

Kirjoittaja: Anton Baer (projektin vetäjä, Aivovammaliiton viestintävastaava, Hetki Companyn perustaja).

---

## 1. Mikä Hetki Momentum on

**Momentum on yhteinen työtila pienille ja keskisuurille järjestöille, tuotantotiimeille ja projekteille** — paikka jossa kaikki tiimin yhteiset asiat ovat samassa näkymässä: tehtävät, aikataulut, kalenterit, viestintä, budjetit, muistiinpanot, ohjelmistot ja työnjako.

Kohderyhmä ei ole yrityssaaste vaan ihmiset, jotka eivät jaksa taistella Notionin, Asanan, Slackin, Excelin, Trellon ja sähköpostin ristitulessa. Momentumissa yksi työtila = yksi yhteisö, ja kaikki moduulit puhuvat samaa dataa.

**Tuotteen lupaus lyhyesti:**
- Yksi paikka, ei 17 työkalua.
- Aina suomenkielinen käyttöliittymä (toinen kieli tulee myöhemmin).
- Räätälöityy työtilan mukaan — elokuvafestivaalilla on eri moduulit kuin juhlatoimikunnalla tai veneprojektilla.
- Ei "enterprise"-kylmyyttä — visuaalinen maailma on lämmin, analoginen, tekstuurinen.

**Mitä Momentum EI ole:**
- Ei korvike Slackille tai sähköpostille — ei reaaliaikainen jatkuva keskustelu.
- Ei CRM tai myynnin työkalu.
- Ei julkinen sivusto — kaikki työtilat ovat sisäänkirjautumisen takana.

---

## 2. Työtilat (orgit) jotka käytössä nyt

Momentum on monitenanttinen. Sama sovellus ajaa montaa työtilaa — jokainen niistä on eri yhteisö omalla datallaan, omalla brändillään, omilla moduuleillaan.

Aktiiviset työtilat (`lib/enabled-orgs.ts`):

| Slug | Yhteisö | Luonne | Tärkeät moduulit |
|---|---|---|---|
| `llff` | Lapinlahden Elokuvajuhlat | Vuosittainen ilmainen elokuvafestivaali, vapaaehtoisvetoinen | Ohjelmisto, Viestintä, Aikataulut, Apurahat |
| `avl` | Aivovammaliitto | Jatkuva järjestöviestintä, potilasjärjestö | Viestintä, Strategia, Projektit |
| `juhlatoimikunta` | Juhlatoimikunta (Sirpa 70v) | Kertaluontoinen yksityinen juhla | Vieraat, Ruoka, Tila, Ohjelma |
| `luuri` | Luuri | Yleistyötila (tyhjä tabula rasa) | Kaikki moduulit |
| `ihaa` | Ihaa | Veneprojekti, pieni harrastetiimi | Tehtävät, Budjetti, Palaverit |

Suunnittele aina niin että sama UI toimii yhtä hyvin juhlatoimikunnalle kuin vakavalle järjestölle — ei saa olla liian "leikkisä" AVL:lle eikä liian "virastomainen" juhlille.

---

## 3. Moduulit (mitä tiimi tekee Momentumissa)

Jokainen työtila valitsee asetuksista käytössä olevat moduulit. Moduulit ovat sivupalkin päänavigaatio. Katso täydellinen lista [`lib/modules.ts`](./lib/modules.ts).

Ryhmittely design-näkökulmasta:

**Ydinmoduulit (melkein kaikilla päällä):**
- **Koti (dashboard)** — yleiskatsaus, ainoa `alwaysOn`-moduuli.
- **Strategia** — pitkän tähtäimen suunnittelu, viestintästrategian pohja.
- **Tiimi** — ketkä kuuluvat yhteisöön, tiimirakenne, roolit.
- **Työnjako** — kuka tekee mitä, vastuualueet.
- **Projektit** — projektit ja niiden tehtävät, karkea hallintataso.
- **Tehtävät** — nopea to-do-lista (pienille työtiloille).

**Ajanhallinta:**
- **Aikataulut** — vuosikello, Gantt, vaihetimeline, kuukausinäkymä.
- **Palaverit** — palaverirunko ja muistiinpanot.
- **Kokoukset (muistiinpanot)** — palaverimuistiot.

**Viestintä:**
- **Viestit** — sisäinen chat (kevyt, ei Slack-korvaaja).
- **Viestintä** — ulkoinen viestintäsuunnitelma, julkaisujono, kanavat.
- **Ohjelmisto** — festivaalin elokuva-ohjelma.

**Talous:**
- **Apurahat** — apurahahakemusten seuranta (LLFF).
- **Budjetti** — split-tyyppiset jaetut kulut (Ihaa).

**Juhla-moduulit:**
- **Vieraat** — kutsuvieraiden hallinta.
- **Ruoka** — ruokavalinnat, allergiat.
- **Tila** — tilan pohjapiirros, istumajärjestys.
- **Ohjelma** — tapahtuman aikataulu.

**Luova työ / tietopankki:**
- **Luomistila (muistiinpanotProjekti)** — vapaa muistiinpanoeditor, mindmap.
- **Ohjeet** — käyttöohjeet ja prosessit.
- **Palaute** — feedback.

Design-vinkki: moduuleja on paljon. Työtila ei näytä kaikkia vaan valitun joukon — yleensä 6–10 kerrallaan. Sivupalkin pituus on silti design-haaste, katso [`components/Sidebar.tsx`](./components/Sidebar.tsx).

---

## 4. Käyttäjäroolit

Yhteisön sisällä (`lib/auth.tsx` → `OrgRole`):

- **owner** — yhteisön omistaja, voi tehdä kaikkea.
- **admin** — hallinnolliset oikeudet.
- **member** — tavallinen jäsen, voi lukea ja muokata.
- **visitor** — vierailija, vain luku (`canEdit = false`).

Lisäksi koodissa kovakoodattu **super admin** -lista (anton@hetkicompany.com, anton.baer@gmail.com). Super admin saa admin-oikeudet kaikissa työtiloissa — käytetty pääosin debugiin.

Design-seuraus: UI:n pitää kertoa roolit kevyesti mutta selkeästi (esim. pillerit "Omistaja", "Admin", "Jäsen", "Vierailija"). Vierailija ei saa nähdä muokkauspainikkeita — suunnittele read-only-tilat yhtä huolella kuin editoivat.

---

## 5. Arkkitehtuuri — sen verran kuin design-sessio tarvitsee

**Älä muuta koodilogiikkaa** — se on backend-session vastuulla. Mutta jotta ymmärrät mitä näet ruudulla, tässä perusteet:

- **Next.js 16 + App Router + Turbopack + React 19 + TypeScript.** HUOM: tämä Next.js-versio sisältää rikkovia muutoksia koulutusdataasi nähden. Jos teet Next.js-spesifisiä asioita, tarkista [`node_modules/next/dist/docs/`](./node_modules/next/dist/docs/).
- **Firestore** hoitaa datan (`lib/firestore.ts` → `useOrgData<T>(key, defaultValue)`). Jokainen moduuli tallentaa dataansa polkuun `organizations/{orgId}/data/{key}`.
- **R2 + Cloudflare Worker** hoitaa kuvat.
- **Reititys**: `/[orgSlug]/dashboard`, `/[orgSlug]/aikataulut` jne. Orgin vaihtuessa koko sivupuu päivittyy.
- **Komponenttirakenne**: sivut ohuita wrappereita [`app/[orgSlug]/*`], logiikka/isot komponentit [`components/sections/*Section.tsx`].
- **Mobile**: `useIsMobile`-hook + responsive-CSS. Sivupalkki slide-in-tilassa mobiilissa.

---

## 6. Visuaalinen identiteetti — Hetki-brändi

Tämä on *kovaa rautaa* — nämä tokenit tulevat Hetki Companyn brändistä ja niitä ei muuteta ilman keskustelua.

### Värit

**Hetki-peruspaletti (flat-värit, EI gradientteja):**
- Blue — `#056B9F` — **pääväri**, käytetään eniten, linkit, primary-napit
- Green — `#185E5B`
- Yellow — `#F1B434`
- Pink — `#E45C81`
- Black — `#303030`

CSS-muuttujat (katso [`app/globals.css`](./app/globals.css)):
```
--pri:#056b9f; --pri-l:#3788b2; --pri-d:#044d73;
--bg:#0a0c10; --card:#111318; --card2:#181b22; --elev:#1e222c;
--border:#282d3a; --border-l:#343a4a;
--t1:#f0f2f5; --t2:#949bac; --t3:#5a6278;
--green:#185e5b; --yellow:#f1b434; --red:#ef6b6b; --pink:#e45c81;
```

**Pääteema on tumma** (`--bg: #0a0c10`). Vaaleaa teemaa ei toistaiseksi ole — älä lisää sitä spekulatiivisesti.

**5-värikaista** (blue → green → yellow → pink → black, 3–6px korkea) on toistuva brändielementti. Se on koodissa mm. `.onb-card::before`-pseudona.

### Fontit

- **Display: Pitch Sans** (Klim Type Foundry), painot 400 ja 500.
  - Käyttö: otsikot, napit, numerot, statsit, pienet uppercase-labelit.
  - Aina `text-transform: uppercase` + `letter-spacing: .02em–.08em`.
- **Body: DM Sans** (Google-fontti, self-hostattu /public/fonts/).
  - Painot 300, 400, 500, 600, 700, 800 saatavilla — **käytä 300 leipätekstissä**, 500–600 UI-labeleissä.
  - **Älä käytä painoja 700 tai 800** UI:ssa — maksimi on 600.

Ei Google Fonts CDN:ää — kaikki fontit ladataan `/public/fonts/`-kansiosta.

### Muut tokenit

- Border radius: **6 / 10 / 14 px** (`--r / --rl / --rxl`) — mitään muuta ei ole, ei pyöristy 20+ px.
- Spacing: `--space-xs/sm/md/lg/xl` (0.5 / 1 / 2 / 4 / 6 rem).
- Animation easing: **`cubic-bezier(.16, 1, .3, 1)`** (käytä aina tätä, ei `ease-out`).
- Shadow: `0 4px 24px rgba(0,0,0,.4)` (tumma teema).

### Tekstuurit

Matalataustaiset paperitekstuurit (`/public/textures/*.jpg`) käytössä onboardingissa blend-mode `overlay`/`soft-light`. Subtiili, ei räikeä.

---

## 7. Kirjoitusohjeet (copy-periaatteet)

Nämä ovat pakollisia, ei mielipiteitä:

1. **Kaikki UI-teksti on suomeksi.** Englantia tulee myöhemmin — nyt vain suomi.
2. **Aina ä ja ö — ei "a" tai "o" -vääntöjä.** "Käyttäjä" ei koskaan "kayttaja". Koodin sisäisissä kommenteissa ascii on ok, mutta UI:n stringeissä ei.
3. **EI EMOJEITA käyttöliittymässä.** Ei edes ✓ tai ★. Käytä tekstiä, SVG-ikonia tai unicodea typografisena merkkinä (◉ ▷ ≡ ☐) — katso moduuli-ikonit [`lib/modules.ts`](./lib/modules.ts).
4. **Läheinen, selkeä, ei pönöttävä.** Puhutellaan sinutellen. "Kutsu jäsen", ei "Tiimin jäsenten lisääminen".
5. **Lyhyet lauseet.** Mieluummin kaksi selkeää kuin yksi pilkuilla pilkottu.
6. **Ei markkinointikieltä.** Ei "innovatiivinen alusta tiimiyhteistyöhön" — vaan "paikka jossa tiimi näkee mitä on tekeillä".

Esimerkkejä hyvästä tyylistä (koodista):
- "Jaa tämä salasana ihmisille jotka haluat kutsua yhteisöösi."
- "Nämä asetukset tallentuvat selaimeesi ja koskevat vain sinua."
- "Syötä toisen yhteisön salasana liittyäksesi sen jäseneksi."

---

## 8. UI-periaatteet

- **Flat colors only.** Ei gradientteja paitsi tuo 5-värikaista (sekin on kovia värirajoja, ei liukuma).
- **Tekstuuri taustalla, ei elementissä.** Napit ovat aina yksivärisiä.
- **Tilojen selkeys:** hover, focus, active, disabled — kaikki näkyvissä. `:focus` aina: `box-shadow: 0 0 0 3px rgba(5,107,159,.15)`.
- **Kortti = sisällön yksikkö.** Kortit muodostavat sivun rytmin. `var(--card)` taustalla, `1px solid var(--border)` reunalla, `var(--rl)` pyöristys.
- **Spacing hengittää.** Mieluummin väljempi kuin tiiviimpi (käyttäjä voi halutessaan kääntää "Kompakti tila" päälle).
- **Animaatiot hienovaraisia.** `.15s–.3s` kestot, easing aina cubic-bezier(.16,1,.3,1).
- **Mobile first ei ole sääntö** mutta mobiili pitää toimia hyvin — sivupalkki slide-in, `no-scroll` body-luokalla kun modal auki.

---

## 9. Komponentti- ja CSS-rakenne

- **Globaali CSS**: [`app/globals.css`](./app/globals.css). Sisältää kaikki `.btn`, `.input`, `.field`, `.onb-*`, `.toast-*` jne. Luokat. Muutokset tänne vaikuttavat kaikkialle.
- **Tyylit komponenteissa**: pääosin **inline-`style`-propseja** (ei CSS-Modules, ei styled-components). Syy: pitää komponentin logiikka ja ulkoasu yhdessä tiedostossa. Tämä on tietoinen valinta.
- **Tailwind**: paketissa on `tailwindcss@4` mutta sitä käytetään hyvin rajoitetusti. Älä spämmää Tailwind-utilityja koko koodipohjaan — pitäydy inline-tyyleissä ja CSS-muuttujissa.
- **Ikonit**: SVG:t inline komponenteissa ([`components/Sidebar.tsx`](./components/Sidebar.tsx) on hyvä referenssi).

---

## 10. Mitä teet sinä (design-sessio) vs. mitä tekee toinen sessio

**Sinun vastuullasi:**
- Visuaalinen identiteetti, CSS-muuttujat, typografia, värit, spacing.
- Layout, sivujen rakenne, komponenttien ulkoasu.
- Animaatiot ja transitiot.
- Responsiivisuus ja mobiilinäkymät.
- Saavutettavuus (värikontrasti, focus-tilat, keyboard-navigaatio).
- Microcopy ja UI-teksti (suomeksi, yllä olevien sääntöjen mukaan).

**EI sinun vastuullasi** (backend-sessio hoitaa):
- Firestore-skeemat tai datalogiikka.
- Auth-flow tai roolilogiikka (mutta saat kommentoida ulkoasua).
- API-integraatiot.
- React-hookkien logiikka ("miten useOrgData toimii"), paitsi jos ne vuotavat UI:hin.

Jos huomaat bugin tai tarpeen logiikkamuutokseen — **kirjoita se muistiin tai kerro Antonille**, älä korjaa itse. Vastaavasti jos backend-sessio tekee muutoksen joka rikkoo visuaalisesti, kerro siitä.

---

## 11. Nykytilanne (2026-04, tarkista ennen aloitusta)

- Päätuote on [`momentum-next/`](./). Vanhan single-file-HTML-proton voi unohtaa.
- Moduulit toimivat kaikki — data tallentuu Firestoreen ja synkronoituu reaaliajassa.
- Onboarding ([`app/onboarding/page.tsx`](./app/onboarding/page.tsx)) toimii mutta sen UX:ssä on vielä hiottavaa.
- Viestintä-moduuli on LLFF:n ydinmoduuli — suurin osa design-katseluista kohdistuu siihen.
- Mobiili toimii mutta ei ole niin hiottu kuin desktop.

**Jatkuvia kipupisteitä joista voit aloittaa:**
- Sivupalkin pituus kun moduuleja on paljon.
- Dashboard-näkymä — mitä siellä näkyy oletuksena? Liikaa vai liian vähän?
- Asetukset-sivu on pitkä ja monoliittinen — voisiko sen jakaa välilehtiin?
- Tumman teeman kontrastit — t3-tekstit välillä liian haaleat.
- Kortien tyylittelyn yhdenmukaisuus eri moduulien välillä.

---

## 12. Hyödyllisiä tiedostoja ensisilmäykseen

Jos luet vain 6 tiedostoa ennen koodaamista, lue nämä:

1. [`app/globals.css`](./app/globals.css) — kaikki tokenit ja perusluokat.
2. [`lib/modules.ts`](./lib/modules.ts) — mitä moduuleja on ja mitä kussakin orgissa on päällä.
3. [`components/AppShell.tsx`](./components/AppShell.tsx) — sivujen yhteinen kuori.
4. [`components/Sidebar.tsx`](./components/Sidebar.tsx) — päänavigaatio, ikonit.
5. [`app/[orgSlug]/settings/page.tsx`](./app/[orgSlug]/settings/page.tsx) — kattava esimerkki sivun rakenteesta, lomakkeista ja modaaleista.
6. [`app/onboarding/page.tsx`](./app/onboarding/page.tsx) — brändi-ilmeen purimmat hetket (5-värikaista, tekstuuritausta, korttirakenne).

---

## 13. Kysy mieluummin kuin oleta

Jos jokin on epäselvää — tuotevisio, moduulin rooli, värin sävy, copyn sävy — kysy Antonilta. Momentumilla ei ole 40-hengen design-tiimiä eikä 200-sivuista brändikirjaa, joten päätöksiä tehdään suoraan.

Kiitos että olet mukana.

— Anton
