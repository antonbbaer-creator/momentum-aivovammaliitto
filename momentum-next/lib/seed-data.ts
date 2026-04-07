// Seed data for AVL and LLFF communities
// Extracted from the original SPA

export const AVL_ORG = {
  name: 'Aivovammaliitto', s: 'AVL', slogan: 'Aivovauriotietouden levittäminen ja vertaistuki',
  goals: [
    { m: '3x/vko', t: 'Some-näkyvyys (FB+IG)', d: 'Facebook ja Instagram vähintään 3 julkaisua viikossa.', p: 40 },
    { m: '4x/v', t: 'Aivoitus-lehti', d: 'Aivovauriotietouden levittäminen, vertaisuuden ja voimaantumisen kokemukset.', p: 50 },
    { m: '4-6/v', t: 'Uutiskirjeet ammattilaisille', d: 'Tietoutta AVL:n asioista ja aivovaurioihin liittyvistä asioista.', p: 30 },
    { m: '~10/v', t: 'Jäsenkirjeet', d: 'Aivovammaliiton ajankohtaisista asioista jäsenille.', p: 25 },
    { m: 'jatkuva', t: 'Nettisivut aivovammaliitto.fi', d: 'Ajankohtaisen ja luotettavan tiedon lähde.', p: 35 },
    { m: 'jatkuva', t: 'LinkedIn ammattilaiskärjellä', d: 'Ajankohtaisia asioita ja tutkimuksia ammattilaiskärjellä.', p: 20 },
  ],
  vals: [
    { i: 'V', t: 'Vertaisuus', d: 'Voimaantumisen ja vertaistuen kokemukset' },
    { i: 'L', t: 'Luotettavuus', d: 'Tutkittu tieto ja asiantuntijuus' },
    { i: 'S', t: 'Saavutettavuus', d: 'Tieto kaikkien saataville esteettömästi' },
    { i: 'A', t: 'Ajankohtaisuus', d: 'Oikea-aikainen ja relevantti viestintä' },
    { i: 'V', t: 'Vuorovaikutteisuus', d: 'Kaksisuuntaista merkitysten rakentamista' },
  ],
  auds: [
    { n: 'Aivovaurion kokeneet ja läheiset', d: 'Vammautuneet, sairastuneet ja heidän läheisensä.' },
    { n: 'Ammattilaiset', d: 'Sosiaali- ja terveysalan ammattilaiset.' },
    { n: 'Suuri yleisö', d: 'Aivoterveydestä kiinnostuneet, ennaltaehkäisy.' },
    { n: 'Jäsenet', d: 'Nykyiset ja potentiaaliset jäsenet.' },
    { n: 'Media ja päättäjät', d: 'Medioiden lukijat, kansanedustajat ja päättäjät.' },
    { n: 'Nuoret', d: 'Nuoret aivovaurion kokeneet.' },
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
  ],
  team: [
    { name: 'Anton Baer', role: 'Viestintävastaava', avatar: 'A' },
    { name: 'Päivi Hakkarainen', role: 'Toiminnanjohtaja', avatar: 'P' },
    { name: 'Pia Kilpeläinen', role: 'Järjestösihteeri', avatar: 'P' },
    { name: 'Jani Saarinen', role: 'Viestinnän suunnittelija', avatar: 'J' },
  ],
  strategyText: 'Viestintäsuunnitelma 2026 - Aivovammaliitto. Viestintä = kaksisuuntaista merkityksien rakentamista. Tiedotus = yksisuuntaista ajankohtaisen tiedon välittämistä.',
};

export const AVL_EVENTS = [
  { id: 1, t: 'Aivoitus-lehti 1/2026', ch: 'Aivoitus-lehti', date: '2026-02-15', st: 'suunniteltu' },
  { id: 2, t: 'Aivoitus-lehti 2/2026', ch: 'Aivoitus-lehti', date: '2026-05-15', st: 'suunniteltu' },
  { id: 3, t: 'Aivoitus-lehti 3/2026', ch: 'Aivoitus-lehti', date: '2026-08-15', st: 'suunniteltu' },
  { id: 4, t: 'Aivoitus-lehti 4/2026', ch: 'Aivoitus-lehti', date: '2026-11-15', st: 'suunniteltu' },
  { id: 5, t: 'Uutiskirje 1/2026', ch: 'Uutiskirje', date: '2026-01-01', st: 'julkaistu' },
  { id: 6, t: 'Uutiskirje 2/2026', ch: 'Uutiskirje', date: '2026-03-01', st: 'suunniteltu' },
  { id: 7, t: 'Uutiskirje 3/2026', ch: 'Uutiskirje', date: '2026-05-01', st: 'suunniteltu' },
  { id: 8, t: 'Aivoviikko alkaa (vko 11)', ch: 'Facebook', date: '2026-03-09', st: 'suunniteltu' },
  { id: 9, t: 'Aivoviikko - IG-sisällöt', ch: 'Instagram', date: '2026-03-09', st: 'suunniteltu' },
  { id: 10, t: 'Aivovammatietoisuuden kuukausi', ch: 'Facebook', date: '2026-03-01', st: 'suunniteltu' },
  { id: 11, t: 'Kippista kohtuudella -kampanja', ch: 'Facebook', date: '2026-04-20', st: 'suunniteltu' },
  { id: 12, t: 'Selvänä liikenteessä -kampanja', ch: 'Instagram', date: '2026-05-01', st: 'suunniteltu' },
];

