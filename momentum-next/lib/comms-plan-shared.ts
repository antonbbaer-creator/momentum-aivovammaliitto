// Viestintäsuunnitelma — LLFF 2026
// Yhteinen datamalli viestintäsuunnitelmalle: mitä viestitään, miten, kuka vastaa.
// Käytössä Viestintä-hubin Suunnitelma-välilehdellä ja tyhjän kuukauden varoituksissa.
//
// Sisältää myös:
//   - LLFF_2025_REFERENCE: historialliset viikkoittaiset julkaisut vuodelta 2025 (Arttu Uuranmäki / PDF-kalenteri)
//   - LLFF_2025_NOTES: Arttu:n onboarding-kirjoitus uudelle viestinnän vastaavalle
//   - LLFF_2025_IMPROVEMENTS: Arttu:n parannusehdotukset vuodelle 2026

export type MilestoneStatus = 'upcoming' | 'inprogress' | 'done' | 'late';

export interface CommsMilestone {
  id: string;
  title: string;
  date: string;              // ISO YYYY-MM-DD
  ownerId?: string;          // OrgTeamMember.id
  status: MilestoneStatus;
  description?: string;
  category: 'visual' | 'launch' | 'publish' | 'production' | 'festival' | 'post';
}

export interface CommsMonthTarget {
  month: number;             // 1-12
  postsMin: number;
  postsMax: number;
  channels: string[];
  focus: string;             // lyhyt kuvaus painotuksesta
  intensity: 'low' | 'medium' | 'high' | 'peak';
}

export interface CommsContentPillar {
  id: string;
  label: string;
  weekday: 'Ma' | 'Ti' | 'Ke' | 'To' | 'Pe' | 'La' | 'Su';
  platforms: string[];
  ownerRole: string;         // rooli tiimissä (ei henkilö-id)
  description: string;
}

// ============================================================
// 2026-strategian laajennokset — kestävä, ei-vanhentuva data
// ============================================================

export interface StrategicMove {
  id: string;
  order: number;             // 1, 2, 3
  title: string;             // "Videolähtöisyys"
  tagline: string;           // lyhyt selkeä lause
  description: string;       // konkreettinen perustelu
  icon: string;              // unicode-symboli
  color: string;             // aksenttiväri
}

export interface CommsKpi {
  id: string;                // T1..T6
  label: string;             // "Kävijämäärä"
  target: string;            // "5000"
  baseline?: string;         // "2025: 4500"
  measurement: string;       // kuinka mitataan
  category: 'audience' | 'partners' | 'volunteers' | 'reach' | 'novice' | 'access';
}

export interface AudienceSegment {
  id: string;
  label: string;             // "Kultainen kulturelli"
  weight2025: number;        // prosentti
  weight2026: number;
  trend: 'up' | 'down' | 'flat';
  description: string;
}

export type CampaignType =
  | 'brand-awareness'
  | 'recruitment'
  | 'launch'
  | 'program-reveal'
  | 'partnership'
  | 'audience-expansion'
  | 'brand-storytelling'
  | 'conversion'
  | 'live-coverage'
  | 'post-event'
  | 'cross-festival';

export interface Campaign {
  id: string;                // CAMPAIGN_01..12
  order: number;
  title: string;
  type: CampaignType;
  audience: string;
  channels: string[];
  formats: string[];
  tone: string;
  phaseId: string;           // linkki PhaseDescriptoriin
  cta?: string;
  note?: string;
}

export interface PhaseDescriptor {
  id: string;                // phase-1..7
  order: number;
  title: string;             // "Valmistelu ja brändin päivitys"
  months: string;            // "Tammi-maaliskuu"
  monthRange: number[];      // [1,2,3]
  focus: string;
  channels: string;
}

export interface ChannelMatrixRow {
  id: string;
  name: string;              // "Instagram Feed"
  function: string;
  frequency: string;
  primaryAudience: string;
  responsible: string;
  isNew2026?: boolean;
}

export interface BrandPillar {
  id: string;
  title: string;
  subtitle: string;          // englanninkielinen
  description: string;
}

export interface CommsPlan {
  id: string;
  year: number;
  festivalName: string;
  festivalDates: string;
  summary: string;
  // 2026-strategia: johdon tiivistelmä
  mission: string;
  visitorGoal: number;
  visitorBaseline: number;
  volunteerGoal: number;
  volunteerBaseline: number;

  responsibleMemberId: string;      // Lasse
  responsibleTeamId: string;        // viestinta
  activeFrom: string;               // ISO — milloin aktiivinen viestintä alkaa
  visualIdentityDeadline: string;   // ISO — milloin grafiikka oltava valmiina
  kickoffNote: string;

  strategicMoves: StrategicMove[];
  kpis: CommsKpi[];
  audienceMix: AudienceSegment[];
  brandPillars: BrandPillar[];

  milestones: CommsMilestone[];
  monthTargets: CommsMonthTarget[];
  phases: PhaseDescriptor[];
  campaigns: Campaign[];
  channelMatrix: ChannelMatrixRow[];
  contentPillars: CommsContentPillar[];
  channels: string[];
  updatedAt?: number;
}

// ============================================================
// LLFF 2026 — oletussuunnitelma
// ============================================================

