// Seed data for AVL and LLFF communities
// Full strategic context extracted from the original SPA

export const AVL_ORG = {
  name: 'Aivovammaliitto', s: 'AVL', slogan: 'Aivovauriotietouden levittäminen ja vertaistuki',

  // ═══ ORGANISAATION STRATEGIA 2023-2030 ═══
  orgStrategy: {
    mission: 'Edistää aivovammaisten sekä heidän läheistensä hyvinvointia ja osallistumisen mahdollisuuksia. Lisäämme tietoisuutta aivovammoista ja osallistumme aktiivisesti kuntoutuksen kehittämiseen.',
    vision: 'Suomesta on tullut aivovammojen hoidon, kuntoutuksen ja vertaistuen edelläkävijämaa, jossa kukaan ei jää yksin vammansa kanssa. Aivovammautuneet ovat yhdenvertaisia kansalaisia ja vammojen määrä on merkittävästi vähentynyt.',
    values: [
      { name: 'Inhimillinen', desc: 'Matalan kynnyksen tuki ja ihmisyyden kunnioitus' },
      { name: 'Asiantunteva', desc: 'Yhteistyökyky ja laaja verkostoituminen' },
      { name: 'Oikeudenmukainen', desc: 'Yksilöllinen ja yhdenvertainen kohtelu, avoin toiminta' },
      { name: 'Rohkea', desc: 'Epäkohtiin puuttuminen, aktiivinen oikeuksien puolustus' },
    ],
    strategicPeriod: '2023-2030',
  },

  // ═══ VIESTINNÄN MISSIO (johdettu strategiasta) ═══
  commsMission: 'Levitämme aivovauriotietoutta ja tuemme vertaisuutta niin, että jokainen aivovaurion kokenut ja läheinen saa tarvitsemansa tiedon ja tuen — riippumatta sijainnista, iästä tai vamman laadusta.',

  // ═══ VIESTINNÄN PERUSTEHTÄVÄT (ohjaavat kaikkea viestintää) ═══
  commsCoreRoles: [
    { id: 'tieto', name: 'Tiedon lisääminen', desc: 'Aivovaurioihin liittyvän tiedon ja ymmärryksen levittäminen niin sairastuneille, läheisille, ammattilaisille kuin suurelle yleisölle.', color: '#056b9f' },
    { id: 'vertaisuus', name: 'Vertaisuuden vahvistaminen', desc: 'Vertaisuuden ja osallisuuden kokemuksen rakentaminen — kukaan ei ole yksin aivovaurion kanssa.', color: '#185e5b' },
    { id: 'voimaantuminen', name: 'Voimaantumisen tuki', desc: 'Sairastuneiden ja läheisten oman toimijuuden ja voimaantumisen tukeminen.', color: '#f1b434' },
    { id: 'nakyvyys', name: 'Näkyvyyden luominen', desc: 'Liiton toiminnan, palveluiden ja vaikuttavuuden tekeminen näkyväksi.', color: '#e45c81' },
  ],

  // ═══ VIESTINTÄ vs. TIEDOTUS ═══
  viestintaDefinitions: {
    viestinta: { dir: 'Kaksisuuntainen, vuorovaikutteinen', goal: 'Merkitysten rakentaminen yhteisesti', metrics: 'Sitoutuminen, dialogi, kokemusten jakaminen', examples: ['Some', 'tapahtumat', 'vertaisryhmät'] },
    tiedotus: { dir: 'Yksisuuntainen, informatiivinen', goal: 'Ajankohtaisten asioiden välittäminen', metrics: 'Tavoittavuus, avaamisprosentti, kattavuus', examples: ['Uutiskirjeet', 'tiedotteet', 'verkkosivut'] },
  },

  // ═══ 2026 ERITYISHUOMIOT ═══
  currentContext: {
    expansion: 'AVL laajentunut 1.1.2026 kattamaan myös aivoverenkiertohäiriöt (AVH) ja muut aivovauriot.',
    visualIdentity: 'Visuaalisen ilmeen kokonaisuudistus keväällä 2026 yhteistyössä graafikko Jutta Kivilompolon kanssa. Kattaa brändi-ilmeen, graafiset elementit ja visuaalisen ohjeistuksen.',
    websiteUpdate: 'Verkkosivuston rakenteen, sisältöjen ja käytettävyyden päivittäminen syksyllä 2026. Hyödyntää uudistettua visuaalista ilmettä.',
    steaCuts: 'STEA-avustukset pienenevät ~30M€ vuonna 2026. Viestinnän pitää priorisoida ja osoittaa vaikuttavuutta.',
    accessibility: 'Digipalvelulain saavutettavuusvaatimukset kiristyvät 28.6.2025. Erityisen tärkeää koska kohderyhmässä kognitiivisia haasteita.',
    elections2027: 'Eduskuntavaalit 2027 — vaikuttamisviestintä aloitettava 2026. Kuntoutus, palvelut, yhdenvertaisuus.',
  },

  // ═══ ORGANISAATION PERUSTIEDOT ═══
  orgContext: {
    fullName: 'Aivovammaliitto ry / Hjärnskadeförbund rf',
    founded: 1992,
    hq: 'Helsinki',
    chair: 'Timo Kallioja',
    execDirector: 'Päivi Puhakka',
    localAssociations: 11,
    funder: 'STEA (Sosiaali- ja terveysjärjestöjen avustuskeskus)',
    expansion2026: '1.1.2026 alkaen AVL laajentunut kattamaan myös aivoverenkiertohäiriön (AVH) ja muun aivojen vaurion kokeneet läheisineen.',
    toivoApp: 'Toivo-sovellus: ilmainen vertaistukisovellus (iOS+Android), anonyymi käyttö nimimerkillä',
  },
  // Key statistics
  stats: {
    tbiAnnual: 36000,
    tbiMildPercent: 90,
    tbiPermanent: 110000,
    tbiDeaths: 1000,
    avhAnnual: 25000,
    avhDeaths: 4500,
    avhCostPerPatient: 55000,
    avhTotalCost: '1.1 mrd euroa/v',
    combinedLiving: 200000,
    withFamilies: 1000000,
    alcoholRelated: '~50% aivovammoista tapahtuu alkoholin vaikutuksen alaisena',
    malePercent: 66,
    youngAge: '~50% 15-34-vuotiaille',
    childrenSevere: '100-150 lasta/v saa vaikean aivovamman',
    dailyNew: 'Yli 100 suomalaista päivässä saa aivovamman tai aivoverenkiertohäiriön',
  },
  // ═══ KANAVAPROFIIILIT (strateginen rooli per kanava) ═══
  channelProfiles: [
    { ch: 'Aivoitus-lehti', role: 'Päätiedotusjulkaisu', freq: '4 numeroa/v', auds: ['Sairastuneet', 'Läheiset', 'Ammattilaiset', 'Suuri yleisö'], metrics: ['Levikki', 'Lukijapalaute', 'Teema-artikkelien määrä'], desc: 'Aivovauriotiedon levittäminen, vertaisuuden ja voimaantumisen kokemukset, tutkimustiedon välittäminen, tapahtumista viestiminen.' },
    { ch: 'Facebook', role: 'Yhteisön kokoontumispaikka', freq: 'Väh. 3x/vko', auds: ['Sairastuneet', 'Läheiset', 'Ammattilaiset'], metrics: ['Seuraajamäärä', 'Tavoittavuus', 'Sitoutuminen'], desc: 'Aivovauriotietouden jakaminen, tapahtumaviestintä, linkitys omaan ja ulkoiseen sisältöön. Loma-aikoina ajastettua, neutraalia sisältöä.' },
    { ch: 'Instagram', role: 'Visuaalinen tarinankerronta', freq: 'Säännöllinen', auds: ['Nuoremmat aikuiset', 'Suuri yleisö'], metrics: ['Seuraajamäärä', 'Tavoittavuus', 'Sitoutuminen'], desc: 'Tapahtumat, videot, ihmisläheisyys. Erityisesti nuoremmat aikuiset.' },
    { ch: 'TikTok', role: 'Kokeileva, nuorten kanava', freq: 'Tarpeen ja resurssien mukaan', auds: ['Nuoret', 'Nuoret aikuiset'], metrics: ['Näytöt', 'Seuraajat'], desc: 'Lyhyet videot, kampanjat, kokemukset — tavoittaa nuoret ja nuoret aikuiset.' },
    { ch: 'YouTube', role: 'Syventävä videokanava', freq: 'Tarpeen mukaan', auds: ['Ammattilaiset', 'Sairastuneet', 'Läheiset'], metrics: ['Näyttökerrat', 'Tilaukset'], desc: 'Webinaarien tallennus ja jakelu, kokemustarinat, asiantuntijahaastattelut.' },
    { ch: 'LinkedIn', role: 'Ammattilaisviestintä ja yhteistyöt', freq: 'Säännöllinen', auds: ['Sidosryhmät', 'Ammattilaiset', 'Rahoittajat'], metrics: ['Seuraajat', 'Tavoittavuus'], desc: 'Ajankohtaisia asioita ja tutkimuksia ammattilaiskärjellä.' },
    { ch: 'Tapahtumat ja webinaarit', role: 'Kohtaamiseen perustuva viestintä', freq: 'Kuukausittain', auds: ['Kaikki'], metrics: ['Osallistujamäärät', 'Palautteet'], desc: 'Viestintäkaari: ennen (kutsu, ennakkoviestintä) — aikana (live, some) — jälkeen (yhteenveto, tallenne).' },
  ],
  vals: [
    { i: 'V', t: 'Vertaisuus', d: 'Voimaantumisen ja vertaistuen kokemukset' },
    { i: 'L', t: 'Luotettavuus', d: 'Tutkittu tieto ja asiantuntijuus' },
    { i: 'S', t: 'Saavutettavuus', d: 'Tieto kaikkien saataville esteettömästi' },
    { i: 'A', t: 'Ajankohtaisuus', d: 'Oikea-aikainen ja relevantti viestintä' },
    { i: 'V', t: 'Vuorovaikutteisuus', d: 'Kaksisuuntaista merkitysten rakentamista' },
  ],
  auds: [
    { n: 'Aivovamman/AVH:n kokeneet', d: 'Vertaistuki, arjen selviytyminen, palvelut ja oikeudet.', tone: 'Lämmin, voimaannuttava, selkokielinen', c: ['Facebook', 'Aivoitus-lehti', 'Tapahtumat'] },
    { n: 'Läheiset', d: 'Ymmärrys, jaksaminen, konkreettiset vinkit.', tone: 'Empaattinen, tukeva, käytännönläheinen', c: ['Facebook', 'Aivoitus-lehti', 'Webinaarit'] },
    { n: 'Ammattilaiset (sote, kuntoutus, opetus)', d: 'Tutkimustieto, kuntoutuskäytännöt, yhteistyömahdollisuudet.', tone: 'Asiantunteva, näyttöön perustuva', c: ['LinkedIn', 'Aivoitus-lehti', 'Webinaarit'] },
    { n: 'Suuri yleisö / aivoterveydestä kiinnostuneet', d: 'Aivoterveys, ennaltaehkäisy, tietoisuuden lisääminen.', tone: 'Helposti lähestyttävä, tarinapohjainen', c: ['Instagram', 'TikTok', 'Kampanjat'] },
  ],
  channels: [
    { name: 'Facebook', slug: 'facebook', color: '#1877F2', ic: 'FB', url: 'https://www.facebook.com/Aivovammaliitto/', enabled: true },
    { name: 'Instagram', slug: 'instagram', color: '#E1306C', ic: 'IG', url: 'https://www.instagram.com/aivovammaliitto/', enabled: true },
    { name: 'LinkedIn', slug: 'linkedin', color: '#0A66C2', ic: 'LI', url: 'https://www.linkedin.com/company/aivovammaliitto', enabled: true },
    { name: 'TikTok', slug: 'tiktok', color: '#00f2ea', ic: 'TT', url: 'https://www.tiktok.com/@aivovammaliitto', enabled: true },
    { name: 'YouTube', slug: 'youtube', color: '#FF0000', ic: 'YT', url: 'https://www.youtube.com/@aivovammaliitto', enabled: true },
    { name: 'Nettisivut', slug: 'nettisivut', color: '#34d399', ic: 'WW', url: 'https://aivovammaliitto.fi/', enabled: true },
    { name: 'Uutiskirje', slug: 'uutiskirje', color: '#fb923c', ic: 'UK', url: null, enabled: true },
    { name: 'Jäsenkirje', slug: 'jasenkirje', color: '#f5c542', ic: 'JK', url: null, enabled: true },
    { name: 'Aivoitus-lehti', slug: 'aivoitus', color: '#9b7cf6', ic: 'AL', url: 'https://www.aivovammaliitto.fi/tiedotus/aivoitus-lehti/', enabled: true },
    { name: 'Messut ja tapahtumat', slug: 'tapahtumat', color: '#e879a8', ic: 'MT', url: null, enabled: true },
    { name: 'Lehdistötiedotteet', slug: 'tiedotteet', color: '#4ad8d8', ic: 'LT', url: null, enabled: false },
    { name: 'Esitteet', slug: 'esitteet', color: '#ef6b6b', ic: 'ES', url: null, enabled: false },
  ],
  team: [
    { name: 'Pia Kilpeläinen', role: 'Viestintävastaava / Aivoitus-lehden päätoimittaja', avatar: 'P', desc: 'Viestinnän koordinointi, Aivoitus-lehden päätoimittaja, jäsenkirjeet, nettisivujen päivitykset, tapahtumajärjestelyt.' },
    { name: 'Anton Baer', role: 'Viestinnän suunnittelija', avatar: 'A', desc: 'Visuaalisen viestinnän kehittäminen, nettisivujen ilme ja uudistus, esitteiden taitto, YouTube-videot, Momentum-alustan kehitys.' },
    { name: 'Jani Saarinen', role: 'Sisällöntuottaja', avatar: 'J', desc: 'Sosiaalisen median sisällöntuotanto (Facebook, Instagram, TikTok), somekanavien analytiikka, sisältökalenterin ylläpito.' },
    { name: 'Päivi Hakkarainen', role: 'Toiminnanjohtaja', avatar: 'P', desc: 'LinkedIn-sisällöt, lehdistötiedotteet, kannanotot, lausunnot, kriisiviestinnän vastuuhenkilö, vaikuttamisviestintä.' },
  ],
  // Key messages for AI context (theme = commsCoreRoles id)
  keyMessages: [
    { title: 'Näkymätön vamma', desc: 'Aivovaurion kognitiiviset oireet ovat näkymättömiä, mikä tekee ymmärtämisestä vaikeaa jopa läheisille. #nakymattonnäkyväksi', theme: 'tieto' },
    { title: 'Vaikuttavuuden laajuus', desc: 'Äkillinen aivovaurio koskettaa jopa miljoonaa suomalaista. 200 000 elää seurausten kanssa.', theme: 'nakyvyys' },
    { title: 'Ennaltaehkäisy', desc: '~50% aivovammoista tapahtuu alkoholin vaikutuksen alaisena. Kypärän käyttö ja turvallinen liikenne ehkäisevät.', theme: 'tieto' },
    { title: 'Elämä jatkuu', desc: 'Toipuminen ja mielekäs elämä ovat mahdollisia aivovaurion jälkeen. Tarinat toivosta. elamajatkuu.fi', theme: 'vertaisuus' },
    { title: 'Aivoterveys kaikille', desc: 'Ennaltaehkäisy, varhainen tunnistaminen ja oikea-aikainen kuntoutus.', theme: 'tieto' },
    { title: 'Laajentunut missio 2026', desc: 'Nyt myös AVH ja muut aivovauriot. 36 000 + 25 000 = yli 60 000 uutta tapausta vuodessa.', theme: 'nakyvyys' },
    { title: 'Yhdenvertaisuus', desc: 'Aivovaurion kokeneiden yhdenvertainen ja omatoiminen osallistuminen yhteiskuntaan.', theme: 'nakyvyys' },
    { title: 'Vertaistuen saavutettavuus', desc: 'Tukea pitää olla saatavilla sijainnista riippumatta. Toivo-sovellus, verkkovertaisryhmät.', theme: 'vertaisuus' },
  ],

  // ═══ MITTARISTO ═══
  metricsFramework: [
    { area: 'Sosiaalinen media', metrics: ['Seuraajamäärä', 'Tavoittavuus', 'Sitoutumisaste'], interval: 'Kuukausittain', target: 'Kasvutrendi ed. vuoteen' },
    { area: 'Aivoitus-lehti', metrics: ['Levikki', 'Lukijapalaute', 'Teema-artikkelit'], interval: 'Numeron jälkeen', target: 'Tyytyväisyys ja kattavuus' },
    { area: 'Tapahtumat', metrics: ['Osallistujamäärät', 'Palautteet'], interval: 'Tapahtumittain', target: 'Osallistujatrendi' },
    { area: 'Uutiskirjeet/tiedotteet', metrics: ['Avausprosentit', 'Klikkaukset'], interval: 'Lähetyksittäin', target: 'Ala-/ylärajat' },
  ],

  // ═══ OPERATIIVINEN KVARTAALIKALENTERI 2026 ═══
  quarterlyCalendar: [
    { q: 1, theme: 'Älä anna sen kasvaa — STOP väkivallalle', months: [
      { m: 1, content: 'Vuoden aloitus: kampanjan lanseeraus, teeman esittely, vertaistarinat', channels: ['Facebook', 'Instagram', 'Nettisivut'], aud: 'Kaikki' },
      { m: 2, content: 'Ammattilaissisältö: väkivallan ja aivovaurion yhteys tutkimustiedon valossa', channels: ['Facebook', 'LinkedIn', 'Webinaarit'], aud: 'Ammattilaiset, läheiset' },
      { m: 3, content: 'Aivoitus 1/2026 ilmestyy. Teemakokonaisuuden koonti ja jatkovuorovaikutus.', channels: ['Aivoitus-lehti', 'Some', 'Tapahtumat'], aud: 'Kaikki' },
    ]},
    { q: 2, theme: 'Aivoterveyden asialla', months: [
      { m: 4, content: 'Aivoterveyskampanja: lyhyet videot, infografiikat, haasteet. Visuaalisen ilmeuudistuksen julkaisu.', channels: ['Facebook', 'Instagram', 'TikTok'], aud: 'Suuri yleisö, nuoret' },
      { m: 5, content: 'Tutkimustiedon jakaminen, asiantuntijahaastattelut, Aivoitus 2/2026', channels: ['LinkedIn', 'Aivoitus-lehti'], aud: 'Ammattilaiset' },
      { m: 6, content: 'Kesän sisältö: aivoterveys arjessa, liikunta, uni. Kevyempää sisältöä.', channels: ['Some (ajastettu)'], aud: 'Kaikki' },
    ]},
    { q: 3, theme: 'Elämän rytmi', months: [
      { m: 7, content: 'Kesäloma-sisältö: palautuminen, arjen rytmi, vinkit', channels: ['Some (ajastettu)'], aud: 'Sairastuneet, läheiset' },
      { m: 8, content: 'Syksyn kauden käynnistys. Vertaistoiminta, ryhmät, Aivoitus 3/2026. Verkkosivupäivityksen käynnistys.', channels: ['Facebook', 'Instagram', 'Tapahtumat'], aud: 'Kaikki' },
      { m: 9, content: 'Elämän rytmi -teema täysillä: arjenhallinta, väsymys, jaksaminen. Webinaarit.', channels: ['Kaikki kanavat'], aud: 'Sairastuneet, läheiset, ammattilaiset' },
    ]},
    { q: 4, theme: 'Toivoa tulevaan', months: [
      { m: 10, content: 'Kuntoutumistarinat, uudet mahdollisuudet. Vaikuttamisviestintä.', channels: ['Facebook', 'LinkedIn', 'Tapahtumat'], aud: 'Kaikki' },
      { m: 11, content: 'Aivoitus 4/2026, vuoden teemojen koonti, kiitollisuus ja yhteisöllisyys.', channels: ['Kaikki kanavat'], aud: 'Kaikki' },
      { m: 12, content: 'Vuoden katsaus, kiitokset, tulevaisuudensuuntia. 2027-ennakointi.', channels: ['Some', 'Uutiskirje'], aud: 'Kaikki' },
    ]},
  ],

  // ═══ KEHITYSSUUNNITELMA 2027 ═══
  developmentPlan2027: {
    currentProjects: [
      { name: 'Visuaalisen viestinnän uudistus', desc: 'Visuaalisen ilmeen kokonaisuudistus yhteistyössä graafikko Jutta Kivilompolon kanssa. Kattaa brändi-ilmeen, graafiset elementit ja visuaalisen ohjeistuksen.', timing: 'Kevät 2026' },
      { name: 'Verkkosivujen päivitys', desc: 'Verkkosivuston rakenteen, sisältöjen ja käytettävyyden päivittäminen. Hyödyntää uudistettua visuaalista ilmettä.', timing: 'Syksy 2026' },
    ],
    targets: [
      { id: 1, name: 'Uusi viestintästrategia', desc: '2015-strategian päivitys vastaamaan nykyistä toimintaympäristöä, digitaalisia kanavia ja liiton kehittyneitä tavoitteita.', prep: 'Q3–Q4 2026' },
      { id: 2, name: 'Teemasuunnittelu 2027', desc: 'Uusien vuositeemojen määrittely. Huomioidaan vuoden 2026 kokemukset, kohderyhmäpalaute ja ajankohtaiset ilmiöt.', prep: 'Q4 2026' },
      { id: 3, name: 'Mittariston kehittäminen', desc: 'Nykyisten mittareiden täydentäminen vaikuttavuusmittareilla: ydinviestien läpimenon laatu, kohderyhmien tavoittamisen laatu.', prep: 'Q2–Q3 2026' },
      { id: 4, name: 'Kanavastrategian tarkennus', desc: 'TikTokin ja YouTuben roolin selkeyttäminen: resurssitarve, tavoitteet ja sisältösuunnitelma.', prep: 'Q2 2026' },
      { id: 5, name: 'Kohderyhmien syvempi profilointi', desc: 'Kohderyhmäkohtaisten persoonien ja sisältöpolkujen kehittäminen palvelemaan tarkemmin eri ryhmiä.', prep: 'Q3 2026' },
      { id: 6, name: 'Sisäisen viestinnän kehittäminen', desc: 'Liiton henkilöstön ja jäsenistön sisäisen viestinnän prosessien ja työkalujen arviointi.', prep: 'Q4 2026' },
    ],
  },
  // ═══ KVARTAALITEEMAT 2026 ═══
  quarterlyThemes: [
    { q: 1, name: 'Älä anna sen kasvaa — STOP väkivallalle', months: 'Tammi–maaliskuu', aivoitus: '1/2026: Stop väkivallalle', focus: 'Tietoisuuden lisääminen väkivallan ja aivovaurion yhteydestä. Ennaltaehkäisy, tunnistaminen ja tuen tarjoaminen.' },
    { q: 2, name: 'Aivoterveyden asialla', months: 'Huhti–kesäkuu', aivoitus: '2/2026: Aivoterveyden asialla', focus: 'Aivojen hyvinvointi, ennaltaehkäisy ja tutkimustieto. Tavoittaa erityisesti suuren yleisön ja ammattilaiset.' },
    { q: 3, name: 'Elämän rytmi', months: 'Heinä–syyskuu', aivoitus: '3/2026: Elämän rytmi', focus: 'Arjen hallinta aivovaurion jälkeen: jaksaminen, rutiinit, väsymys, palautuminen. Vertaisuus ja käytännön vinkit.' },
    { q: 4, name: 'Toivoa tulevaan', months: 'Loka–joulukuu', aivoitus: '4/2026: Toivoa tulevaan', focus: 'Tulevaisuudenuskoa, kuntoutumistarinoita, uusia mahdollisuuksia ja yhteiskunnan tukea. Voimaantuminen.' },
  ],
  // Member survey insights
  memberSurvey: {
    respondents: 320,
    notFollowSome: 64,
    followFacebook: 33,
    followWebsite: 41,
    readAivoitus: 89,
    preferPrint: 91,
    receiveMemberLetter: 60,
    ageGroup: '51-65v (51% vastaajista)',
    brainInjurySurvivors: 74,
    preferFaceToFace: 75,
  },
  strategyText: `Momentum — Aivovammaliiton viestinnän strateginen työkalu 2026–2027
Versio 1.0, huhtikuu 2026

Viestintä on Aivovammaliiton ydintoimintaa läpileikkaava strateginen funktio. Sen neljä perustehtävää ovat: tiedon lisääminen, vertaisuuden vahvistaminen, voimaantumisen tuki ja näkyvyyden luominen.

Viestintä = kaksisuuntaista merkitysten rakentamista (some, tapahtumat, vertaisryhmät).
Tiedotus = yksisuuntaista tiedon välittämistä (uutiskirjeet, tiedotteet, verkkosivut).

Kohderyhmät: 1) Aivovamman/AVH:n kokeneet 2) Läheiset 3) Ammattilaiset 4) Suuri yleisö. Sävy vaihtelee kohderyhmittäin.

2026 kvartaaliteemat: Q1 Älä anna sen kasvaa — STOP väkivallalle, Q2 Aivoterveyden asialla, Q3 Elämän rytmi, Q4 Toivoa tulevaan.

Kehityshankkeet 2026: visuaalisen ilmeen uudistus (kevät, Jutta Kivilompolo) ja verkkosivupäivitys (syksy).
Valmistelu 2027: uusi viestintästrategia, teemasuunnittelu, mittariston kehittäminen, kanavastrategian tarkennus.`,
};

