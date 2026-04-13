'use client';

import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { DEFAULT_MODULES, MODULE_ORDER, MODULE_REGISTRY, getDefaultModules } from '@/lib/modules';

export default function DebugModulesPage() {
  const [log, setLog] = useState<string[]>([]);
  const [modules, setModules] = useState<Record<string, boolean> | null>(null);
  const [orgId, setOrgId] = useState('avl');

  const addLog = (msg: string) => {
    console.log('[DEBUG]', msg);
    setLog(prev => [...prev, `${new Date().toLocaleTimeString()} ${msg}`]);
  };

  const readModules = async () => {
    addLog(`Reading modules for org: ${orgId}...`);
    try {
      const snap = await getDoc(doc(db, 'organizations', orgId, 'data', 'modules'));
      if (snap.exists()) {
        const data = JSON.parse(snap.data().v || '{}');
        setModules(data);
        addLog(`OK - Found ${Object.keys(data).length} module keys: ${Object.entries(data).filter(([,v]) => v).map(([k]) => k).join(', ')}`);
      } else {
        const defaults = getDefaultModules(orgId);
        setModules(defaults);
        addLog(`Document does not exist - using defaults`);
      }
    } catch (err: any) {
      addLog(`READ ERROR: ${err.code || err.message}`);
    }
  };

  const toggleModule = async (modId: string) => {
    if (!modules) return;
    const current = modules[modId] ?? false;
    const updated = { ...modules, [modId]: !current };
    addLog(`Toggle ${modId}: ${current} -> ${!current}`);

    // Update local state first
    setModules(updated);

    // Write to Firestore
    try {
      await setDoc(doc(db, 'organizations', orgId, 'data', 'modules'), {
        v: JSON.stringify(updated),
        ts: Date.now(),
        updatedBy: 'debug-page',
      });
      addLog(`WRITE OK for ${modId}`);
    } catch (err: any) {
      addLog(`WRITE ERROR: ${err.code || ''} ${err.message}`);
      // Revert
      setModules(prev => prev ? { ...prev, [modId]: current } : prev);
    }
  };

  const verifyPersistence = async () => {
    addLog('Verifying persistence - re-reading from Firestore...');
    try {
      const snap = await getDoc(doc(db, 'organizations', orgId, 'data', 'modules'));
      if (snap.exists()) {
        const data = JSON.parse(snap.data().v || '{}');
        const mismatches: string[] = [];
        if (modules) {
          for (const key of Object.keys(modules)) {
            if (modules[key] !== data[key]) {
              mismatches.push(`${key}: local=${modules[key]} firestore=${data[key]}`);
            }
          }
        }
        if (mismatches.length === 0) {
          addLog('VERIFY OK - Local state matches Firestore');
        } else {
          addLog(`VERIFY MISMATCH: ${mismatches.join(', ')}`);
        }
      }
    } catch (err: any) {
      addLog(`VERIFY ERROR: ${err.code || err.message}`);
    }
  };

  useEffect(() => { readModules(); }, [orgId]);

  return (
    <div style={{ padding: '2rem', maxWidth: 800, margin: '0 auto', fontFamily: 'monospace', background: '#0a0f1a', color: '#e0e0e0', minHeight: '100vh' }}>
      <h1 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>Module Toggle Debug</h1>

      <div style={{ marginBottom: '1rem', display: 'flex', gap: '.5rem' }}>
        {['avl', 'llff', 'juhlatoimikunta'].map(id => (
          <button key={id} onClick={() => setOrgId(id)} style={{
            padding: '.4rem .8rem', borderRadius: 4, border: '1px solid',
            borderColor: orgId === id ? '#4cf' : '#333',
            background: orgId === id ? '#1a3a5a' : '#111',
            color: orgId === id ? '#4cf' : '#999', cursor: 'pointer',
          }}>{id}</button>
        ))}
      </div>

      {modules && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '.4rem', marginBottom: '1rem' }}>
          {MODULE_ORDER.map(modId => {
            const mod = MODULE_REGISTRY[modId];
            const enabled = modules[modId] ?? false;
            return (
              <div key={modId} onClick={() => toggleModule(modId)} style={{
                display: 'flex', alignItems: 'center', gap: '.4rem', padding: '.5rem .6rem',
                background: enabled ? 'rgba(68,204,255,.1)' : '#111',
                border: `1px solid ${enabled ? '#4cf' : '#333'}`,
                borderRadius: 4, cursor: 'pointer',
              }}>
                <span style={{ fontSize: '.8rem' }}>{mod?.icon}</span>
                <span style={{ fontSize: '.75rem', flex: 1 }}>{mod?.label}</span>
                <span style={{ fontSize: '.65rem', color: enabled ? '#4f8' : '#f44' }}>{enabled ? 'ON' : 'OFF'}</span>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1rem' }}>
        <button onClick={readModules} style={{ padding: '.4rem .8rem', background: '#1a3a1a', border: '1px solid #4f8', borderRadius: 4, color: '#4f8', cursor: 'pointer' }}>
          Re-read Firestore
        </button>
        <button onClick={verifyPersistence} style={{ padding: '.4rem .8rem', background: '#3a3a1a', border: '1px solid #ff4', borderRadius: 4, color: '#ff4', cursor: 'pointer' }}>
          Verify Persistence
        </button>
      </div>

      <div style={{ background: '#0d1117', border: '1px solid #333', borderRadius: 4, padding: '.75rem', maxHeight: 300, overflowY: 'auto' }}>
        <div style={{ fontSize: '.7rem', color: '#666', marginBottom: '.3rem' }}>Console Log:</div>
        {log.map((l, i) => (
          <div key={i} style={{ fontSize: '.72rem', lineHeight: 1.5, color: l.includes('ERROR') ? '#f44' : l.includes('OK') ? '#4f8' : '#ccc' }}>{l}</div>
        ))}
        {log.length === 0 && <div style={{ color: '#555', fontSize: '.72rem' }}>Loading...</div>}
      </div>
    </div>
  );
}