export const AVL_CHANNEL_STATS = [
  { name: 'Facebook', handle: '@aivovammaliitto', followers: 4120, reach: '15.7K', lastUpdated: '2026-03-01' },
  { name: 'Instagram', handle: '@aivovammaliitto', followers: 2847, reach: '18.3K', lastUpdated: '2026-03-01' },
  { name: 'LinkedIn', handle: 'Aivovammaliitto ry', followers: 1560, reach: '7.4K', lastUpdated: '2026-03-01' },
  { name: 'YouTube', handle: 'Aivovammaliitto', followers: 890, reach: '4.5K', lastUpdated: '2026-03-01' },
];

export const LLFF_ORG = {
  name: 'Lapinlahden Elokuvajuhlat', s: 'LLFF', slogan: 'Elokuva tekee hyvää / Cinema Works Wonders',
  goals: [
    { t: '10 000 kävijää 2026', p: 1 },
    { t: 'Laajentua viikon mittaiseksi festivaaliksi', p: 2 },
    { t: 'Kansainvälinen näkyvyys Nordic Frames -ohjelmistolla', p: 3 },
    { t: 'Kasvattaa Instagram-seuraajia 3000:een', p: 4 },
    { t: 'Rakentaa vahva vapaaehtoisten verkosto', p: 5 },
  ],
  vals: [
    { t: 'Ammattimaisuus', d: 'Festivaali toteutetaan vapaaehtoisvoimin mutta sen tulee näyttäytyä vertaisena ammattilaisfestivaaleille.' },
    { t: 'Tasa-arvo ja monimuotoisuus', d: 'Ilmaisuus purkaa taloudellisia esteitä. Festivaali on paikka johon kaikki ovat tervetulleita.' },
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
  { id: 103, t: 'Ohjelmiston julkaisu', ch: 'Instagram', date: '2026-05-15', st: 'suunniteltu' },
  { id: 104, t: 'Lippuvarauksen avautuminen', ch: 'Facebook', date: '2026-05-20', st: 'suunniteltu' },
  { id: 105, t: 'Päävieraan julkistus', ch: 'Instagram', date: '2026-06-01', st: 'suunniteltu' },
  { id: 106, t: 'Nordic Frames -haku aukeaa', ch: 'LinkedIn', date: '2026-02-01', st: 'suunniteltu' },
  { id: 107, t: 'Nordic Frames -haku päättyy', ch: 'LinkedIn', date: '2026-04-01', st: 'suunniteltu' },
  { id: 108, t: 'Festivaaliviikko alkaa', ch: 'Instagram', date: '2026-08-10', st: 'suunniteltu' },
  { id: 109, t: 'Avajaisnäytös', ch: 'Facebook', date: '2026-08-10', st: 'suunniteltu' },
  { id: 110, t: 'NØW-työpaja alkaa', ch: 'Instagram', date: '2026-08-11', st: 'suunniteltu' },
  { id: 111, t: 'Päätösnäytös + NØW-esitykset', ch: 'Instagram', date: '2026-08-16', st: 'suunniteltu' },
  { id: 112, t: 'Festivaalin jälkipurku ja raportointi', ch: 'Facebook', date: '2026-09-01', st: 'suunniteltu' },
];

export const LLFF_CHANNEL_STATS = [
  { name: 'Instagram', handle: '@lapinlahtifilmfestival', followers: 1240, reach: '12.4K', lastUpdated: '2026-03-01' },
  { name: 'Facebook', handle: 'Kino Lapinlahti ry', followers: 890, reach: '8.2K', lastUpdated: '2026-03-01' },
  { name: 'LinkedIn', handle: 'Kino Lapinlahti', followers: 320, reach: '3.1K', lastUpdated: '2026-03-01' },
  { name: 'TikTok', handle: '@llff_festival', followers: 580, reach: '22.1K', lastUpdated: '2026-03-01' },
];
