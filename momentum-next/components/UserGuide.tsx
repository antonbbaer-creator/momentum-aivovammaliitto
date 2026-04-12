'use client';

import { useEffect, useState, useCallback, useMemo, type ReactNode } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useModules } from '@/lib/modules';

const STORAGE_KEY = 'momentum:userguide-seen-v1';

interface Step {
  title: string;
  subtitle: string;
  body: ReactNode;
  path?: string; // Moduulin reitti — navigoidaan tälle sivulle askelta vaihdettaessa
  moduleId?: string; // Jos määritelty, askel näytetään vain kun moduuli on päällä
}

function buildSteps(orgSlug: string): Step[] {
  const isLlff = orgSlug === 'llff';
  const isAvl = orgSlug === 'avl';
  const isJtk = orgSlug === 'juhlatoimikunta';
  const orgLabel = isLlff ? 'Lapinlahden Lyhytelokuvajuhlien' : isAvl ? 'Aivovammaliiton' : isJtk ? 'Juhlatoimikunnan' : 'organisaatiosi';
  const orgShort = isLlff ? 'LLFF' : isAvl ? 'AVL' : isJtk ? 'Juhlatoimikunta' : 'organisaatio';
  const orgGen = isLlff ? 'LLFF:n' : isAvl ? 'Aivovammaliiton' : isJtk ? 'Juhlatoimikunnan' : 'organisaation';

  return [
    {
      title: 'Tervetuloa Momentumiin',
      subtitle: isLlff
        ? 'Lapinlahden Lyhytelokuvajuhlien työkalu'
        : isAvl
        ? 'Aivovammaliiton viestinnan strateginen kumppani'
        : isJtk
        ? 'Juhlatoimikunta — Sirpan 70v juhlien järjestely'
        : 'Projektinhallinta ja viestintä samassa näkymässä',
      body: isJtk ? (
        <>
          <p>
            Momentum on Juhlatoimikunnan työkalu Sirpan 70-vuotis­syntymäpäiväjuhlien
            järjestämiseen. Kaikki juhlien suunnittelu — vieraslista, ruokatarjoilut,
            tehtävät, tilan valmistelu, ohjelma ja aikataulu — löytyy samasta paikasta.
          </p>
          <p>
            Juhlat järjestetään <strong>la 25.4.2026 klo 15–24</strong> Tyttöjen
            talolla Kalliossa (Hämeentie 13 A). Valmistelu alkaa klo 10.
          </p>
          <p className="ug-hint">
            Tämä pikaopas esittelee jokaisen työkalun. Nuolinäppäimet
            liikkuvat askelten välillä, Esc sulkee. Opas löytyy aina
            vasemman reunan Käyttöohje-napista.
          </p>
        </>
      ) : (
        <>
          <p>
            Momentum on {orgLabel} projektinhallinnan ja viestinnän työkalu.
            Samassa näkymässä asuvat strategia, tiimi, sisäinen chat,
            aikataulut, viestintä, ohjelmisto ja apurahat — kaikki
            kytköksissä toisiinsa.
          </p>
          <p>
            Tämä pikaopas vie sinut moduulien läpi. Jokainen askel avaa
            vastaavan sivun taustalle, jotta näet mistä puhutaan.
          </p>
          <p className="ug-hint">
            Näppäimet: nuoli oikealle/vasemmalle liikkuu askelten välillä,
            Esc sulkee. Opas löytyy aina uudelleen vasemman reunan
            Käyttöohje-napista.
          </p>
        </>
      ),
    },
    {
      title: 'Koti',
      subtitle: isJtk ? 'Juhlatoimikunnan kokonaiskuva' : 'Päivän tärkein työlista',
      path: '/dashboard',
      moduleId: 'dashboard',
      body: isJtk ? (
        <>
          <p>
            Koti on Juhlatoimikunnan päänäkymä. Näet tilanteen
            yhdellä silmäyksellä: montako päivää juhliin, avoimet
            tehtävät ja sinulle osoitetut vastuut.
          </p>
          <p>
            Alareunan <strong>Tilannekatsaus</strong> pyytää tekoälyltä
            yhteenvedon järjestelyjen tilanteesta. <strong>Inspiraatio</strong>
            -nappi antaa konkreettisia ideoita juhlien järjestämiseen —
            ohjelmaideoita, koristelu­vinkkejä ja käytännön niksejä.
          </p>
        </>
      ) : (
        <>
          <p>
            Koti kokoaa sen, mikä koskee juuri sinua. Et näe koko
            {orgShort === 'LLFF' ? ' LLFF:n' : ' organisaation'} työtä
            vaan omat vastuusi — päivän tärkeimmät tekemiset yhdessä
            listassa.
          </p>
          <p>
            <strong>Sinun tehtäväsi</strong> yhdistää projektitehtävät ja
            apurahahaut samaan listaan deadlinen mukaan. Voit merkitä
            tehtävän tehdyksi suoraan rastilla tai palauttaa sen
            aktiiviseksi. <strong>Sinun projektisi</strong> näyttää
            projektit, joissa sinulle on avoimia tehtäviä.
          </p>
          <p>
            Näkymä varoittaa, jos tiimissäsi on tehtäviä ilman tekijää tai
            sinulle on tullut pyyntöjä tiimiläisiltä. Alareunan
            <strong> Tilannekatsaus</strong> ja <strong>Inspiraatiota</strong>
            -napit kysyvät Momentum AI:lta joko raportin viestinnän
            tilanteesta tai idean esimerkeistä muualta.
          </p>
        </>
      ),
    },
    {
      title: 'Strategia',
      subtitle: 'Pitkän tähtäimen pohja',
      path: '/strategy',
      moduleId: 'strategy',
      body: (
        <>
          <p>
            Strategia-sivu kokoaa {orgGen}
            {' '}strategisen perustan. Näet kauden tavoitteet,
            viestinnän mission, sisältöpilarit, kohderyhmät, sävyt, arvot
            ja ydinviestit — eli sen pohjan, jolle kaikki viestintä
            rakennetaan.
          </p>
          <p>
            Sivulta löytyvät myös <strong>viestintäsuunnitelma</strong>,
            <strong> kanavat ja vastuut</strong>, <strong>tavoitteet ja
            mittarit</strong> sekä <strong>vuosittaiset kampanjat</strong>.
            Ajankohtaista-osio kokoaa kauden painopisteet.
          </p>
          <p className="ug-hint">
            Sivun lopussa on <strong>Kouluta Momentum tuntemaan strategiasi</strong>
            — kun päivität strategiaa, Momentum AI osaa vastata
            kysymyksiin sen pohjalta.
          </p>
        </>
      ),
    },
    {
      title: 'Tiimi',
      subtitle: isJtk ? 'Juhlatoimikunnan jäsenet ja vastuut' : 'Jäsenet, roolit ja tiimikohtaiset projektit',
      path: '/team',
      moduleId: 'team',
      body: isJtk ? (
        <>
          <p>
            Tiimi-sivu näyttää Juhlatoimikunnan jäsenet: Sonja, Raisa,
            Elina ja Anton. Näet kunkin roolin, vastuualueet ja
            yhteystiedot.
          </p>
          <p>
            Voit lisätä uusia tiimejä ja jäseniä tarpeen mukaan — esimerkiksi
            jos joku muu haluaa auttaa juhlapäivänä. Tiimiläiset
            näkyvät myös tehtävien ja ruokahankintojen vastuuhenkilö­valinnoissa.
          </p>
        </>
      ) : (
        <>
          <p>
            Tiimi-sivu kokoaa ihmiset ja heidän vastuunsa. Näet tiimit,
            jäsenet, roolit, yhteystiedot ja tiimikohtaiset projektit
            yhdestä paikasta.
          </p>
          <p>
            Kun tiimiläinen on merkitty tehtävän tai apurahan
            vastuuhenkilöksi, sama kortti linkittyy häneen muissakin
            moduuleissa — Kodissa, viestintäsuunnitelmassa ja apurahojen
            aikataulussa. Oma käyttäjätilisi tunnistautuu tiimiläiseen
            nimen tai sähköpostin perusteella, jolloin Koti näyttää sinun
            vastuusi.
          </p>
        </>
      ),
    },
    {
      title: 'Viestit',
      subtitle: 'Tiimin sisäinen keskustelu',
      path: '/viestit',
      moduleId: 'viestit',
      body: (
        <>
          <p>
            Viestit on {orgGen}
            {' '}sisäinen chat. Vasemmalta löytyvät <strong>tiimikanavat</strong>
            yleiseen keskusteluun ja <strong>suorat viestit</strong>
            yksittäisten tiimiläisten välille. Oikealla näkyy aktiivinen
            keskustelu.
          </p>
          <p>
            Viestit tallentuvat organisaatiokohtaisesti — eri
            organisaatioiden chatit eivät sekoitu keskenään. Tämä on
            oikea paikka nopeaan koordinointiin ja päätösten
            kirjaamiseen ilman sähköpostiketjuja.
          </p>
        </>
      ),
    },
    {
      title: 'Aikataulut',
      subtitle: isJtk ? 'Viikkoaikajana juhliin ja palautuksiin' : 'Vuosikello, Kalenteri ja Aikajana',
      path: '/aikataulut',
      moduleId: 'aikataulut',
      body: isJtk ? (
        <>
          <p>
            Juhlatoimikunnan aikataulut näyttävät viikkopohjaisen
            aikajanan huhtikuun 12. päivästä toukokuun 2. päivään.
            Jokainen päivä on omana sarakkeena, ja vaiheet näkyvät
            Gantt-palkkeina.
          </p>
          <p>
            <strong>Aikajana</strong> — näet viisi vaihetta: suunnittelu,
            hankinnat, viimeistely, juhlapäivä ja purku/palautukset.
            Klikkaa vaihetta auki nähdäksesi tehtävät ja merkitäksesi
            niitä tehdyiksi. Ylhäällä näkyy laskuri juhlapäivään.
            <br />
            <strong>Kalenteri</strong> — yksittäisten tapahtumien ja
            deadlinejen hallinta päivä- ja viikkonäkymissä.
          </p>
        </>
      ) : (
        <>
          <p>
            Aikataulut-sivulla on kolme välilehteä, jotka käsittelevät
            samoja vaiheita ja tapahtumia eri näkökulmista:
          </p>
          <p>
            <strong>Vuosikello</strong> — koko vuoden kaarinäkymä,
            vaiheet ja niiden värikoodit ympyrässä. Helikopteriperspektiivi
            siihen, milloin mikin asia ajoittuu.
            <br />
            <strong>Kalenteri</strong> — päivä-, viikko- ja kuukausi­
            näkymät yksittäisille tapahtumille ja deadlineille. Tapahtumia
            voi raahata suoraan kalenterissa, ja muutokset päivittyvät
            samalla vuosikelloon.
            <br />
            <strong>Aikajana</strong> — vaiheet lineaarisena janana
            alusta loppuun. Paras näkymä vaihesiirtymien ja
            päällekkäisyyksien hallintaan.
          </p>
        </>
      ),
    },
    {
      title: 'Viestintä',
      subtitle: 'Kuusi välilehteä: suunnittelusta julkaisuun',
      path: '/viestinta',
      moduleId: 'viestinta',
      body: (
        <>
          <p>
            Viestintä on {orgGen}
            {' '}sisällöntuotannon komentokeskus. Sivulla on kuusi
            välilehteä, jotka vievät idean suunnitelmasta julkaisuun asti:
          </p>
          <p>
            <strong>Suunnitelma</strong> — mitä, miten ja kuka.
            Kuukausikohtainen kattavuus ja vastuut kanavittain.
            <br />
            <strong>Kalenteri</strong> — julkaisukalenteri kuukausi- ja
            listanäkymässä. Näet mitä julkaistaan milloinkin.
            <br />
            <strong>Tuotanto</strong> — julkaisujen tila: brief → luonnos
            → valmis → julkaistu. Tästä näet mikä odottaa työtä ja missä
            vaiheessa.
            <br />
            <strong>Editori</strong> — graafinen editori, jolla rakennat
            julkaisugrafiikan {orgShort === 'LLFF' ? 'LLFF-brändissä' : 'brändissäsi'}.
            Suora manipulaatio: kulmakahvat kokoon, kiertohandle
            pyöritykseen, pikakomennot z-järjestykseen.
            <br />
            <strong>Mediapankki</strong> — {orgShort === 'LLFF' ? 'LLFF Mediapankki R2 CDN:ssä' : 'tiedostot ja kuvat CDN:ssä'}.
            Täällä säilyvät logot, kuvat ja pohjat.
            <br />
            <strong>Julkaisu</strong> — kanavavirta valmiista julkaisuista
            kanavittain. Näet mitä missäkin kanavassa on menossa.
          </p>
        </>
      ),
    },
    {
      title: 'Ohjelmisto',
      subtitle: isLlff
        ? 'Festivaaliviikko 20.–26.8.2026'
        : 'Tapahtumatuotanto ja ohjelma',
      path: '/ohjelmisto',
      moduleId: 'ohjelmisto',
      body: (
        <>
          <p>
            {isLlff
              ? 'Ohjelmisto-sivu kokoaa LLFF 2026 -festivaaliviikon 20.–26.8.2026 sisällöt. Neljä välilehteä:'
              : 'Ohjelmisto-sivu kokoaa tapahtumien sisällöt neljälle välilehdelle:'}
          </p>
          <p>
            <strong>Kokonaisaikataulut</strong> — koko ohjelma
            ruudukkona: elokuvat, musiikki ja työpajat samassa
            aikajanassa. Näet päällekkäisyydet ja aukot yhdellä silmäyksellä.
            <br />
            <strong>Elokuvat</strong> — elokuvakatalogi: teokset,
            ohjaajat, kestot, formaatti, kieli ja näytösajat.
            <br />
            <strong>Musiikki</strong> — musiikkiohjelma: esiintyjät,
            keikat ja aikataulut.
            <br />
            <strong>Työpajat</strong> — työpajojen listaus,
            vetäjät, kohderyhmät ja ilmoittautumistilat.
          </p>
        </>
      ),
    },
    {
      title: 'Apurahat',
      subtitle: isLlff
        ? 'Apurahavuosikello · 100 000 € tavoite'
        : 'Rahoitushaut ja budjetti',
      path: '/budget',
      moduleId: 'budget',
      body: (
        <>
          <p>
            Apurahat-sivu seuraa rahoitushakuja vuosikellona. Näet
            hakuajat, vastuuhenkilöt, tilanteen (auki, jätetty,
            myönnetty, hylätty) ja edistymisen kokonais­tavoitteeseen
            {isLlff ? ' — LLFF:llä 100 000 € ' : ' '}nähden.
          </p>
          <p>
            Jokaiselta hakemukselta voit katsoa yksityiskohdat: hakuaika,
            summa, vastuu, linkit ja muistiinpanot. Sinulle merkityt
            apurahat nousevat Kodin <strong>Sinun tehtäväsi</strong>
            -listaan deadlinen lähestyessä.
          </p>
        </>
      ),
    },
    // ── Juhla-moduulit ──────────────────────────────
    {
      title: 'Vieraat',
      subtitle: isJtk ? 'Sirpan juhlien vieraslista' : 'Vieraslista ja ilmoittautumiset',
      path: '/vieraat',
      moduleId: 'vieraat',
      body: isJtk ? (
        <>
          <p>
            Vieraslista kokoaa kaikki Sirpan 70-vuotisjuhlien kutsutut
            ja ilmoittautuneet. Listalla on tällä hetkellä noin 60 vierasta
            Facebook-kutsusta ja seinäkommenteista — arvio
            todellisesta henkilömäärästä on 57–65.
          </p>
          <p>
            Jokaiselle vieraalle voit merkitä <strong>statuksen</strong>
            (saapuu, kutsuttu, epävarma, ei pääse), <strong>seurueen</strong>,
            <strong> ruokavalion</strong> ja <strong>muistiinpanon</strong>.
            Yläreunassa näkyy kokonaistilanne: montako saapuu, montako
            odottaa vastausta ja arvioitu henkilömäärä ruokamitoitukseen.
          </p>
          <p>
            Hae vieraita nimellä, suodata ryhmän tai statuksen mukaan.
            Klikkaa <strong>Muokkaa</strong> muuttaaksesi mitä tahansa tietoa.
          </p>
        </>
      ) : (
        <>
          <p>
            Vieraslista hallinnoi kutsuttuja ja ilmoittautuneita. Näet
            tilastot (saapuu, kutsuttu, odottaa, ei pääse) ja voit
            suodattaa ryhmän tai statuksen mukaan.
          </p>
          <p>
            Jokaiselle vieraalle voi merkitä ruokavalion, seurueen,
            +1-avecin ja muistiinpanoja. Statusta voi vaihtaa suoraan
            listanäkymässä.
          </p>
        </>
      ),
    },
    {
      title: 'Ruoka',
      subtitle: isJtk ? 'Sirpan juhlien tarjoilut' : 'Ruoka- ja juomasuunnittelu',
      path: '/ruoka',
      moduleId: 'ruoka',
      body: isJtk ? (
        <>
          <p>
            Ruoka ja juomat -sivu kokoaa Juhlatoimikunnan tarjoilu­suunnitelman.
            Lisää ruokia ja juomia kategorioittain: alkupalat, pääruoka,
            jälkiruoka, kakku, juomat ja muu.
          </p>
          <p>
            Jokaiselle kohteelle merkitään <strong>vastuuhenkilö</strong>
            (kuka hoitaa), <strong>määrä</strong>, <strong>ruokavaliohuomio</strong>
            ja <strong>pitääkö vielä hankkia</strong>. Yläreunassa näkyy
            tilanne: montako kohdetta, montako hankittavana ja montako valmista.
          </p>
          <p>
            Rastita kohde valmiiksi kun se on hoidossa. Hankittavat-merkintä
            auttaa kauppalistana juhlapäivää edeltävinä päivinä.
          </p>
        </>
      ) : (
        <>
          <p>
            Ruoka-sivu hallinnoi tarjoiluja kategorioittain. Voit merkitä
            vastuuhenkilön, määrän, ruokavaliorajoitukset ja hankinta­statuksen.
          </p>
        </>
      ),
    },
    {
      title: 'Tehtävät',
      subtitle: isJtk ? 'Juhlatoimikunnan tehtävälista' : 'Yleinen tehtävälista',
      path: '/tehtavat',
      moduleId: 'tehtavat',
      body: isJtk ? (
        <>
          <p>
            Tehtävät on Juhlatoimikunnan yleinen tehtävälista kaikkeen
            juhlajärjestelyyn liittyvään. Lisää nopeasti yläpalkin
            pikalisäyksellä tai tarkemmat tiedot lomakkeella.
          </p>
          <p>
            Jokaiselle tehtävälle voi merkitä <strong>tekijän</strong>
            (Sonja, Raisa, Elina tai Anton), <strong>kategorian</strong>
            (koristelu, ohjelma, kutsut, musiikki jne.),
            <strong> deadlinen</strong>, <strong>prioriteetin</strong> ja
            <strong> hankittava</strong>-lipun tavaroille joita pitää ostaa.
          </p>
          <p>
            Suodata tekijän tai hankittava-statuksen mukaan. Tärkeät
            tehtävät nousevat listan kärkeen, ja deadlinen lähestyessä
            päivälaskuri muuttuu punaiseksi.
          </p>
        </>
      ) : (
        <>
          <p>
            Tehtävälista kokoaa yleiset tekemiset. Pikalisäys yläpalkissa,
            tarkemmat tiedot lomakkeella. Suodata tekijän tai
            hankittava-statuksen mukaan.
          </p>
        </>
      ),
    },
    {
      title: 'Tila',
      subtitle: isJtk ? 'Tyttöjen talo — juhlapaikan tilat' : 'Juhlapaikan tilat ja pohjapiirros',
      path: '/tila',
      moduleId: 'tila',
      body: isJtk ? (
        <>
          <p>
            Tila-sivu kuvaa Tyttöjen talon (Hämeentie 13 A) eri
            huoneet ja niiden käyttötarkoitukset juhlissa. Lisää
            jokaiselle tilalle nimi, kuvaus, käyttötarkoitus ja kuvia.
          </p>
          <p>
            Esimerkiksi: juhlahuone (pääjuhlatila, ruokailu ja puheet),
            keittiö (ruokavalmistelu), eteinen (vastaanotto), piha
            (lisätila kesäsäässä). Kapasiteetti auttaa mitoittamaan
            istumajärjestyksen.
          </p>
          <p>
            Klikkaa tilan korttia nähdäksesi yksityiskohdat ja kuvat
            isompana. Muokkaa tai lisää kuvia valmisteluvaiheen aikana.
          </p>
        </>
      ) : (
        <>
          <p>
            Tila-sivu hallinnoi juhlapaikan eri tiloja. Jokaiselle
            tilalle voi lisätä kuvat, käyttötarkoituksen, kapasiteetin
            ja muistiinpanoja.
          </p>
        </>
      ),
    },
    {
      title: 'Ohjelma',
      subtitle: isJtk ? 'Juhlapäivän aikataulu klo 10–24' : 'Päivän ohjelma-aikataulu',
      path: '/ohjelma',
      moduleId: 'ohjelma',
      body: isJtk ? (
        <>
          <p>
            Ohjelma-sivu on Sirpan 70-vuotisjuhlien päiväaikataulu
            lauantaille 25.4.2026. Aikajana jakautuu kahteen osaan:
          </p>
          <p>
            <strong>Valmistelu (10:00–15:00)</strong> — somistus,
            ruokavalmistelu, tekniikka ja viimeiset tarkistukset ennen
            vieraiden saapumista.
            <br />
            <strong>Juhlat (15:00–24:00)</strong> — vastaanotto, puheet,
            maljat, ruokailu, musiikki, ohjelma ja juhlan päättäminen.
          </p>
          <p>
            Lisää ohjelmanumeroita tyypeittäin: valmistelu, ohjelma,
            ruoka/tarjoilu, musiikki, puhe/malja tai muu. Jokaiselle
            merkitään alku- ja loppuaika, vastuuhenkilö ja kuvaus.
            Klikkaa ohjelmanumeroa muokataksesi sitä.
          </p>
        </>
      ) : (
        <>
          <p>
            Ohjelma-sivu kokoaa päivän tapahtumat aikajanalle. Lisää
            ohjelmanumeroita kategorioittain ja merkitse vastuuhenkilöt.
          </p>
        </>
      ),
    },
    {
      title: 'Muistiinpanot',
      subtitle: isJtk ? 'Juhlatoimikunnan palaverimuistiinpanot' : 'Palaverimuistiinpanot',
      path: '/muistiinpanot',
      moduleId: 'muistiinpanot',
      body: isJtk ? (
        <>
          <p>
            Muistiinpanot-sivu on Juhlatoimikunnan palaverimuistiinpanojen
            arkisto. Aina kun järjestelypalaverissa sovitaan jotain,
            kirjaa se tänne — muistiinpanot tallentuvat aikajärjestyksessä.
          </p>
          <p>
            Jokaisessa muistiinpanossa merkitään <strong>ketkä olivat
            paikalla</strong> (valitaan tiimin jäsenistä) ja kirjoitetaan
            vapaamuotoinen teksti. Myöhemmin voit pyytää <strong>tekoälyä
            tiivistämään</strong> muistiinpanon — AI luo yhteenvedon
            pääkohdista ja toimenpiteistä.
          </p>
          <p>
            Muistiinpanot löytyvät listanäkymästä uusimmat ensin. Klikkaa
            muistiinpanoa auki nähdäksesi koko sisällön ja AI-yhteenvedon.
          </p>
        </>
      ) : (
        <>
          <p>
            Muistiinpanot kokoaa palaverimuistiinpanot aikajärjestyksessä.
            Merkitse osallistujat ja kirjoita vapaamuotoiset muistiinpanot.
            Tekoäly voi tiivistää muistiinpanon pääkohdiksi ja
            toimenpiteiksi.
          </p>
        </>
      ),
    },
    {
      title: 'Momentum AI',
      subtitle: isJtk
        ? 'Tekoäly juhlanjärjestäjän apuna'
        : isLlff
        ? 'Kokeile tekoälyä — kysy mitä se osaa'
        : 'Tekoäly tuntee strategian ja datan',
      body: isJtk ? (
        <>
          <p>
            Oikean alakulman <strong>M</strong>-nappi avaa Momentum AI:n
            — tekoäly joka toimii juhlanjärjestäjän apurina. Se tuntee
            Juhlatoimikunnan tiimin, aikataulun, vieraslistan ja
            juhlapaikan tiedot.
          </p>
          <p>
            Kysy siltä mitä tahansa: ohjelmaideoita, koristeluvinkkejä,
            ruokamäärien mitoitusta, puherunkojen luonnostelua tai
            aikataulun optimointia. <strong>Inspiraatio</strong>-napilla
            saat suoraan ideoita juhlien järjestämiseen.
          </p>
          <p className="ug-hint">
            Opas löytyy aina vasemman reunan Käyttöohje-napista.
          </p>
        </>
      ) : (
        <>
          <p>
            Oikean alakulman <strong>M</strong>-nappi avaa Momentum AI:n
            — tekoäly joka tuntee {orgGen + ' '}
            strategian, kohderyhmät, kanavat, projektit ja tulevat
            tapahtumat. Kysy siltä mitä tahansa viestintään tai
            tuotantoon liittyvää.
          </p>
          {isLlff && (
            <p>
              Kun painat <strong>Käynnistä AI-demo</strong>, Momentum AI
              avautuu ja kysyy tekoälyltä itseltään mitä se osaa. Saat
              yleiskuvan siitä, miten AI voi auttaa: ideoiden
              pallottelu, strategian avaaminen, postausten luonnokset,
              apurahahakemusten kirjoittaminen ja muut käyttötapaukset.
            </p>
          )}
          <p className="ug-hint">
            Opas löytyy aina uudelleen vasemman reunan Käyttöohje-napista.
            Voit myös hypätä suoraan tiettyyn askeleeseen alareunan
            pisteillä.
          </p>
        </>
      ),
    },
  ];
}

