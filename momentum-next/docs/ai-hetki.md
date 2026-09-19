# AI-Hetki — agenttistudio Momentumissa

AI-Hetki on oma työtila (`/ai-hetki`), jossa Mac Minillä pyörivä elokuvastudio-agentti
(`Code/elokuvastudio`) näkyy tuotantoyhtiönä: kuusi Claude-agenttia (tuottaja,
kehityspäällikkö, käsikirjoittaja, dramaturgi, ohjaaja, lukija) kehittävät ja
kirjoittavat käsikirjoituksia, ja Anton kommentoi projekteja väliin.

## Moduulit

- **Studio** (`/ai-hetki/studio`) — `AiHetkiStudioSection`: studion tila (heartbeat),
  ohjaus (tauko, lähtökohdat), projektit. Projektisivu `/ai-hetki/studio/[projektiId]` —
  `AiHetkiProjektiSection`: askeleet, agenttien ketju, kommentointi.
- **Käsikirjoitus** — studio vie luonnokset `screenplay_doc_sp_ai_{uid}` + versiot.
- **Tiimi** — agentit tiiminjäseninä (`lib/ai-hetki-defaults.ts`).

## Tietomalli

`lib/aihetki-shared.ts`. Firestore-avaimet (`organizations/ai-hetki/data/*`):

| Avain | Kirjoittaja | Sisältö |
|---|---|---|
| `aihetki_studio` | studio | `AiStudioTila` — heartbeat, kuka työskentelee, kustannukset, muisti |
| `aihetki_projektit` | studio | `AiProjektiMeta[]` — indeksi |
| `aihetki_projekti_{uid}` | studio | `AiProjekti` — meta, viestit (agenttien puheenvuorot), käsitellyt kommentit |
| `aihetki_kommentit_{uid}` | Momentum | `AiKommentti[]` — Antonin kommentit |
| `aihetki_ohjaus` | Momentum | `AiOhjaus` — tauko, siemenet (lähtökohdat) |

Kirjoittajat on erotettu avaimittain, jotta selain ja Mac Mini eivät kirjoita samaa
dokumenttia päällekkäin. Poikkeus: `screenplays`-indeksi, johon studio tekee
lue–yhdistä–kirjoita-päivityksen luonnoksen valmistuessa (harvoin).

## Kommenttien kierto

1. Anton kirjoittaa kommentin projektisivulla → `aihetki_kommentit_{uid}`.
2. Studio lukee ennen jokaista askelta uudet kommentit (id ei ole `kasitellytKommentit`-listassa)
   ja liittää ne jokaisen agentin tehtävänantoon otsikolla "Studion omistajan kommentit".
3. Askeleen jälkeen studio julkaisee projektin uudelleen, ja kommentti saa merkinnän
   "agentit huomioineet".

## Studion tunnukset

Studio kirjautuu joko `FIREBASE_ADMIN_KEY`-service accountilla (sama kuin skripteissä)
tai Momentum-käyttäjänä (`MOMENTUM_EMAIL`/`MOMENTUM_PASSWORD`, Firebase email/password).
Jos käytetään käyttäjätunnusta, sen pitää olla `ai-hetki`-työtilan jäsen (super-adminit
provisioidaan automaattisesti, ks. `lib/auth.tsx`).
