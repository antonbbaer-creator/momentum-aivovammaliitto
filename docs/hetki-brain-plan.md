# Aivot (Hetki Brain) Momentumissa – suunnitelma

Tila: **toteutettu 26.9.2026** (Anton: "Rakenna aivot"). Odottaa käyttöönottoa: ks. `docs/aivot-kaytto.md` ja hyväksymiskriteerit alla.
Pohjana on ohje "Hetki Brain Momentumiin – ohje Claude Codelle". Tässä dokumentissa ei ole liiketoimintadataa (luvut, asiakkaat, hinnat); ne tulevat vain paikallisesta tuontipaketista.

---

## 1. Vaihe 0: mitä Momentumissa on nyt

| Asia | Tilanne | Merkitys aivoille |
|---|---|---|
| Pino | Next.js 16 (App Router) + React 19, TypeScript. Tuotanto Netlifyssä (`hetkimomentum.com`). | Momentum ei ole HTML-demo. Aivot rakennetaan olemassa olevaan sovellukseen, ei uuteen pinoon. |
| Tietokanta | **Firebase Firestore** (projekti `momentum-69262`), ei Postgresia eikä Supabasea. Tiedostot Firebase Storagessa ja Cloudflare R2:ssa. | Ohjeen Postgres-malli (taulut, RLS, `tsvector`) käännetään Firestoren vastineiksi, ks. kohta 2. |
| Autentikointi | Firebase Auth. API-reitit varmistavat ID-tokenin (`lib/auth-server.ts`). | Käytetään sellaisenaan. |
| Monivuokraus | On jo: `organizations/{orgId}`, jäsenyys `organizations/{orgId}/members/{uid}` rooleilla `owner`, `admin`, `member`, `visitor`. Firestore-säännöt rajaavat jäsenyyden perusteella. | Aivot saavat oman `org_id`-rajan samalla mekanismilla. Ohjeen roolit: omistaja = `owner`/`admin`, jäsen = `member`, lukija = `visitor`. |
| Orgin data nyt | Useimmat moduulit tallentavat yhden JSON-blobin dokumenttiin `organizations/{orgId}/data/{key}` (1 Mt:n raja on jo kerran tullut vastaan). | Aivoille **ei** käytetä blob-mallia: jokainen muistiinpano on oma dokumenttinsa. Muuten 1 Mt tulee vastaan, eivätkä versiot, haut ja takaisinlinkit skaalaudu. |
| Tekoäly | Claude API kutsutaan palvelimelta: Next API -reitit (`app/api/pdf/*`, `ANTHROPIC_API_KEY`) ja Cloudflare Worker (`/api/ai/assist`, Momentum-bot). | Aivojen tekoäly Next API -reiteissä, avain vain palvelimella, malli ympäristömuuttujasta. |
| Puheentunnistus | Worker `/api/transcribe` → **OpenAI Whisper** (käsittely Yhdysvalloissa). Selaimen nauhoitus `lib/use-audio-recorder.ts`. | Nauhoitus käytetään uudelleen. Palveluntarjoaja vaihdettavan rajapinnan taakse, ja EU-vaihtoehto on päätöskysymys. |
| Markdown | Kevyt oma renderöijä viesteille (`lib/markdown.ts`), ei taulukoita. `jszip` on jo riippuvuus. | Aivoille tarvitaan täysi markdown: taulukot, otsikot, tehtävälistat, wikilinkit ja ⚠️. Tätä varten ehdotetaan yhtä pientä, turvallista riippuvuutta (päätös 5). |
| Testit ja CI | GitHub Actions: terveys, tyypit, lint, functions-build ja Firestore-sääntötestit emulaattorissa (`firebase/rules-tests/`). | Aivojen org-eristystesti (ohjeen "RLS-testi") kirjoitetaan samaan harnessiin. |
| Deploy | Next → Netlify (push mainiin). Säännöt ja Functions → `firebase deploy` käsin. Agentit eivät deployaa. | Jokainen vaihe julkaistaan erikseen Antonin hyväksynnällä. |

