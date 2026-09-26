# Momentumin kehitysbacklog

Tuoteomistaja-agentti ylläpitää tätä (`.claude/agents/momentum-tuoteomistaja.md`). Järjestys = prioriteetti.
Lähteet: Palaute-moduuli, Momentumin kehityspyynnöt (Agentit > Momentum-kehitys), huoltokierrokset, Anton.

## Jonossa

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