export const AVL_EVENTS = [
  { id: 1, t: 'Aivoitus-lehti 1/2026: Stop väkivallalle', ch: 'Aivoitus-lehti', date: '2026-02-15', st: 'julkaistu' },
  { id: 2, t: 'Aivoitus-lehti 2/2026: Aivoterveyden asialla', ch: 'Aivoitus-lehti', date: '2026-05-15', st: 'suunniteltu' },
  { id: 3, t: 'Aivoitus-lehti 3/2026: Elämän rytmi', ch: 'Aivoitus-lehti', date: '2026-08-15', st: 'suunniteltu' },
  { id: 4, t: 'Aivoitus-lehti 4/2026: Toivoa tulevaan', ch: 'Aivoitus-lehti', date: '2026-11-15', st: 'suunniteltu' },
  { id: 5, t: 'Uutiskirje 1/2026', ch: 'Uutiskirje', date: '2026-01-15', st: 'julkaistu' },
  { id: 6, t: 'Uutiskirje 2/2026', ch: 'Uutiskirje', date: '2026-03-15', st: 'julkaistu' },
  { id: 7, t: 'Uutiskirje 3/2026', ch: 'Uutiskirje', date: '2026-05-15', st: 'suunniteltu' },
  { id: 8, t: 'Aivoviikko alkaa (vko 11)', ch: 'Facebook', date: '2026-03-09', st: 'julkaistu' },
  { id: 9, t: 'Aivoviikko - IG-sisällöt', ch: 'Instagram', date: '2026-03-09', st: 'julkaistu' },
  { id: 10, t: 'Aivovammatietoisuuden kuukausi alkaa', ch: 'Facebook', date: '2026-03-01', st: 'julkaistu' },
  { id: 11, t: 'Kippista kohtuudella -kampanja', ch: 'Facebook', date: '2026-04-20', st: 'suunniteltu' },
  { id: 12, t: 'Kippista kohtuudella - tapahtumat', ch: 'Messut ja tapahtumat', date: '2026-04-20', st: 'suunniteltu' },
  { id: 13, t: 'Selvänä liikenteessä -kampanja', ch: 'Instagram', date: '2026-05-01', st: 'suunniteltu' },
  { id: 14, t: 'Jäsenkirje tammikuu', ch: 'Jäsenkirje', date: '2026-01-10', st: 'julkaistu' },
  { id: 15, t: 'Jäsenkirje helmikuu', ch: 'Jäsenkirje', date: '2026-02-10', st: 'julkaistu' },
  { id: 16, t: 'Jäsenkirje maaliskuu', ch: 'Jäsenkirje', date: '2026-03-10', st: 'julkaistu' },
  { id: 17, t: 'Jäsenkirje huhtikuu', ch: 'Jäsenkirje', date: '2026-04-10', st: 'suunniteltu' },
];

