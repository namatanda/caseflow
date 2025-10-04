import { create } from 'zustand';

export type ImportStage = 'queued' | 'validation' | 'parsing' | 'importing' | 'completed' | 'failed';

export interface ImportProgress {
  batchId: string;
  jobId: string;
  progress: number;
  stage: ImportStage;
  processedRecords?: number;
  totalRecords?: number;
  validRecords?: number;
  invalidRecords?: number;
  message?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface BatchInfo {
  id: string;
  fileName: string;
  fileSize: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  totalRecords: number;
  processedRecords: number;
  validRecords: number;
  invalidRecords: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

interface ImportState {
  activeImports: Map<string, ImportProgress>;
  recentBatches: BatchInfo[];
  updateProgress: (batchId: string, progress: ImportProgress) => void;
  removeImport: (batchId: string) => void;
  setRecentBatches: (batches: BatchInfo[]) => void;
  addBatch: (batch: BatchInfo) => void;
  clearActiveImports: () => void;
}

export const useImportStore = create<ImportState>((set) => ({
  activeImports: new Map(),
  recentBatches: [],

  updateProgress: (batchId, progress) =>
    set((state) => ({
      activeImports: new Map(state.activeImports).set(batchId, progress),
    })),

  removeImport: (batchId) =>
    set((state) => {
      const newMap = new Map(state.activeImports);
      newMap.delete(batchId);
      return { activeImports: newMap };
    }),

  setRecentBatches: (batches) => set({ recentBatches: batches }),

  addBatch: (batch) =>
    set((state) => ({
      recentBatches: [batch, ...state.recentBatches].slice(0, 50), // Keep last 50
    })),

  clearActiveImports: () => set({ activeImports: new Map() }),
}));