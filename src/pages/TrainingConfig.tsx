import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { client } from '../api/client';
import { Play, Settings, Database, Target, Cpu } from 'lucide-react';
import { useModelStore } from '../store/modelStore';
import { useTrainingConfigStore } from '../store/trainingConfigStore';

const TrainingConfig: React.FC = () => {
  const navigate = useNavigate();
  const { selectedModel, getSelectedModelName } = useModelStore();
  const { config, setConfig } = useTrainingConfigStore();
  
  const [datasets, setDatasets] = useState<any[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<any>(null);
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loadingDatasets, setLoadingDatasets] = useState(true);

  useEffect(() => {
    const fetchDatasets = async () => {
      try {
        setLoadingDatasets(true);
        const res = await client.get('/data/');
        if (res.data && res.data.length > 0) {
          const transformedDatasets = res.data.map((file: any) => ({
            id: file.id,
            filename: file.filename,
            file_path: file.file_path,
            rows: file.rows,
            columns: file.columns,
            column_names: file.column_info.map((col: any) => col.name),
            size: file.rows * file.columns * 8
          }));
          
          setDatasets(transformedDatasets);
          
          // 使用保存的数据集ID或默认第一个
          const savedDatasetId = config.selectedDatasetId;
          const targetDataset = savedDatasetId 
            ? transformedDatasets.find((d: any) => d.id === savedDatasetId) || transformedDatasets[0]
            : transformedDatasets[0];
          
          setSelectedDataset(targetDataset);
          setAvailableColumns(targetDataset.column_names);
          
          // 如果没有保存的目标列，自动选择包含'白度'的列
          if (!config.target_col) {
            const whitenessCol = targetDataset.column_names.find((col: string) => 
              col.includes('白度') || col.toLowerCase().includes('whiteness')
            );
            if (whitenessCol) {
              setConfig({ target_col: whitenessCol });
            }
          }
        }
      } catch (err) {
        console.error("Failed to fetch datasets", err);
        setError('无法加载数据集');
      } finally {
        setLoadingDatasets(false);
      }
    };
    fetchDatasets();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const newValue = type === 'number' ? Number(value) : value;
    setConfig({ [name]: newValue });
  };

  const handleDatasetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const datasetId = e.target.value;
    const dataset = datasets.find(d => d.id === datasetId);
    if (dataset) {
      setSelectedDataset(dataset);
      setAvailableColumns(dataset.column_names);
      setConfig({ selectedDatasetId: datasetId });
      
      // 尝试自动选择目标列
      const whitenessCol = dataset.column_names.find((col: string) => 
        col.includes('白度') || col.toLowerCase().includes('whiteness')
      );
      if (whitenessCol) {
        setConfig({ target_col: whitenessCol });
      } else {
        setConfig({ target_col: '' });
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedDataset) {
      setError('请选择数据集');
      return;
    }
    
    if (!config.target_col) {
      setError('请选择目标列');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const trainingConfig = {
        target_col: config.target_col,
        seq_len: config.seq_len,
        d_model: config.d_model,
        n_layers: config.n_layers,
        dropout: config.dropout,
        lr: config.lr,
        batch_size: config.batch_size,
        epochs: config.epochs,
        top_k: config.top_k,
        n_models: config.n_models,
      };

      const response = await client.post('/training/create', {
        data_id: selectedDataset.id,
        config: trainingConfig,
        model_type: selectedModel
      });
      
      navigate(`/monitor/${response.data.id}`);
    } catch (err: any) {
      setError(err.response?.data?.detail || '启动训练失败');
    } finally {
      setLoading(false);
    }
  };

  if (loadingDatasets) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-white p-12 rounded-lg shadow-sm text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">正在加载可用数据集...</p>
        </div>
      </div>
    );
  }

  if (datasets.length === 0) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-yellow-50 border border-yellow-200 p-6 rounded-lg">
          <p className="text-yellow-800 font-medium">未找到可用数据集</p>
          <p className="text-yellow-700 text-sm mt-2">
            请确保 <code className="bg-yellow-100 px-2 py-1 rounded">data/</code> 目录中有 CSV 文件
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-blue-600 p-6 rounded-lg shadow-lg text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Settings className="mr-3" size={32} />
            <div>
              <h2 className="text-2xl font-bold">训练配置</h2>
              <p className="text-indigo-100 text-sm mt-1">配置模型参数并开始训练（配置会自动保存）</p>
            </div>
          </div>
          <div className="flex items-center bg-white/20 px-4 py-2 rounded-lg">
            <Cpu className="mr-2" size={20} />
            <span className="font-medium">{getSelectedModelName()}</span>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow-sm">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-600 rounded-md text-sm flex items-center">
            <span className="font-medium">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Dataset Selection Section */}
          <div className="border-b border-gray-200 pb-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
              <Database className="mr-2 text-indigo-600" size={20} />
              数据集选择
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  选择数据集
                </label>
                <select
                  value={selectedDataset?.id || ''}
                  onChange={handleDatasetChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  required
                >
                  {datasets.map((dataset) => (
                    <option key={dataset.id} value={dataset.id}>
                      {dataset.filename} ({dataset.rows} 行, {dataset.columns} 列)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                  <Target className="mr-1 text-indigo-600" size={16} />
                  目标列 (预测对象)
                </label>
                <select
                  name="target_col"
                  value={config.target_col}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  required
                >
                  <option value="">请选择目标列...</option>
                  {availableColumns.map((col) => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Dataset Info */}
            {selectedDataset && (
              <div className="mt-4 p-4 bg-indigo-50 border border-indigo-200 rounded-md">
                <p className="text-sm text-indigo-900">
                  <span className="font-semibold">数据集信息：</span> 
                  {' '}{selectedDataset.rows.toLocaleString()} 行数据，
                  {' '}{selectedDataset.columns} 个特征列，
                  {' '}文件大小 {(selectedDataset.size / 1024).toFixed(2)} KB
                </p>
              </div>
            )}
          </div>

          {/* Model Configuration Section */}
          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">模型参数配置</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">序列长度 (Sequence Length)</label>
                <input
                  type="number"
                  name="seq_len"
                  value={config.seq_len}
                  onChange={handleChange}
                  min="1"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-xs text-gray-500 mt-1">时间序列的长度</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">模型维度 (d_model)</label>
                <input
                  type="number"
                  name="d_model"
                  value={config.d_model}
                  onChange={handleChange}
                  min="32"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-xs text-gray-500 mt-1">模型隐藏层维度</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">网络层数 (Layers)</label>
                <input
                  type="number"
                  name="n_layers"
                  value={config.n_layers}
                  onChange={handleChange}
                  min="1"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-xs text-gray-500 mt-1">网络深度</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">训练轮次 (Epochs)</label>
                <input
                  type="number"
                  name="epochs"
                  value={config.epochs}
                  onChange={handleChange}
                  min="1"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-xs text-gray-500 mt-1">训练迭代次数</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">批次大小 (Batch Size)</label>
                <input
                  type="number"
                  name="batch_size"
                  value={config.batch_size}
                  onChange={handleChange}
                  min="1"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-xs text-gray-500 mt-1">每批训练样本数</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">集成模型数量 (Ensemble)</label>
                <input
                  type="number"
                  name="n_models"
                  value={config.n_models}
                  onChange={handleChange}
                  min="1"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-xs text-gray-500 mt-1">多模型集成数量</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">特征选择数量 (Top K)</label>
                <input
                  type="number"
                  name="top_k"
                  value={config.top_k}
                  onChange={handleChange}
                  min="1"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-xs text-gray-500 mt-1">选择前K个重要特征</p>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end pt-4 border-t border-gray-200">
            <button
              type="submit"
              disabled={loading || !selectedDataset || !config.target_col}
              className={`flex items-center px-8 py-3 rounded-lg font-medium text-white transition-all shadow-md ${
                loading || !selectedDataset || !config.target_col
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 hover:shadow-lg'
              }`}
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  启动训练中...
                </>
              ) : (
                <>
                  <Play size={20} className="mr-2" />
                  开始训练
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TrainingConfig;
