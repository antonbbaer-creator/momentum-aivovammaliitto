'use client';

// Ohjepaneeli Esitteet-moduulin yläosaan: mitä saavutettava esite vaatii,
// taito avattavissa Claudessa, ja miten saavutettavuuden tarkistaa.

// Linkki Anton tekemään Claude-taitoon (saavutettavan PDF:n luonti).
// TODO: vaihda oikeaan taidon URLiin kun se on julkaistu Claudessa.
const CLAUDE_SKILL_URL = 'https://claude.ai';

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
        <div style={{ marginTop: 12 }}>
          <a className="btn btn-primary" href={CLAUDE_SKILL_URL} target="_blank" rel="noreferrer">
            Avaa taito Claudessa
          </a>
          <span style={{ marginLeft: 10, fontSize: 13, color: 'var(--t3)' }}>
            Claude-taito, joka opastaa saavutettavan esitteen luonnissa.
          </span>
        </div>
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