export const DEFAULT_LLFF_2026_PLAN: CommsPlan = {
  id: 'llff-2026-commsplan',
  year: 2026,
  festivalName: 'Lapinlahden Elokuvajuhlat 2026',
  festivalDates: '20.-26.8.2026',
  summary:
    'LLFF 2026 -festivaalin viestintästrategia rakentuu kolmen strategisen siirron varaan: ' +
    'videolähtöisyys, Hetki Momentum -integraatio ja noviisiyleisön tavoittelu. ' +
    'Tavoitteena 5000 kävijää ja vahvistettu "Elokuva tekee hyvää / Cinema Works Wonders" -brändi.',

  mission:
    'Viestinnän tehtävä on saada 5000 kävijää Lapinlahden elokuvajuhlille 2026 ja vahvistaa festivaalin ' +
    'brändiä "Elokuva tekee hyvää / Cinema Works Wonders".',
  visitorGoal: 5000,
  visitorBaseline: 4500,
  volunteerGoal: 70,
  volunteerBaseline: 52,

  responsibleMemberId: 'lasse',
  responsibleTeamId: 'viestinta',
  activeFrom: '2026-05-01',
  visualIdentityDeadline: '2026-05-01',
  kickoffNote:
    'Viestinnän vastaa Lars "Lasse" Hulden yhdessä Viestinnän Tiimin kanssa (Jutta AD:na). ' +
    'Kolme strategista siirtoa: videolähtöisyys, Hetki Momentum -integraatio, noviisiyleisön tavoittelu. ' +
    'Visuaalisen ilmeen oltava valmiina 1.5.2026 mennessä — ennen aktiivista julkaisuvaihetta.',

  strategicMoves: [
    {
      id: 'move-video',
      order: 1,
      title: 'Videolähtöisyys',
      tagline: 'Reels, TikTok ja Stories osaksi perusrytmiä — ei vain viime viikolle.',
      description:
        '2025 "Get to know X" -reel-sarja toimi mutta käytettiin vasta festivaaliviikolla. ' +
        '2026 laajennetaan 4 viikon kampanjaksi jo heinäkuussa. Reels 2/viikko ja TikTok 2/viikko kesä-elo.',
      icon: '▶',
      color: '#e45c81',
    },
    {
      id: 'move-hetki',
      order: 2,
      title: 'Hetki Momentum -integraatio',
      tagline: 'Yksi työkalu: suunnittelu, hyväksyntä ja julkaisu saman katon alla.',
      description:
        'Eliminoi Canva-Drive-Slack -hajontaa, joka söi 2025 johtajan aikaa. ' +
        'Templaatit valmiina jo huhtikuussa — ei touko-kesäkuussa niin kuin 2025.',
      icon: '◉',
      color: '#9b7cf6',
    },
    {
      id: 'move-novices',
      order: 3,
      title: 'Noviisien tavoittelu',
      tagline: 'Oma viestinnän vertikaali ihmisille jotka eivät löydä festivaaleille muuten.',
      description:
        'Uusi CAMPAIGN_07 heinäkuussa: "Ensimmäistä kertaa elokuvafestivaalilla?" -sisältösarja. ' +
        '20 sekunnin Reels-klipit, "Tuo kaveri mukaan" -vetovoima, FAQ-carouselit ja tutorial-sisältö.',
      icon: '★',
      color: '#2a8a86',
    },
  ],

  kpis: [
    { id: 'T1', label: 'Kävijämäärä',             target: '5000',   baseline: '2025: 4500', measurement: 'Oviajastimet + lipunvaraustilastot festivaaliviikolla.', category: 'audience' },
    { id: 'T2', label: 'Uudet kumppanit',         target: '≥ 3',    baseline: '2025 sponsorit',                   measurement: 'Uusien sponsorien/kumppanien määrä vs. 2025.', category: 'partners' },
    { id: 'T3', label: 'Vapaaehtoiset',           target: '≥ 70',   baseline: '2025: ~52',                        measurement: 'Aktiiviset vapaaehtoiset rekisterissä.',          category: 'volunteers' },
    { id: 'T4', label: 'IG-seuraajat & media',    target: '+25 %',  baseline: '+ ≥ 8 medianostoa',                measurement: 'IG-seuraajien kasvu ja medianostojen määrä.',     category: 'reach' },
    { id: 'T5', label: 'Ensikertalaisten osuus',  target: '≥ 35 %', baseline: 'Uusi 2026',                        measurement: 'Kävijäkyselyllä festivaaliviikon aikana.',        category: 'novice' },
    { id: 'T6', label: 'Saavutettavuus',          target: '100 %',  baseline: 'Epäsäännöllistä 2025',             measurement: 'Kaikki kuvat alt-tekstillä, kaikki reelit tekstitettyjä.', category: 'access' },
  ],

  audienceMix: [
    {
      id: 'aud-kulturelli',
      label: 'Kulttuuriaktiivit',
      weight2025: 30, weight2026: 18, trend: 'down',
      description:
        '18+ v. — kaikenikäiset joille elokuva ja taide ovat keskiössä. Lukevat HS Kulttuurin, käyvät Kiasmassa, Andorrassa, Docpointissa, Rakkautta & Anarkiaa -festareilla. ' +
        'Opiskelijasta eläkeläiseen: yhdistävä tekijä on kulttuurinen uteliaisuus, ei ikä. Tuntevat LLFF:n jo — pidetään yllä mutta ei enää painoteta.',
    },
    {
      id: 'aud-normaali',
      label: 'Kaupunkitapahtuman etsijät',
      weight2025: 30, weight2026: 28, trend: 'flat',
      description:
        'Kaiken ikäiset helsinkiläiset joille elokuva ei ole kärki — he etsivät hyvää kaupunkitapahtumaa kesäkuukaudelle. ' +
        'Tulevat Lapinlahteen tunnelman, ulkoalueen, ystävien ja ruoka/juoma-tarjonnan takia. Löytävät tapahtumat.hel.fi:stä, Facebookista ja kaupunkikuvasta (julisteet, flaijerit).',
    },
    {
      id: 'aud-nuoret',
      label: 'Nuoret (14-29)',
      weight2025: 20, weight2026: 22, trend: 'up',
      description:
        'Yläkoulu-ikäisistä nuoriin työelämässä oleviin. Eivät koe elokuvafestivaaleja "omakseen" — festarit tuntuvat eliitin jutulta tai liian virallisilta. ' +
        'Käyttävät TikTokia, Instagramia ja Jodelia. Tavoitetaan Reels + TikTok, kaverimaisella sävyllä ja "tuo kaveri" -impulssilla. Ikäraja K-12 / K-16 -elokuvissa huomioitava.',
    },
    {
      id: 'aud-noviisit',
      label: 'Ensikertalaiset festareilla',
      weight2025: 20, weight2026: 22, trend: 'up',
      description:
        'Ihmiset jotka eivät ole koskaan käyneet elokuvafestivaalilla — pitävät elokuvista mutta kokevat festarit "eliitin jutuksi" tai pelottavan virallisina. ' +
        'Tarvitsevat "Ensimmäistä kertaa?" -FAQ:n, selkeän vieraanvaraisen sävyn ja kaveri-impulssin ("tuo kaveri mukaan").',
    },
    {
      id: 'aud-ammattilaiset',
      label: 'Elokuva-alan ammattilaiset',
      weight2025: 0, weight2026: 10, trend: 'up',
      description:
        'Ohjaajat, tuottajat, kuraattorit, kriitikot ja elokuvaopiskelijat. Erityisesti Nordic Frames -sarjasta kiinnostuneet pohjoismaiset tekijät. ' +
        'Tavoitetaan LinkedInissä, lehdistötiedotteilla ja cross-festival-yhteistyöllä (Docpoint, Tampere, R&A). ' +
        'Heille LLFF on verkostoitumisen ja ammatillisen näkyvyyden paikka.',
    },
  ],

  brandPillars: [
    { id: 'pillar-pro',       title: 'Ammattimaisuus',            subtitle: 'Professionalism',     description: 'Kuratoitu ohjelmisto, laadukas visuaalinen ilme, ammattimainen viestintä.' },
    { id: 'pillar-equality',  title: 'Tasa-arvo ja monimuotoisuus', subtitle: 'Equality & Diversity', description: 'Moniääninen ohjelmisto, saavutettava viestintä, kaikille avoin tila.' },
    { id: 'pillar-community', title: 'Yhteisöllisyys ja yksinäisyys', subtitle: 'Community & Solitude', description: 'Yhdessäolo ja henkilökohtainen kokemus elokuvan ympärillä.' },
  ],

  milestones: [
    {
      id: 'ms-strategy',
      title: 'Viestintästrategia ja vuoden aikataulutus',
      date: '2026-03-31',
      ownerId: 'lasse',
      status: 'upcoming',
      description: 'Vuoden strategia, sisältöpilarit ja vapaaehtoisten rekrytointisuunnitelma valmiina. (Arttu 2025: "lähinnä suunnittelua, n. 0-8 h/vko")',
      category: 'production',
    },
    {
      id: 'ms-visual',
      title: 'Visuaalinen brändi-ilme valmiina',
      date: '2026-05-01',
      ownerId: 'jutta',
      status: 'upcoming',
      description: 'Jutta AD:na kantaa päävastuun visuaalisen ilmeen suunnittelusta ja osin toteutuksesta läpi festivaalin. Juliste + templaatit + brändielementit käytössä.',
      category: 'visual',
    },
    {
      id: 'ms-templates',
      title: 'Some-templatet ja materiaalit valmiina',
      date: '2026-05-15',
      ownerId: 'jutta',
      status: 'upcoming',
      description: 'IG/FB-postauspohjat, tarinapohjat, ohjelmisto-templatet ja sponsorikortit valmiina. Viestinnän rakenteet pystyssä.',
      category: 'visual',
    },
    {
      id: 'ms-website',
      title: 'Nettisivut päivitetty ja ohjelmistovarauksen rakenne valmiina',
      date: '2026-05-25',
      ownerId: 'lasse',
      status: 'upcoming',
      description: 'Nettisivut tukevat pitkiä elokuvakuvauksia, ohjelmistosivua, ohjelman muutosten pikaviestintää ja lippuvarausjärjestelmää.',
      category: 'production',
    },
    {
      id: 'ms-active',
      title: 'Aktiivinen some-viestintä alkaa',
      date: '2026-05-04',
      ownerId: 'lasse',
      status: 'upcoming',
      description: 'Ensimmäiset lämmittelypostaukset. 2-3 julkaisua/viikko, IG + FB. Teaser-sisältöjä ennen hard launchia.',
      category: 'publish',
    },
    {
      id: 'ms-hardlaunch',
      title: 'Hard launch: juliste + ensimmäiset ohjelmistojulkistukset',
      date: '2026-06-02',
      ownerId: 'lasse',
      status: 'upcoming',
      description: 'Julisteen paljastus ja ensimmäiset ohjelmistojulkistukset (useita elokuvia yhdessä postauksessa, ei yksi kerrallaan). IG/FB/LI.',
      category: 'launch',
    },
    {
      id: 'ms-catalog',
      title: 'Sähköinen festivaalikatalogi valmiina',
      date: '2026-07-15',
      ownerId: 'jutta',
      status: 'upcoming',
      description: 'Instagramissa jaettava sähköinen ohjelmakatalogi (vrt. Karhupuisto Film Festival). Sisältää koko ohjelmiston yhdellä silmäyksellä.',
      category: 'visual',
    },
    {
      id: 'ms-volunteers',
      title: 'Vapaaehtoisten rekrytointi festariviikonloppuun',
      date: '2026-07-01',
      ownerId: 'lasse',
      status: 'upcoming',
      description: 'Call for volunteers IG + FB. (Arttu 2025: julkaistiin Week 26 alussa)',
      category: 'production',
    },
    {
      id: 'ms-tickets',
      title: 'Lippuvaraukset avautuvat',
      date: '2026-08-10',
      ownerId: 'lasse',
      status: 'upcoming',
      description: 'Ticket booking opens — iso IG/FB-julkistus. (Arttu 2025: Week 33 Monday)',
      category: 'launch',
    },
    {
      id: 'ms-final-program',
      title: 'Lopullinen ohjelmisto julkistettu',
      date: '2026-08-15',
      ownerId: 'lasse',
      status: 'upcoming',
      description: 'Viimeiset ohjelmistopaljastukset + käytännönasioiden viestintä + Holvi-verkkokauppa tukituotteille.',
      category: 'launch',
    },
    {
      id: 'ms-festival',
      title: 'Festivaaliviikko 20.-26.8.2026',
      date: '2026-08-20',
      ownerId: 'lasse',
      status: 'upcoming',
      description: 'Päivittäinen festivaalisisältö: ohjelma, tapahtumat, live-raportointi, "get to know team" -reelit. Arttu 2025: +12 h per festivaalipäivä.',
      category: 'festival',
    },
    {
      id: 'ms-post',
      title: 'Kiitokset ja jälkiviestintä',
      date: '2026-08-30',
      ownerId: 'lasse',
      status: 'upcoming',
      description: 'Thank you -postaukset, tulevien tapahtumien teaser (Docpoint näkyvyys joulukuussa, Tampere-haku).',
      category: 'post',
    },
  ],

  monthTargets: [
    { month: 1,  postsMin: 0, postsMax: 1, channels: ['Instagram','Facebook'], focus: 'Strategia ja suunnittelu — ei aktiivista julkaisemista.', intensity: 'low' },
    { month: 2,  postsMin: 0, postsMax: 1, channels: ['Instagram','Facebook'], focus: 'Strategia ja suunnittelu — ei aktiivista julkaisemista.', intensity: 'low' },
    { month: 3,  postsMin: 0, postsMax: 1, channels: ['Instagram','Facebook'], focus: 'Strategia ja suunnittelu — ei aktiivista julkaisemista.', intensity: 'low' },
    { month: 4,  postsMin: 0, postsMax: 2, channels: ['Instagram','Facebook','LinkedIn'], focus: 'Open call workshops + installations. Templaatit viimeistelyssä.', intensity: 'low' },
    { month: 5,  postsMin: 8, postsMax: 12, channels: ['Instagram','Facebook'], focus: 'Aktiivinen viestintä alkaa. 2-3 julkaisua/vko. Teaserit + kumppanuudet + vapaaehtoiskutsut.', intensity: 'medium' },
    { month: 6,  postsMin: 12, postsMax: 20, channels: ['Instagram','Facebook','LinkedIn'], focus: 'Hard launch kesäkuun alussa. Juliste + ensimmäiset ohjelmistot yhteisjulkaisuina. 3-5/vko.', intensity: 'high' },
    { month: 7,  postsMin: 16, postsMax: 24, channels: ['Instagram','Facebook'], focus: 'Ohjelmistopaljastukset + sponsorit + workshopit + musiikit. 4-5 julkaisua/vko. Sähköinen katalogi julki.', intensity: 'high' },
    { month: 8,  postsMin: 24, postsMax: 40, channels: ['Instagram','Facebook'], focus: 'Festivaalikuukausi. Lipunmyynti avautuu, viimeiset julkistukset, festivaaliviikko 20.-26.8 päivittäin.', intensity: 'peak' },
    { month: 9,  postsMin: 2, postsMax: 4,   channels: ['Instagram','Facebook'], focus: 'Kiitokset + festivaalin jälkikäteiskommunikaatio.', intensity: 'low' },
    { month: 10, postsMin: 0, postsMax: 1,   channels: ['Instagram','Facebook'], focus: 'Lepo / retro.', intensity: 'low' },
    { month: 11, postsMin: 0, postsMax: 1,   channels: ['Instagram','Facebook'], focus: 'Tampere-hakuilmoitukset.', intensity: 'low' },
    { month: 12, postsMin: 1, postsMax: 2,   channels: ['Instagram','Facebook'], focus: 'Docpoint-näkyvyys + tulevan vuoden teaser.', intensity: 'low' },
  ],

  phases: [
    { id: 'phase-1', order: 1, title: 'Valmistelu ja brändin päivitys',      months: 'Tammi-maaliskuu', monthRange: [1,2,3],    focus: 'Strategian viimeistely, AD-brief, 2026-teeman lukkoon lyöminen, Hetki Momentum -konfigurointi, vapaaehtoisten ensimmäinen aalto.', channels: 'Hiljainen — 1-2 julk./vko ("matka on alkanut")' },
    { id: 'phase-2', order: 2, title: 'Alkukampanja & open callit',          months: 'Huhti-toukokuu',  monthRange: [4,5],      focus: 'Open callit (työpajat, installaatiot, lyhytelokuvat), teeman julkistus, vapaaehtoisten avoin rekry, julisteen luonnos.',                 channels: 'IG 3-4/vko, FB 2/vko, TikTok aloitus' },
    { id: 'phase-3', order: 3, title: 'Hard launch & ohjelmistojulkistukset', months: 'Kesäkuu',        monthRange: [6],        focus: 'Hard launch -viikko (vko 23). Juliste, uusi verkkosivu, ensimmäiset elokuva- ja musiikkipaljastukset, sponsori-spotlightit alkavat.', channels: 'IG + FB päärytmi, TikTok 2/vko' },
    { id: 'phase-4', order: 4, title: 'Noviisien kampanja',                  months: 'Heinäkuu',       monthRange: [7],        focus: 'Uusi 2026: "Ensimmäistä kertaa elokuvafestivaalilla?" -sarja, Reels 20 s, "Tuo kaveri mukaan", työpajojen ja oheiskokemusten nostot.', channels: 'IG Reels + TikTok + Stories ensisijaiset' },
    { id: 'phase-5', order: 5, title: 'Intensiivikausi ja festivaali',       months: 'Elokuu',         monthRange: [8],        focus: 'Lipunvaraus avautuu (vko 33), "Get to know X" -reel-sarja, visuaalinen aikataulu, aluekartta, live-stories, festivaaliviikko.',        channels: 'Päivittäin kaikki kanavat' },
    { id: 'phase-6', order: 6, title: 'Jälkimarkkinointi ja reflektio',      months: 'Syys-lokakuu',   monthRange: [9,10],     focus: 'TB-video, festivaalin palauteprosessi ja julkinen raportti, sponsoripitchit 2027:lle, strategia 2027 -työryhmän aloitus.',          channels: 'Hiljainen — 2-4 julk./vko' },
    { id: 'phase-7', order: 7, title: 'Hiljainen kausi ja cross-festival',   months: 'Marras-joulukuu',monthRange: [11,12],    focus: 'Docpoint-näkyvyys joulukuussa, vuoden "parhaat hetket" -julkaisut, uusien yhteistyökumppanien tapaamiset.',                      channels: 'Minimirytmi — 1-2 julk./kk' },
  ],

  campaigns: [
    { id: 'CAMPAIGN_01', order: 1,  title: 'Tammikuu — Matka alkaa',          type: 'brand-awareness',   audience: 'Kaikki (orgaaninen)',                channels: ['Instagram','Facebook','Uutiskirje'],                 formats: ['still','story','teksti'],       tone: 'Hiljainen, pohtiva, odottava',              phaseId: 'phase-1' },
    { id: 'CAMPAIGN_02', order: 2,  title: 'Open Call 2026',                  type: 'recruitment',       audience: 'Taiteilijat, tekijät, vapaaehtoiset', channels: ['Instagram','Facebook','LinkedIn','Verkkosivut'],     formats: ['still','carousel','teksti'],    tone: 'Kutsuva, käytännönläheinen',                phaseId: 'phase-2', cta: 'Hakulomakkeen linkki' },
    { id: 'CAMPAIGN_03', order: 3,  title: 'Hard Launch 2026',                type: 'launch',            audience: 'Kaikki',                             channels: ['Instagram','Facebook','TikTok','LinkedIn','Lehdistö'], formats: ['still','reel','press release','uutiskirje'], tone: 'Juhlava, ammattimainen, innoittava', phaseId: 'phase-3' },
    { id: 'CAMPAIGN_04', order: 4,  title: 'Ohjelmistojulkistukset',          type: 'program-reveal',    audience: 'Kulturellit, normaalit',             channels: ['Instagram','Facebook'],                              formats: ['still','carousel'],             tone: 'Kuratoitu, laadukas, asiatieto',            phaseId: 'phase-3', note: '1 elokuva / viikko kesä-heinäkuussa, ryppäinä (2025 oppi)' },
    { id: 'CAMPAIGN_05', order: 5,  title: 'Musiikkijulkistukset',            type: 'program-reveal',    audience: 'Kaikki',                             channels: ['Instagram','Facebook'],                              formats: ['still','reel'],                 tone: 'Lämmin, tunnelmallinen',                    phaseId: 'phase-3' },
    { id: 'CAMPAIGN_06', order: 6,  title: 'Sponsoripaljastukset',            type: 'partnership',       audience: 'Kaikki (priorisoitu)',               channels: ['Instagram','Facebook','LinkedIn'],                   formats: ['still','video'],                tone: 'Kiitollinen, ammattimainen, autenttinen',    phaseId: 'phase-3', note: 'Aina tarkistus sponsorilta ennen julkaisua' },
    { id: 'CAMPAIGN_07', order: 7,  title: 'Noviisien kampanja',              type: 'audience-expansion',audience: 'Noviisit, nuoret',                   channels: ['Instagram Reels','TikTok','Stories'],                formats: ['reel','tutorial','FAQ-carousel'],tone: 'Leikkisä, rohkaiseva, saavutettava',        phaseId: 'phase-4', cta: 'Tuo kaveri, lipunvaraus', note: 'UUSI 2026 — strateginen painopiste' },
    { id: 'CAMPAIGN_08', order: 8,  title: 'Get to know the team',            type: 'brand-storytelling',audience: 'Kaikki, erityisesti noviisit',       channels: ['Instagram Reels','Stories','TikTok'],                formats: ['reel 60s','carousel'],          tone: 'Henkilökohtainen, aito, hupsu',             phaseId: 'phase-5', note: '1/vko 4 viikkoa ennen festivaalia — aloitus heinäkuun lopulla' },
    { id: 'CAMPAIGN_09', order: 9,  title: 'Lipunvaraus avautuu',             type: 'conversion',        audience: 'Kaikki',                             channels: ['Instagram','Facebook','TikTok','Uutiskirje','Verkkosivut'], formats: ['still','reel','story'],   tone: 'Selkeä, käytännöllinen, innostava',         phaseId: 'phase-5' },
    { id: 'CAMPAIGN_10', order: 10, title: 'Festivaaliviikko — live',         type: 'live-coverage',     audience: 'Kaikki',                             channels: ['IG Stories','Reels','TikTok','Facebook'],            formats: ['story','reel','live'],          tone: 'Reaaliaikainen, hupsu, tunnelmallinen',     phaseId: 'phase-5', note: 'Päivittäinen vastuu festivaaliviikolla' },
    { id: 'CAMPAIGN_11', order: 11, title: 'Kiitos ja TB',                    type: 'post-event',        audience: 'Kävijät, vapaaehtoiset',             channels: ['Kaikki'],                                            formats: ['video (TB)','still','teksti'],  tone: 'Lämmin, kiitollinen, rauhallinen',          phaseId: 'phase-6' },
    { id: 'CAMPAIGN_12', order: 12, title: 'Docpoint & jälkinäkyvyys',        type: 'cross-festival',    audience: 'Elokuva-alan ammattilaiset',         channels: ['Instagram','LinkedIn'],                              formats: ['still','video'],                tone: 'Ammattimainen, kumppaneita kunnioittava',    phaseId: 'phase-7' },
  ],

  channelMatrix: [
    { id: 'ch-ig-feed',  name: 'Instagram Feed',    function: 'Visuaalinen pääkanava, ohjelmistopaljastukset, brändi', frequency: '4-5 julk./vko huhti-kesä, 6-7 heinä-elo', primaryAudience: 'Kaikki',                    responsible: 'Viestinnän johtaja + graafikko' },
    { id: 'ch-ig-story', name: 'Instagram Stories', function: 'Rento, reaaliaikainen, BTS, yhteisö',                   frequency: 'Päivittäin kesä-elo',                      primaryAudience: 'Normaali kuluttaja, nuoret', responsible: 'Viestinnän tiimi' },
    { id: 'ch-ig-reels', name: 'Instagram Reels',   function: 'Noviisi- ja nuoriyleisön tavoittaminen, algoritmikasvu',frequency: '2/vko kesä-elo',                           primaryAudience: 'Nuoret, noviisit',           responsible: 'Videotuottaja' },
    { id: 'ch-fb',       name: 'Facebook',          function: 'Tapahtumasivut, logistiikka, normaali kuluttaja',       frequency: '3-4 julk./vko',                            primaryAudience: 'Normaali kuluttaja, perheet',responsible: 'Viestinnän tiimi' },
    { id: 'ch-tiktok',   name: 'TikTok',            function: 'Film-TikTok, orgaaninen viraliteetti, noviisien houkuttelu', frequency: '2/vko kesä-elo',                     primaryAudience: 'Nuoret (12-29)',             responsible: 'Videotuottaja', isNew2026: true },
    { id: 'ch-linkedin', name: 'LinkedIn',          function: 'Kumppanit, rahoittajat, ammattimaisuuden tapa',         frequency: '1/vko',                                    primaryAudience: 'Ammattilaiset, rahoittajat', responsible: 'Viestinnän johtaja' },
    { id: 'ch-web',      name: 'Verkkosivut',       function: 'Luotettava info, SEO, lehdistön käyntikortti',          frequency: 'Jatkuvasti',                               primaryAudience: 'Kaikki (erityisesti media)', responsible: 'Web-tiimi + johtaja' },
    { id: 'ch-news',     name: 'Uutiskirje',        function: 'Sitoutuneet kannattajat, sponsorisisäänkirjaus',        frequency: 'Kvartaaleittain + 4 kirjettä touko-elo',   primaryAudience: 'Normaalit, kulturellit',     responsible: 'Viestinnän johtaja', isNew2026: true },
    { id: 'ch-press',    name: 'Lehdistö',          function: 'Ulkoinen näkyvyys',                                     frequency: '3 release-vaihetta (huhti, kesä, elo)',    primaryAudience: 'Media',                       responsible: 'Viestinnän johtaja' },
    { id: 'ch-prints',   name: 'Julisteet & flaijerit', function: 'Kaupunkikuva',                                      frequency: '1 kampanja (painatus kesäkuu)',            primaryAudience: 'Kaikki, erityisesti noviisit', responsible: 'Graafikko + jakelutiimi' },
  ],

  // Viikkoittaisen julkaisurytmin rakenne — johdettu Arttu:n 2025-kalenterista.
  // Huomio 2026: painopiste siirtyy yksittäisistä elokuvista kokonaisfestivaaliin (ks. LLFF_2025_IMPROVEMENTS).
  contentPillars: [
    { id: 'cp-monday',    label: 'Musiikki / ohjelmisto-paketti',   weekday: 'Ma', platforms: ['Facebook','Instagram'], ownerRole: 'Viestinnän vastaava', description: 'Musiikkiohjelma tai useamman elokuvan yhteinen paljastus. Keskitytään kokonaisuuteen, ei yksittäiseen esiintyjään.' },
    { id: 'cp-tuesday',   label: 'Sponsori / kumppani',              weekday: 'Ti', platforms: ['Facebook','Instagram'], ownerRole: 'Viestinnän vastaava', description: 'Yhteistyökumppanin tai sponsorin nosto. Arttu 2025: Yle, Helsingin kaupunki, MES, Pro Lapinlahti, Subterra, HelsinkiMissio.' },
    { id: 'cp-wednesday', label: 'Workshop / elokuva-paketti',      weekday: 'Ke', platforms: ['Facebook','Instagram'], ownerRole: 'Viestinnän tiimi', description: 'Workshop-esittely tai elokuvapaketti (useampi elokuva samassa postauksessa).' },
    { id: 'cp-thursday',  label: 'Elokuva / teema',                  weekday: 'To', platforms: ['Facebook','Instagram'], ownerRole: 'Viestinnän tiimi', description: 'Temaattinen elokuvanosto tai festivaalin kokonaisuutta käsittelevä sisältö.' },
    { id: 'cp-friday',    label: 'Musiikki / sponsori / reel',       weekday: 'Pe', platforms: ['Facebook','Instagram'], ownerRole: 'Viestinnän tiimi', description: 'Viikonloppua pohjustava sisältö — musiikki-julkistus, sponsori tai reel.' },
    { id: 'cp-saturday',  label: 'Reel / extra',                      weekday: 'La', platforms: ['Instagram'],           ownerRole: 'Viestinnän tiimi', description: 'Reel-sisältö (esim. "Get to know" -sarjaan) tai extra-sisältö. Ei pakollinen.' },
  ],

  channels: ['Instagram', 'Facebook'],
  updatedAt: Date.now(),
};