export const AVL_CHANNEL_STATS = [
  { name: 'Facebook', handle: 'Facebook.com/Aivovammaliitto', followers: 4737, reach: '15.7K', lastUpdated: '2026-04', note: 'Jäsenkyselyssä 33% jäsenistä seuraa. Julkaisutahti: väh. 3x/vko.' },
  { name: 'Instagram', handle: '@aivovammaliitto', followers: 2566, reach: '18.3K', lastUpdated: '2026-04', note: '1281 julkaisua. Väh. 3x/vko. Hashtagit päivitykseen sopivat.' },
  { name: 'LinkedIn', handle: 'Aivovammaliitto', followers: 74, reach: '1.2K', lastUpdated: '2026-04', note: 'Ammattilaiskärjellä. Pieni mutta kasvava.' },
  { name: 'Nettisivut', handle: 'aivovammaliitto.fi', followers: null, reach: '12.8K/kk', lastUpdated: '2026-04', note: '41% jäsenistä seuraa. Uudistus käynnissä.' },
];

// ═══ LLFF ═══

export const LLFF_ORG = {
  name: 'Lapinlahden Elokuvajuhlat', s: 'LLFF', slogan: 'Elokuva tekee hyvää / Cinema Works Wonders',
  orgContext: {
    fullName: 'Lapinlahden Elokuvajuhlat / Lapinlahti Film Festival',
    founded: 2024,
    hq: 'Helsinki, Lapinlahden sairaala-alue',
    association: 'Kino Lapinlahti ry',
    volunteers: 50,
    bilingual: true,
    expansion2026: 'Viikon mittainen festivaali, laajenee alueen elokuvateattereihin, 10 000 kävijätavoite',
    freeEthos: 'Ilmaisuus on festivaalin radikaali perusperuste — elokuva kuuluu kaikille',
  },
  goals: [
    { t: '10 000 kävijää 2026', p: 1 },
    { t: 'Laajentua viikon mittaiseksi festivaaliksi', p: 2 },
    { t: 'Kansainvälinen näkyvyys Nordic Frames -ohjelmistolla', p: 3 },
    { t: 'Kasvattaa Instagram-seuraajia 3000:een', p: 4 },
    { t: 'Rakentaa vahva vapaaehtoisten verkosto', p: 5 },
  ],
  vals: [
    { t: 'Ammattimaisuus', d: 'Toteutetaan vapaaehtoisvoimin mutta näyttäytyy vertaisena ammattilaisfestivaaleille.' },
    { t: 'Tasa-arvo ja monimuotoisuus', d: 'Ilmaisuus purkaa taloudellisia esteitä. Kaikki ovat tervetulleita.' },
    { t: 'Yhteisöllisyys', d: 'Lapinlahden historiallinen ympäristö ja festivaalin yhteisöllinen henki.' },
  ],
  auds: [
    { n: 'Kultainen kulturelli', d: 'Elokuva-alan ammattilaiset ja aktiiviset festivaalikävijät.' },
    { n: 'Normaali kuluttaja', d: 'Elokuvista nauttivat perheet, eläkeläiset, keski-ikäiset.' },
    { n: 'Nuoret ja passiivit (12-29v.)', d: 'Eivät ole löytäneet elokuvafestivaaleja.' },
    { n: 'Noviisit', d: 'Kokemattomia festivaalikävijöitä jotka tulevat läheisen kutsumana.' },
    { n: 'Kansainvälinen yleisö', d: 'Nordic Frames -tekijävieraat, kansainväliset ammattilaiset.' },
  ],
  tone: ['Innostava', 'Lämmin', 'Persoonallinen', 'Asiallinen', 'Kutsuva'],
  channels: [
    { name: 'Instagram', color: '#E1306C', ic: 'IG' },
    { name: 'Facebook', color: '#1877F2', ic: 'FB' },
    { name: 'LinkedIn', color: '#0A66C2', ic: 'LI' },
    { name: 'TikTok', color: '#000000', ic: 'TT' },
    { name: 'Nettisivut', color: '#056b9f', ic: 'WW' },
  ],
  team: [
    { name: 'Anton Baer', role: 'Taiteellinen johtaja', avatar: 'A' },
    { name: 'Svetlana Romanova', role: 'Vastaava tuottaja', avatar: 'S' },
    { name: 'Arttu Uuranmäki', role: 'Viestinnän vastaava', avatar: 'A' },
    { name: 'Siiri Siltala', role: 'Elokuvakuraattori', avatar: 'S' },
    { name: 'Hanna Hovitie', role: 'Nordic Frames -kuraattori', avatar: 'H' },
    { name: 'Anna Lehtonen', role: 'NØW-työpajan vetäjä', avatar: 'A' },
  ],
  strategyText: 'Lapinlahden Elokuvajuhlat (LLFF) on maksuton elokuvafestivaali Helsingissä. Festivaali rakentuu vuosittain vaihtuvan yhteiskunnallisen teeman ympärille. Ilmaisuus on festivaalin radikaali perusperuste — elokuva kuuluu kaikille.',
};

