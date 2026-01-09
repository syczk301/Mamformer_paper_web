import React from 'react';
import { useConfigSync } from '../hooks/useConfigSync';

interface ConfigSyncProviderProps {
  children: React.ReactNode;
}

// 配置同步提供者组件
// 负责在用户登录后自动加载云端配置，并在配置变化时自动同步
export function ConfigSyncProvider({ children }: ConfigSyncProviderProps) {
  // 使用配置同步 Hook
  useConfigSync();
  
  return <>{children}</>;
}
