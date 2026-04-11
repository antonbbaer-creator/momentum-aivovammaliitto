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
  const orgLabel = isLlff ? 'Lapinlahden Lyhytelokuvajuhlien' : 'organisaatiosi';
  const orgShort = isLlff ? 'LLFF' : 'organisaatio';

  return [
    {
      title: 'Tervetuloa Momentumiin',
      subtitle: isLlff
        ? 'Lapinlahden Lyhytelokuvajuhlien työkalu'
        : 'Projektinhallinta ja viestintä samassa näkymässä',
      body: (
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
      subtitle: 'Päivän tärkein työlista',
      path: '/dashboard',
      moduleId: 'dashboard',
      body: (
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
            Strategia-sivu kokoaa {orgShort === 'LLFF' ? 'LLFF:n' : 'organisaation'}
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
      subtitle: 'Jäsenet, roolit ja tiimikohtaiset projektit',
      path: '/team',
      moduleId: 'team',
      body: (
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
            Viestit on {orgShort === 'LLFF' ? 'LLFF:n' : 'organisaation'}
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
      subtitle: 'Vuosikello, Kalenteri ja Aikajana',
      path: '/aikataulut',
      moduleId: 'aikataulut',
      body: (
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
            Viestintä on {orgShort === 'LLFF' ? 'LLFF:n' : 'organisaation'}
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
    {
      title: 'Momentum AI',
      subtitle: isLlff
        ? 'Kokeile tekoälyä — kysy mitä se osaa'
        : 'Tekoäly tuntee strategian ja datan',
      body: (
        <>
          <p>
            Oikean alakulman <strong>M</strong>-nappi avaa Momentum AI:n
            — tekoäly joka tuntee {orgShort === 'LLFF' ? 'LLFF:n ' : ''}
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

// LLFF-demon viestit — ajetaan peräkkäin Momentum AI:lle käyttöohjeen lopussa
// Pyydetään tekoälyä itse kertomaan käyttötapauksensa — ei luoda postausta
const LLFF_DEMO_PROMPTS: string[] = [
  'Mitä kaikkea osaat tehdä Momentumissa LLFF:n tiimille? Kerro konkreettisesti käyttötapaukset — esimerkiksi ideoiden pallottelu, strategian avaaminen ja tulkinta, postausten luonnostelu eri kanaviin, apurahahakemusten kirjoittamisen tuki, viestintäsuunnitelman sparraus, aikataulujen ja ohjelmiston pohdinta, sekä muut tavat joilla voit auttaa. Vastaa tiiviisti jäsennellyllä listalla, älä tee vielä yhtään postausta — tämä on esittely.',
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
      // Viimeisen askeleen Valmis/Käynnistä-nappi: sulje opas ja käynnistä AI-demo LLFF:lle
      close();
      if (isLlff) {
        // Pieni viive jotta käyttöohjeen sulkeutuminen ehtii animoitua
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent('momentum:ai-prompt', {
              detail: { texts: LLFF_DEMO_PROMPTS },
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
            {isLast ? (isLlff ? 'Käynnistä AI-demo' : 'Valmis') : 'Seuraava'}
          </button>
        </div>
      </div>
    </div>
  );
}