// ============================================================
// 2025 REFERENSSI — Arttu:n PDF-kalenterista purettu viikkorakenne
// ============================================================

export interface HistoricalWeek {
  week: number;
  dateRange: string;
  posts: HistoricalPost[];
  note?: string;
}
export interface HistoricalPost {
  weekday: string;
  content: string;
  platforms: string[];
  category: 'music' | 'sponsor' | 'film' | 'workshop' | 'shortfilm' | 'launch' | 'volunteers' | 'festival' | 'post' | 'other';
  notes?: string;
}

export const LLFF_2025_REFERENCE: HistoricalWeek[] = [
  {
    week: 18, dateRange: '28.4.-4.5.2025', note: 'Vapun viikko — NO POST.',
    posts: [
      { weekday: 'Pe', content: 'Open call: workshops', platforms: ['IG','FB','LI'], category: 'launch' },
    ],
  },
  {
    week: 19, dateRange: '5.5.-11.5.2025', note: 'Äitienpäivä — NO POST.',
    posts: [
      { weekday: 'Ma', content: 'Open call: installations', platforms: ['IG','FB','LI'], category: 'launch' },
    ],
  },
  { week: 20, dateRange: '12.5.-18.5.2025', posts: [], note: 'Hiljaisempi viikko — templaattien viimeistely.' },
  { week: 21, dateRange: '19.5.-25.5.2025', posts: [] },
  { week: 22, dateRange: '26.5.-1.6.2025', posts: [], note: 'Helatorstai.' },
  {
    week: 23, dateRange: '2.6.-8.6.2025', note: 'HARD LAUNCH -viikko. Festivaalin päälaukaisu.',
    posts: [
      { weekday: 'Ti', content: 'HARD LAUNCH — juliste + festivaalin paljastus', platforms: ['FB','IG','LI'], category: 'launch' },
      { weekday: 'Ke', content: 'Elokuva: Raja',                                platforms: ['FB','IG'],      category: 'film' },
      { weekday: 'To', content: 'Sponsor: Yle',                                  platforms: ['IG','FB'],      category: 'sponsor', notes: 'Check with Yle before publishing' },
      { weekday: 'Pe', content: 'Elokuva: Agent of Happiness',                   platforms: ['FB','IG'],      category: 'film' },
    ],
  },
  {
    week: 24, dateRange: '9.6.-15.6.2025',
    posts: [
      { weekday: 'Ma', content: 'Musiikki: Sydän ja villasukat',                 platforms: ['FB','IG'], category: 'music', notes: 'Co-publish' },
      { weekday: 'To', content: 'Elokuva: Hytti nro 6',                          platforms: ['FB','IG'], category: 'film', notes: 'Vierailu Juho Kuosmanen & Outi Airola?' },
      { weekday: 'Pe', content: 'Musiikki: Subterra',                            platforms: ['FB','IG'], category: 'music', notes: 'Co-publish' },
    ],
  },
  {
    week: 25, dateRange: '16.6.-22.6.2025', note: 'Juhannus — Fri+Sat NO POST.',
    posts: [
      { weekday: 'Ma', content: 'Musiikki: Ovddolas',                            platforms: ['FB','IG'], category: 'music', notes: 'Co-publish' },
      { weekday: 'Ti', content: 'Sponsor: Helsingin kaupunki',                   platforms: ['IG','FB'], category: 'sponsor' },
      { weekday: 'To', content: 'Elokuva: My Favorite Cake',                     platforms: ['FB','IG'], category: 'film' },
    ],
  },
  {
    week: 26, dateRange: '23.6.-29.6.2025',
    posts: [
      { weekday: 'Ma', content: 'Musiikki: Melisa Yildirim',                     platforms: ['FB','IG'], category: 'music', notes: 'Co-publish' },
      { weekday: 'Ti', content: 'Call for volunteers',                           platforms: ['IG','FB'], category: 'volunteers' },
      { weekday: 'To', content: 'Elokuva: Enys Men',                             platforms: ['FB','IG'], category: 'film' },
    ],
  },
  {
    week: 27, dateRange: '30.6.-6.7.2025',
    posts: [
      { weekday: 'Ma', content: 'Musiikki: Jekaterina',                          platforms: ['FB','IG'], category: 'music', notes: 'Co-publish' },
      { weekday: 'Ti', content: 'Sponsor: Lapinlahden Lähde',                    platforms: ['FB','IG'], category: 'sponsor' },
      { weekday: 'Ke', content: 'Elokuva: Disco Boy',                            platforms: ['FB','IG'], category: 'film' },
      { weekday: 'To', content: 'Sponsor: MES',                                  platforms: ['FB','IG'], category: 'sponsor' },
      { weekday: 'Pe', content: 'Musiikki: Adnil & Tämo',                        platforms: ['FB','IG'], category: 'music', notes: 'Co-publish' },
    ],
  },
  {
    week: 28, dateRange: '7.7.-13.7.2025',
    posts: [
      { weekday: 'Ma', content: 'Musiikki: Iida Maria Jasmiina',                 platforms: ['FB','IG'], category: 'music', notes: 'Co-publish' },
      { weekday: 'Ti', content: 'Sponsor: Pro Lapinlahti',                       platforms: ['FB','IG'], category: 'sponsor' },
      { weekday: 'Ke', content: 'Workshop: Itsemyötätuntoa sanoista',            platforms: ['FB','IG'], category: 'workshop' },
      { weekday: 'To', content: 'Elokuva: Prinsessa',                            platforms: ['FB','IG'], category: 'film', notes: 'Vierailu?' },
      { weekday: 'Pe', content: 'Musiikki: Nana Janger',                         platforms: ['FB','IG'], category: 'music', notes: 'Co-publish' },
      { weekday: 'La', content: 'Sponsor: Kahvila Lähde',                        platforms: ['FB','IG'], category: 'sponsor' },
    ],
  },
  {
    week: 29, dateRange: '14.7.-20.7.2025',
    posts: [
      { weekday: 'Ma', content: 'Musiikki: Grotto Boys',                         platforms: ['FB','IG'], category: 'music' },
      { weekday: 'Ti', content: 'Sponsor: Cinema Mondo',                         platforms: ['FB','IG'], category: 'sponsor' },
      { weekday: 'Ke', content: 'Workshop: Breathwork Journey Inwards',          platforms: ['IG','FB'], category: 'workshop' },
      { weekday: 'To', content: 'Sponsor: Subterra ry / The Dating Game',        platforms: ['FB','IG'], category: 'sponsor' },
      { weekday: 'Pe', content: 'Sponsor: HelsinkiMissio',                       platforms: ['IG','FB'], category: 'sponsor' },
    ],
  },
  {
    week: 30, dateRange: '21.7.-27.7.2025',
    posts: [
      { weekday: 'Ma', content: 'Musiikki: Heli Hartikainen',                    platforms: ['FB','IG'], category: 'music' },
      { weekday: 'Ti', content: 'Sponsor: Jalotofu + Call for volunteers',       platforms: ['FB','IG'], category: 'sponsor' },
      { weekday: 'Ke', content: 'Workshop: Echoes of Belonging + Dogma',         platforms: ['IG','FB'], category: 'workshop' },
      { weekday: 'To', content: 'Elokuva: Beau Travail',                         platforms: ['FB','IG'], category: 'film' },
      { weekday: 'Pe', content: 'Musiikki: Sophia Mitiku',                       platforms: ['FB','IG'], category: 'music' },
      { weekday: 'La', content: 'Sponsor: Pohjoismainen ministerineuvosto',      platforms: ['FB','IG'], category: 'sponsor' },
    ],
  },
  {
    week: 31, dateRange: '28.7.-3.8.2025',
    posts: [
      { weekday: 'Ma', content: 'Musiikki: Otto Taimela + Dogma',                platforms: ['FB','IG','LI'], category: 'music' },
      { weekday: 'Ti', content: 'Shortfilm',                                      platforms: ['FB','IG'], category: 'shortfilm' },
      { weekday: 'Ke', content: 'Workshop: Leikkiklubi',                         platforms: ['FB','IG'], category: 'workshop' },
      { weekday: 'To', content: 'Elokuva: A Yoman — QUEEF-yhteistyö',            platforms: ['FB','IG'], category: 'film' },
      { weekday: 'Pe', content: 'Elokuva: Mykkätrilogia',                        platforms: ['FB','IG'], category: 'film' },
      { weekday: 'La', content: 'Sponsor: Ape Gelato + Shortfilm',               platforms: ['FB','IG'], category: 'sponsor' },
    ],
  },
  {
    week: 32, dateRange: '4.8.-10.8.2025',
    posts: [
      { weekday: 'Ma', content: 'Elokuva: Je\'vida',                             platforms: ['FB','IG'], category: 'film' },
      { weekday: 'Ti', content: 'Shortfilm',                                      platforms: ['FB','IG'], category: 'shortfilm' },
      { weekday: 'Ke', content: 'Elokuva: Kuolleet lehdet',                      platforms: ['FB','IG'], category: 'film' },
      { weekday: 'To', content: 'Shortfilm + Exhibition',                        platforms: ['FB','IG'], category: 'shortfilm' },
      { weekday: 'Pe', content: 'Workshop: Hoitava liike',                       platforms: ['FB','IG'], category: 'workshop' },
      { weekday: 'La', content: 'Ticket booking opens on Monday',                platforms: ['FB','IG'], category: 'launch' },
      { weekday: 'Su', content: 'Shortfilm',                                      platforms: ['FB','IG'], category: 'shortfilm' },
    ],
  },
  {
    week: 33, dateRange: '11.8.-17.8.2025',
    posts: [
      { weekday: 'Ma', content: 'TICKET BOOKING HAS OPENED',                     platforms: ['FB','IG'], category: 'launch' },
      { weekday: 'Ti', content: 'Elokuva: Omenavarkaat',                         platforms: ['FB','IG'], category: 'film', notes: 'Vierailu Samppa Batal?' },
      { weekday: 'Ke', content: 'Shortfilm + Sponsor: Bike Cafe',                platforms: ['FB','IG'], category: 'film' },
      { weekday: 'To', content: 'Workshop: TRE-liiketerapia + Sponsor Bamilami', platforms: ['FB','IG'], category: 'workshop' },
      { weekday: 'Pe', content: 'Sponsor: Kahvila Mutteri + Reel: Get to know Anton', platforms: ['FB','IG'], category: 'sponsor' },
      { weekday: 'La', content: 'Workshop: Writing + Reel: Get to know Nellie',  platforms: ['FB','IG'], category: 'workshop' },
      { weekday: 'Su', content: 'Art: Personal attention',                       platforms: ['FB','IG'], category: 'other' },
    ],
  },
  {
    week: 34, dateRange: '18.8.-24.8.2025', note: 'FESTIVAL WEEK — päivittäinen intensiivinen sisältö.',
    posts: [
      { weekday: 'Ma', content: 'Workshop: Photography + Reel: Get to know Sveta', platforms: ['FB','IG'], category: 'festival' },
      { weekday: 'Ti', content: 'Kivipiha Screenings boost + Workshop: Systems modeling', platforms: ['FB','IG'], category: 'festival' },
      { weekday: 'Ke', content: 'Visual Schedule + Area map',                    platforms: ['FB','IG'], category: 'festival' },
      { weekday: 'To', content: 'Film festival begins + Reel: Get to know Saara', platforms: ['FB','IG'], category: 'festival' },
      { weekday: 'Pe', content: 'Huolituoli & Kaverikorneri + Music: Sumu',       platforms: ['FB','IG'], category: 'festival' },
      { weekday: 'La', content: 'Ilma-akro + Good Guys juoma',                   platforms: ['FB','IG'], category: 'festival' },
      { weekday: 'Su', content: 'Installations artists',                         platforms: ['FB','IG'], category: 'festival' },
    ],
  },
  {
    week: 35, dateRange: '25.8.-31.8.2025',
    posts: [
      { weekday: 'Ma', content: 'Trent mainos + Sensommar',                      platforms: ['FB','IG'], category: 'post' },
      { weekday: 'Ti', content: 'Espoo Cine: Rochefortin tytöt + Thank you for the festival', platforms: ['FB','IG'], category: 'post' },
      { weekday: 'Pe', content: 'Apply to Tampere',                              platforms: ['IG','FB','LI'], category: 'post' },
      { weekday: 'Su', content: 'TBA video + Docpoint-näkyvyys joulukuussa',     platforms: ['FB','IG'], category: 'post' },
    ],
  },
];

