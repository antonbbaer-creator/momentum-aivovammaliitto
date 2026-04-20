'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { collection, addDoc, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { workerFetch } from '@/lib/worker-fetch';

type FeedbackType = 'bug' | 'feature' | 'other';

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
  status: 'open' | 'in-progress' | 'done' | 'declined';
}

const TYPE_META: Record<FeedbackType, { label: string; color: string; icon: string }> = {
  bug:     { label: 'Bugi',            color: 'var(--red)',    icon: '!' },
  feature: { label: 'Kehityspyyntö',   color: 'var(--pri-l)',  icon: '+' },
  other:   { label: 'Muu',             color: 'var(--t2)',     icon: '·' },
};

const STATUS_META: Record<Feedback['status'], { label: string; color: string }> = {
  'open':         { label: 'Avoin',       color: 'var(--t2)' },
  'in-progress':  { label: 'Työn alla',    color: 'var(--yellow)' },
  'done':         { label: 'Valmis',      color: 'var(--green)' },
  'declined':     { label: 'Hylätty',     color: 'var(--t3)' },
};

export default function PalautePage() {
  const { user, activeOrg, orgs } = useAuth();
  const { toast } = useToast();
  const [type, setType] = useState<FeedbackType>('feature');
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [myFeedback, setMyFeedback] = useState<Feedback[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  // Äänitys
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const activeOrgName = orgs.find(o => o.orgId === activeOrg)?.name || activeOrg || '';

  const loadMyFeedback = useCallback(async () => {
    if (!user) return;
    setLoadingList(true);
    try {
      const q = query(
        collection(db, 'momentumFeedback'),
        where('userUid', '==', user.uid),
        orderBy('submittedAt', 'desc'),
      );
      const snap = await getDocs(q);
      setMyFeedback(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Feedback));
    } catch (e) {
      console.error('Load feedback error:', e);
    } finally {
      setLoadingList(false);
    }
  }, [user]);

  useEffect(() => { loadMyFeedback(); }, [loadMyFeedback]);

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
        status: 'open' as const,
      });
      toast('Kiitos palautteesta!', 'success');
      setText('');
      setType('feature');
      loadMyFeedback();
    } catch (e) {
      console.error('Submit feedback error:', e);
      toast('Lähetys epäonnistui', 'error');
    } finally {
      setSubmitting(false);
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

  return (
    <AppShell title="Palaute" subtitle="Kehityspyynnöt & bugit Momentumista">
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: '1.5rem' }}>
        {/* Lomake */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)' }}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 500 }}>Lähetä palaute</h3>
            <p style={{ fontSize: '.78rem', color: 'var(--t3)', marginTop: '.2rem', lineHeight: 1.5 }}>
              Kerro mikä Momentumissa toimii huonosti tai mitä haluaisit lisättäväksi. Voit kirjoittaa tai äänittää — äänitys litteroidaan automaattisesti.
            </p>
          </div>

          <div style={{ padding: '1.5rem' }}>
            {/* Tyyppi */}
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
                  >
                    {m.icon} {m.label}
                  </button>
                );
              })}
            </div>

            {/* Teksti */}
            <textarea
              className="input textarea"
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={type === 'bug' ? 'Mitä tapahtui, missä, milloin?' : type === 'feature' ? 'Mitä haluaisit Momentumiin?' : 'Kirjoita vapaasti...'}
              style={{ minHeight: 160, fontSize: '.9rem', lineHeight: 1.6 }}
            />

            {/* Äänitys + lähetys */}
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
                  style={{
                    background: 'var(--red)', color: '#fff', borderColor: 'var(--red)',
                    display: 'inline-flex', alignItems: 'center', gap: '.4rem',
                  }}
                >
                  <span style={{
                    width: 8, height: 8, borderRadius: 2, background: '#fff',
                    display: 'inline-block', animation: 'pulse 1s infinite',
                  }} />
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

        {/* Omat palautteet */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)' }}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.88rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.02em' }}>
              Omat palautteeni ({myFeedback.length})
            </h3>
          </div>
          <div style={{ padding: '.75rem', display: 'flex', flexDirection: 'column', gap: '.5rem', maxHeight: 600, overflowY: 'auto' }}>
            {loadingList && <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--t3)', fontSize: '.82rem' }}>Ladataan…</div>}
            {!loadingList && myFeedback.length === 0 && (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--t3)', fontSize: '.82rem' }}>
                Et ole vielä lähettänyt palautetta.
              </div>
            )}
            {myFeedback.map(f => {
              const tm = TYPE_META[f.type] || TYPE_META.other;
              const sm = STATUS_META[f.status] || STATUS_META.open;
              return (
                <div key={f.id} style={{
                  background: 'var(--elev)', border: '1px solid var(--border)',
                  borderLeft: `3px solid ${tm.color}`,
                  borderRadius: 'var(--r)', padding: '.75rem .9rem',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.35rem', gap: '.5rem' }}>
                    <span style={{ fontSize: '.62rem', color: tm.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                      {tm.label}
                    </span>
                    <span style={{ fontSize: '.62rem', padding: '.1rem .4rem', borderRadius: 9999, background: 'var(--card)', border: '1px solid var(--border)', color: sm.color, fontWeight: 600 }}>
                      {sm.label}
                    </span>
                  </div>
                  <div style={{ fontSize: '.82rem', color: 'var(--t1)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                    {f.text}
                  </div>
                  <div style={{ fontSize: '.62rem', color: 'var(--t3)', marginTop: '.4rem' }}>
                    {new Date(f.submittedAt).toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric', year: 'numeric' })}
                  </div>
                </div>
              );
            })}
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
