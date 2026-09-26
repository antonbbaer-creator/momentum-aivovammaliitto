# Huoltoloki

Uusin ensin. Kehityspäällikkö kirjaa jokaisen `/momentum-huolto`-kierroksen tänne.

## 2026-09-26 vihreä (korjauskierros)
- Ajettu CI:ssä (commit 1aa59ce): terveys ✓, tsc ✓, lint ✓ (0 virhettä, 160 varoitusta), functions-build ✓, worker ✓, Firestore-sääntötestit 4/4 ✓.
- Korjattu: B-1 palautteiden org-raja (firestore.rules ja emulaattoritestit), B-2 Node 22, B-3 lint 318 → 0 (viisi kehittäjäagenttia rinnakkain), functions/lib pois gitistä. Lint on nyt CI:ssä estävä.
- Tarkoitukselliset lint-ohitukset (perusteltu rivillä): TaskNetworkGraph d3-noodien mutaatio (2), MeetingsSection ja debug-modules purity klikkauskäsittelijässä, use-integrations ja drive set-state-in-effect.
- Päätökset: `firebase deploy --only firestore:rules,functions` (Anton). B-4 isot tiedostot jätetty omaksi vaiheekseen.
- Seuraavalla kerralla: käy läpi 160 lint-varoitusta (käyttämättömät muuttujat, `<img>`). Saavutettavuus aloitetaan moduulista `agentit`.

## 2026-09-26 keltainen (alkutarkistus, agenttisysteemin käyttöönotto)
- Ajettu: terveys.mjs paikallisesti; CI:ssä tsc ✓, functions-build ✓, worker-syntaksi ✓, lint ✗ (318 virhettä, 162 varoitusta, kaikki vanhassa koodissa; ks. B-3). Paikallisesti npm-rekisteri ei ollut käytettävissä.
- Kunnossa: super-admin-lista sama kolmessa paikassa, kaikilla 31 moduulilla sivu, kaikki funktiot exportattu, ei salaisuuksia repossa, ei avoimia kirjoitussääntöjä.
- Backlogiin: B-1 palautteiden list-sääntö (tietoturva), B-2 Node 22, B-3 CI, B-4 isot komponentit.
- Päätökset: B-1 sääntömuutoksen hyväksyntä; `momentumDevAgents`-funktion deploy.
- Seuraavalla kerralla: saavutettavuus aloitetaan moduulista `agentit`. Aja lint ja tsc, kun riippuvuudet saadaan asennettua.
