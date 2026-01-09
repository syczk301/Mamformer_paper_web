import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { useTrainingConfigStore } from '../store/trainingConfigStore';
import { useModelStore } from '../store/modelStore';

// 防抖时间（毫秒）
const SYNC_DEBOUNCE_MS = 2000;

export function useConfigSync() {
  const { user, isAuthenticated } = useAuthStore();
  const { config, syncToCloud: syncTrainingConfig, loadFromCloud: loadTrainingConfig } = useTrainingConfigStore();
  const { selectedModel, syncToCloud: syncModelConfig, loadFromCloud: loadModelConfig } = useModelStore();
  
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasLoadedRef = useRef(false);

  // 从云端加载配置（登录后执行一次）
  useEffect(() => {
    if (isAuthenticated && user?.id && !hasLoadedRef.current) {
      hasLoadedRef.current = true;
      
      // 并行加载所有配置
      Promise.all([
        loadTrainingConfig(user.id),
        loadModelConfig(user.id),
      ]).then(() => {
        console.log('云端配置加载完成');
      }).catch((err) => {
        console.error('加载云端配置失败:', err);
      });
    }
    
    // 用户登出时重置标记
    if (!isAuthenticated) {
      hasLoadedRef.current = false;
    }
  }, [isAuthenticated, user?.id, loadTrainingConfig, loadModelConfig]);

  // 防抖同步函数
  const debouncedSync = useCallback(() => {
    if (!isAuthenticated || !user?.id) return;

    // 清除之前的定时器
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }

    // 设置新的定时器
    syncTimeoutRef.current = setTimeout(() => {
      Promise.all([
        syncTrainingConfig(user.id),
        syncModelConfig(user.id),
      ]).then(() => {
        console.log('配置已同步到云端');
      }).catch((err) => {
        console.error('同步配置失败:', err);
      });
    }, SYNC_DEBOUNCE_MS);
  }, [isAuthenticated, user?.id, syncTrainingConfig, syncModelConfig]);

  // 监听配置变化，自动同步
  useEffect(() => {
    if (hasLoadedRef.current && isAuthenticated && user?.id) {
      debouncedSync();
    }

    // 清理定时器
    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [config, selectedModel, debouncedSync, isAuthenticated, user?.id]);

  // 手动同步函数
  const manualSync = useCallback(async () => {
    if (!isAuthenticated || !user?.id) return;
    
    await Promise.all([
      syncTrainingConfig(user.id),
      syncModelConfig(user.id),
    ]);
  }, [isAuthenticated, user?.id, syncTrainingConfig, syncModelConfig]);

  return { manualSync };
}