**Tarkistettavaa ennen toteutusta (Anton, Firebase- ja Netlify-konsoli):**
1. Firestoren sijainti (`eur3` tai `europe-*`?) ja Storage-bucketin sijainti. Näitä ei näe koodista, eikä Firestoren sijaintia voi vaihtaa jälkikäteen.
2. Netlify Functionsin alue: oletuksena Yhdysvallat. Aivojen API-reitit käsittelevät luottamuksellista dataa, joten alue kannattaa asettaa EU:hun (esim. `eu-central-1`), jos tilaus sallii.

---

## 2. Tietomalli Firestoressa

Ohjeen taulut käännetään alikokoelmiksi orgin alle. Näin org-raja on polussa, ja säännöt ovat samat kuin muualla Momentumissa.
Kentät nimetään camelCasella repon tavan mukaan.

```
organizations/{orgId}/
  brainSections/{slug}          title, description, sortOrder, parentSlug
  brainNotes/{slug}             sectionSlug, name, nameKey, title, kind, properties{}, bodyMd,
                                needsReview, reviewItems[], linksOut[], unresolvedLinks[],
                                sourcePath, createdBy, updatedBy, createdAt, updatedAt, version
    revisions/{version}         title, bodyMd, properties, changedBy, changeSource, changeReason, createdAt
  brainNoteNames/{nameKey}      slug                  (nimen yksikäsitteisyys orgin sisällä)
  brainDecisions/{id}           decidedOn, decision, rationale, areaSlug, source, proposalId, createdBy, createdAt
  brainProposals/{id}           title, bodyMd, status, area, impact, urgency, sources[], createdBy,
                                decidedBy, decidedAt, decisionNote, snoozeUntil, noteSlug, createdAt
  brainGoals/{id}               period, title, targetValue, stretchValue, unit, breakdown[], noteSlug
  brainMetricEntries/{id}       goalId, period, value, note, createdAt
  brainInbox/{id}               rawText, audioPath, transcript, channel, status, aiSuggestion{}, error,
                                createdBy, createdAt, processedAt
  brainTemplates/{id}           name, kind, propertiesTemplate{}, bodyMd
  brainAuditLog/{id}            actorType, actorId, action, entity, entityId, diff{}, createdAt
brainAgentTokens/{sha256}       orgId, name, scopes[], createdBy, createdAt, lastUsedAt, revokedAt
```

| Ohjeen vaatimus | Firestore-ratkaisu |
|---|---|
| `slug` uniikki orgissa | Dokumentin id on slug, joten uniikkius tulee rakenteesta. |
| `name` uniikki orgissa | `brainNoteNames/{nameKey}` (pienaakkoset, trimmattu). Luonti ja uudelleennimeäminen tehdään transaktiossa palvelimella. |
| `brain_links` | Linkit tallennetaan muistiinpanoon (`linksOut` = kohteiden slugit, `unresolvedLinks` = nimet ilman kohdetta, aliakset `properties`-kentän ulkopuolella). Takaisinlinkit haetaan kyselyllä `where('linksOut', 'array-contains', slug)`. Linkit lasketaan uudelleen jokaisella tallennuksella, ja kun uusi muistiinpano luodaan, sitä odottaneet `unresolvedLinks` ratkaistaan. Erillistä linkkikokoelmaa ei tarvita. |
| Versiot ja palautus | Alikokoelma `revisions/{version}`. Tallennus kasvattaa `version`-kenttää ja kirjoittaa revision samassa transaktiossa. Palautus = uusi versio vanhan sisällöllä, lähteenä `user`. |
| Row Level Security | Firestore-säännöt: aivojen kokoelmat ovat orgin jäsenille **vain luku** (`visitor` = lukija mukaan lukien). **Kaikki kirjoitukset kulkevat API-reittien kautta** (admin-SDK), jotka tarkistavat roolin ja kirjoittavat revision ja audit-rivin samassa transaktiossa. Näin selain ei voi ohittaa versiointia eikä auditointia. `brainAuditLog` on omistajille vain luku, ja `brainAgentTokens` on suljettu kokonaan selaimelta. |
| RLS-testi | `firebase/rules-tests/brain.test.mjs`: toisen orgin jäsen ei lue, listaa eikä kirjoita Hetken aivoja, lukija ei kirjoita, kirjautumaton ei näe mitään. Ajetaan CI:ssä. |
| Täysitekstihaku (`finnish`) | Firestoressa ei ole täysitekstihakua. Aivot ovat pieni korpus (satoja muistiinpanoja), joten haku tehdään palvelimella: API-reitti rakentaa orgin muistiinpanoista välimuistissa pidettävän hakemiston. Mukana suomen normalisointi (pienaakkoset, ä/ö säilyvät, yksinkertainen päätteenkatkaisu), ja painotus on otsikossa. Myöhemmin semanttinen haku Firestoren omalla vektorihaulla (`findNearest`), ei erillistä palvelua. |
| `properties` jsonb | Vapaamuotoinen map. Tyypit (`kind`) ja pohjat määräävät, mitä kenttiä odotetaan, joten malli toimii kaikille orgeille. |
| `created_by` agentilla | `actorType: 'agent'` + tokenin nimi. |