// ============================================================
// ARTTU:N ONBOARDING-MUISTIO (2025 konteksti)
// ============================================================

export const LLFF_2025_NOTES = {
  author: 'Arttu Uuranmäki',
  email: 'arttu.uuranmaki1@gmail.com',
  role: '2025 viestinnän vastaava',
  teamComposition:
    'Viestinnän johtaja (Arttu), graafikko (Jutta), kaksi web-devaajaa (Joel ja Jussi-Pekka), videotuottaja (Teodor) + n. 4 avustajaa.',
  totalHours: 'N. 10 täyttä työviikkoa ripoteltuna 8 kuukauden ajalle (tammi-elokuu).',
  monthlyLoad: [
    { period: 'Tammi-huhtikuu', hours: '0-8 h/vko', focus: 'Strategia, suunnittelu, aikataulutus, vapaaehtoisten rekrytointi, apurahahakemukset (viestinnän materiaaleille saatu 1500€).' },
    { period: 'Toukokuu',       hours: '4-8 h/vko', focus: 'Templaattien valmistelu, palautekierrokset julisteesta, verkkosivupäivitykset, sisäiset työskentelytavat.' },
    { period: 'Kesä-heinäkuu',  hours: '8-20 h/vko', focus: 'Sisällöntuotanto + koordinointi. Juliste ja ensimmäiset ohjelmistot kesäkuun ensimmäisellä viikolla. Vapaaehtoiset festariviikkoon. Viestintäyhteistyöt (mm. R&A).' },
    { period: 'Elokuu',          hours: '20-40 h/vko + 12+ h/festivaalipäivä', focus: 'Viimeinen ohjelmisto, käytännönasiat, lipunvaraus, Holvi-verkkokauppa.' },
  ],
  leadershipNote:
    'Viestinnän johtaja on osa johtoryhmää (jokaisen tiimin johtaja). Osallistuu yleiskokouksiin 1-2 viikon välein. Tiiviissä yhteistyössä toiminnanjohtajan (Sveta), sponsorivastaavan, elokuvakuraattorien, musatuottajan ja taiteellisen johtajan (Anton) kanssa.',
  closingThoughts:
    'Parasta festivaalin tekemisessä oli rakentaa lähes tyhjästä jotain oman näköistä. Ryhmä hitsautui tiiviiksi erityisesti kesäkuukausina. Mitään ei tarvitse tehdä yksin — apua saa muilta tiimiläisiltä.',
};

