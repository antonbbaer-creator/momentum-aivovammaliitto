# Hetki Momentum

Hetki Companyn työtila-alusta organisaatioille (AVL, Hetki Company, juhlatoimikunnat, EnlightenedBits ym.).
Tuotanto: https://hetkimomentum.com (Netlify). Firebase-projekti `momentum-69262`.

## Kartta

| Polku | Mitä |
|---|---|
| `momentum-next/` | Varsinainen sovellus: Next.js 16 + React 19 + Firebase. **Lue `momentum-next/AGENTS.md`**: Next 16 poikkeaa koulutusdatasta, katso `node_modules/next/dist/docs/` ennen Next-API:n käyttöä. |
| `momentum-next/app/[orgSlug]/<moduuli>/page.tsx` | Moduulien sivut. Sivu = `AppShell` + `components/sections/<X>Section.tsx`. |
| `momentum-next/lib/modules.ts` | Moduulirekisteri, sivupalkin järjestys ja orgikohtaiset oletusmoduulit. |
| `momentum-next/lib/*-shared.ts` | Moduulin tietomalli, oletukset ja puhtaat apurit. |
| `momentum-next/lib/firestore.ts` | `useOrgData(key, default)`: orgin data `organizations/{orgId}/data/{key}` muodossa `{ v: JSON, ts, updatedBy }`. |
| `firebase/functions/src/` | Cloud Functions (europe-west1, Node 22). `lib/` on käännetty tulos, ei gitissä: `npm run build` ja deployn predeploy tuottavat sen. |
| `momentum-worker/` | Cloudflare Worker: Meta OAuth, R2-media, Claude-proxy. |
| `firestore.rules`, `storage.rules` | Tietoturvasäännöt. |
| `momentum-aivovammaliitto.html`, `arkisto/` | Vanha yksitiedostoinen versio. Älä kehitä, älä poista. |
| `agentit/` | Momentumin ylläpito- ja kehitysagenttien työtila (backlog, huoltoloki, skriptit). |
| `.claude/agents/momentum-*.md` | Kehitysagentit. `.claude/skills/momentum-*` ohjaavat kierroksia. |

## Konventiot

- Kieli: käyttöliittymä, kommentit ja commit-viestit suomeksi. Commit-muoto `Moduuli: mitä muuttui` (ks. `git log`).
- Oletusarvot moduulitasolla vakioina (`EMPTY_X`, `DEFAULT_X`), ei uusia objekteja renderissä: `useOrgData` vertaa viitteitä.
- Tyylit: inline-tyylit ja CSS-muuttujat (`--card`, `--border`, `--t1..t3`, `--hetki-blue|green|yellow|pink|black`, `--r`, `--rl`), luokat `btn`, `input`, `sec-h`. Ei uusia UI-kirjastoja.
- Oikeudet: `useAuth().canEdit` ennen kirjoitusnappeja. Firestore-säännöt ovat viimeinen puolustuslinja.
- **Super-admin-lista on kolmessa paikassa**: `firestore.rules`, `momentum-next/lib/super-admins.ts`, `momentum-worker/src/index.js`. Muuta kaikki kolme kerralla.
- Uusi moduuli: `MODULE_REGISTRY` + `MODULE_ORDER` + sivu `app/[orgSlug]/<path>/page.tsx` + orgin oletusmoduulit.
- Uusi Cloud Function: export `src/index.ts`:ssä, region `europe-west1`, token-otsake `x-agent-token` jos kutsuja on agentti.
- Saavutettavuus: WCAG 2.1 AA. AVL:n käyttäjissä on aivovammaisia: selkeä kieli, isot osuma-alueet, ei pelkkää väriä merkityksenä.

## Tarkistukset ennen committia

```bash
node agentit/bin/terveys.mjs                     # nopeat rakennetarkistukset, ei riippuvuuksia
node --test 'momentum-next/lib/*.test.mjs'          # aivojen ydinlogiikka ja markdown, ei riippuvuuksia
cd momentum-next && npm run lint && npx tsc --noEmit
cd firebase/functions && npm run build
cd firebase/rules-tests && npm install && npm test   # Firestore-säännöt emulaattorissa (vaatii Javan)
```

## Mitä agentit eivät tee

Eivät deployaa (`firebase deploy`, `wrangler deploy`, Netlify), eivät pushaa `main`-haaraan, eivät force-pushaa,
eivät koske `.env`-tiedostoihin eivätkä tuotantodataan. `.claude/hooks/suojaa.mjs` estää nämä teknisesti.
Julkaisu on aina ihmisen päätös: agentti avaa PR:n ja kirjaa päätöksen Momentumiin.
