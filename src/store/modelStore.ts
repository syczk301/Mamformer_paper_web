import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { saveUserConfig, loadUserConfig } from '../lib/supabase';

export interface ModelInfo {
  id: string;
  name: string;
}

interface ModelState {
  selectedModel: string;
  models: ModelInfo[];
  isSyncing: boolean;
  lastSyncTime: string | null;
  setSelectedModel: (modelId: string) => void;
  getSelectedModelName: () => string;
  syncToCloud: (userId: string) => Promise<void>;
  loadFromCloud: (userId: string) => Promise<void>;
}

export const useModelStore = create<ModelState>()(
  persist(
    (set, get) => ({
      selectedModel: 'mamformer',
      models: [
        { id: 'mamformer', name: 'Mamformer' },
        { id: 'auto-mamformer', name: 'Auto-Mamformer' },
        // 后续可添加更多模型
      ],
      isSyncing: false,
      lastSyncTime: null,

      setSelectedModel: (modelId: string) => set({ selectedModel: modelId }),

      getSelectedModelName: () => {
        const state = get();
        const model = state.models.find(m => m.id === state.selectedModel);
        return model?.name || 'Mamformer';
      },

      // 同步配置到 Supabase
      syncToCloud: async (userId: string) => {
        if (!userId) return;
        
        set({ isSyncing: true });
        try {
          const success = await saveUserConfig(userId, 'model', {
            selectedModel: get().selectedModel,
          });
          if (success) {
            set({ lastSyncTime: new Date().toISOString() });
          }
        } catch (error) {
          console.error('同步模型配置到云端失败:', error);
        } finally {
          set({ isSyncing: false });
        }
      },

      // 从 Supabase 加载配置
      loadFromCloud: async (userId: string) => {
        if (!userId) return;
        
        try {
          const cloudConfig = await loadUserConfig(userId, 'model');
          if (cloudConfig && cloudConfig.selectedModel) {
            set({ 
              selectedModel: cloudConfig.selectedModel,
              lastSyncTime: new Date().toISOString(),
            });
          }
        } catch (error) {
          console.error('从云端加载模型配置失败:', error);
        }
      },
    }),
    {
      name: 'model-storage',
    }
  )
);
