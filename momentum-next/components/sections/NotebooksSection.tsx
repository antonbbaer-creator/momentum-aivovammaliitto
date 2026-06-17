'use client';

import { useState } from 'react';
import { deleteDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { useUserData } from '@/lib/use-user-data';
import { Notebook, NotebookFolder, NotebooksDoc } from '@/lib/notebooks-shared';
import { newId } from '@/lib/personal-shared';
import NotebookShelf from '@/components/notebooks/NotebookShelf';
import NotebookView from '@/components/notebooks/NotebookView';
import NotebookCustomizer from '@/components/notebooks/NotebookCustomizer';

// Muistiinpanot — henkilökohtaiset muistikirjat hyllyssä, kansioittain.
// Metadata yhdessä docissa ('notebooks'), sivusisältö per kirja
// ('notebookPages_{id}', NotebookView'n sisällä). Haku ei v1:ssä.

const EMPTY_DOC: NotebooksDoc = { folders: [], notebooks: [] };

type CustomizerState = { mode: 'create'; folderId: string | null } | { mode: 'edit'; id: string } | null;

export default function NotebooksSection() {
  const { user } = useAuth();
  const [data, setData, loading] = useUserData<NotebooksDoc>('notebooks', EMPTY_DOC);
  const [openId, setOpenId] = useState<string | null>(null);
  const [customizer, setCustomizer] = useState<CustomizerState>(null);

  const folders = data.folders || [];
  const notebooks = data.notebooks || [];
  const openNotebook = openId ? notebooks.find((n) => n.id === openId) || null : null;
  const editTarget = customizer?.mode === 'edit' ? notebooks.find((n) => n.id === customizer.id) || null : null;

  const updateNotebook = (id: string, patch: Partial<Notebook>) => {
    setData((prev) => ({
      ...prev,
      notebooks: (prev.notebooks || []).map((n) => (n.id === id ? { ...n, ...patch } : n)),
    }));
  };

  const saveNotebook = (nb: Notebook) => {
    setData((prev) => {
      const list = prev.notebooks || [];
      const exists = list.some((n) => n.id === nb.id);
      return {
        ...prev,
        notebooks: exists ? list.map((n) => (n.id === nb.id ? nb : n)) : [...list, nb],
      };
    });
    const isNew = customizer?.mode === 'create';
    setCustomizer(null);
    if (isNew) setOpenId(nb.id);
  };

  const deleteNotebook = async (nb: Notebook) => {
    if (!window.confirm(`Poistetaanko muistikirja "${nb.title || 'Nimetön'}" ja kaikki sen sivut?`)) return;
    setData((prev) => ({ ...prev, notebooks: (prev.notebooks || []).filter((n) => n.id !== nb.id) }));
    setCustomizer(null);
    if (openId === nb.id) setOpenId(null);
    // Best-effort-siivous: orvoksi jäävä sivut-doc on harmiton jos poisto epäonnistuu
    if (user) {
      try {
        await deleteDoc(doc(db, 'users', user.uid, 'personalData', `notebookPages_${nb.id}`));
      } catch {
        /* noop */
      }
    }
  };

  const createFolder = (name: string) => {
    const folder: NotebookFolder = { id: newId(), name: name.trim(), createdAt: Date.now() };
    if (!folder.name) return;
    setData((prev) => ({ ...prev, folders: [...(prev.folders || []), folder] }));
  };

  const renameFolder = (id: string, name: string) => {
    if (!name.trim()) return;
    setData((prev) => ({
      ...prev,
      folders: (prev.folders || []).map((f) => (f.id === id ? { ...f, name: name.trim() } : f)),
    }));
  };

  const deleteFolder = (folder: NotebookFolder) => {
    if (!window.confirm(`Poistetaanko kansio "${folder.name}"? Muistikirjat säilyvät ilman kansiota.`)) return;
    setData((prev) => ({
      ...prev,
      folders: (prev.folders || []).filter((f) => f.id !== folder.id),
      notebooks: (prev.notebooks || []).map((n) => (n.folderId === folder.id ? { ...n, folderId: null } : n)),
    }));
  };

  if (loading) {
    return <div style={{ color: 'var(--t3)', fontSize: '.85rem', padding: '2rem 0' }}>Ladataan muistikirjoja…</div>;
  }

  if (openNotebook) {
    return (
      <>
        {/* key={id}: kirjan vaihto unmounttaa näkymän, jolloin sivut-docin
            odottava debounce-kirjoitus ehtii oikeaan dociin (use-user-data.ts) */}
        <NotebookView
          key={openNotebook.id}
          notebook={openNotebook}
          onBack={() => setOpenId(null)}
          onEditCover={() => setCustomizer({ mode: 'edit', id: openNotebook.id })}
          onMeta={(patch) => updateNotebook(openNotebook.id, patch)}
        />
        {editTarget && (
          <NotebookCustomizer
            key={editTarget.id}
            mode="edit"
            initial={editTarget}
            folders={folders}
            onSave={saveNotebook}
            onCancel={() => setCustomizer(null)}
            onDelete={() => deleteNotebook(editTarget)}
          />
        )}
      </>
    );
  }

  return (
    <>
      <NotebookShelf
        folders={folders}
        notebooks={notebooks}
        onOpen={(id) => setOpenId(id)}
        onEdit={(nb) => setCustomizer({ mode: 'edit', id: nb.id })}
        onNew={(folderId) => setCustomizer({ mode: 'create', folderId })}
        onCreateFolder={createFolder}
        onRenameFolder={renameFolder}
        onDeleteFolder={deleteFolder}
      />
      {customizer?.mode === 'create' && (
        <NotebookCustomizer
          mode="create"
          initial={null}
          defaultFolderId={customizer.folderId}
          folders={folders}
          onSave={saveNotebook}
          onCancel={() => setCustomizer(null)}
        />
      )}
      {customizer?.mode === 'edit' && editTarget && (
        <NotebookCustomizer
          key={editTarget.id}
          mode="edit"
          initial={editTarget}
          folders={folders}
          onSave={saveNotebook}
          onCancel={() => setCustomizer(null)}
          onDelete={() => deleteNotebook(editTarget)}
        />
      )}
    </>
  );
}
