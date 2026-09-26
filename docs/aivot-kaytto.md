# Aivot: käyttöönotto ja tuonti

Ohje Antonille. Aivot on Momentumin moduuli (`/hetki-company/aivot`), johon Hetki Brainin sisältö tuodaan Obsidianista.
Suunnitelma ja päätökset: [`hetki-brain-plan.md`](hetki-brain-plan.md). Tietosuoja: [`aivot-tietosuoja.md`](aivot-tietosuoja.md).

Tässä dokumentissa ei ole liiketoimintadataa. Luvut ovat keksittyjä esimerkkejä.

---

## 1. Tarkista ennen kaikkea muuta

1. **Firestoren sijainti.** Firebase-konsoli → projekti `momentum-69262` → Firestore Database → välilehti *Data* tai *Settings*: kohta *Location*.
   Suositus on EU (`eur3` tai `europe-*`). Sijaintia ei voi vaihtaa jälkikäteen. Kirjaa näkemäsi arvo tietosuojadokumenttiin.
2. **Storage-bucketin sijainti.** Firebase-konsoli → Storage → bucketin tiedot (sama projekti).
3. **Netlify Functionsin alue.** Netlify → sivusto → *Site configuration → Functions → Region*. Oletus on Yhdysvallat.
   Aivojen API-reitit käsittelevät luottamuksellista dataa, joten aseta EU-alue (esim. Frankfurt `eu-central-1`), jos tilaus sallii.

## 2. Ympäristömuuttujat (Netlify)

Netlify → sivusto → *Site configuration → Environment variables*. Arvot ovat palvelimella, eivät koskaan selaimessa.

| Muuttuja | Pakollinen | Mitä |
|---|---|---|
| `FIREBASE_ADMIN_KEY` | kyllä | Palvelutilin avain (JSON tai base64). Kaikki aivojen kirjoitukset kulkevat tämän kautta. Luultavasti jo asetettu. |
| `ANTHROPIC_API_KEY` | Kirjaa ja Kysy | Claude API -avain. Ilman sitä kirjaukset tallentuvat, mutta tekoäly ei käsittele niitä. |
| `BRAIN_AI_MODEL` | ei | Mallin tunnus. Oletus on koodissa (`lib/brain-ai.ts`). Vaihda vain, jos haluat eri mallin. |
| `BRAIN_AI_FALLBACKS` | ei | `off` poistaa palvelinpuolen varareitityksen (kieltäytymisen jälkeen toinen malli). Oletuksena päällä. |
| `BRAIN_TRANSCRIBE_PROVIDER` | ei | Puheentunnistus. Oletus `worker-whisper` (Cloudflare Worker → OpenAI Whisper). |

Muutos tulee voimaan seuraavassa Netlify-julkaisussa (*Deploys → Trigger deploy*).

## 3. Julkaisu

Julkaisu on aina Antonin päätös. Agentit eivät julkaise.

1. **Firestore-säännöt** (aivojen kokoelmat ovat selaimelle vain luku):
   ```bash
   firebase deploy --only firestore:rules
   ```
2. **Sovellus**: haara yhdistetään `main`-haaraan PR:n kautta, ja Netlify julkaisee sen automaattisesti.
3. Varmista, että Aivot-moduuli näkyy Hetki Companyn sivupalkissa.

## 4. Tuonti vaiheittain

Tuonti ajetaan omalta koneelta. Seed-tiedosto on luottamuksellinen: **älä kopioi sitä repoon** (`data/` ja `*seed*.json` ovat `.gitignore`ssa).

Valmistelu (kerran):

```bash
cd momentum-next
npm install
# Palvelutilin avain: Firebase-konsoli → Project settings → Service accounts → Generate new private key.
# Säilytä tiedosto repon ulkopuolella ja poista se, kun et enää tarvitse sitä.
export GOOGLE_APPLICATION_CREDENTIALS="$HOME/avaimet/momentum-69262-admin.json"
# tai: export FIREBASE_ADMIN_KEY="$(base64 < "$HOME/avaimet/momentum-69262-admin.json")"
```

Polku seediin (esimerkki):

```bash
SEED="$HOME/Momentum – Hetki Brain/data/hetki-brain-seed.json"
```

### Vaihe 1: kuivaharjoitus

```bash
node scripts/import-brain.mjs "$SEED" --org hetki-company --dry-run
```