// ============================================================
// PARANNUSEHDOTUKSET 2026 (Arttu)
// ============================================================

export interface Improvement {
  id: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  status: 'applied' | 'planned' | 'backlog';
  owner?: string;
}

export const LLFF_2025_IMPROVEMENTS: Improvement[] = [
  {
    id: 'imp-batch-reveals',
    title: 'Useita ohjelmistoja yhdessä julkaisussa',
    description: 'Julkaise ohjelmistopaljastukset ryppäinä — esim. yksi postaus jossa 3 elokuvaa. 2025 julkaistiin jokainen yksittäin, mikä söi kapasiteettia.',
    priority: 'high',
    status: 'applied',
    owner: 'lasse',
  },
  {
    id: 'imp-catalog',
    title: 'Sähköinen festivaalikatalogi',
    description: 'Tee sähköinen ohjelmakatalogi joka voidaan myös julkaista Instagramissa. Karhupuisto Film Festivalilla on hyvä esimerkki.',
    priority: 'high',
    status: 'planned',
    owner: 'jutta',
  },
  {
    id: 'imp-focus-whole-fest',
    title: 'Painopiste kokonaisfestivaaliin',
    description: 'Sen sijaan että viestintä keskittyy yksittäisiin elokuviin/keikkoihin/workshopeihin, painopiste tulee olla kokonaisfestivaalissa. Tavoite: ihmiset käyvät festivaalilla yleisesti, ei vain yhden esityksen takia.',
    priority: 'high',
    status: 'applied',
    owner: 'lasse',
  },
  {
    id: 'imp-website',
    title: 'Nettisivujen kehitys',
    description: 'Nettisivut tarvitsevat kapasiteettia kaikkeen tietoon yhdessä paikassa: pitkät elokuvakuvaukset, useammat kuvat per elokuva. Myös pikaviestintätila ohjelman muutoksille.',
    priority: 'high',
    status: 'planned',
    owner: 'lasse',
  },
  {
    id: 'imp-newsletter',
    title: 'Uutiskirje (side quest)',
    description: 'Jos viestinnän tiimissä on tarpeeksi ihmisiä, uutiskirje olisi hyvä lisä. Nykyisillä resursseilla tämä on sivusuuntainen mahdollisuus.',
    priority: 'low',
    status: 'backlog',
  },
  {
    id: 'imp-one-ad',
    title: 'Yksi AD viestinnälle',
    description: '2025: Visual Director + Graphical Designer -jakautuminen teki operatiivisesta tasosta kömpelön. 2026: yksi AD (Jutta) jolla on kokonaisvastuu.',
    priority: 'high',
    status: 'applied',
    owner: 'jutta',
  },
];