Hetki-kohtaista sisältöä ei ole koodissa: osiot, pohjat, tavoitteet ja agenttien nimet tulevat datasta. Uusi org saa tyhjät aivot ja halutessaan yleisen aloituspohjan (osiot ilman sisältöä).

---

## 3. Arkkitehtuuri

- **Moduuli** `aivot` rekisteriin (`lib/modules.ts`), polku `/[orgSlug]/aivot`. Kytketään päälle Hetki Companylle. Muut orgit voivat ottaa sen käyttöön myöhemmin.
- **Sivut**: `aivot` (Koti), `aivot/m/[slug]` (muistiinpano), `aivot/kirjaa`, `aivot/ehdotukset`, `aivot/kysy`, `aivot/asetukset` (tokenit, vienti).
- **Luku**: selain lukee Firestoresta suoraan (reaaliaikainen päivitys, säännöt rajaavat).
- **Kirjoitus**: `app/api/brain/*` -reitit (Next, Node-runtime, admin-SDK). Sama palvelinkerros (`lib/brain-server.ts`) palvelee käyttäjiä (Firebase ID-token) ja agentteja (agenttitoken).
- **Tekoäly**: `lib/brain-ai.ts`. Kontekstina organisaation `core`-muistiinpano ja arvot sekä haun palauttamat relevantit muistiinpanot, ei koko aivoja. Malli: `BRAIN_AI_MODEL` (oletus ajantasainen Sonnet), avain `ANTHROPIC_API_KEY`. Vastaukset rakenteisina (tool use / JSON-skeema).
- **Puhe**: `lib/brain-transcribe.ts` rajapinta `transcribe(audio, lang) → text`. Toteutus valitaan päätöksen 2 mukaan. Äänitiedosto poistetaan oletuksena onnistuneen litteroinnin jälkeen.
- **Periaate**: tekoäly ja agentit ehdottavat, ihminen hyväksyy. Mitään ei lähetetä organisaation ulkopuolelle.

---

## 4. Toteutusjärjestys (pienet, erikseen tarkistettavat PR:t)

