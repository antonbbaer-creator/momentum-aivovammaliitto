'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { collection, addDoc, query, where, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { workerFetch } from '@/lib/worker-fetch';

type FeedbackType = 'bug' | 'feature' | 'other';
type FeedbackStatus = 'open' | 'in-progress' | 'done' | 'declined';

interface Feedback {
  id: string;
  orgId: string;
  orgName: string;
  userUid: string;
  userName: string;
  userEmail: string;
  type: FeedbackType;
  text: string;
  submittedAt: string;
  status: FeedbackStatus;
}

const TYPE_META: Record<FeedbackType, { label: string; color: string; icon: string }> = {
  bug:     { label: 'Bugi',          color: 'var(--red)',   icon: '!' },
  feature: { label: 'Kehityspyyntö', color: 'var(--pri-l)', icon: '+' },
  other:   { label: 'Muu',           color: 'var(--t2)',    icon: '·' },
};

export default function PalautePage() {
  const { user, activeOrg, orgs } = useAuth();
  const { toast } = useToast();
  const [type, setType] = useState<FeedbackType>('feature');
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const activeOrgName = orgs.find(o => o.orgId === activeOrg)?.name || activeOrg || '';

  const loadFeedback = useCallback(async () => {
    if (!user || !activeOrg) return;
    setLoadingList(true);
    try {
      // Vain where(orgId == activeOrg) — ei orderBy → ei vaadita compound-indeksia.
      // Sortataan client-puolella ISO-paivamaaran perusteella.
      const q = query(
        collection(db, 'momentumFeedback'),
        where('orgId', '==', activeOrg),
      );
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }) as Feedback);
      list.sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''));
      setFeedback(list);
    } catch (e) {
      console.error('Load feedback error:', e);
      toast('Palautteen lataaminen epäonnistui', 'error');
    } finally {
      setLoadingList(false);
    }
  }, [user, activeOrg, toast]);

  useEffect(() => { loadFeedback(); }, [loadFeedback]);

  const submit = async () => {
    if (!user || !text.trim() || !activeOrg) return;
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'momentumFeedback'), {
        orgId: activeOrg,
        orgName: activeOrgName,
        userUid: user.uid,
        userName: user.displayName || '',
        userEmail: user.email || '',
        type,
        text: text.trim(),
        submittedAt: new Date().toISOString(),
        status: 'open' as FeedbackStatus,
      });
      toast('Kiitos palautteesta!', 'success');
      setText('');
      setType('feature');
      loadFeedback();
    } catch (e) {
      console.error('Submit feedback error:', e);
      toast('Lähetys epäonnistui', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = async (id: string, status: FeedbackStatus) => {
    setBusyId(id);
    // Optimistinen
    setFeedback(prev => prev.map(f => f.id === id ? { ...f, status } : f));
    try {
      await updateDoc(doc(db, 'momentumFeedback', id), { status });
      toast(status === 'done' ? 'Merkitty korjatuksi' : status === 'open' ? 'Palautettu avoimeksi' : 'Tila päivitetty', 'success');
    } catch (e) {
      console.error('Status update error:', e);
      toast('Tilan päivitys epäonnistui', 'error');
      loadFeedback(); // palauta oikea tila
    } finally {
      setBusyId(null);
    }
  };

  const deleteFeedback = async (id: string) => {
    if (!confirm('Poistetaanko palaute pysyvästi?')) return;
    setBusyId(id);
    try {
      await deleteDoc(doc(db, 'momentumFeedback', id));
      setFeedback(prev => prev.filter(f => f.id !== id));
      toast('Palaute poistettu', 'success');
    } catch (e) {
      console.error('Delete feedback error:', e);
      toast('Poisto epäonnistui', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' });
        chunksRef.current = [];
        if (blob.size === 0) { setTranscribing(false); return; }
        setTranscribing(true);
        try {
          const fd = new FormData();
          const ext = (mimeType || 'audio/webm').includes('mp4') ? 'mp4' : 'webm';
          fd.append('file', blob, `palaute.${ext}`);
          const res = await workerFetch('/api/transcribe', { method: 'POST', body: fd });
          if (!res.ok) throw new Error('Transcribe failed');
          const { transcription } = await res.json() as { transcription: string };
          if (transcription) {
            setText(prev => prev ? `${prev}\n\n${transcription}` : transcription);
            toast('Äänitys litteroitu', 'success');
          } else {
            toast('Litterointi ei tuottanut tekstiä', 'error');
          }
        } catch (e) {
          console.error('Transcribe error:', e);
          toast('Litterointi epäonnistui', 'error');
        } finally {
          setTranscribing(false);
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch (e) {
      console.error('Mic error:', e);
      toast('Mikrofoniin pääsy estetty', 'error');
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  };

  const open = useMemo(() => feedback.filter(f => f.status === 'open' || f.status === 'in-progress'), [feedback]);
  const done = useMemo(() => feedback.filter(f => f.status === 'done' || f.status === 'declined'), [feedback]);

  const renderCard = (f: Feedback, isDone: boolean) => {
    const tm = TYPE_META[f.type] || TYPE_META.other;
    const isMine = f.userUid === user?.uid;
    const busy = busyId === f.id;
    return (
      <div key={f.id} style={{
        background: isDone ? 'transparent' : 'var(--elev)',
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${isDone ? 'var(--green)' : tm.color}`,
        opacity: isDone ? 0.7 : 1,
        borderRadius: 'var(--r)', padding: '.85rem 1rem',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.4rem', gap: '.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '.62rem', color: tm.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>
            {tm.icon} {tm.label}
          </span>
          <span style={{ fontSize: '.62rem', color: 'var(--t3)' }}>
            {f.userName || f.userEmail || 'Anonyymi'} · {new Date(f.submittedAt).toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric', year: 'numeric' })}
          </span>
        </div>
        <div style={{
          fontSize: '.84rem', color: 'var(--t1)', lineHeight: 1.55, whiteSpace: 'pre-wrap',
          textDecoration: f.status === 'declined' ? 'line-through' : 'none',
        }}>
          {f.text}
        </div>
        <div style={{ display: 'flex', gap: '.4rem', marginTop: '.6rem', flexWrap: 'wrap' }}>
          {!isDone ? (
            <>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => updateStatus(f.id, 'done')}
                disabled={busy}
                style={{ fontSize: '.7rem', color: 'var(--green)' }}
                title="Merkitse korjatuksi"
              >✓ Korjattu</button>
              {f.status === 'open' ? (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => updateStatus(f.id, 'in-progress')}
                  disabled={busy}
                  style={{ fontSize: '.7rem', color: 'var(--yellow)' }}
                >Työn alla</button>
              ) : (
                <span style={{ fontSize: '.62rem', padding: '.18rem .5rem', borderRadius: 9999, background: 'rgba(241,180,52,.14)', color: 'var(--yellow)', fontWeight: 700, alignSelf: 'center' }}>
                  Työn alla
                </span>
              )}
            </>
          ) : (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => updateStatus(f.id, 'open')}
              disabled={busy}
              style={{ fontSize: '.7rem' }}
              title="Palauta avoimeksi"
            >↺ Palauta avoimeksi</button>
          )}
          <div style={{ flex: 1 }} />
          {isMine && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => deleteFeedback(f.id)}
              disabled={busy}
              style={{ fontSize: '.7rem', color: 'var(--t3)' }}
              title="Poista oma palaute"
            >Poista</button>
          )}
        </div>
      </div>
    );
  };

  return (
    <AppShell title="Palaute" subtitle="Yhteisön kehityspyynnöt & bugit">
      {/* Lomake */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', marginBottom: '1.5rem' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 500 }}>Lähetä palaute</h3>
          <p style={{ fontSize: '.78rem', color: 'var(--t3)', marginTop: '.2rem', lineHeight: 1.5 }}>
            Kerro mikä Momentumissa toimii huonosti tai mitä haluaisit lisättäväksi. Voit kirjoittaa tai äänittää — äänitys litteroidaan automaattisesti. Palautteet näkyvät kaikille {activeOrgName}-yhteisön jäsenille.
          </p>
        </div>

        <div style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '.4rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            {(Object.keys(TYPE_META) as FeedbackType[]).map(t => {
              const m = TYPE_META[t];
              const active = type === t;
              return (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  style={{
                    fontSize: '.78rem', padding: '.5rem .9rem', borderRadius: 9999,
                    background: active ? m.color : 'var(--elev)',
                    color: active ? '#fff' : 'var(--t2)',
                    border: `1px solid ${active ? m.color : 'var(--border)'}`,
                    fontWeight: 600, cursor: 'pointer',
                  }}
                >{m.icon} {m.label}</button>
              );
            })}
          </div>

          <textarea
            className="input textarea"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={type === 'bug' ? 'Mitä tapahtui, missä, milloin?' : type === 'feature' ? 'Mitä haluaisit Momentumiin?' : 'Kirjoita vapaasti...'}
            style={{ minHeight: 140, fontSize: '.9rem', lineHeight: 1.6 }}
          />

          <div style={{ display: 'flex', gap: '.5rem', marginTop: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {!recording ? (
              <button
                className="btn btn-ghost btn-sm"
                onClick={startRecording}
                disabled={transcribing}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem' }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--red)', display: 'inline-block' }} />
                {transcribing ? 'Litteroidaan…' : 'Äänitä'}
              </button>
            ) : (
              <button
                className="btn btn-sm"
                onClick={stopRecording}
                style={{ background: 'var(--red)', color: '#fff', borderColor: 'var(--red)', display: 'inline-flex', alignItems: 'center', gap: '.4rem' }}
              >
                <span style={{ width: 8, height: 8, borderRadius: 2, background: '#fff', display: 'inline-block', animation: 'pulse 1s infinite' }} />
                Lopeta äänitys
              </button>
            )}
            <div style={{ flex: 1 }} />
            <button
              className="btn btn-primary"
              onClick={submit}
              disabled={!text.trim() || submitting || transcribing}
            >
              {submitting ? 'Lähetetään…' : 'Lähetä palaute'}
            </button>
          </div>
        </div>
      </div>

      {/* Listat: Bugit & toiveet | Korjatut */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
        {/* Avoimet */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.88rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>
              Bugit & toiveet ({open.length})
            </h3>
          </div>
          <div style={{ padding: '.75rem', display: 'flex', flexDirection: 'column', gap: '.5rem', maxHeight: 720, overflowY: 'auto' }}>
            {loadingList && <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--t3)', fontSize: '.82rem' }}>Ladataan…</div>}
            {!loadingList && open.length === 0 && (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--t3)', fontSize: '.82rem' }}>
                Ei avoimia palautteita.
              </div>
            )}
            {open.map(f => renderCard(f, false))}
          </div>
        </div>

        {/* Korjatut */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.88rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--green)' }}>
              ✓ Korjatut ({done.length})
            </h3>
          </div>
          <div style={{ padding: '.75rem', display: 'flex', flexDirection: 'column', gap: '.5rem', maxHeight: 720, overflowY: 'auto' }}>
            {!loadingList && done.length === 0 && (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--t3)', fontSize: '.82rem' }}>
                Ei vielä korjattuja.
              </div>
            )}
            {done.map(f => renderCard(f, true))}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: .4; }
        }
      `}</style>
    </AppShell>
  );
}