Mitään ei kirjoiteta. Tuloste näyttää:
- montako osiota, muistiinpanoa, nimeä, ehdotusta, päätöstä ja pohjaa luotaisiin, päivitettäisiin tai ohitettaisiin
- uusien ja päivitettävien muistiinpanojen nimet (ei sisältöä)
- vertailun `meta.counts_by_kind`-lukuihin: jokaisen rivin ero pitäisi olla 0. `dashboard`-tyyppiä ei tuoda sisältönä, vaan sen näkymät tallennetaan erikseen.
- ratkaisemattomat linkit. Osa on tarkoituksella tulevia sivuja. Vertaa määrää seedin `meta.unresolved_links`-listaan.
- kaksoisnimet (jälkimmäinen saa nimeen " (2)", koska linkit viittaavat nimeen) ja tuntemattomat osiot (muistiinpano menee Inboxiin)

Jos luvut eivät täsmää, korjaa vault tai vientiskripti ja aja kuivaharjoitus uudelleen.

### Vaihe 2: varsinainen tuonti

```bash
node scripts/import-brain.mjs "$SEED" --org hetki-company
```

Jokainen muistiinpano saa version 1 ja revision lähteellä `import`. Audit-lokiin tulee yksi koontirivi (`import.run`).

### Vaihe 3: koontinäkymät

```bash
node scripts/import-brain.mjs "$SEED" --org hetki-company --views --dry-run
node scripts/import-brain.mjs "$SEED" --org hetki-company --views
```

Obsidianin dashboard-näkymät (`saved_views`) tallennetaan kokoelmaan `brainViews`. Skripti yrittää tulkita otsikon, suodattimet ja sarakkeet.
Alkuperäinen määrittely säilyy aina kentässä `raw`, joten tulkintaa voi parantaa myöhemmin.

### Vaihe 4: tavoitteet

Tavoitteiden luvut eivät ole seedissä eivätkä koodissa. Tee oma `goals.json` repon ulkopuolelle (`goals.json` on `.gitignore`ssa).

Rakenne (keksityt luvut):

```json
{
  "goals": [
    {
      "id": "liikevaihto-2027",
      "period": "2027",
      "title": "Liikevaihto 2027",
      "targetValue": 100000,
      "stretchValue": 120000,
      "baselineValue": 80000,
      "baselinePeriod": "2026",
      "unit": "€",
      "breakdown": [
        { "key": "mainos", "label": "Mainospuoli", "targetValue": 60000 },
        { "key": "elokuva", "label": "Elokuvapuoli", "targetValue": 40000 }
      ],
      "noteSlug": "tavoitteet-tavoitteet-2027",
      "sortOrder": 0
    }
  ]
}
```

- Pakolliset: `id`, `period`, `title`, `targetValue`. Muut ovat valinnaisia.
- `id` on dokumentin tunniste. Pidä se samana, niin uudelleenajo päivittää saman tavoitteen.
- `noteSlug` on muistiinpano, johon tavoite liittyy. Slugin näet muistiinpanon osoitteesta (`/aivot/m/<slug>`).
- Toteumat kirjataan Momentumissa, ei tähän tiedostoon.

```bash
node scripts/import-brain.mjs "$SEED" --org hetki-company --goals "$HOME/avaimet/goals.json" --dry-run
node scripts/import-brain.mjs "$SEED" --org hetki-company --goals "$HOME/avaimet/goals.json"
```

## 5. Vienti uudelleen ja tuonti uudelleen

Jos vaultia muutetaan vielä ennen siirtymistä kokonaan Momentumiin:

```bash
cd "$HOME/Momentum – Hetki Brain"
python3 export_hetki_brain.py '<polku vaultiin>' data
cd <repo>/momentum-next
node scripts/import-brain.mjs "$SEED" --org hetki-company --dry-run
node scripts/import-brain.mjs "$SEED" --org hetki-company
```

