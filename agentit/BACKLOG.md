# Momentumin kehitysbacklog

Tuoteomistaja-agentti ylläpitää tätä (`.claude/agents/momentum-tuoteomistaja.md`). Järjestys = prioriteetti.
Lähteet: Palaute-moduuli, Momentumin kehityspyynnöt (Agentit > Momentum-kehitys), huoltokierrokset, Anton.

## Jonossa

### B-1 Palautteiden listaus vuotaa org-rajan yli
- Lähde: huolto 2026-09-26 (alkutarkistus), `firestore.rules` rivi ~168
- Koko: S · Riski: korkea (sääntömuutos) · Tila: odottaa (Antonin hyväksyntä)
- Miksi: `momentumFeedback`-kokoelman `list`-sääntö sallii kenelle tahansa kirjautuneelle kyselyn `limit <= 200` ilman orgId-ehtoa. Kommentti olettaa, että client suodattaa orgId:llä, mutta sääntö ei pakota sitä: kuka tahansa kirjautunut voi listata 200 palautetta kaikista orgeista sähköposteineen. Lisäksi Palaute-sivun oma kysely (`where orgId ==`, ei `limit`iä) ei täytä `limit`-ehtoa, joten sivu toimii todennäköisesti vain super-admineille.
- Ehdotus: `allow list: if isSuperAdmin() || (request.auth != null && isOrgMember(resource.data.orgId));` ja kysely `where('orgId','==',activeOrg)` pysyy ennallaan. Tietoturvatarkastaja vahvistaa ennen toteutusta; testaa emulaattorissa jäsenellä ja ei-jäsenellä.
- Hyväksymiskriteerit:
  - [ ] Ei-jäsen ei saa listattua toisen orgin palautteita (emulaattoritesti)
  - [ ] Orgin jäsen näkee oman orginsa palautteet Palaute-sivulla
  - [ ] Super-admin näkee kaikki

### B-2 Cloud Functions Node 20 → 22
- Lähde: huolto 2026-09-26 (terveys `functions-node`)
- Koko: S · Riski: keskitaso · Tila: odottaa
- Miksi: Node 20:n tuki on päättynyt, ja Cloud Functions poistaa nodejs20-ajoympäristön käytöstä. Ilmoitukset, tehtävämirrorit ja agenttien kirjaus lakkaavat toimimasta, jos deploy estyy.
- Hyväksymiskriteerit:
  - [ ] `firebase.json` runtime `nodejs22`, `package.json` `engines.node` `"22"`
  - [ ] `npm run build` ja emulaattori käynnistyvät
  - [ ] Anton deployaa ja tarkistaa lokit (`npm run logs`)

### B-3 CI vihreäksi ja pakolliseksi
- Lähde: agenttisysteemin käyttöönotto
- Koko: S · Riski: matala · Tila: odottaa
- Miksi: `.github/workflows/momentum-ci.yml` ajaa terveyden, lintin, tyypit ja functions-buildin. Ensimmäinen ajo näyttää, onko lint- tai tyyppivelkaa. Kun CI on vihreä, se kannattaa asettaa pakolliseksi `main`-haaran suojaukseen.
- Hyväksymiskriteerit:
  - [ ] CI vihreä `main`-haarassa
  - [ ] Lint-askel ei ole enää `continue-on-error`

### B-4 EditorSection.tsx:n pilkkominen (3 400 riviä)
- Lähde: huolto 2026-09-26 (terveys `big-files`)
- Koko: L (pilko ennen valintaa) · Riski: keskitaso · Tila: odottaa
- Miksi: Iso tiedosto hidastaa jokaista muutosta ja lisää regressioriskiä. Pilkotaan osiin samalla tavalla kuin `components/sections/editor/`. Samaa harkitaan `PersonalWeekSection.tsx` (2 800) ja `muistiinpanot/page.tsx` (2 200).
- Hyväksymiskriteerit:
  - [ ] Tuoteomistaja pilkkoo S/M-kokoisiksi kohdiksi

## Valmiit

<!-- - B-x otsikko (PR-linkki, YYYY-MM-DD) -->
