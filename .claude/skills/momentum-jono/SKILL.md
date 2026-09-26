---
name: momentum-jono
description: Käsittelee Momentumin kehitysagenttien jonon. Hakee Agentit > Momentum-kehitys -sivulta jätetyt pyynnöt ja avoimet palautteet ja käynnistää niille oikean kierroksen (momentum-huolto tai momentum-kehitys). Käytä ajastetussa ajossa (/loop, Routine, Mac minin vahti) tai kun pyydetään "katso onko Momentumissa pyyntöjä".
---

# Momentumin kehitysjono

1. `node agentit/bin/pyynnot.mjs --json`
   - `offline: true` (ei tokenia): kerro se ja käytä `agentit/BACKLOG.md`:tä. Älä keksi pyyntöjä.
2. Jos `running` ei ole tyhjä ja ajo on alkanut alle 2 tuntia sitten: toinen sessio työskentelee. Lopeta, älä aloita rinnakkaista.
   Yli 2 tuntia vanha `kaynnissa`: merkitse `kirjaa.mjs pyynto --request <id> --status virhe --note "Aikakatkaisu, ajo ei raportoinut 2 h"` ja jatka.
3. Käsittele **yksi** pyyntö kerrallaan, vanhin ensin (`pending[0]`):

   | `type` | Toiminto |
   |---|---|
   | `huolto` | `/momentum-huolto` (ohjeteksti argumenttina) |
   | `katselmointi` | momentum-tarkastaja + tarvittaessa tietoturva annetulle haaralle tai PR:lle, raportti pyynnön noteen |
   | `kehitys`, `korjaus`, `muu` | `/momentum-kehitys <req-id>`; pyynnön `instructions` on tehtävän kuvaus |

   `focus.kulma` on pysyvä painotus: välitä se kaikille aliagenteille.
4. Jos jonossa ei ole pyyntöjä: katso `feedback`. Uusi `bug`-tyyppinen palaute, joka on alle 7 päivää vanha ja jota ei ole backlogissa: käynnistä **momentum-tuoteomistaja** lisäämään se backlogiin. Älä toteuta palautteita ilman pyyntöä tai backlog-valintaa.
5. Lopuksi yksi rivi: mitä käsiteltiin, tai "jono tyhjä".
