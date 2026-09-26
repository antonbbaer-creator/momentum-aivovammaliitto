# Momentumin kehitysbacklog

Tuoteomistaja-agentti ylläpitää tätä (`.claude/agents/momentum-tuoteomistaja.md`). Järjestys = prioriteetti.
Lähteet: Palaute-moduuli, Momentumin kehityspyynnöt (Agentit > Momentum-kehitys), huoltokierrokset, Anton.

## Jonossa

### B-5 Koko sovelluksen kontrasti ja välilehtien kosketusalue
- Lähde: saavutettavuuskatselmointi 2026-09-26 (Aivot)
- Koko: S · Riski: matala (visuaalinen muutos kaikkiin moduuleihin) · Tila: odottaa (Antonin hyväksyntä ulkoasulle)
- Miksi: Vaalean teeman `--t3`/`--ink3` (#6E6960) `--card2`-taustalla on 4.28:1, alle WCAG 1.4.3:n 4.5:1. `.cal-view-btn` (TabSwitcher) on alle 44 px korkea, mikä haittaa AVL:n käyttäjiä, joilla on motorisia haasteita. Aivoissa kierretty paikallisesti.
- Hyväksymiskriteerit:
  - [ ] `--ink3` vaaleassa teemassa esim. #5B564C (n. 5:1)
  - [ ] `.cal-view-btn` min-height 44px ja display inline-flex
  - [ ] Tarkistettu silmämääräisesti dashboard, Agentit ja Ehdotukset

### B-6 Storage: ääniteiden lataus vain muokkaajille, koko- ja tyyppiraja
- Lähde: Aivot-katselmointi 2026-09-26
- Koko: S · Riski: keskitaso (sääntömuutos) · Tila: odottaa
- Miksi: `storage.rules` sallii kaikille orgin jäsenille (myös visitor) kirjoituksen polkuun `organizations/{orgId}/**` ilman koko- tai tyyppirajaa. Aivojen äänitteet (`brain-audio/`) kannattaa rajata: vain owner/admin/member, alle 25 Mt, `audio/*`, ei lukua selaimesta.
- Hyväksymiskriteerit:
  - [ ] Storage-emulaattoritesti rules-testeihin
  - [ ] Lukija ei voi ladata, yli 25 Mt ja muu kuin audio hylätään

### B-4 EditorSection.tsx:n pilkkominen (3 400 riviä)
- Lähde: huolto 2026-09-26 (terveys `big-files`)
- Koko: L (pilko ennen valintaa) · Riski: keskitaso · Tila: odottaa
- Miksi: Iso tiedosto hidastaa jokaista muutosta ja lisää regressioriskiä. Pilkotaan osiin samalla tavalla kuin `components/sections/editor/`. Samaa harkitaan `PersonalWeekSection.tsx` (2 800) ja `muistiinpanot/page.tsx` (2 200).
- Hyväksymiskriteerit:
  - [ ] Tuoteomistaja pilkkoo S/M-kokoisiksi kohdiksi

## Valmiit

- B-1 Palautteiden listaus vuoti org-rajan yli: sääntö korjattu, emulaattoritestit CI:ssä (2026-09-26, voimaan komennolla `firebase deploy --only firestore:rules`)
- B-2 Cloud Functions Node 22 (2026-09-26, voimaan komennolla `firebase deploy --only functions`)
- B-3 Lint 318 virhettä → 0, lint estävänä CI:ssä (2026-09-26). 160 varoitusta jäljellä (käyttämättömät muuttujat, `<img>`), ei estäviä.
<!-- - B-x otsikko (PR-linkki, YYYY-MM-DD) -->