export const LLFF_EVENTS = [
  { id: 101, t: 'Visuaalisen ilmeen suunnittelu', ch: 'Instagram', date: '2026-01-15', st: 'valmis' },
  { id: 102, t: 'Verkkosivujen päivitys 2026', ch: 'Nettisivut', date: '2026-02-01', st: 'suunniteltu' },
  { id: 103, t: 'Nordic Frames -haku aukeaa', ch: 'LinkedIn', date: '2026-02-01', st: 'suunniteltu' },
  { id: 104, t: 'Nordic Frames -haku päättyy', ch: 'LinkedIn', date: '2026-04-01', st: 'suunniteltu' },
  { id: 105, t: 'Ohjelmiston julkaisu', ch: 'Instagram', date: '2026-05-15', st: 'suunniteltu' },
  { id: 106, t: 'Lippuvarauksen avautuminen', ch: 'Facebook', date: '2026-05-20', st: 'suunniteltu' },
  { id: 107, t: 'Päävieraan julkistus', ch: 'Instagram', date: '2026-06-01', st: 'suunniteltu' },
  { id: 108, t: 'Festivaaliviikko alkaa', ch: 'Instagram', date: '2026-08-10', st: 'suunniteltu' },
  { id: 109, t: 'Avajaisnäytös', ch: 'Facebook', date: '2026-08-10', st: 'suunniteltu' },
  { id: 110, t: 'NØW-työpaja alkaa', ch: 'Instagram', date: '2026-08-11', st: 'suunniteltu' },
  { id: 111, t: 'Päätösnäytös + NØW-esitykset', ch: 'Instagram', date: '2026-08-16', st: 'suunniteltu' },
  { id: 112, t: 'Jälkipurku ja raportointi', ch: 'Facebook', date: '2026-09-01', st: 'suunniteltu' },
];