| # | Osa | Sisältö | Valmis kun |
|---|---|---|---|
| 1 | Tietomalli ja säännöt | `lib/brain-shared.ts` (tyypit, wikilinkki-jäsennin, ⚠️-poiminta, slugit), Firestore-säännöt, `brain.test.mjs` | Eristystesti vihreä CI:ssä |
| 2 | Tuonti | `momentum-next/scripts/import-brain.mjs <polku>/hetki-brain-seed.json --org hetki-company [--dry-run]`. Ajetaan Antonin koneella, data ei tule repoon (`data/` ja `*seed*.json` `.gitignore`en). Idempotentti upsert slugilla, revisio lähteellä `import`, ehdotukset (`## Lähteet`), päätökset (alue nimellä), pohjat, linkit ja raportti ratkaisemattomista. Tavoitteet erillisestä paikallisesta `goals.json`-tiedostosta, ei koodista. Lopuksi vertailu `meta.counts_by_kind`-lukuihin. | Kuivaharjoitus ja tuonti täsmäävät |
| 3 | Aivot-näkymä (luku) | Osiopuu, lista, muistiinpano, markdown ja taulukot, klikattavat wikilinkit, takaisinlinkit, ominaisuuspaneeli, ⚠️-korostus ja -merkki, haku | Kaikki tuodut muistiinpanot selattavissa |
| 4 | Muokkaus | Markdown-editori (esikatselu vierellä), ominaisuuksien muokkaus, versiohistoria ja palautus, uusi muistiinpano pohjasta, uudelleennimeäminen päivittää linkit | Revisiot ja audit-rivit syntyvät |
| 5 | Koti | Tavoitteet ja toteuma (mainos- ja elokuvapuoli erikseen), uudet ehdotukset, ⚠️-lista, käsittelemätön inbox, projektit ja asiakkaat taulukkoina `properties`-kentistä (Obsidianin `base`-näkymien vastineet `saved_views`-tiedon mukaan), viimeksi muokatut | |
| 6 | Kirjaa: teksti | Tallennus heti inboxiin (`uusi`), tekoälyn operaatiolista (`append_to_note`, `update_property`, `create_note`, `add_decision`, `add_proposal`, `update_goal_metric`), diff-näkymä, jokaisen operaation hyväksyntä, muokkaus tai hylkäys erikseen. Epäselvä kohde → kysymys. | Mitään ei kirjoiteta ilman hyväksyntää |
| 7 | Kirjaa: ääni | Mikrofoni puhelimella, EU-tallennus, litterointi, äänen poisto | Päästä päähän puhelimella |
| 8 | Ehdotukset | Kortit tiloittain. Hyväksy → tehtävä Kehityssuunnitelmaan ja valinnainen päätös. Hylkää → perustelu, ei ehdoteta uudelleen. Myöhemmin → palaa valittuna päivänä. | |
| 9 | Kysy | Haku → vastaus lähdeviitteineen. Jos lähdettä ei ole, vastaus sanoo sen. | |
| 10 | Agenttirajapinta | `/api/brain/agent/*`: luku (muistiinpanot, haku, tavoitteet, ehdotukset, päätökset), kirjoitus (inbox, ehdotus). Muistiinpanomuutokset menevät ehdotuksiksi. Tokenit hallitaan asetussivulla (näytetään kerran, tallennetaan SHA-256-tiivisteenä, scopet, peruttavissa), ja jokainen kutsu kirjataan audit-lokiin. Ohje iPhonen pikakomentoon (Siri → inbox). | Token lukee ja kirjoittaa, audit näkyy |
| 11 | Vienti | Zip-vault: osiot kansioina, frontmatter, `[[wikilinkit]]`, pohjat `Mallit/`-kansioon. Aukeaa Obsidianissa. | |
| – | Dokumentaatio | `docs/aivot-tietosuoja.md`: missä data on, mitkä palvelut käsittelevät sitä ja millä ehdoilla (Firestore, Storage, Netlify, Anthropic, puheentunnistus). Tarkistetaan ajantasaisista lähteistä ennen vaihetta 6. | |

Olemassa olevia kokoelmia, avaimia tai moduuleja ei muuteta eikä poisteta. Ainoa muutos yhteisiin tiedostoihin: moduulirekisteri, sääntöihin uusi `match`-lohko ja `.gitignore`.

Vaiheet 1–5 eivät tarvitse päätöksiä 2–4. Vaihe 7 tarvitsee päätöksen 2.

---

## 5. Myöhemmin (ei nyt)