Tuonti on idempotentti:
- Muistiinpanon tunniste on `slugify(note.id)`, joten sama muistiinpano päivittyy eikä monistu.
- Muuttumaton muistiinpano ohitetaan eikä saa uutta versiota. Muuttunut saa version + 1 ja revision lähteellä `import`.
- Jos vain linkit muuttuvat (esim. uusi muistiinpano ratkaisee aiemmin ratkaisemattoman linkin), linkit päivittyvät ilman uutta versiota.
- **Momentumissa muokattua muistiinpanoa ei ylikirjoiteta.** Skripti listaa ne. Jos haluat silti vaultin version, lisää `--force`. Momentumin versio säilyy versiohistoriassa.
- Ehdotuksen päätös (hyväksytty, hylätty tai myöhemmin), joka on tehty Momentumissa, säilyy.
- Mitään ei poisteta. Jos muistiinpano on poistettu vaultista, skripti kertoo määrän, ja poisto tehdään Momentumissa.

## 6. Agenttitokenit

Aivot → Asetukset → Agenttitokenit (omistaja tai ylläpitäjä).

- Anna tokenille kuvaava nimi (esim. "Strategiaagentti" tai "Siri") ja vain tarvittavat oikeudet:
  `read` (lukeminen), `inbox:write` (kirjaukset), `proposals:write` (ehdotukset).
- Token näytetään **vain kerran**. Kopioi se salasanojen hallintaan. Momentum tallentaa siitä vain SHA-256-tiivisteen.
- Perutun tokenin käyttö lakkaa heti. Jokainen agentin kutsu kirjataan audit-lokiin.
- Rajapinta: `https://hetkimomentum.com/api/brain/agent`, otsake `Authorization: Bearer mbt_…`. Kuvaus on tiedoston `momentum-next/app/api/brain/agent/route.ts` alussa.
- Agentti ei muuta muistiinpanoja suoraan. Muutokset tulevat ehdotuksina hyväksyttäviksi.

## 7. Siri-pikakomento (iPhone)

1. Luo token, jolla on oikeus `inbox:write`, nimeksi esim. "Siri".
2. Avaa Pikakomennot → uusi pikakomento:
   1. **Sanele teksti** (kieli suomi).
   2. **Hae URL-osoitteen sisältö**:
      - URL `https://hetkimomentum.com/api/brain/agent`
      - Menetelmä `POST`
      - Otsakkeet: `Authorization` = `Bearer mbt_…` (token), `Content-Type` = `application/json`
      - Pyynnön runko JSON: `type` = `inbox`, `text` = *Sanottu teksti*, `channel` = `siri`
   3. (Valinnainen) **Näytä ilmoitus**: "Kirjattu aivoihin".
3. Nimeä pikakomento esim. "Kirjaa aivoihin". Nyt voit sanoa: "Hei Siri, kirjaa aivoihin".

Kirjaus menee Inboxiin tilaan *Uusi*. Tekoäly ehdottaa, mihin se kuuluu, ja sinä hyväksyt ehdotuksen Momentumissa.
Token on pikakomennossa selväkielisenä. Jos puhelin katoaa, peru token Asetuksista.

## 8. Obsidian jää arkistoksi

Antonin päätös 26.9.2026: vault jää tuonnin jälkeen vain luettavaksi arkistoksi, ja **Momentum on ainoa totuus**.

- Älä muokkaa vaultia tuonnin jälkeen. Jos muokkaat, tuonti ei ylikirjoita Momentumissa tehtyjä muutoksia ilman `--force`-lippua.
- Varmuuskopio: Aivot → Asetukset → Vienti tuottaa zip-vaultin (osiot kansioina, frontmatter, `[[wikilinkit]]`, pohjat `Mallit/`-kansiossa), joka aukeaa Obsidianissa.

## 9. Vianetsintä

| Viesti | Syy ja korjaus |
|---|---|
| `Tunnukset puuttuvat` | Aseta `GOOGLE_APPLICATION_CREDENTIALS` tai `FIREBASE_ADMIN_KEY`. Kuivaharjoitus toimii ilman tunnuksia, mutta silloin kaikki näytetään uusina. |
| `Organisaatiota "…" ei löydy` | Tarkista `--org`. Hetki Companyn tunnus on `hetki-company`. |
| `Palvelutili kuuluu projektiin …` | Avain on väärästä Firebase-projektista. |
| `Seed: notes-kenttä puuttuu` | Väärä tiedosto tai vientiskriptin vanha versio. |
| `Tavoitteet: … pakollisia` | `goals.json`-tiedostosta puuttuu `title`, `period` tai `targetValue`. |
| Ero `counts_by_kind`-vertailussa | Katso tuntemattomat tyypit ja kaksoistunnisteet tulosteen lopusta. |