export const LLFF_CHANNEL_STATS = [
  { name: 'Instagram', handle: '@lapinlahtifilmfestival', followers: 1240, reach: '12.4K', lastUpdated: '2026-03' },
  { name: 'Facebook', handle: 'Kino Lapinlahti ry', followers: 890, reach: '8.2K', lastUpdated: '2026-03' },
  { name: 'LinkedIn', handle: 'Kino Lapinlahti', followers: 320, reach: '3.1K', lastUpdated: '2026-03' },
  { name: 'TikTok', handle: '@llff_festival', followers: 580, reach: '22.1K', lastUpdated: '2026-03' },
];

// ── Juhlatoimikunta — Sirpan 70v syntymäpäiväjuhlat ──

export const JUHLATOIMIKUNTA_ORG = {
  name: 'Juhlatoimikunta', s: 'JTK', slogan: 'Sirpan 70-vuotisjuhlien järjestely',
  commsMission: 'Järjestää Sirpalle ikimuistoiset ja lämminhenkiset 70-vuotisjuhlat.',
  contentPillars: [],
  goals: [],
  vals: [],
  auds: [],
  tone: ['Lämminhenkinen', 'Iloinen', 'Juhlallinen'],
  channels: [
    { name: 'WhatsApp', color: '#25D366', ic: 'WA' },
    { name: 'Sähköposti', color: '#6366f1', ic: 'SP' },
  ],
  team: [
    { name: 'Sonja Baer', role: 'Juhlatoimikunnan vetäjä', avatar: 'S' },
    { name: 'Raisa Baer', role: 'Jäsen', avatar: 'R' },
    { name: 'Elina Savo', role: 'Jäsen', avatar: 'E' },
    { name: 'Anton Baer', role: 'Jäsen', avatar: 'A' },
  ],
  strategyText: 'Sirpan 70-vuotissyntymäpäiväjuhlat järjestetään lauantaina 25.4.2026 Tyttöjen talolla Kalliossa (Hämeentie 13 A, 00530 Helsinki). Juhlatoimikunta: Sonja Baer (vetäjä), Raisa Baer, Elina Savo, Anton Baer.',
};

export const JUHLATOIMIKUNTA_EVENTS: any[] = [];
export const JUHLATOIMIKUNTA_CHANNEL_STATS: any[] = [];
