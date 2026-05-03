// Aivovammaliiton graafinen ohjeisto — siemen-data PDF:stä (versio 27.4.2026).
// Käytetään vain orgSlug === 'avl'. Anton voi muokata sisältöä UI:sta — ensimmäinen
// tallennus persistoi datan Firestoreen, jonka jälkeen tämä siemen ei enää näy.

import type { BrandGuide } from './brand-guide-shared';

export const AVL_BRAND_GUIDE: BrandGuide = {
  intro: {
    title: 'Aivovammaliiton graafinen ohjeisto',
    subtitle: 'Brändi, värit, typografia ja kuvamaailma',
    lastUpdated: '27.4.2026',
  },

  logo: {
    description:
      'Aivovammaliiton tunnus muodostuu puunrungosta, lehdistä ja latvuksen silhuetista, josta voi nähdä aivojen muodon. Logo muodostuu tunnuksen ja logotyypin (nimen kirjoitusasun) yhdistelmästä — näiden keskinäisiä suhteita ei saa muuttaa. Logosta on olemassa sekä pysty- että vaaka-asettelumalli; ensisijaisesti käytetään vaakaversiota, mutta esim. kapeassa tilassa (kuten käyntikortissa) käytetään pystyversiota. Tunnusta voidaan käyttää yksinään erikoissovelluksissa tai graafisena elementtinä. Tunnuksen ja logon voi tilata Aivovammaliitosta.',
    assets: [],
  },

  colors: {
    description:
      'Aivovammaliitolla on kolme pääväriä — Kuusi, Koivu ja Lumi — joita voidaan käyttää yhdessä lisävärien kanssa. Kuusi toimii hyvin tummana pohjana vaalealle tekstille sekä kuvituskuville tai otsikoissa värillisenä tekstinä vaalealla pohjalla. Koivua voidaan käyttää tehostevärinä. Lumi toimii hyvin esimerkiksi värillisen tekstin pohjana ja graafisten elementtien pohjavärinä. Yleinen nyrkkisääntö: vaalealla pohjalla tumma teksti, tummalla pohjalla vaalea teksti.',
    primary: [
      {
        id: 'avl_kuusi',
        name: 'Kuusi',
        hex: '#008555',
        cmyk: 'C 85 M 22 Y 79 K 7',
        rgb: 'R 0 G 133 B 85',
        description: 'Pääväri. Tumma pohja vaalealle tekstille tai värillinen teksti vaalealla.',
      },
      {
        id: 'avl_koivu',
        name: 'Koivu',
        hex: '#CBDB2A',
        cmyk: 'C 29 M 0 Y 89 K 0',
        rgb: 'R 202 G 214 B 50',
        description: 'Pääväri / tehosteväri.',
      },
      {
        id: 'avl_lumi',
        name: 'Lumi',
        hex: '#FFFFFF',
        cmyk: 'C 0 M 0 Y 0 K 0',
        rgb: 'R 255 G 255 B 255',
        description: 'Pääväri. Värillisen tekstin ja graafisten elementtien pohja.',
      },
    ],
    accent: [
      {
        id: 'avl_verso',
        name: 'Verso',
        hex: '#DFEEE2',
        cmyk: 'C 16 M 0 Y 15 K 0',
        rgb: 'R 223 G 238 B 226',
        theme: 'Aivovammat',
        description: 'Yhdistelmä Kuusi + Verso. Aivovammat-teeman lisäväri.',
      },
      {
        id: 'avl_ruusu',
        name: 'Ruusu',
        hex: '#F9EBF5',
        cmyk: 'C 2 M 11 Y 0 K 0',
        rgb: 'R 249 G 235 B 245',
        theme: 'Läheiset',
        description: 'Yhdistelmä Kuusi + Ruusu. Läheiset-teeman lisäväri.',
      },
      {
        id: 'avl_persikka',
        name: 'Persikka',
        hex: '#FDE9E3',
        cmyk: 'C 0 M 12 Y 10 K 0',
        rgb: 'R 253 G 233 B 227',
        theme: 'Aivoverenkiertohäiriö',
        description: 'Yhdistelmä Kuusi + Persikka. AVH-teeman lisäväri.',
      },
      {
        id: 'avl_sade',
        name: 'Säde',
        hex: '#F8F5C7',
        cmyk: 'C 5 M 0 Y 30 K 0',
        rgb: 'R 248 G 245 B 199',
        theme: 'Ammattilaiset',
        description: 'Yhdistelmä Kuusi + Säde. Ammattilaiset-teeman lisäväri.',
      },
      {
        id: 'avl_pilvi',
        name: 'Pilvi',
        hex: '#E8F2FC',
        cmyk: 'C 11 M 2 Y 0 K 0',
        rgb: 'R 232 G 242 B 252',
        theme: 'Aivoterveys',
        description: 'Yhdistelmä Kuusi + Pilvi. Aivoterveys-teeman lisäväri.',
      },
    ],
  },

  typography: {
    description:
      'Sisäisen viestinnän materiaaleissa (Word-dokumentit, PowerPoint-esitykset yms.) voidaan käyttää korvaavana fonttina Arialia silloin, kun Outfitia tai Aveniria ei voida teknisistä syistä käyttää.',
    fonts: [
      {
        id: 'avl_outfit',
        role: 'heading',
        family: 'Outfit',
        source: 'Google Fonts',
        weights: 'Light, Regular, Medium, Semibold, Bold, Black',
        fallback: 'Arial',
        description:
          'Otsikko- ja korostuskäytössä. Outfit on päätteetön, lempeän pyöreä ja helposti luettava kirjasintyyppi. Outfit löytyy Google Fontsista ja monet selaimet tukevat sitä. Kaikkia leikkauksia voi käyttää, joskin Thin ja ExtraLight harkiten luettavuuden takia. Semibold on suositeltava leikkaus otsikoissa ja väliotsikoissa Aivovammaliiton visuaalisen ilmeen yhtenäisyyden takaamiseksi.',
      },
      {
        id: 'avl_avenir',
        role: 'body',
        family: 'Avenir',
        source: 'Adobe Fonts',
        weights: 'Light, Roman, Medium, Black, Oblique, Black Oblique',
        fallback: 'Arial',
        description:
          'Leipätekstin kirjasintyyppi. Avenir on päätteetön, selkeä ja helposti luettava. Light ja Light Oblique harkiten luettavuuden takia. Perus leipätekstissä suositeltava leikkaus on Roman.',
      },
    ],
  },

  imagery: [
    {
      id: 'avl_img_photos',
      title: 'Valokuvat',
      description:
        'Aivovammaliiton materiaaleissa käytetään lämminhenkisiä valokuvia, jotka tuntuvat aidoilta — niistä välittyy läheisyys ja ihmiskontakti. Vältetään kuvapankkikuvien, tekoälyllä tehtyjen kuvien sekä liian lavastetun tai silotellun oloisten kuvien käyttöä. Valokuvissa ihminen esitetään arkisesti ja realistisesti, mutta tunnelma on rauhallinen ja yleisvire positiivinen.',
      examples: [],
    },
    {
      id: 'avl_img_illustrations',
      title: 'Kuvituskuvat',
      description:
        'Kuvituskuvien tärkeimpiä tehtäviä ovat tekstuaalisen sisällön visualisointi, lähestyttävän ja rauhallisen kokonaisuuden luominen sekä brändi-ilmeen yhtenäistäminen. Kuvituskuvat ovat viivapiirrosmaisia, muotokieleltään orgaanisia ja niiden väripaletti ottaa vaikutteita brändiväreistä.',
      examples: [],
    },
    {
      id: 'avl_img_graphs',
      title: 'Graafit',
      description:
        'Graafeissa tulee käyttää saavutettavaa väripalettia: väreillä tulee olla keskenään tarpeeksi kylläisyyskontrastia. Päävärinä käytetään Aivovammaliiton omaa brändiväriä. Muiden värien tulee poiketa pääväristä ja toisistaan tarpeeksi kylläisyydeltään ja lämmöltään, jotta taataan värien erottuvuus ja graafien helppolukuisuus.',
      examples: [],
    },
  ],

  materials: [
    {
      id: 'avl_mat_brochures',
      title: 'Esitteet',
      description:
        'Esitteissä käytetään ilmeen mukaisia värejä: vihreää pääväriä sekä teeman mukaisia lisävärejä. Esitteen otsikko sijoitetaan kannessa aina ylös, jotta kansi on kokonaisuudessaan luettavampi. Otsikon yhteydessä sekä esitteen infolaatikoissa käytetään olemassaolevia ilmeen mukaisia graafisia elementtejä.',
      files: [],
    },
    {
      id: 'avl_mat_social',
      title: 'Sosiaalinen media',
      description:
        'Some-postauksissa käytetään ilmeen mukaista värimaailmaa ja hyödynnetään muualla julkaisuissa esiintyviä grafiikoita. Postausten kuva-alueelle tuleva teksti pidetään suhteellisen lyhyenä selkeän yleis-ilmeen ja luettavuuden vuoksi. Suurempi tekstisisältö ja selitteet kannattaa painottaa postauksen tekstiosioon. Kuvituskuvia voi käyttää myös somessa, kunhan ne liittyvät selkeästi postauksen aiheeseen.',
      files: [],
    },
    {
      id: 'avl_mat_rollups',
      title: 'Roll-upit ja banderollit',
      description:
        'Roll-upeissa ja banderolleissa käytetään brändin mukaista värimaailmaa sekä muotokieltä. Logo sijoitetaan näkyvästi vaalealle taustalle. Materiaaleissa voi käyttää joko kuvituskuvia tai valokuvia, mutta teksti tulee aina sijoittaa vaalealle taustalle, jotta kokonaisuus pysyy selkeänä ja luettavana.',
      files: [],
    },
    {
      id: 'avl_mat_pptx',
      title: 'PowerPoint-pohjat',
      description:
        'PowerPoint-pohjissa käytetään brändin mukaisia värejä. Isot otsikot esitetään vihreällä Kuusi-brändivärillä ja sijoitetaan aina sivun yläreunaan. Muu sivulla esiintyvä teksti on 100 % mustaa. Logo sijoitetaan oikeaan alakulmaan vaalealle taustalle, missä se erottuu selkeästi mutta ei ole muun materiaalin tiellä. Yleisilme on selkeä ja raikas. Kannessa ja nimiösivuilla voidaan käyttää taustaväriä, mutta sisältösivujen pohjaväri on valkoinen luettavuuden takaamiseksi.',
      files: [],
    },
  ],

  accessibility: {
    description:
      'Aivovammaliiton julkaisuja laadittaessa on pidettävä huolta, että kaikki materiaali on saavutettavaa.',
    points: [
      'Taustaväreillä ja tekstillä on tarpeeksi suuri värikontrasti.',
      'Fonttikoko on tarpeeksi suurta.',
      'Esitteet voi lukea halutessaan screenreaderilla.',
      'Tekstisisältö on tarpeeksi selkokielistä ja helposti ymmärrettävää.',
    ],
  },

  contact: {
    organization: 'Aivovammaliitto ry',
    phone: '(09) 8366580',
    email: 'aivovammaliitto@aivovammaliitto.fi',
    notes: 'Tunnuksen ja logon voi tilata Aivovammaliitosta.',
  },
};
