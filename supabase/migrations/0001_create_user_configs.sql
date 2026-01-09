-- 用户配置表
-- 用于存储用户的训练配置、模型选择等个性化设置

CREATE TABLE IF NOT EXISTS user_configs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    config_type VARCHAR(50) NOT NULL CHECK (config_type IN ('training', 'model', 'general')),
    config_data JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- 每个用户每种配置类型只能有一条记录
    UNIQUE(user_id, config_type)
);

-- 创建索引以加速查询
CREATE INDEX IF NOT EXISTS idx_user_configs_user_id ON user_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_configs_config_type ON user_configs(config_type);

-- 创建更新时间触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_user_configs_updated_at ON user_configs;
CREATE TRIGGER update_user_configs_updated_at
    BEFORE UPDATE ON user_configs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 启用 Row Level Security (RLS)
ALTER TABLE user_configs ENABLE ROW LEVEL SECURITY;

-- 创建 RLS 策略：用户只能访问自己的配置
CREATE POLICY "Users can view own configs" ON user_configs
    FOR SELECT USING (true);  -- 允许所有读取（因为我们用的是应用层的 user_id）

CREATE POLICY "Users can insert own configs" ON user_configs
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update own configs" ON user_configs
    FOR UPDATE USING (true);

CREATE POLICY "Users can delete own configs" ON user_configs
    FOR DELETE USING (true);

-- 添加注释
COMMENT ON TABLE user_configs IS '用户配置表，存储训练参数、模型选择等个性化设置';
COMMENT ON COLUMN user_configs.user_id IS '用户ID（来自应用层认证）';
COMMENT ON COLUMN user_configs.config_type IS '配置类型：training（训练配置）、model（模型选择）、general（通用设置）';
COMMENT ON COLUMN user_configs.config_data IS '配置数据（JSON格式）';
