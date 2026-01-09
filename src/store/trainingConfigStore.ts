import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { saveUserConfig, loadUserConfig } from '../lib/supabase';

export interface TrainingConfigState {
  target_col: string;
  seq_len: number;
  d_model: number;
  n_layers: number;
  dropout: number;
  lr: number;
  batch_size: number;
  epochs: number;
  top_k: number;
  n_models: number;
  selectedDatasetId: string;
}

interface TrainingConfigStore {
  config: TrainingConfigState;
  isLoading: boolean;
  isSyncing: boolean;
  lastSyncTime: string | null;
  setConfig: (config: Partial<TrainingConfigState>) => void;
  resetConfig: () => void;
  syncToCloud: (userId: string) => Promise<void>;
  loadFromCloud: (userId: string) => Promise<void>;
}

const defaultConfig: TrainingConfigState = {
  target_col: '',
  seq_len: 12,
  d_model: 64,
  n_layers: 2,
  dropout: 0.3,
  lr: 0.001,
  batch_size: 32,
  epochs: 50,
  top_k: 12,
  n_models: 1,
  selectedDatasetId: '',
};

export const useTrainingConfigStore = create<TrainingConfigStore>()(
  persist(
    (set, get) => ({
      config: defaultConfig,
      isLoading: false,
      isSyncing: false,
      lastSyncTime: null,

      setConfig: (newConfig) => {
        set((state) => ({
          config: { ...state.config, ...newConfig },
        }));
      },

      resetConfig: () => set({ config: defaultConfig }),

      // 同步配置到 Supabase
      syncToCloud: async (userId: string) => {
        if (!userId) return;
        
        set({ isSyncing: true });
        try {
          const success = await saveUserConfig(userId, 'training', get().config);
          if (success) {
            set({ lastSyncTime: new Date().toISOString() });
          }
        } catch (error) {
          console.error('同步训练配置到云端失败:', error);
        } finally {
          set({ isSyncing: false });
        }
      },

      // 从 Supabase 加载配置
      loadFromCloud: async (userId: string) => {
        if (!userId) return;
        
        set({ isLoading: true });
        try {
          const cloudConfig = await loadUserConfig(userId, 'training');
          if (cloudConfig) {
            set({ 
              config: { ...defaultConfig, ...cloudConfig },
              lastSyncTime: new Date().toISOString(),
            });
          }
        } catch (error) {
          console.error('从云端加载训练配置失败:', error);
        } finally {
          set({ isLoading: false });
        }
      },
    }),
    {
      name: 'training-config-storage',
    }
  )
);
