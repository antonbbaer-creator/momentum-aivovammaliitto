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

  // ═══ SISÄLTÖPILARIT (ohjaavat kaikkea viestintää) ═══
  contentPillars: [
    { id: 'tietoisuus', name: 'Tietoisuus', desc: 'Aivovauriotietous, näkymätön vamma, avainluvut, tutkimustieto. Tavoite: ihmiset ymmärtävät mitä aivovaurio tarkoittaa.', color: '#056b9f' },
    { id: 'vertaistuki', name: 'Vertaistuki', desc: 'Tarinat toivosta, Toivo-sovellus, yhteisö, elämä jatkuu. Tavoite: kukaan ei jää yksin.', color: '#185e5b' },
    { id: 'ennaltaehkaisy', name: 'Ennaltaehkäisy', desc: 'Alkoholi, liikenneturvallisuus, aivoterveys, kypäräkampanjat. Tavoite: vammojen määrä vähenee.', color: '#f1b434' },
    { id: 'vaikuttaminen', name: 'Vaikuttaminen', desc: 'Kannanotot, lakialoitteet, yhdenvertaisuus, kuntoutusoikeudet. Tavoite: rakenteet muuttuvat.', color: '#e45c81' },
    { id: 'yhteiso', name: 'Yhteisö', desc: 'Jäsentarinat, tapahtumat, webinaarit, vapaaehtoisuus. Tavoite: aktiivinen ja kasvava yhteisö.', color: '#9b7cf6' },
  ],

  // ═══ 2026 ERITYISHUOMIOT ═══
  currentContext: {
    expansion: 'AVL laajentunut 1.1.2026 kattamaan myös aivoverenkiertohäiriöt (AVH) ja muut aivovauriot. Mahdollinen nimenmuutos valmistelussa.',
    steaCuts: 'STEA-avustukset pienenevät ~30M€ vuonna 2026. Viestinnän pitää priorisoida ja osoittaa vaikuttavuutta.',
    accessibility: 'Digipalvelulain saavutettavuusvaatimukset kiristyvät 28.6.2025. Erityisen tärkeää koska kohderyhmässä kognitiivisia haasteita.',
    elections2027: 'Eduskuntavaalit 2027 — vaikuttamisviestintä aloitettava 2026. Kuntoutus, palvelut, yhdenvertaisuus.',
    nameChange: 'Mahdollinen nimenmuutos tulossa liittyen AVH-laajennukseen. Viestinnällisesti iso projekti joka vaikuttaa kaikkiin kanaviin.',
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
  goals: [
    { m: '3x/vko', t: 'Some-näkyvyys (FB+IG)', d: 'Facebook ja Instagram vähintään 3 julkaisua viikossa. Loma-ajoille ajastetaan neutraalia materiaalia. Säännöllisyys, oikea-aikaisuus, sisältö ja sitoutumiseen panostus. Mittarit: tykkääjämäärä, tavoitetut, sitoutetut.', p: 40 },
    { m: '4x/v', t: 'Aivoitus-lehti', d: 'Aivovauriotietouden levittäminen, vertaisuuden ja voimaantumisen kokemukset, tutkimustieto. Vastuuhenkilö: päätoimittaja. 2026 teemat: 1) Stop väkivallalle 2) Aivoterveyden asialla 3) Elämän rytmi 4) Toivoa tulevaan.', p: 50 },
    { m: '4-6/v', t: 'Uutiskirjeet ammattilaisille', d: 'Tietoutta AVL:n asioista ja aivovaurioihin liittyvistä ajankohtaisista asioista tiiviisti. Ohjaa linkeillä verkkosivuille. Vastuuhenkilö: viestintävastaava.', p: 30 },
    { m: '~10/v', t: 'Jäsenkirjeet', d: 'Aivovammaliiton ajankohtaisista asioista jäsenille joiden sähköposti on tiedossa. Vastuuhenkilö: järjestösihteeri.', p: 25 },
    { m: 'jatkuva', t: 'Nettisivut aivovammaliitto.fi', d: 'Ajankohtaisen ja luotettavan tiedon lähde. Uudistus käynnissä. Jäsenkyselyssä 41% jäsenistä seuraa.', p: 35 },
    { m: 'jatkuva', t: 'LinkedIn ammattilaiskärjellä', d: 'Ajankohtaisia asioita ja tutkimuksia ammattilaiskärjellä. Vastuuhenkilö: viestintävastaava + toiminnanjohtaja.', p: 20 },
    { m: 'jatkuva', t: 'Tapahtumat ja webinaarit', d: 'Suuri yleisö: Kippista kohtuudella, kouluvierailut. Ammattilaiset: webinaarit, Sairaanhoitajapäivät. Aivovaurion kokeneet: Ensitietopäivät.', p: 30 },
    { m: 'tarpeen mukaan', t: 'Lehdistötiedotteet ja vaikuttaminen', d: 'Lehdistötiedotteita medioille, kannanottoja kansanedustajille, lausuntoja lakivalmisteluista.', p: 15 },
    { m: 'tarpeen mukaan', t: 'TikTok ja YouTube', d: 'TikTok: aivovauriotietoutta tunteella, kokemustoimijat. YouTube: webinaarit tekstitettyinä.', p: 10 },
    { m: 'jatkuva', t: 'Esitteet', d: 'Aivovauriotietoutta vastavammautuneille, läheisille ja ammattilaisille.', p: 20 },
  ],
  vals: [
    { i: 'V', t: 'Vertaisuus', d: 'Voimaantumisen ja vertaistuen kokemukset' },
    { i: 'L', t: 'Luotettavuus', d: 'Tutkittu tieto ja asiantuntijuus' },
    { i: 'S', t: 'Saavutettavuus', d: 'Tieto kaikkien saataville esteettömästi' },
    { i: 'A', t: 'Ajankohtaisuus', d: 'Oikea-aikainen ja relevantti viestintä' },
    { i: 'V', t: 'Vuorovaikutteisuus', d: 'Kaksisuuntaista merkitysten rakentamista' },
  ],
  auds: [
    { n: 'Aivovaurion kokeneet ja läheiset', d: 'Vammautuneet, sairastuneet ja heidän läheisensä. Erityisesti vastavammautuneet.', c: ['Facebook', 'Instagram', 'Nettisivut', 'Aivoitus-lehti', 'Esitteet', 'TikTok', 'YouTube'] },
    { n: 'Ammattilaiset', d: 'Sosiaali- ja terveysalan ammattilaiset. Tavoitetaan uutiskirjeillä, webinaareilla, LinkedIn-sisällöillä.', c: ['LinkedIn', 'Uutiskirje', 'Nettisivut', 'Esitteet'] },
    { n: 'Suuri yleisö', d: 'Aivoterveydestä kiinnostuneet, ennaltaehkäisy. Kippista kohtuudella -kampanja, kouluvierailut.', c: ['Facebook', 'Instagram', 'TikTok', 'Messut ja tapahtumat'] },
    { n: 'Jäsenet', d: 'Nykyiset ja potentiaaliset jäsenet joiden sähköposti on tiedossa.', c: ['Jäsenkirje', 'Facebook', 'Nettisivut'] },
    { n: 'Media ja päättäjät', d: 'Medioiden lukijat, kansanedustajat ja päättäjät.', c: ['Lehdistötiedotteet'] },
    { n: 'Nuoret', d: 'Nuoret aivovaurion kokeneet 18-35v. @aivovammanuoret Instagram, TikTok.', c: ['Instagram', 'TikTok'] },
  ],
  tone: ['Asiallinen', 'Empaattinen', 'Rohkaiseva', 'Selkeä', 'Luotettava', 'Lämmin'],
  channels: [
    { name: 'Facebook', color: '#1877F2', ic: 'FB' },
    { name: 'Instagram', color: '#E1306C', ic: 'IG' },
    { name: 'LinkedIn', color: '#0A66C2', ic: 'LI' },
    { name: 'TikTok', color: '#00f2ea', ic: 'TT' },
    { name: 'YouTube', color: '#FF0000', ic: 'YT' },
    { name: 'Nettisivut', color: '#34d399', ic: 'WW' },
    { name: 'Uutiskirje', color: '#fb923c', ic: 'UK' },
    { name: 'Jäsenkirje', color: '#f5c542', ic: 'JK' },
    { name: 'Aivoitus-lehti', color: '#9b7cf6', ic: 'AL' },
    { name: 'Messut ja tapahtumat', color: '#e879a8', ic: 'MT' },
    { name: 'Lehdistötiedotteet', color: '#4ad8d8', ic: 'LT' },
    { name: 'Esitteet', color: '#ef6b6b', ic: 'ES' },
  ],
  team: [
    { name: 'Pia Kilpeläinen', role: 'Viestintävastaava / Aivoitus-lehden päätoimittaja', avatar: 'P', desc: 'Viestinnän koordinointi, Aivoitus-lehden päätoimittaja, jäsenkirjeet, nettisivujen päivitykset, tapahtumajärjestelyt.' },
    { name: 'Anton Baer', role: 'Viestinnän suunnittelija', avatar: 'A', desc: 'Visuaalisen viestinnän kehittäminen, nettisivujen ilme ja uudistus, esitteiden taitto, YouTube-videot, Momentum-alustan kehitys.' },
    { name: 'Jani Saarinen', role: 'Sisällöntuottaja', avatar: 'J', desc: 'Sosiaalisen median sisällöntuotanto (Facebook, Instagram, TikTok), somekanavien analytiikka, sisältökalenterin ylläpito.' },
    { name: 'Päivi Hakkarainen', role: 'Toiminnanjohtaja', avatar: 'P', desc: 'LinkedIn-sisällöt, lehdistötiedotteet, kannanotot, lausunnot, kriisiviestinnän vastuuhenkilö, vaikuttamisviestintä.' },
  ],
  // Key messages for AI context
  keyMessages: [
    { title: 'Näkymätön vamma', desc: 'Aivovaurion kognitiiviset oireet ovat näkymättömiä, mikä tekee ymmärtämisestä vaikeaa jopa läheisille. #nakymattonnäkyväksi', theme: 'tietoisuus' },
    { title: 'Vaikuttavuuden laajuus', desc: 'Äkillinen aivovaurio koskettaa jopa miljoonaa suomalaista. 200 000 elää seurausten kanssa.', theme: 'vaikuttaminen' },
    { title: 'Ennaltaehkäisy', desc: '~50% aivovammoista tapahtuu alkoholin vaikutuksen alaisena. Kypärän käyttö ja turvallinen liikenne ehkäisevät.', theme: 'ennaltaehkäisy' },
    { title: 'Elämä jatkuu', desc: 'Toipuminen ja mielekäs elämä ovat mahdollisia aivovaurion jälkeen. Tarinat toivosta. elamajatkuu.fi', theme: 'vertaistuki' },
    { title: 'Aivoterveys kaikille', desc: 'Ennaltaehkäisy, varhainen tunnistaminen ja oikea-aikainen kuntoutus.', theme: 'terveys' },
    { title: 'Laajentunut missio 2026', desc: 'Nyt myös AVH ja muut aivovauriot. 36 000 + 25 000 = yli 60 000 uutta tapausta vuodessa.', theme: 'organisaatio' },
    { title: 'Yhdenvertaisuus', desc: 'Aivovaurion kokeneiden yhdenvertainen ja omatoiminen osallistuminen yhteiskuntaan.', theme: 'vaikuttaminen' },
    { title: 'Vertaistuen saavutettavuus', desc: 'Tukea pitää olla saatavilla sijainnista riippumatta. Toivo-sovellus, verkkovertaisryhmät.', theme: 'vertaistuki' },
  ],
  // Annual campaigns
  campaigns: [
    { name: 'Aivoviikko / Brain Awareness Week', month: 3, desc: 'Kansainvälinen aivoviikko (vko 11). Ilmaisia luentoja, sairaaloiden näyttelyt.', channels: ['Facebook', 'Instagram', 'Nettisivut', 'Messut ja tapahtumat'] },
    { name: 'Aivovammatietoisuuden kuukausi', month: 3, desc: 'Koko maaliskuu. Tietoisuuskampanja sosiaalisessa mediassa.', channels: ['Facebook', 'Instagram', 'TikTok', 'Nettisivut'] },
    { name: 'Kippista kohtuudella', month: 4, desc: 'Ennen vappua. EHYT ry:n kanssa. Alkoholin kohtuukäyttö, ennaltaehkäisy.', channels: ['Facebook', 'Instagram', 'Messut ja tapahtumat', 'Lehdistötiedotteet'] },
    { name: 'Selvänä liikenteessä', month: 5, desc: 'Liikenneturvallisuuskampanja EHYT ry:n kanssa. Nuoret aikuiset.', channels: ['Instagram', 'TikTok', 'Facebook'] },
    { name: 'Elämä jatkuu -kampanja', month: null, desc: 'Jatkuva. Lähettilaspohjainen tarinakampanja. elamajatkuu.fi', channels: ['Facebook', 'Instagram', 'Nettisivut', 'YouTube'] },
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
  strategyText: `Viestintäsuunnitelma 2026 - Aivovammaliitto
Päivitetty 3.3.2026
Työryhmä: Anton Baer, Päivi Hakkarainen, Pia Kilpeläinen, Jani Saarinen

Viestintä = kaksisuuntaista merkityksien rakentamista – lähettäjä ja vastaanottaja ovat vuorovaikutuksessa.
Tiedotus = yksisuuntaista ajankohtaisen tiedon välittämistä.

1. ULKOINEN VIESTINTÄ: Aivoitus, Facebook, Instagram, TikTok, YouTube, LinkedIn, messut ja tapahtumat
2. ULKOINEN TIEDOTUS: nettisivut, lehdistötiedotteet, esitteet, uutiskirje, jäsenkirje
3. SISÄINEN VIESTINTÄ: sähköposti (ensisijainen), puhelu (kiireelliset), WhatsApp (epävirallinen)
4. KRIISIVIESTINTÄ: erillinen suunnitelma, vastuuhenkilö toiminnanjohtaja

Laajennus 2026: AVL kattaa nyt myös AVH:n ja muut aivovauriot. Yli 60 000 uutta tapausta vuodessa.`,
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
