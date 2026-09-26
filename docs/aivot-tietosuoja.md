# Aivot: missä data on ja kuka sitä käsittelee

Tämä dokumentti kuvaa Momentumin Aivot-moduulin (organisaation tietopohja) tietovirrat: missä data säilytetään,
mitkä palvelut käsittelevät sitä ja miten sitä suojataan. Pohjana koodin nykytila (syyskuu 2026).

**Merkintä "Tarkistettava"** tarkoittaa kohtaa, jota ei voi varmistaa koodista. Se on tarkistettava palvelun konsolista
tai ajantasaisista ehdoista ennen kuin dokumenttia käytetään asiakkaille. Tarkistuksen jälkeen kirjaa päivämäärä ja tulos kohtaan.

---

## 1. Yhteenveto

| Mitä | Missä | Kuka käsittelee | Sijainti |
|---|---|---|---|
| Muistiinpanot, versiot, päätökset, ehdotukset, tavoitteet, kirjaukset, audit-loki | Firebase Firestore, projekti `momentum-69262` | Google (Firebase) | **Tarkistettava** (Firebase-konsoli → Firestore → Location). Suositus EU (`eur3` tai `europe-*`). |
| Äänikirjaukset (väliaikaisesti) | Firebase Storage, polku `organizations/{orgId}/brain-audio/` | Google (Firebase) | **Tarkistettava** (Firebase-konsoli → Storage). |
| Palvelinlogiikka (tallennus, haku, tekoälykutsut, vienti) | Netlify, Next.js API -reitit `/api/brain/*` | Netlify | **Tarkistettava** (Netlify → Functions → Region). Oletus Yhdysvallat, suositus EU. |
| Tekoälykäsittely (Kirjaa, Kysy) | Anthropic Claude API | Anthropic | **Tarkistettava** (ks. kohta 4). |
| Puheentunnistus | Cloudflare Worker → OpenAI Whisper API | Cloudflare, OpenAI | OpenAI: Yhdysvallat (Antonin päätös 26.9.2026). Cloudflare: **Tarkistettava**. |
| Agenttitokenit | Firestore `brainAgentTokens`, vain SHA-256-tiiviste | Google (Firebase) | Kuten Firestore. |

## 2. Firestore ja Storage

- Jokaisen organisaation aivot ovat omassa polussaan `organizations/{orgId}/brain*`. Organisaatioiden välinen raja on polussa ja Firestore-säännöissä (`firestore.rules`).
- **Luku**: vain organisaation jäsenet (roolit omistaja, ylläpitäjä, jäsen ja lukija). Toisen organisaation jäsen ei näe mitään. Tämä testataan automaattisesti (`firebase/rules-tests/`).
- **Kirjoitus**: selain ei voi kirjoittaa aivoihin suoraan. Kaikki muutokset kulkevat palvelimen API-reittien kautta. Reitit tarkistavat roolin ja tallentavat jokaisesta muutoksesta version ja audit-rivin.
- **Versiot**: jokainen muistiinpanon muutos tallentaa edellisen sisällön versiohistoriaan (`revisions`). Vanhan version voi palauttaa.
- **Äänitiedosto** poistetaan Storagesta oletuksena heti onnistuneen litteroinnin jälkeen. Jos litterointi epäonnistuu, tiedosto jää, jotta litterointia voi yrittää uudelleen.
- **Sijainti: Tarkistettava.** Firestoren ja Storagen sijainti valitaan projektia luotaessa, eikä sitä voi vaihtaa jälkikäteen. Tarkistus: ____ (päivä, tulos).

## 3. Netlify

- Sovellus ja sen API-reitit ajetaan Netlifyssä. API-reitit käsittelevät aivojen sisältöä muistissa pyynnön ajan (esim. haku ja tekoälyn kontekstin kokoaminen).
- Firestoreen kirjoitetaan palvelutilin avaimella (`FIREBASE_ADMIN_KEY`), joka on vain Netlifyn ympäristömuuttujissa.
- **Functions-alue: Tarkistettava.** Netlifyn oletusalue on Yhdysvallat. Alueen voi vaihtaa (*Site configuration → Functions → Region*), jos tilaus sallii. Tarkistus: ____.

