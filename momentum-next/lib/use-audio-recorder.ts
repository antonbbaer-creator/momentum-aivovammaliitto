'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type RecorderState = 'idle' | 'recording' | 'recorded' | 'error';

interface RecorderResult {
  state: RecorderState;
  error: string | null;
  recordedBlob: Blob | null;
  recordedUrl: string | null;
  durationMs: number;
  start: () => Promise<void>;
  stop: () => Promise<Blob | null>;
  reset: () => void;
}

/**
 * Selaimen MediaRecorder-pohjainen tallennin. Palauttaa Blobin (audio/webm
 * tai audio/mp4 selaimen tuesta riippuen), jonka voi lähettää suoraan
 * /api/transcribe-reitille FormDatan kentässä `audio`.
 */
export function useAudioRecorder(): RecorderResult {
  const [state, setState] = useState<RecorderState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef<number>(0);
  const tickRef = useRef<number | null>(null);
  const stopResolveRef = useRef<((b: Blob | null) => void) | null>(null);

  const cleanupStream = () => {
    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop();
      streamRef.current = null;
    }
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      cleanupStream();
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickMimeType = (): string | undefined => {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
    for (const m of candidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(m)) return m;
    }
    return undefined;
  };

  const start = useCallback(async () => {
    setError(null);
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedBlob(null);
    setRecordedUrl(null);
    setDurationMs(0);
    chunksRef.current = [];

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('Selain ei tue äänitallennusta.');
      setState('error');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = rec;

      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const type = mimeType || rec.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        cleanupStream();
        if (blob.size === 0) {
          setState('idle');
          setRecordedBlob(null);
          setRecordedUrl(null);
          stopResolveRef.current?.(null);
          stopResolveRef.current = null;
          return;
        }
        const url = URL.createObjectURL(blob);
        setRecordedBlob(blob);
        setRecordedUrl(url);
        setState('recorded');
        stopResolveRef.current?.(blob);
        stopResolveRef.current = null;
      };

      startedAtRef.current = Date.now();
      tickRef.current = window.setInterval(() => {
        setDurationMs(Date.now() - startedAtRef.current);
      }, 200);

      rec.start(1000); // chunkit sekunnin välein
      setState('recording');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Mikrofonin avaus epäonnistui.');
      setState('error');
      cleanupStream();
    }
  }, [recordedUrl]);

  const stop = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const rec = recorderRef.current;
      if (!rec || rec.state === 'inactive') {
        resolve(recordedBlob);
        return;
      }
      stopResolveRef.current = resolve;
      try {
        rec.stop();
      } catch {
        cleanupStream();
        setState('idle');
        resolve(null);
      }
    });
  }, [recordedBlob]);

  const reset = useCallback(() => {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedBlob(null);
    setRecordedUrl(null);
    setDurationMs(0);
    setError(null);
    setState('idle');
  }, [recordedUrl]);

  return { state, error, recordedBlob, recordedUrl, durationMs, start, stop, reset };
}

/** Mappaa Blob-MIME → tiedostopääte Whisperin hyväksymille muodoille. */
export function audioExtensionForBlob(blob: Blob): string {
  const t = (blob.type || '').toLowerCase();
  if (t.includes('mp4') || t.includes('m4a')) return 'm4a';
  if (t.includes('mpeg')) return 'mp3';
  if (t.includes('wav')) return 'wav';
  return 'webm';
}