// Demo-viestit — ajetaan peräkkäin Momentum AI:lle käyttöohjeen lopussa
const ORG_DEMO_PROMPTS: Record<string, string[]> = {
  llff: [
    'Mitä kaikkea osaat tehdä Momentumissa LLFF:n tiimille? Kerro konkreettisesti käyttötapaukset -- esimerkiksi ideoiden pallottelu, strategian avaaminen ja tulkinta, postausten luonnostelu eri kanaviin, apurahahakemusten kirjoittamisen tuki, viestintäsuunnitelman sparraus, aikataulujen ja ohjelmiston pohdinta, sekä muut tavat joilla voit auttaa. Vastaa tiiviisti jäsennellyllä listalla, älä tee vielä yhtään postausta -- tämä on esittely.',
  ],
  avl: [
    'Mitä kaikkea osaat tehdä Momentumissa Aivovammaliiton viestintätiimille? Kerro konkreettisesti käyttötapaukset -- esimerkiksi viestintäsuunnitelman sparraus, postausten luonnostelu eri kanaviin (Facebook, Instagram, LinkedIn, Aivoitus-lehti), kampanjoiden ideointi, tietoisuuskampanjoiden sisällöt, ja muut tavat joilla voit auttaa. Vastaa tiiviisti jäsennellyllä listalla, älä tee vielä yhtään postausta -- tämä on esittely.',
  ],
  juhlatoimikunta: [
    'Mitä kaikkea osaat tehdä Momentumissa Juhlatoimikunnan apuna Sirpan 70-vuotisjuhlien järjestämisessä? Kerro konkreettisesti -- esimerkiksi ohjelmaideoita, koristeluvinkkejä, ruokamäärien laskemista 60 vieraalle, puherunkojen luonnostelua, aikataulun optimointia, musiikkisuosituksia, ja muita tapoja joilla voit auttaa juhlatoimikuntaa. Vastaa tiiviisti jäsennellyllä listalla -- tämä on esittely.',
  ],
};
const DEFAULT_DEMO_PROMPTS = [
  'Mitä kaikkea osaat tehdä Momentumissa tiimillemme? Kerro konkreettisesti käyttötapaukset. Vastaa tiiviisti jäsennellyllä listalla -- tämä on esittely.',
];