Hetki Pipelinen yhdistäminen, viestintätoimintojen kytkeminen aivoihin kontekstiksi, PWA ja semanttinen haku. Kehitysagentit (`agentit/`) voivat myöhemmin lukea aivoja samalla agenttirajapinnalla.

---

## 6. Päätökset

Anton päätti 26.9.2026:

| # | Kysymys | Päätös |
|---|---|---|
| 1 | Pino | **Firebase.** Aivot rakennetaan Firestore-kokoelmiksi orgin alle, ei Supabasea. |
| 2 | Puheentunnistus | **Whisper toistaiseksi** (nykyinen Worker-toteutus, käsittely Yhdysvalloissa). Tehdään vaihdettavan rajapinnan taakse. EU-vaihtoehto myöhemmin, ja tämä kirjataan tietosuojadokumenttiin. |
| 3 | Obsidian | **Arkisto.** Vault jää tuonnin jälkeen vain luettavaksi, ja Momentum on ainoa totuus. Vientiä käytetään varmuuskopiona. |
| 4 | Hetki Pipeline | **Myöhemmin.** |

Ratkaistu toteutuksen alussa (Anton: "Rakenna aivot", 26.9.2026):

| # | Kysymys | Ratkaisu |
|---|---|---|
| 5 | Markdown | Oma, testattu jäsennin (`lib/brain-markdown.mjs`), joka tuottaa puun ja renderöi Reactina ilman innerHTML:ää. Kirjaston lisääminen vaatisi lukkotiedoston päivityksen, mikä ei onnistu pilvisessiossa. Taulukot, sisäkkäiset listat, tehtävälistat, callout-lohkot ja wikilinkit ovat testattuja. |
| 6 | Haara | Session haara `claude/agenttinen-momentumi-systeemi-q7bm7m`, jokainen vaihe omana committinaan. |
| 7 | Tuonti | Ajetaan Antonin koneella paikallisesta polusta (`scripts/import-brain.mjs`). |
| 8 | Sijainti | Vielä tarkistamatta. Tarkista Firestoren sijainti konsolista ennen tuontia. |

---

## 7. Hyväksymiskriteerit (tilanne 26.9.2026)

| Kriteeri | Tila |
|---|---|
| Suunnitelma hyväksytty ennen toteutusta | ✓ |
| Kuivaharjoitus ja tuonti, määrät vastaavat seedin metaa | Skripti valmis ja testattu keksityllä datalla (`scripts/import-brain.mjs`, 15 testiä). **Ajetaan Antonin koneella.** |
| Osiot ja muistiinpanot näkyvät, wikilinkit ja takaisinlinkit | ✓ (tarkistettava oikealla datalla) |
| Päätösloki, ehdotukset, pohjat ja tavoitteet tuotu | Tuonti tukee kaikkia; tavoitteet paikallisesta goals.json-tiedostosta |
| ⚠️-kohdat muistiinpanoissa ja koontinäkymässä | ✓ |
| Kirjaa tekstillä ja äänellä, ei kirjoitusta ilman hyväksyntää | ✓ (ääni Whisperillä, tarkistettava selaimessa) |
| Ehdotuksen hyväksyntä lisää tehtävän Kehityssuunnitelmaan | ✓ |
| Kysy vastaa lähteineen | ✓ (vaatii ANTHROPIC_API_KEY:n Netlifyssä) |
| Agenttitokenilla luku, kirjaus ja ehdotus, audit-loki | ✓ |
| Org-eristystesti (RLS-vastine) | ✓ `firebase/rules-tests/brain.test.mjs`, CI:ssä |
| Vienti aukeaa Obsidianissa | Toteutettu, tarkistettava oikealla datalla |
| Olemassa olevat toiminnot toimivat kuten ennen | CI vihreä (tyypit, lint, säännöt); selaintesti puuttuu |

Katselmointi (tarkastaja, tietoturva, saavutettavuus) tehty ja löydökset korjattu. Avoimet: B-5 (koko sovelluksen kontrasti), B-6 (ääniteiden tallennussäännöt) `agentit/BACKLOG.md`:ssä.