## 4. Anthropic Claude API

**Milloin**: vain kun käyttäjä käyttää Kirjaa-toimintoa (kirjauksen käsittely) tai Kysy-toimintoa (kysymys aivoille). Tuonti, selaaminen, muokkaus ja haku eivät lähetä mitään Anthropicille.

**Mitä lähetetään** (`lib/brain-ai.ts`):
- organisaation nimi, ydinmuistiinpano (`core`) ja arvot
- käyttäjän kirjaus tai kysymys
- haun perusteella **relevantit muistiinpanot** sisältöineen, ei koko aivoja
- Kirjaa-toiminnossa lisäksi hakemisto: osioiden ja **kaikkien muistiinpanojen nimet** (ilman sisältöä), jotta tekoäly osaa ehdottaa oikeaa kohdetta, sekä tavoitteet tavoitelukuineen

**Mitä ei lähetetä**: muiden organisaatioiden dataa, muistiinpanojen versiohistoriaa, audit-lokia eikä agenttitokeneita. Avain (`ANTHROPIC_API_KEY`) on vain palvelimella.
Huomaa: jos muistiinpanon sisällössä on henkilötietoja (esim. asiakkaan yhteyshenkilö), ne lähtevät mukana, kun muistiinpano on kysymyksen kannalta relevantti.

**Periaate**: tekoäly ehdottaa, ihminen hyväksyy. Tekoälyn ehdotus ei muuta aivoja ennen kuin käyttäjä hyväksyy sen.

**API-datan käyttö, säilytys ja käsittelypaikka: Tarkistettava** Anthropicin ajantasaisista kaupallisista ehdoista ja tietosuojadokumentaatiosta ennen asiakaskäyttöä.
Tarkistettavat kysymykset: käytetäänkö API-dataa mallien koulutukseen, kuinka kauan pyyntöjä säilytetään, missä käsittely tapahtuu, ja onko tietojenkäsittelysopimus (DPA) voimassa.
Tarkistus: ____.

## 5. Puheentunnistus (OpenAI Whisper Cloudflare Workerin kautta)

- Kulku: selain → Firebase Storage → Momentumin API-reitti → Cloudflare Worker `/api/transcribe` → OpenAI Whisper API → teksti takaisin kirjaukseen.
- **Käsittely Yhdysvalloissa.** Antonin päätös 26.9.2026: Whisper on käytössä toistaiseksi. EU-vaihtoehto selvitetään myöhemmin, ja palveluntarjoaja on vaihdettavan rajapinnan takana (`lib/brain-transcribe.ts`, ympäristömuuttuja `BRAIN_TRANSCRIBE_PROVIDER`).
- Äänitiedosto poistetaan Storagesta litteroinnin jälkeen (ks. kohta 2).
- Äänikirjaus on vapaaehtoinen. Kirjauksen voi aina tehdä tekstinä, jolloin ääntä ei lähetetä minnekään.
- **OpenAI:n API-datan käyttö ja säilytys: Tarkistettava** OpenAI:n ajantasaisista ehdoista. **Cloudflare Workerin käsittelypaikka: Tarkistettava.**

## 6. Agenttitokenit

- Organisaatiokohtaiset tokenit ajastetuille agenteille ja iPhonen pikakomennolle (Siri).
- Token näytetään luotaessa kerran. Momentum tallentaa siitä vain **SHA-256-tiivisteen**, joten tokenia ei voi lukea kannasta.
- Oikeudet on rajattu (lukeminen, kirjaukset, ehdotukset). Agentti ei voi muuttaa muistiinpanoja suoraan: muutokset tulevat ehdotuksina ihmisen hyväksyttäviksi.
- Omistaja tai ylläpitäjä voi **perua** tokenin Asetuksista, ja peruminen tulee voimaan heti.
- Jokainen agentin kutsu kirjataan audit-lokiin.

## 7. Audit-loki ja palvelinlokit

