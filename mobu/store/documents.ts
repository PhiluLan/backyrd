import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { seedDocuments } from '@/data/seed';
import { DocumentDraft, MobuDocument } from '@/types/document';

type DocumentsState = {
  documents: MobuDocument[];
  pendingDraft: DocumentDraft | null;
  hydrated: boolean;
  setPendingDraft: (draft: DocumentDraft | null) => void;
  addDocument: (draft: DocumentDraft) => MobuDocument;
  markPaid: (id: string) => void;
  setHydrated: (hydrated: boolean) => void;
};

export const useDocumentsStore = create<DocumentsState>()(
  persist(
    (set, get) => ({
      documents: seedDocuments,
      pendingDraft: null,
      hydrated: false,
      setPendingDraft: (pendingDraft) => set({ pendingDraft }),
      addDocument: (draft) => {
        const document: MobuDocument = {
          ...draft,
          id: `document-${Date.now()}`,
          createdAt: new Date().toISOString(),
        };
        set({ documents: [document, ...get().documents], pendingDraft: null });
        return document;
      },
      markPaid: (id) =>
        set((state) => ({
          documents: state.documents.map((document) =>
            document.id === id ? { ...document, status: 'paid' } : document,
          ),
        })),
      setHydrated: (hydrated) => set({ hydrated }),
    }),
    {
      name: 'mobu-documents',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ documents: state.documents }),
      onRehydrateStorage: () => (state) => state?.setHydrated(true),
    },
  ),
);
