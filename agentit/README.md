# Momentumin ylläpito- ja kehitysagentit

Agenttitiimi, joka pitää Hetki Momentumin kunnossa ja kehittää sitä käyttäjien palautteen pohjalta.
Sama malli kuin Hetkin myyntiagenteilla: agentit tekevät työn ja ehdottavat, Anton päättää ja julkaisee.

```
                Anton (Momentum: Agentit > Momentum-kehitys, puhelin, terminaali)
                  │ pyynnöt, painotus, päätökset          ▲ ajot, terveys, päätökset, PR:t
                  ▼                                        │
        ┌──────────────── Kehityspäällikkö ────────────────┐   pääsessio, skillit:
        │  /momentum-huolto  /momentum-kehitys  /momentum-jono │
        └──┬──────────┬───────────┬───────────┬─────────┬──┘
           │          │           │           │         │
      huoltaja   tietoturva   kehittäjä   tarkastaja  saavutettavuus    tuoteomistaja
      (sonnet)    (opus)       (opus)       (opus)       (sonnet)          (opus)
      korjaa      lukee        koodaa       lukee        lukee             BACKLOG.md
      ylläpidon   raportoi     committaa    raportoi     raportoi          palautteet
```

| Agentti | Tiedosto | Tekee | Ei tee |
|---|---|---|---|
| Kehityspäällikkö | pääsessio + skillit | Jakaa työn, päättää korjataanko nyt, kirjaa, raportoi | Ei kirjoita tuotantokoodia itse |
| Huoltaja | `.claude/agents/momentum-huoltaja.md` | Terveys, lint, tyypit, buildit, riippuvuudet, turvalliset korjaukset | Ei major-päivityksiä, ei käytösmuutoksia |
| Tietoturva | `momentum-tietoturva.md` | Säännöt, auth, Worker, Functions, salaisuudet, org-rajat | Ei muokkaa, ei julkaise hyökkäysten yksityiskohtia |
| Kehittäjä | `momentum-kehittaja.md` | Toteuttaa rajatun tehtävän konventioilla, committaa | Ei arvaa epäselvää, ei uusia riippuvuuksia |
| Tarkastaja | `momentum-tarkastaja.md` | Katselmoi diffin, ajaa tarkistukset itse | Ei muokkaa, ei raportoi tyylimakua bugeina |
| Saavutettavuus | `momentum-saavutettavuus.md` | WCAG 2.1 AA, selkokieli, mobiili | Ei muokkaa |
| Tuoteomistaja | `momentum-tuoteomistaja.md` | Palautteet ja pyynnöt → priorisoitu `BACKLOG.md` | Ei koske koodiin |

## Kierrokset

| Komento | Milloin | Kesto |
|---|---|---|
| `/momentum-huolto` | Viikoittain, ennen isoa julkaisua, kun CI on punainen | 15–30 min |
| `/momentum-huolto pika` | Nopea tila: terveys, lint, tyypit | 2–5 min |
| `/momentum-kehitys` | Tuoteomistaja valitsee seuraavan backlogista | 20–60 min |
| `/momentum-kehitys B-3` / `req-…` / vapaa teksti | Tietty tehtävä | 20–60 min |
| `/momentum-jono` | Ajastettuna: käsittelee Momentumista jätetyt pyynnöt | 1 min – 60 min |

Ajopaikka on vapaa: Mac mini (kuten myyntiagentit), Claude Code -pilvisessio tai oma kone.
Ajastus esim. `/loop 1h /momentum-jono` tai Claude Coden Routine, joka ajaa `/momentum-huolto` maanantaisin.

## Suojaukset

`.claude/hooks/suojaa.mjs` (PreToolUse, `.claude/settings.json`) estää kaikilta sessioilta tässä repossa:
`firebase deploy`, `wrangler deploy`, `netlify deploy`, tuotantodatan poistot ja backfillin, pushin `main`-haaraan,
force-pushin, `.env`-tiedostojen lukemisen ja muokkaamisen. Julkaisu on aina Antonin käsissä.

## Momentum-yhteys

Agentit raportoivat Momentumiin Cloud Functionin `momentumDevAgents` kautta (`firebase/functions/src/devAgents.ts`):

| Skripti | Mitä |
|---|---|
| `agentit/bin/terveys.mjs [--json]` | Nopeat rakennetarkistukset ilman riippuvuuksia (myös CI:ssä) |
| `agentit/bin/kirjaa.mjs aloita\|tapahtuma\|valmis\|virhe\|paatos\|terveys\|pyynto\|palaute` | Ajot, tapahtumavirta, terveysraportti, pyyntöjen ja palautteiden tila |
| `agentit/bin/pyynnot.mjs [--json]` | Jonossa olevat pyynnöt, painotus ja avoimet palautteet |

Firestore (`organizations/hetki-company/data/`): `momentumDevRuns`, `momentumDevRequests`, `momentumDevFocus`, `momentumDevHealth`.
Palautteet luetaan ja päivitetään suoraan `momentumFeedback`-kokoelmaan (vain tila ja `agentNote`).

Ilman `AGENT_LOG_TOKEN`-ympäristömuuttujaa skriptit ohittavat kirjauksen hiljaa, joten kierrokset toimivat myös offline.

### Käyttöönotto (kerran, Anton)

1. `cd firebase/functions && npm run build && firebase deploy --only functions:momentumDevAgents`
   (käyttää samaa `AGENT_LOG_TOKEN`ia kuin `logAgentRun`, arvo `firebase/functions/.env`).
2. Aseta samalle koneelle, jossa agentit ajetaan: `export AGENT_LOG_TOKEN=<sama arvo>` (esim. `~/.zshrc`).
   Claude Code -pilvessä: ympäristön salaisuudeksi.
3. Momentumissa: Hetki Company > Agentit > välilehti **Momentum-kehitys**.
4. Testaa: `node agentit/bin/kirjaa.mjs terveys` → Terveys-kortti päivittyy.

## Tiedostot

- `BACKLOG.md`: priorisoitu kehityslista (tuoteomistaja ylläpitää)
- `HUOLTOLOKI.md`: huoltokierrosten loki, uusin ensin
