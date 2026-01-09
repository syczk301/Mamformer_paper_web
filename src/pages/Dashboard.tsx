import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Settings, Activity, History, Sparkles, ChevronDown, Cpu, Play, Loader2, Cloud, CloudOff } from 'lucide-react';
import { useModelStore } from '../store/modelStore';
import { useTrainingConfigStore } from '../store/trainingConfigStore';
import { useAuthStore } from '../store/authStore';
import { client } from '../api/client';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { selectedModel, models, setSelectedModel, getSelectedModelName, isSyncing: isModelSyncing, lastSyncTime: modelSyncTime } = useModelStore();
  const { config, isSyncing: isConfigSyncing, lastSyncTime: configSyncTime } = useTrainingConfigStore();
  const { user } = useAuthStore();
  
  const isSyncing = isModelSyncing || isConfigSyncing;
  const lastSyncTime = modelSyncTime || configSyncTime;
  
  const [datasets, setDatasets] = useState<any[]>([]);
  const [quickStartLoading, setQuickStartLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchDatasets = async () => {
      try {
        const res = await client.get('/data/');
        if (res.data && res.data.length > 0) {
          setDatasets(res.data);
        }
      } catch (err) {
        console.error("Failed to fetch datasets", err);
      }
    };
    fetchDatasets();
  }, []);

  const handleQuickStart = async () => {
    if (datasets.length === 0) {
      setError('没有可用的数据集');
      return;
    }

    // 使用保存的配置或默认配置
    const datasetId = config.selectedDatasetId || datasets[0].id;
    const dataset = datasets.find(d => d.id === datasetId) || datasets[0];
    
    // 自动选择目标列（优先使用保存的，否则自动检测）
    let targetCol = config.target_col;
    if (!targetCol && dataset.column_info) {
      const whitenessCol = dataset.column_info.find((col: any) => 
        col.name.includes('白度') || col.name.toLowerCase().includes('whiteness')
      );
      targetCol = whitenessCol?.name || dataset.column_info[0]?.name;
    }

    if (!targetCol) {
      setError('无法确定目标列，请前往训练配置页面手动选择');
      return;
    }

    setQuickStartLoading(true);
    setError('');

    try {
      const trainingConfig = {
        target_col: targetCol,
        seq_len: config.seq_len || 12,
        d_model: config.d_model || 64,
        n_layers: config.n_layers || 2,
        dropout: config.dropout || 0.3,
        lr: config.lr || 0.001,
        batch_size: config.batch_size || 32,
        epochs: config.epochs || 50,
        top_k: config.top_k || 12,
        n_models: config.n_models || 1,
      };

      const response = await client.post('/training/create', {
        data_id: dataset.id,
        config: trainingConfig,
        model_type: selectedModel
      });

      navigate(`/monitor/${response.data.id}`);
    } catch (err: any) {
      setError(err.response?.data?.detail || '启动训练失败');
    } finally {
      setQuickStartLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 模型选择区域 */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <Cpu className="text-blue-600" size={24} />
            <h2 className="text-lg font-semibold text-gray-800">选择预测模型</h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="appearance-none bg-gray-50 border border-gray-300 text-gray-700 py-2.5 px-4 pr-10 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer text-base font-medium"
              >
                {models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 pointer-events-none" size={18} />
            </div>
            
            {/* 快速开始按钮 */}
            <button
              onClick={handleQuickStart}
              disabled={quickStartLoading || datasets.length === 0}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-white transition-all ${
                quickStartLoading || datasets.length === 0
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 shadow-md hover:shadow-lg'
              }`}
            >
              {quickStartLoading ? (
                <>
                  <Loader2 className="animate-spin" size={18} />
                  启动中...
                </>
              ) : (
                <>
                  <Play size={18} />
                  快速开始训练
                </>
              )}
            </button>
          </div>
        </div>
        
        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-md text-sm">
            {error}
          </div>
        )}
        
        {/* 当前配置预览 */}
        <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            当前配置：<span className="font-medium text-gray-700">{getSelectedModelName()}</span>
            {config.target_col && (
              <> · 目标列: <span className="font-medium text-gray-700">{config.target_col}</span></>
            )}
            {' '}· {config.epochs || 50} 轮次 · {config.n_models || 1} 个模型
            <Link to="/config" className="ml-3 text-blue-600 hover:underline">
              修改配置 →
            </Link>
          </p>
          
          {/* 云同步状态 */}
          {user && (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              {isSyncing ? (
                <>
                  <Loader2 size={14} className="animate-spin text-blue-500" />
                  <span>同步中...</span>
                </>
              ) : lastSyncTime ? (
                <>
                  <Cloud size={14} className="text-green-500" />
                  <span>已同步到云端</span>
                </>
              ) : (
                <>
                  <CloudOff size={14} className="text-gray-400" />
                  <span>本地存储</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 错误提示 */}
      {datasets.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
          <p className="text-yellow-800 text-sm">
            未检测到数据集，请确保 <code className="bg-yellow-100 px-1 rounded">data/</code> 目录中有 CSV 文件
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link to="/config" className="block group">
          <div className="bg-white p-6 rounded-lg shadow-sm hover:shadow-md transition-shadow border-t-4 border-indigo-500 h-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">训练配置</h3>
              <Settings className="text-indigo-500 group-hover:scale-110 transition-transform" size={24} />
            </div>
            <p className="text-gray-500 text-sm">
              选择数据集和目标列，配置模型参数。
            </p>
          </div>
        </Link>

        <Link to="/prediction" className="block group">
          <div className="bg-white p-6 rounded-lg shadow-sm hover:shadow-md transition-shadow border-t-4 border-purple-500 h-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">实时预测</h3>
              <Sparkles className="text-purple-500 group-hover:scale-110 transition-transform" size={24} />
            </div>
            <p className="text-gray-500 text-sm">
              使用训练好的模型进行实时预测，快速获取结果。
            </p>
          </div>
        </Link>
        
        <Link to="/history" className="block group">
          <div className="bg-white p-6 rounded-lg shadow-sm hover:shadow-md transition-shadow border-t-4 border-pink-500 h-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">训练历史</h3>
              <History className="text-pink-500 group-hover:scale-110 transition-transform" size={24} />
            </div>
            <p className="text-gray-500 text-sm">
              查看历史训练任务，监控进度并下载结果。
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
};

export default Dashboard;
