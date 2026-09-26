# Huoltoloki

Uusin ensin. Kehityspäällikkö kirjaa jokaisen `/momentum-huolto`-kierroksen tänne.

## 2026-09-26 keltainen (alkutarkistus, agenttisysteemin käyttöönotto)
- Ajettu: terveys.mjs paikallisesti; CI:ssä tsc ✓, functions-build ✓, worker-syntaksi ✓, lint ✗ (318 virhettä, 162 varoitusta, kaikki vanhassa koodissa; ks. B-3). Paikallisesti npm-rekisteri ei ollut käytettävissä.
- Kunnossa: super-admin-lista sama kolmessa paikassa, kaikilla 31 moduulilla sivu, kaikki funktiot exportattu, ei salaisuuksia repossa, ei avoimia kirjoitussääntöjä.
- Backlogiin: B-1 palautteiden list-sääntö (tietoturva), B-2 Node 22, B-3 CI, B-4 isot komponentit.
- Päätökset: B-1 sääntömuutoksen hyväksyntä; `momentumDevAgents`-funktion deploy.
- Seuraavalla kerralla: saavutettavuus aloitetaan moduulista `agentit`. Aja lint ja tsc, kun riippuvuudet saadaan asennettua.
