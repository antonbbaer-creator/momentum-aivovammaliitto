'use client';

import { useState, useRef } from 'react';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { useOrgData } from '@/lib/firestore';
import {
  PdfDocument,
  PdfDocStatus,
  PdfFigure,
  PDF_DOCS_KEY,
  STATUS_LABELS,
  statusTone,
  makePdfId,
  storageBase,
  buildAccessibilityStatement,
  SelfCheckSummary,
} from '@/lib/pdf-accessibility-shared';
import { checkRemediation } from '@/lib/pdf-figures';
import PdfAltEditor from './PdfAltEditor';
import PdfGuidance from './PdfGuidance';

const ORG_NAMES: Record<string, string> = { avl: 'Aivovammaliitto ry' };

const TONE_VAR: Record<string, string> = {
  green: 'var(--green)',
  yellow: 'var(--yellow)',
  red: 'var(--red)',
  gray: 'var(--t3)',
};

export default function PdfAccessibilitySection() {
  const { user, activeOrg, canEdit } = useAuth();
  const [docs, setDocs] = useOrgData<PdfDocument[]>(PDF_DOCS_KEY, []);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [checks, setChecks] = useState<Record<string, { check: SelfCheckSummary; statement: string }>>({});
  const [topErr, setTopErr] = useState<string | null>(null);
  const [upload, setUpload] = useState<{ name: string } | null>(null);
  // Pidetään PDF:n tavut muistissa, jotta tagaus/editori/tarkistus eivät hae niitä
  // uudelleen Storagesta (selaimen cross-origin fetch ei toimi ilman bucket-CORSia).
  const bytesCache = useRef<Map<string, Uint8Array>>(new Map());

  const setBusyFor = (id: string, v: boolean) => setBusy(prev => ({ ...prev, [id]: v }));
  const patchDoc = (id: string, patch: Partial<PdfDocument>) =>
    setDocs(prev => prev.map(d => (d.id === id ? { ...d, ...patch } : d)));

  async function handleUpload(file: File) {
    setTopErr(null);
    console.log('[pdf] handleUpload', { name: file.name, type: file.type, size: file.size, activeOrg, uid: user?.uid, canEdit });
    if (!user) { setTopErr('Et ole kirjautunut sisään.'); return; }
    if (!activeOrg) { setTopErr('Ei aktiivista työtilaa.'); return; }
    if (!canEdit) { setTopErr('Sinulla ei ole muokkausoikeutta tässä työtilassa.'); return; }
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (!isPdf) { setTopErr(`Valitse PDF-tiedosto (sait tyypin "${file.type || 'tuntematon'}").`); return; }
    const id = makePdfId();
    const path = `${storageBase(activeOrg, id)}/original.pdf`;
    setUpload({ name: file.name });
    const watchdog = setTimeout(() => {
      setTopErr('Lataus kestää tavallista kauemmin. Jos se ei valmistu, kyseessä voi olla Storage-yhteys tai CORS — tarkista selaimen konsoli (Network-välilehti).');
    }, 25000);
    try {
      console.log('[pdf] uploadBytes alkaa', path, file.size, 'tavua');
      bytesCache.current.set(id, new Uint8Array(await file.arrayBuffer()));
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file, { contentType: 'application/pdf' });
      const url = await getDownloadURL(storageRef);
      console.log('[pdf] upload valmis', url);
      const doc: PdfDocument = {
        id,
        filename: file.name,
        status: 'uploaded',
        storage: { original: path, originalUrl: url },
        uploadedBy: user.uid,
        uploadedAt: Date.now(),
      };
      setDocs(prev => [doc, ...prev]);
    } catch (e) {
      console.error('[pdf] upload epäonnistui', e);
      setTopErr('Lataus epäonnistui: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      clearTimeout(watchdog);
      setUpload(null);
    }
  }

  async function handleAutotag(doc: PdfDocument) {
    if (!activeOrg || !user || !canEdit || !doc.storage.originalUrl) return;
    setBusyFor(doc.id, true);
    patchDoc(doc.id, { status: 'tagging', error: undefined });
    try {
      // Käytä muistissa olevia tavuja; hae Storagesta vain jos puuttuu (esim. sivun lataus uudelleen)
      let original = bytesCache.current.get(doc.id);
      if (!original) {
        const origRes = await fetch(doc.storage.originalUrl);
        original = new Uint8Array(await origRes.arrayBuffer());
      }
      const idToken = await user.getIdToken();
      const res = await fetch('/api/pdf/autotag', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/pdf' },
        body: original as BodyInit,
      });
      if (!res.ok) {
        const msg = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(msg.error || `HTTP ${res.status}`);
      }
      const tagged = new Uint8Array(await res.arrayBuffer());
      bytesCache.current.set(doc.id, tagged); // muistiin alt-editoria varten
      const path = `${storageBase(activeOrg, doc.id)}/tagged.pdf`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, tagged, { contentType: 'application/pdf' });
      const url = await getDownloadURL(storageRef);
      patchDoc(doc.id, {
        status: 'tagged',
        storage: { ...doc.storage, tagged: path, taggedUrl: url },
      });
    } catch (e) {
      patchDoc(doc.id, { status: 'error', error: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusyFor(doc.id, false);
    }
  }

  async function handleComplete(doc: PdfDocument, finalBytes: Uint8Array, figures: PdfFigure[], title: string) {
    if (!activeOrg) return;
    bytesCache.current.set(doc.id, finalBytes); // muistiin tarkistusta varten
    const path = `${storageBase(activeOrg, doc.id)}/final.pdf`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, finalBytes, { contentType: 'application/pdf' });
    const url = await getDownloadURL(storageRef);
    patchDoc(doc.id, {
      status: 'done',
      figures,
      storage: { ...doc.storage, final: path, finalUrl: url },
    });
    setEditingId(null);
  }

  async function handleCheck(doc: PdfDocument) {
    if (!doc.storage.finalUrl) return;
    setBusyFor(doc.id, true);
    try {
      const bytes = bytesCache.current.get(doc.id)
        ?? new Uint8Array(await (await fetch(doc.storage.finalUrl)).arrayBuffer());
      const check = await checkRemediation(bytes);
      const statement = buildAccessibilityStatement({
        title: doc.filename.replace(/\.pdf$/i, ''),
        check,
        orgName: ORG_NAMES[activeOrg || ''] || activeOrg || 'Organisaatio',
        date: new Date().toLocaleDateString('fi-FI'),
      });
      setChecks(prev => ({ ...prev, [doc.id]: { check, statement } }));
    } catch (e) {
      alert('Tarkistus epäonnistui: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusyFor(doc.id, false);
    }
  }

  async function handleDelete(doc: PdfDocument) {
    if (!canEdit) return;
    if (!confirm(`Poistetaanko "${doc.filename}"?`)) return;
    for (const p of [doc.storage.original, doc.storage.tagged, doc.storage.final]) {
      if (p) { try { await deleteObject(ref(storage, p)); } catch { /* voi olla jo poissa */ } }
    }
    setDocs(prev => prev.filter(d => d.id !== doc.id));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PdfGuidance />

      <div>
        <label
          className="btn btn-primary"
          style={{ cursor: canEdit && !upload ? 'pointer' : 'not-allowed', opacity: canEdit && !upload ? 1 : 0.6 }}
        >
          <input
            type="file"
            accept="application/pdf,.pdf"
            style={{ display: 'none' }}
            disabled={!canEdit || !!upload}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
              e.target.value = '';
            }}
          />
          {upload ? 'Ladataan…' : 'Lataa PDF-esite'}
        </label>
        {!canEdit && (
          <span style={{ marginLeft: 10, fontSize: 13, color: 'var(--yellow)' }}>
            Ei muokkausoikeutta — lataus ei ole käytössä.
          </span>
        )}
      </div>

      {upload && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: 12 }}>
          <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 8 }}>
            Ladataan {upload.name}… (älä sulje sivua)
          </div>
          <div className="pdf-prog" />
        </div>
      )}

      {topErr && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--red)', borderRadius: 'var(--rl)', padding: 12, color: 'var(--red)', fontSize: 14 }}>
          {topErr}
        </div>
      )}

      {docs.length === 0 ? (
        <p style={{ color: 'var(--t3)' }}>Ei vielä esitteitä. Lataa ensimmäinen yltä.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {docs.map((doc) => (
            <div key={doc.id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <DocRow
                doc={doc}
                busy={!!busy[doc.id]}
                canEdit={canEdit}
                editing={editingId === doc.id}
                onAutotag={() => handleAutotag(doc)}
                onEdit={() => setEditingId(editingId === doc.id ? null : doc.id)}
                onCheck={() => handleCheck(doc)}
                onDelete={() => handleDelete(doc)}
              />
              {editingId === doc.id && doc.storage.taggedUrl && (
                <PdfAltEditor
                  taggedBytes={bytesCache.current.get(doc.id)}
                  taggedUrl={doc.storage.taggedUrl}
                  filename={doc.filename}
                  onComplete={(b, f, t) => handleComplete(doc, b, f, t)}
                  onCancel={() => setEditingId(null)}
                />
              )}
              {checks[doc.id] && (
                <CheckPanel
                  check={checks[doc.id].check}
                  statement={checks[doc.id].statement}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DocRow({
  doc, busy, canEdit, editing, onAutotag, onEdit, onCheck, onDelete,
}: {
  doc: PdfDocument;
  busy: boolean;
  canEdit: boolean;
  editing: boolean;
  onAutotag: () => void;
  onEdit: () => void;
  onCheck: () => void;
  onDelete: () => void;
}) {
  const tone = statusTone(doc.status);
  return (
    <div
      style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
    >
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontWeight: 600, color: 'var(--t1)' }}>{doc.filename}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <span
            style={{
              fontSize: 12, fontWeight: 600, color: TONE_VAR[tone],
              border: `1px solid ${TONE_VAR[tone]}`, borderRadius: 6, padding: '1px 8px',
            }}
          >
            {STATUS_LABELS[doc.status as PdfDocStatus]}
          </span>
          {doc.error && <span style={{ fontSize: 12, color: 'var(--red)' }}>{doc.error}</span>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {doc.storage.originalUrl && (
          <a className="btn btn-ghost" href={doc.storage.originalUrl} target="_blank" rel="noreferrer">
            Alkuperäinen
          </a>
        )}
        {doc.storage.finalUrl && (
          <a className="btn btn-ghost" href={doc.storage.finalUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--green)' }}>
            Valmis (lataa)
          </a>
        )}
        {doc.status === 'uploaded' && (
          <button className="btn btn-primary" disabled={busy || !canEdit} onClick={onAutotag}>
            {busy ? 'Tagataan…' : 'Tagaa saavutettavaksi'}
          </button>
        )}
        {canEdit && doc.storage.taggedUrl && (doc.status === 'tagged' || doc.status === 'needs-alt' || doc.status === 'done') && (
          <button className="btn btn-primary" onClick={onEdit}>
            {editing ? 'Sulje editori' : doc.status === 'done' ? 'Muokkaa alt-tekstejä' : 'Lisää alt-tekstit'}
          </button>
        )}
        {doc.status === 'done' && doc.storage.finalUrl && (
          <button className="btn btn-ghost" disabled={busy} onClick={onCheck}>
            {busy ? 'Tarkistetaan…' : 'Tarkista'}
          </button>
        )}
        {canEdit && (
          <button className="btn btn-ghost" disabled={busy} onClick={onDelete} aria-label="Poista">
            Poista
          </button>
        )}
      </div>
    </div>
  );
}

function CheckPanel({ check, statement }: { check: SelfCheckSummary; statement: string }) {
  const rows: { ok: boolean; label: string }[] = [
    { ok: check.figures.total === 0 || check.figures.withAlt === check.figures.total, label: `Kuvien alt-tekstit: ${check.figures.withAlt}/${check.figures.total}` },
    { ok: check.links.total === 0 || check.links.withContents === check.links.total, label: `Linkkien kuvaukset: ${check.links.withContents}/${check.links.total}` },
    { ok: check.title, label: 'Dokumentin otsikko' },
    { ok: check.lang, label: 'Dokumentin kieli' },
    { ok: check.displayDocTitle, label: 'Otsikko näytetään (DisplayDocTitle)' },
    { ok: check.pdfuaMetadata, label: 'PDF/UA-metatiedot' },
  ];
  return (
    <div style={{ background: 'var(--elev)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <strong style={{ color: 'var(--t1)' }}>Itsetarkistus</strong>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--t3)' }}>
        Tämä varmistaa, että työkalun korjaukset on tehty. Se <strong>ei korvaa</strong> täyttä
        PDF/UA-validointia (esim. veraPDF) eikä ihmisen tekemää tarkistusta.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ fontSize: 14, color: r.ok ? 'var(--green)' : 'var(--yellow)' }}>
            {r.ok ? '✓' : '!'} {r.label}
          </div>
        ))}
      </div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 13, color: 'var(--t2)' }}>Saavutettavuusselosteen luonnos (tarkista ja täydennä)</span>
        <textarea className="textarea" rows={10} readOnly value={statement} />
      </label>
      <div>
        <button className="btn btn-ghost" onClick={() => navigator.clipboard?.writeText(statement)}>
          Kopioi seloste
        </button>
      </div>
    </div>
  );
}
