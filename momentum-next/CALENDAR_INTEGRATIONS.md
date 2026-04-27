# Kalenteri-integraatiot — Google + Microsoft (Outlook)

Henkilökohtaisen tilan (`/oma`) viikkokalenteri tukee ulkoisten kalentereiden synkronointia:
- Tapahtumat näkyvät overlay-tyylillä viikkonäkymässä
- Kategoriaan mapatun kalenterin tunnit lasketaan ajankäyttöyhteenvetoon
- Konfliktivaroitus omien lohkojen ja ulkoisten tapahtumien limittyessä
- Kaksisuuntainen kirjoitus: Momentumissa luotu lohko, jonka kategoria on mapattu kalenteriin, kirjoittautuu sinne automaattisesti

## Käyttöönotto

### 1. Asenna riippuvuudet

```bash
cd momentum-next
npm install
```

(Lisätty: `firebase-admin` server-puolen Firestore-kirjoituksia varten)

### 2. Firebase Admin -tunnukset

Kirjautuminen + Firestore-kirjoitus OAuth-callbackeissä ja API-routeissa vaatii service-account-tunnuksen.

1. Firebase Console → Project Settings → **Service Accounts** → "Generate new private key"
2. Tallenna JSON. Aseta `.env.local`:iin yhdellä rivillä, joko base64-pakattuna tai puhtaana JSONina:

```bash
# Base64 (suositeltu — välttää JSONin escape-ongelmat)
cat serviceAccount.json | base64 | pbcopy
# Liitä:
FIREBASE_ADMIN_KEY=<base64-merkkijono>
```

### 3. Google Calendar -OAuth

Tämä on **eri OAuth-client** kuin Drive (Drive käyttää Firebase Authin Google-provideria, joka ei anna refresh-tokenia).

1. [Google Cloud Console](https://console.cloud.google.com/) → projekti `momentum-69262` (tai oma)
2. **APIs & Services** → **Library** → ota **Google Calendar API** käyttöön
3. **APIs & Services** → **Credentials** → "Create credentials" → **OAuth client ID**
4. Application type: **Web application**
5. Authorized redirect URIs:
   - `http://localhost:3000/api/oauth/google/callback`
   - `https://your-domain.example/api/oauth/google/callback` (tuotanto)
6. Kopioi **Client ID** ja **Client Secret** `.env.local`:iin:

```
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
```

### 4. Microsoft (Outlook / Microsoft 365) -OAuth

1. [Azure Portal](https://portal.azure.com/) → **App registrations** → "New registration"
2. Name: `Momentum`
3. Supported account types: **Accounts in any organizational directory and personal Microsoft accounts** (= multi-tenant + personal)
4. Redirect URI: **Web** → `http://localhost:3000/api/oauth/microsoft/callback`
5. Tallenna sovellus, kopioi **Application (client) ID**
6. **Certificates & secrets** → "New client secret" → kopioi **Value** (näkyy vain kerran)
7. **API permissions** → "Add a permission" → Microsoft Graph → Delegated:
   - `Calendars.ReadWrite`
   - `offline_access`
   - `openid`, `email` (yleensä jo mukana)
8. (Valinnainen, multi-tenant) "Grant admin consent" — yksityishenkilö-tileille ei tarvita.

```
MICROSOFT_OAUTH_CLIENT_ID=...
MICROSOFT_OAUTH_CLIENT_SECRET=...
MICROSOFT_TENANT_ID=common
```

### 5. Pohja-URL

```
OAUTH_REDIRECT_BASE_URL=http://localhost:3000
```

Tuotannossa aseta tämä lopulliseen verkko-osoitteeseen — redirect URI **täytyy täsmätä** OAuth-providereissa rekisteröityihin URLeihin.

### 6. Käynnistä uudelleen

```bash
npm run dev
```

Asetussivu: http://localhost:3000/oma/asetukset

## Käyttö

### Kalenterin liittäminen

1. Oma-tila → **Asetukset** → "Yhdistä" Googlen tai Microsoftin kohdalla
2. OAuth-popup → suostumus → palaat asetussivulle
3. Valitse rastilla mitkä kalenterit näkyvät viikossa
4. (Valinnainen) Mappaa kalenteri kategoriaan dropdown-valikolla — ts. "tämän kalenterin tapahtumat ovat **Aivovammaliitto**-aikaa"
5. (Valinnainen) Aktivoi kirjoitus → Momentumissa luodut lohkot tähän kategoriaan kirjoittautuvat tähän kalenteriin
6. **Tallenna**

### Kaksisuuntainen synkka

- Tee Momentumissa lohko jonka kategoria on mapattu kirjoituskelpoiseen kalenteriin → tapahtuma luodaan ulkoiseen kalenteriin POST-kutsulla
- Muokkaa lohkoa → ulkoinen tapahtuma päivittyy PATCH-kutsulla
- Poista lohko → ulkoinen tapahtuma poistetaan
- Ulkoisesta kalenterista lisätyt tapahtumat näkyvät vain-luku-overlayna seuraavalla pollauskerralla (max 15 min viive, tai paina "Päivitä nyt")

### Pollauksen ajoitus

Asetussivun "Päivitä nyt" -painikkeesta pollaus ajetaan välittömästi. Automaattinen pollaus tapahtuu kun käyttäjä avaa /oma/viikko ja viimeisin haku on yli 15 min vanha.

**Tuotantokäyttöön suositellaan ajastettua cronia** (esim. Netlify Scheduled Function tai ulkoinen cron) joka kutsuu `/api/calendars/poll` jokaiselle aktiiviselle käyttäjälle. Tämä ei kuitenkaan ole pakollinen — lazy-poll riittää useimmille tapauksille.

## Datapolut Firestoressa

```
users/{uid}/integrations/google      ← OAuth-tokenit + kalenterimetatiedot
users/{uid}/integrations/microsoft   ← idem
users/{uid}/personalData/externalEvents  ← pollatut tapahtumat (window: -7..+28 päivää)
```

Olemassaolevat säännöt (`firestore.rules`) sallivat lukuoikeuden ja kirjoituksen omistajalle näille — ei tarvitse päivittää sääntöjä.

## Vianjäljitys

- **"Token exchange failed"**: client ID/secret väärin tai redirect URI ei täsmää
- **"unauthorized" 401**: Firebase ID-token vanhentunut → kirjaudu uudelleen
- **"Google refresh failed"**: refresh_token puuttuu → poista yhteys ja yhdistä uudelleen (varmista että `prompt=consent` ja `access_type=offline` toimivat)
- **Tapahtumat eivät näy**: tarkista että kalenterissa on `syncEnabled: true` ja paina "Päivitä nyt"