// ============================================================
// Helperit
// ============================================================

export function normalizeCommsPlan(p: any): CommsPlan {
  if (!p) return { ...DEFAULT_LLFF_2026_PLAN };
  return {
    id: p.id || DEFAULT_LLFF_2026_PLAN.id,
    year: p.year || DEFAULT_LLFF_2026_PLAN.year,
    festivalName: p.festivalName || DEFAULT_LLFF_2026_PLAN.festivalName,
    festivalDates: p.festivalDates || DEFAULT_LLFF_2026_PLAN.festivalDates,
    summary: p.summary || DEFAULT_LLFF_2026_PLAN.summary,
    mission: p.mission || DEFAULT_LLFF_2026_PLAN.mission,
    visitorGoal: typeof p.visitorGoal === 'number' ? p.visitorGoal : DEFAULT_LLFF_2026_PLAN.visitorGoal,
    visitorBaseline: typeof p.visitorBaseline === 'number' ? p.visitorBaseline : DEFAULT_LLFF_2026_PLAN.visitorBaseline,
    volunteerGoal: typeof p.volunteerGoal === 'number' ? p.volunteerGoal : DEFAULT_LLFF_2026_PLAN.volunteerGoal,
    volunteerBaseline: typeof p.volunteerBaseline === 'number' ? p.volunteerBaseline : DEFAULT_LLFF_2026_PLAN.volunteerBaseline,
    responsibleMemberId: p.responsibleMemberId || DEFAULT_LLFF_2026_PLAN.responsibleMemberId,
    responsibleTeamId: p.responsibleTeamId || DEFAULT_LLFF_2026_PLAN.responsibleTeamId,
    activeFrom: p.activeFrom || DEFAULT_LLFF_2026_PLAN.activeFrom,
    visualIdentityDeadline: p.visualIdentityDeadline || DEFAULT_LLFF_2026_PLAN.visualIdentityDeadline,
    kickoffNote: p.kickoffNote || DEFAULT_LLFF_2026_PLAN.kickoffNote,
    strategicMoves:  Array.isArray(p.strategicMoves)  && p.strategicMoves.length > 0  ? p.strategicMoves  : DEFAULT_LLFF_2026_PLAN.strategicMoves,
    kpis:            Array.isArray(p.kpis)            && p.kpis.length > 0            ? p.kpis            : DEFAULT_LLFF_2026_PLAN.kpis,
    audienceMix:     Array.isArray(p.audienceMix)     && p.audienceMix.length > 0     ? p.audienceMix     : DEFAULT_LLFF_2026_PLAN.audienceMix,
    brandPillars:    Array.isArray(p.brandPillars)    && p.brandPillars.length > 0    ? p.brandPillars    : DEFAULT_LLFF_2026_PLAN.brandPillars,
    milestones:      Array.isArray(p.milestones)      && p.milestones.length > 0      ? p.milestones      : DEFAULT_LLFF_2026_PLAN.milestones,
    monthTargets:    Array.isArray(p.monthTargets)    && p.monthTargets.length > 0    ? p.monthTargets    : DEFAULT_LLFF_2026_PLAN.monthTargets,
    phases:          Array.isArray(p.phases)          && p.phases.length > 0          ? p.phases          : DEFAULT_LLFF_2026_PLAN.phases,
    campaigns:       Array.isArray(p.campaigns)       && p.campaigns.length > 0       ? p.campaigns       : DEFAULT_LLFF_2026_PLAN.campaigns,
    channelMatrix:   Array.isArray(p.channelMatrix)   && p.channelMatrix.length > 0   ? p.channelMatrix   : DEFAULT_LLFF_2026_PLAN.channelMatrix,
    contentPillars:  Array.isArray(p.contentPillars)  && p.contentPillars.length > 0  ? p.contentPillars  : DEFAULT_LLFF_2026_PLAN.contentPillars,
    channels:        Array.isArray(p.channels) ? p.channels : DEFAULT_LLFF_2026_PLAN.channels,
    updatedAt: p.updatedAt || Date.now(),
  };
}