export default function UserGuide() {
  const router = useRouter();
  const params = useParams();
  const orgSlug = (params?.orgSlug as string) || '';
  const { isEnabled } = useModules();

  // Rakenna kaikki askeleet, suodata pois ne joiden moduuli on kytketty pois päältä.
  // Askeleet ilman moduleId:tä (Tervetuloa, Momentum AI) näytetään aina.
  const steps = useMemo(() => {
    const all = buildSteps(orgSlug);
    return all.filter((s) => !s.moduleId || isEnabled(s.moduleId));
  }, [orgSlug, isEnabled]);

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  // Varmista että askel pysyy sallitulla alueella jos moduuleja kytketään pois
  useEffect(() => {
    if (step > steps.length - 1) {
      setStep(Math.max(0, steps.length - 1));
    }
  }, [steps.length, step]);

  // Avaa opas automaattisesti ensikäynnistä
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const seen = window.localStorage.getItem(STORAGE_KEY);
      if (!seen) {
        setOpen(true);
        setStep(0);
      }
    } catch {
      // localStorage ei käytettävissä — ohitetaan
    }
  }, []);

  // Navigoi askeleen mukaiselle sivulle taustalle
  useEffect(() => {
    if (!open || !orgSlug) return;
    const path = steps[step]?.path;
    if (path) {
      router.push(`/${orgSlug}${path}`);
    }
  }, [open, step, orgSlug, router, steps]);

  // Avaa ulkoisesta tapahtumasta (sivupalkin napista)
  useEffect(() => {
    const handler = () => {
      setStep(0);
      setOpen(true);
    };
    window.addEventListener('momentum:open-userguide', handler);
    return () => window.removeEventListener('momentum:open-userguide', handler);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // ignore
    }
  }, []);

  const isLlff = orgSlug === 'llff';

  const next = useCallback(() => {
    if (step >= steps.length - 1) {
      // Viimeisen askeleen Valmis/Käynnistä-nappi: sulje opas ja käynnistä AI-demo
      close();
      const demoPrompts = ORG_DEMO_PROMPTS[orgSlug] || DEFAULT_DEMO_PROMPTS;
      if (demoPrompts.length > 0) {
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent('momentum:ai-prompt', {
              detail: { texts: demoPrompts },
            })
          );
        }, 300);
      }
      return;
    }
    setStep((s) => s + 1);
  }, [step, close, steps.length, isLlff]);

  const prev = useCallback(() => {
    setStep((s) => Math.max(0, s - 1));
  }, []);

  // Näppäinkomennot
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, close, next, prev]);

  if (!open) return null;

  const current = steps[step];
  const isLast = step === steps.length - 1;
  const isFirst = step === 0;

  return (
    <div
      className="ug-panel"
      role="dialog"
      aria-modal="false"
      aria-labelledby="ug-title"
    >
      <div className="ug-bar">
        <span style={{ background: 'var(--hetki-blue)' }} />
        <span style={{ background: 'var(--hetki-green)' }} />
        <span style={{ background: 'var(--hetki-yellow)' }} />
        <span style={{ background: 'var(--hetki-pink)' }} />
        <span style={{ background: 'var(--hetki-black)' }} />
      </div>

      <div className="ug-head">
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="ug-kicker">
            Käyttöohje · {step + 1} / {steps.length}
          </div>
          <h3 id="ug-title">{current.title}</h3>
          <p className="ug-sub">{current.subtitle}</p>
        </div>
        <button
          className="ug-x"
          onClick={close}
          aria-label="Sulje käyttöohje"
        >
          ×
        </button>
      </div>

      <div className="ug-body">{current.body}</div>

      <div className="ug-foot">
        <div className="ug-dots" role="tablist" aria-label="Opas-askeleet">
          {steps.map((_, i) => (
            <button
              key={i}
              className={`ug-dot ${i === step ? 'act' : ''} ${
                i < step ? 'done' : ''
              }`}
              aria-label={`Askel ${i + 1}`}
              aria-selected={i === step}
              onClick={() => setStep(i)}
            />
          ))}
        </div>
        <div className="ug-actions">
          <button
            className="btn btn-ghost btn-sm"
            onClick={prev}
            disabled={isFirst}
          >
            Edellinen
          </button>
          <button className="btn btn-primary btn-sm" onClick={next}>
            {isLast ? 'Käynnistä AI-demo' : 'Seuraava'}
          </button>
        </div>
      </div>
    </div>
  );
}
