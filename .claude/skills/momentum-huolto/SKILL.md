---
name: momentum-huolto
description: Momentumin huoltokierros. Kehityspäällikkö ajaa huoltajan, tietoturvatarkastajan ja saavutettavuustarkastajan, korjauttaa turvalliset viat omassa haarassa, kirjaa huoltolokin ja raportoi Momentumiin. Käytä kun pyydetään huoltoa, ylläpitoa, terveystarkistusta, "katso onko Momentum kunnossa", tai ajastetulla viikkohuollolla.
---

# Momentumin huoltokierros

Olet **kehityspäällikkö** (koordinaattori). Et tee tarkistuksia itse, vaan jaat ne aliagenteille, kokoat tulokset ja päätät mitä korjataan nyt.

Argumentti (valinnainen): `pika` = vain terveys + lint + tyypit, ei aliagentteja; `tietoturva` tai `saavutettavuus <moduuli>` = vain se osa.

## 0. Valmistelu

```bash
RUN_ID="dev-$(date +%Y%m%d-%H%M)-huolto"
git fetch origin main && git status --short
```

- Jos työpuu on likainen, älä jatka: kerro mitä on kesken.
- Luo haara `claude/huolto-$(date +%Y%m%d)` (tai käytä sessiolle annettua haaraa, jos sellainen on määrätty).
- `node agentit/bin/kirjaa.mjs aloita --id $RUN_ID --type huolto --summary "Huoltokierros alkoi"`
- Lue `agentit/HUOLTOLOKI.md`:n kaksi viimeisintä merkintää: mitä jäi auki viimeksi.

## 1. Tarkistukset rinnakkain

Käynnistä samassa viestissä (rinnakkain):

- **momentum-huoltaja**: koko työjärjestys. Saa korjata turvalliset asiat, ei committaa.
- **momentum-tietoturva**: täysi tarkistuslista.
- **momentum-saavutettavuus**: yksi moduuli, jota ei ole tarkistettu pisimpään aikaan (ks. huoltoloki). Kierrä: agentit, esitepankki, muistiinpanot, projects, tyonjako, viestit, dashboard, saavutettavuus, graafinen, logogeneraattori, palaute.

Jokaisen käynnistyksen yhteydessä: `node agentit/bin/kirjaa.mjs tapahtuma --id $RUN_ID --agent <huoltaja|tietoturva|saavutettavuus> --text "<mitä tekee>"`.

## 2. Päätä

Kokoa löydökset yhteen listaan vakavuuden mukaan. Jokaiselle yksi kolmesta:

| Päätös | Milloin |
|---|---|
| **Korjaa nyt** | Huoltaja jo korjasi, tai korjaus on pieni, paikallinen eikä muuta käytöstä (lint, tyyppi, synkka, patch-päivitys) |
| **Backlogiin** | Vaatii suunnittelua, muuttaa käytöstä tai on M/L-kokoinen. Lisää `agentit/BACKLOG.md`:hen tuoteomistajan muodossa. |
| **Päätös Antonille** | Major-päivitys, sääntömuutos, kustannus, tietoturvalöydös kriittinen/korkea |

Kriittinen tietoturvalöydös: älä kirjoita hyökkäyksen yksityiskohtia julkiseen PR:ään tai Momentumiin. Kirjaa "kriittinen tietoturvalöydös, ks. huoltoloki" ja kerro Antonille suoraan.

## 3. Korjaukset ja tarkastus

Jos korjauksia on:
1. Anna **momentum-tarkastaja**lle diff katselmoitavaksi.
2. Estävät ja tärkeät löydökset: korjauta huoltajalla, katselmoi uudelleen (enintään 2 kierrosta, sitten päätökseksi).
3. Commit: `Huolto: <mitä korjattiin>`. Push haaraan `git push -u origin <haara>`.
4. PR vain, jos ihminen on pyytänyt tai sessiolla on lupa avata PR:iä. Muuten kerro haaran nimi.

## 4. Kirjaa

Lisää `agentit/HUOLTOLOKI.md`:n alkuun merkintä:

```markdown
## <YYYY-MM-DD> <vihreä|keltainen|punainen>
- Ajettu: terveys, lint, tsc, build, functions, audit, tietoturva, saavutettavuus (<moduuli>)
- Korjattu: ...
- Backlogiin: B-<n> ...
- Päätökset: ...
- Seuraavalla kerralla: ...
```

Committaa loki samaan haaraan. Sitten:

```bash
node agentit/bin/kirjaa.mjs terveys
node agentit/bin/kirjaa.mjs valmis --id $RUN_ID --agents huoltaja,tietoturva,saavutettavuus,tarkastaja \
  --summary "<2–4 riviä>" --results korjaukset=<n>,loydokset=<n> --branch <haara> [--pr <url>] \
  [--decision "<kysymys>"]...
```

## 5. Raportoi ihmiselle

Enintään 10 riviä: tila (vihreä/keltainen/punainen), mitä korjattiin, mitä päätöksiä tarvitaan, haara tai PR. Ei listaa kaikesta mikä oli kunnossa.