export function getMonthTarget(plan: CommsPlan, month: number): CommsMonthTarget | undefined {
  return plan.monthTargets.find(m => m.month === month);
}

export function countPublicationsInMonth(publications: Array<{ date?: string | null }>, year: number, month: number): number {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  return publications.filter(p => p.date && p.date.startsWith(prefix)).length;
}

export function monthCoverageStatus(
  plan: CommsPlan,
  publications: Array<{ date?: string | null }>,
  year: number,
  month: number
): {
  month: number;
  target: CommsMonthTarget | undefined;
  scheduled: number;
  status: 'ok' | 'under' | 'empty' | 'idle';
  message: string;
} {
  const target = getMonthTarget(plan, month);
  const scheduled = countPublicationsInMonth(publications, year, month);
  if (!target || target.postsMax === 0) {
    return { month, target, scheduled, status: 'idle', message: 'Suunnitelmassa ei aktiivista viestintää tässä kuussa.' };
  }
  if (scheduled === 0) {
    return { month, target, scheduled, status: 'empty', message: `Ei yhtään suunniteltua julkaisua. Tavoite ${target.postsMin}-${target.postsMax}.` };
  }
  if (scheduled < target.postsMin) {
    return { month, target, scheduled, status: 'under', message: `${scheduled} / ${target.postsMin}-${target.postsMax} suunniteltu. Vielä ${target.postsMin - scheduled} puuttuu minimiin.` };
  }
  return { month, target, scheduled, status: 'ok', message: `${scheduled} julkaisua suunniteltu (tavoite ${target.postsMin}-${target.postsMax}).` };
}

