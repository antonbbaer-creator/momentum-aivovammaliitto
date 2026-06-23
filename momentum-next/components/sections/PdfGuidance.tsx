'use client';

// Ohjepaneeli Esitteet-moduulin yläosaan: mitä saavutettava esite vaatii,
// taito avattavissa Claudessa, ja miten saavutettavuuden tarkistaa.

// Avaa Claude valmiilla kehotteella, johon on upotettu accessible-pdf-wcag -taidon
// ydinohjeet. Näin ohjeet kulkevat linkin mukana myös käyttäjälle, jolla taitoa ei
// ole asennettuna omaan Claudeensa. (Skriptien ajaminen vaatii silti taidon asennuksen
// tai Momentumin oman työkalun.)
const SKILL_PROMPT = [
  'Toimi saavutettavan PDF:n (WCAG 2.1 AA) asiantuntijana ja opasta minua. Noudata tätä taitoa:',
  '',
  'PERUSASIA: Saavutettava PDF on tagattu — rakennepuu kertoo ruudunlukijalle otsikkotasot, kappaleet, listat, taulukot, kuvien alt-tekstit ja ennen kaikkea lukujärjestyksen. Taitetussa esitteessä lukujärjestys on erityisen tärkeä, koska palstat eivät noudata yksinkertaista vasen→oikea-järjestystä.',
  '',
  'PARAS TAPA: lisää tagit paikallaan ulkoasua muuttamatta. Jos alkuperäinen taitto (InDesign) on saatavilla, saavutettava vienti lähteestä on laadukkain — lukujärjestys ja tagit syntyvät suoraan oikein.',
  '',
  'KONE OSAA luotettavasti: dokumentin kieli, otsikko ja DisplayDocTitle, metatiedot, salauksen poisto (luvalla), tekstin valittavuuden tarkistus, puuttuvien alt-tekstien listaus.',
  '',
  'IHMINEN TARKISTAA AINA: alt-tekstien sisältö (katso kuvat, ehdota, hyväksy), lukujärjestys monipalstaisessa esitteessä, otsikkotasot.',
  '',
  'TYÖNKULKU: (0) Tunnista onko valmis PDF vai onko taitto yhä saatavilla. (1) Audit: tarkista tagit, kieli, otsikko, metatiedot, tekstin valittavuus ja alt-tekstit. (2) Auto-korjaa turvallisesti kieli, otsikko ja metatiedot. (3) Tagita tagaamaton esite paikallaan: ehdota alt-tekstit ja sisällyslinkit chattiin, anna ihmisen korjata, kirjoita sitten lopullinen tiedosto. (4) Tuota WCAG 2.1 AA -raportti korjauslistalla.',
  '',
  'ALT-TEKSTI: 1–2 virkettä (enintään noin 250 merkkiä), päätä pisteeseen, älä aloita sanoilla "Kuva/Kuvassa", neutraali kuvaus ilman tulkintaa, koristekuvat merkitään artefaktiksi.',
  '',
  'LOPUKSI: ihmistarkastus Adobe Acrobatissa (tagit, lukujärjestys, alt-tekstit, linkit) ja ruudunlukijatesti.',
  '',
  'Kerro nyt vaihe vaiheelta, miten teen taitetusta PDF-esitteestäni saavutettavan tämän taidon mukaan, ja mitä minun pitää itse tarkistaa.',
].join('\n');
// claude:// avaa Claude Desktop -sovelluksen; https://claude.ai on selainvaralinkki.
const CLAUDE_DESKTOP_URL = `claude://claude.ai/new?q=${encodeURIComponent(SKILL_PROMPT)}`;
const CLAUDE_WEB_URL = `https://claude.ai/new?q=${encodeURIComponent(SKILL_PROMPT)}`;

const card: React.CSSProperties = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--rl)',
  padding: 16,
};

const summary: React.CSSProperties = {
  cursor: 'pointer',
  fontWeight: 600,
  color: 'var(--t1)',
  padding: '8px 0',
  listStyle: 'none',
};

export default function PdfGuidance() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ ...card, borderLeft: '3px solid var(--pri)' }}>
        <p style={{ margin: 0, color: 'var(--t2)', lineHeight: 1.6 }}>
          Tähän kerätään kaikki esitteet. Työkalu tekee verkkoon julkaistavasta PDF-esitteestä
          mahdollisimman saavutettavan (WCAG 2.1 AA / PDF/UA) ja ohjaa loput — kuvien
          vaihtoehtoiset tekstit — sinun hyväksyttäväksesi. Työkalu <strong>ei takaa</strong>{' '}
          täydellistä saavutettavuutta: alt-tekstien sisältö ja vaikeat lähde-PDF:n virheet
          (esim. upottamattomat fontit) vaativat ihmisen arvion.
        </p>
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <a className="btn btn-primary" href={CLAUDE_DESKTOP_URL}>
            Avaa taito Claudessa
          </a>
          <a href={CLAUDE_WEB_URL} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: 'var(--t3)' }}>
            tai avaa selaimessa
          </a>
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--t3)' }}>
          Avaa Claude-sovelluksen valmiilla kysymyksellä — Claude opastaa saavutettavan esitteen luonnissa.
        </p>
      </div>

      <details style={card}>
        <summary style={summary}>Millainen on saavutettava esite?</summary>
        <ul style={{ margin: '8px 0 0', paddingLeft: 20, color: 'var(--t2)', lineHeight: 1.7 }}>
          <li>Tagattu rakenne: otsikot, kappaleet, listat ja taulukot merkitty — ei pelkkää visuaalista muotoilua</li>
          <li>Looginen lukujärjestys ruudunlukijalle</li>
          <li>Kuvilla vaihtoehtoinen teksti (alt); koristekuvat merkitty koristeiksi</li>
          <li>Dokumentin otsikko ja kieli määritelty</li>
          <li>Linkeillä kuvaava teksti (ei pelkkä osoite)</li>
          <li>Riittävä värikontrasti; väri ei ole ainoa merkityksen kantaja</li>
          <li>Fontit upotettu ja teksti valittavissa — ei skannattua kuvaa tekstistä</li>
          <li>PDF/UA-tunniste ja metatiedot kunnossa</li>
        </ul>
      </details>

      <details style={card}>
        <summary style={summary}>Miten tarkistat että esite on saavutettava?</summary>
        <ol style={{ margin: '8px 0 0', paddingLeft: 20, color: 'var(--t2)', lineHeight: 1.7 }}>
          <li><strong>Tässä työkalussa:</strong> lataa esite → Tagaa saavutettavaksi → Lisää alt-tekstit → paina <em>Tarkista</em>. Saat tarkistuslistan ja saavutettavuusselosteen luonnoksen.</li>
          <li><strong>Konevalidointi:</strong> aja PDF veraPDF- tai PAC-tarkistuksen läpi (PDF/UA-raportti). Tämä kattaa koneellisesti todennettavat kohdat.</li>
          <li><strong>Ihmisarvio:</strong> kuuntele esite ruudunlukijalla ja varmista, että lukujärjestys ja alt-tekstit ovat järkeviä.</li>
          <li><strong>Muista:</strong> kone kattaa vain osan WCAG-kohdista. Alt-tekstien sisältö ja looginen lukujärjestys vaativat aina ihmisen arvion.</li>
        </ol>
      </details>
    </div>
  );
}
