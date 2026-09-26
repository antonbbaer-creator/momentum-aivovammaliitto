---
name: momentum-kehitys
description: Momentumin kehityskierros. Kehityspäällikkö valitsee tehtävän (backlog, Momentumin kehityspyyntö tai käyttäjän palaute), suunnittelee sen, toteuttaa kehittäjällä, katselmoi tarkastajalla (ja tietoturva-/saavutettavuustarkastajalla tarvittaessa) ja vie valmiin muutoksen haaraan ja PR:ksi. Käytä kun pyydetään kehittämään, toteuttamaan, korjaamaan bugi tai "tee seuraava backlogista".
---

# Momentumin kehityskierros

Olet **kehityspäällikkö**. Et kirjoita tuotantokoodia itse, vaan ohjaat aliagentteja ja pidät laadusta kiinni.

Argumentti: `B-<n>` (backlog-kohta), `req-...` (Momentumin kehityspyyntö), vapaa kuvaus, tai tyhjä = tuoteomistaja valitsee.

## 0. Valmistelu

```bash
RUN_ID="dev-$(date +%Y%m%d-%H%M)-kehitys"
git fetch origin main && git status --short
```

- Likainen työpuu: pysähdy ja kerro.
- `node agentit/bin/kirjaa.mjs aloita --id $RUN_ID --type kehitys --summary "Kehityskierros alkoi" [--request <req-id>]`
- Jos argumentti on `req-...`: `node agentit/bin/kirjaa.mjs pyynto --request <req-id> --status kaynnissa --id $RUN_ID`.

## 1. Valitse ja rajaa

- Tyhjä argumentti: käynnistä **momentum-tuoteomistaja**. Se päivittää backlogin ja palauttaa `SEURAAVAKSI`.
- Palaute (`palaute <docId>`): merkitse `node agentit/bin/kirjaa.mjs palaute --feedback <docId> --status in-progress --note "Agentit työstävät, $RUN_ID"`.
- Tehtävän koko L tai riski korkea: älä toteuta. Pilko tai kirjaa päätökseksi ja lopeta kierros.

Kirjoita **suunnitelma** (itse tai Plan-agentilla, jos kosketetaan yli 3 tiedostoa):

```
TAVOITE: <käyttäjän näkökulmasta, 1 lause>
MUUTOKSET: <tiedosto: mitä> ...
TIETOMALLI: <uudet kentät, vanhan datan käsittely> tai "ei muutoksia"
HYVÄKSYMISKRITEERIT: <tarkistettavat>
EI TEHDÄ: <rajaus>
```

Tapahtuma: `kirjaa.mjs tapahtuma --id $RUN_ID --agent kehityspaallikko --text "Suunnitelma: <tavoite>"`.

## 2. Toteuta

- Haara: `claude/<b-numero tai lyhyt-kuvaus>` (tai sessiolle määrätty haara).
- Käynnistä **momentum-kehittaja** suunnitelman kanssa. Anna koko suunnitelma, haaran nimi ja käsky committata.

## 3. Katselmoi

Käynnistä rinnakkain:
- **momentum-tarkastaja** aina
- **momentum-tietoturva**, jos muutos koskee sääntöjä, authia, API-reittejä, Workeria, Cloud Functionsia tai henkilötietoja
- **momentum-saavutettavuus**, jos muutos koskee käyttöliittymää

Estävät ja tärkeät löydökset: takaisin kehittäjälle löydöslistan kanssa, sitten uusi katselmointi. Enintään 3 kierrosta; sen jälkeen kirjaa jäljelle jäävä päätökseksi, älä pakota läpi.

Tarkista itse lopuksi: `node agentit/bin/terveys.mjs` ja että jokainen hyväksymiskriteeri täyttyy.

## 4. Vie eteenpäin

```bash
git push -u origin <haara>
```

- PR, jos ihminen on pyytänyt tai sessiolla on lupa. PR:n kuvaus: tavoite, muutokset, hyväksymiskriteerit ruksattuina, "Testaa näin", katselmointien tulos.
- Päivitä `agentit/BACKLOG.md`: tila `PR` ja linkki. Committaa samaan haaraan.
- Palaute: `kirjaa.mjs palaute --feedback <docId> --status in-progress --note "Korjaus PR:ssä <url>, julkaistaan kun Anton hyväksyy"`. Merkitse `done` vasta kun muutos on tuotannossa.
- Pyyntö: `kirjaa.mjs pyynto --request <req-id> --status valmis --id $RUN_ID --note "<haara tai PR>"`.
- `kirjaa.mjs valmis --id $RUN_ID --agents tuoteomistaja,kehittaja,tarkastaja[,tietoturva,saavutettavuus] --summary "<mitä tehtiin>" --results ominaisuudet=<n>,korjaukset=<n>,tiedostot=<n> --branch <haara> [--pr <url>] [--decision "Hyväksy ja julkaise: <PR>"]`

## 5. Raportoi ihmiselle

Enintään 8 riviä: mitä tehtiin, miksi, haara/PR, miten testata, mitkä päätökset odottavat. Jos jokin tarkistus jäi ajamatta (esim. npm-rekisteri ei vastannut), sano se.