export const MONTHS_FI = [
  'Tammikuu','Helmikuu','Maaliskuu','Huhtikuu','Toukokuu','Kesäkuu',
  'Heinäkuu','Elokuu','Syyskuu','Lokakuu','Marraskuu','Joulukuu',
];

export function intensityColor(intensity: CommsMonthTarget['intensity']): string {
  switch (intensity) {
    case 'peak':   return '#e45c81';
    case 'high':   return '#9b7cf6';
    case 'medium': return '#3788b2';
    case 'low':    return 'var(--t3)';
  }
}

// Yhdistää org.channels (jos määritelty) ja 2026-strategian channelMatrix:n.
// Käytetään kaikissa paikoissa joissa käyttäjä valitsee kanavan (kalenteri, editori, queue, detail)
// jotta kaikki strategian kanavat ovat aina saatavilla ilman erillistä asetusta.
export interface UnifiedChannel {
  name: string;
  color: string;
  source: 'org' | 'plan';
}

const CHANNEL_DEFAULT_COLORS: Record<string, string> = {
  'Instagram Feed':     '#E1306C',
  'Instagram Stories':  '#C13584',
  'Instagram Reels':    '#833AB4',
  'Instagram':          '#E1306C',
  'Facebook':           '#1877F2',
  'TikTok':             '#000000',
  'LinkedIn':           '#0A66C2',
  'Verkkosivut':        '#2a8a86',
  'Uutiskirje':         '#f59e0b',
  'Lehdistö':           '#9b7cf6',
  'Julisteet & flaijerit': '#e45c81',
};

export function unifiedChannels(
  plan: CommsPlan,
  orgChannels?: Array<{ name: string; color?: string }> | null
): UnifiedChannel[] {
  const out: UnifiedChannel[] = [];
  const seen = new Set<string>();
  for (const oc of orgChannels || []) {
    if (!oc?.name || seen.has(oc.name)) continue;
    seen.add(oc.name);
    out.push({ name: oc.name, color: oc.color || CHANNEL_DEFAULT_COLORS[oc.name] || '#3788b2', source: 'org' });
  }
  for (const row of plan.channelMatrix || []) {
    if (!row?.name || seen.has(row.name)) continue;
    seen.add(row.name);
    out.push({ name: row.name, color: CHANNEL_DEFAULT_COLORS[row.name] || '#3788b2', source: 'plan' });
  }
  return out;
}

export function milestoneCategoryMeta(cat: CommsMilestone['category']): { label: string; color: string; icon: string } {
  switch (cat) {
    case 'visual':     return { label: 'Visuaalinen',     color: '#e45c81', icon: '◈' };
    case 'launch':     return { label: 'Julkistus',       color: '#9b7cf6', icon: '★' };
    case 'publish':    return { label: 'Julkaisu',        color: '#3788b2', icon: '▶' };
    case 'production': return { label: 'Tuotanto',        color: '#2a8a86', icon: '⚙' };
    case 'festival':   return { label: 'Festivaali',      color: '#f59e0b', icon: '◉' };
    case 'post':       return { label: 'Jälkiviestintä',  color: 'var(--t3)', icon: '◌' };
  }
}