- **Audit-loki** (`brainAuditLog`): kuka (käyttäjä tai agentti), mitä (toiminto), mihin (kohteen tunniste) ja milloin. Muutoksista kirjataan vain metatiedot (esim. muuttuneiden kenttien nimet ja versio), ei sisältöä. Audit-lokin näkevät vain omistajat ja ylläpitäjät.
- **Palvelinlokit**: aivojen koodi ei kirjoita muistiinpanojen tai kirjausten sisältöä Netlifyn tai Workerin lokeihin. Lokeihin menevät vain tunnisteet ja virhetyypit.
- **Tuontiskripti** tulostaa vain nimiä ja määriä, ei sisältöä. Tuonnista jää audit-lokiin yksi koontirivi.

## 8. Vienti ja poisto

- **Vienti**: omistaja tai ylläpitäjä voi ladata koko aivot zip-tiedostona (Aivot → Asetukset → Vienti). Tiedosto aukeaa Obsidianissa. Vienti kirjataan audit-lokiin.
- **Poisto**: tällä hetkellä poisto tehdään **pyynnöstä ylläpitäjältä** (Hetki Company). Käyttöliittymässä ei vielä ole koko aivojen poistoa.
- Varmuuskopiot: **Tarkistettava**, onko Firestoren varmuuskopiointi (PITR tai ajastetut varmuuskopiot) käytössä ja kuinka kauan kopioita säilytetään. Tämä vaikuttaa siihen, milloin poistettu data häviää kokonaan.

## 9. Kysymyksiä, joita asiakkaat kysyvät

**Missä datamme on?**
Firebase Firestoressa (Google). Sijainti on **tarkistettava** konsolista. Tavoite on EU.

**Näkeekö joku muu organisaatio datamme?**
Ei. Jokaisen organisaation data on omassa polussaan, ja tietoturvasäännöt estävät muiden organisaatioiden pääsyn. Tämä testataan automaattisesti jokaisen muutoksen yhteydessä.

**Lähetetäänkö datamme tekoälylle?**
Vain kun käytätte Kirjaa- tai Kysy-toimintoa. Silloin lähetetään organisaation ydin ja arvot sekä kysymykseen liittyvät muistiinpanot, ei koko aivoja. Kirjaa-toiminto lähettää lisäksi muistiinpanojen nimilistan ja tavoitteet.

**Koulutetaanko tekoälyä datallamme?**
**Tarkistettava** Anthropicin (ja puheentunnistuksessa OpenAI:n) ajantasaisista kaupallisista ehdoista ennen kuin vastaatte tähän asiakkaalle.

**Missä puhe käsitellään?**
OpenAI Whisperissä Yhdysvalloissa. Äänitiedosto poistetaan litteroinnin jälkeen. Puheen käyttö on vapaaehtoista: kirjauksen voi tehdä myös tekstinä.

**Voiko tekoäly tai agentti muuttaa tietojamme itsestään?**
Ei. Tekoäly ja agentit tekevät ehdotuksia, ja ihminen hyväksyy ne. Jokainen muutos tallentuu versiohistoriaan ja audit-lokiin.

**Kuka on muuttanut mitäkin?**
Versiohistoria näyttää jokaisen muistiinpanon muutokset. Audit-loki näyttää kaikki toiminnot, myös agenttien.

**Saammeko datamme ulos?**
Kyllä. Vienti tuottaa zip-tiedoston (Markdown ja Obsidian-yhteensopiva rakenne).

**Miten datamme poistetaan?**
Tällä hetkellä pyynnöstä Hetki Companyn ylläpitäjältä. Varmuuskopioiden säilytysaika on **tarkistettava**.

**Mihin agenttitoken antaa pääsyn?**
Vain yhden organisaation aivoihin ja vain valittuihin oikeuksiin. Token tallennetaan tiivisteenä, ja sen voi perua milloin tahansa.

---

## Tarkistuslista ennen asiakaskäyttöä

- [ ] Firestoren sijainti (Firebase-konsoli)
- [ ] Storage-bucketin sijainti (Firebase-konsoli)
- [ ] Netlify Functionsin alue
- [ ] Anthropic: API-datan käyttö, säilytys, käsittelypaikka ja DPA (ajantasaiset ehdot)
- [ ] OpenAI: API-datan käyttö ja säilytys (ajantasaiset ehdot)
- [ ] Cloudflare Workerin käsittelypaikka
- [ ] Firestoren varmuuskopiot ja niiden säilytysaika
