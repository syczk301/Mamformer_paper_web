import { createClient } from '@supabase/supabase-js';

// Supabase 配置 - 请替换为您的实际配置
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 用户配置表结构
export interface UserConfig {
  id?: string;
  user_id: string;
  config_type: 'training' | 'model' | 'general';
  config_data: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

// 保存用户配置到 Supabase
export async function saveUserConfig(
  userId: string,
  configType: 'training' | 'model' | 'general',
  configData: Record<string, any>
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('user_configs')
      .upsert(
        {
          user_id: userId,
          config_type: configType,
          config_data: configData,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id,config_type',
        }
      );

    if (error) {
      console.error('保存配置失败:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('保存配置异常:', err);
    return false;
  }
}

// 从 Supabase 加载用户配置
export async function loadUserConfig(
  userId: string,
  configType: 'training' | 'model' | 'general'
): Promise<Record<string, any> | null> {
  try {
    const { data, error } = await supabase
      .from('user_configs')
      .select('config_data')
      .eq('user_id', userId)
      .eq('config_type', configType)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // 没有找到记录，返回 null
        return null;
      }
      console.error('加载配置失败:', error);
      return null;
    }
    return data?.config_data || null;
  } catch (err) {
    console.error('加载配置异常:', err);
    return null;
  }
}

// 加载用户所有配置
export async function loadAllUserConfigs(userId: string): Promise<{
  training: Record<string, any> | null;
  model: Record<string, any> | null;
  general: Record<string, any> | null;
}> {
  try {
    const { data, error } = await supabase
      .from('user_configs')
      .select('config_type, config_data')
      .eq('user_id', userId);

    if (error) {
      console.error('加载所有配置失败:', error);
      return { training: null, model: null, general: null };
    }

    const result: {
      training: Record<string, any> | null;
      model: Record<string, any> | null;
      general: Record<string, any> | null;
    } = { training: null, model: null, general: null };

    data?.forEach((item: any) => {
      if (item.config_type === 'training') {
        result.training = item.config_data;
      } else if (item.config_type === 'model') {
        result.model = item.config_data;
      } else if (item.config_type === 'general') {
        result.general = item.config_data;
      }
    });

    return result;
  } catch (err) {
    console.error('加载所有配置异常:', err);
    return { training: null, model: null, general: null };
  }
}
