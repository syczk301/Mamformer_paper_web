import React, { useState, useEffect } from 'react';
import { client } from '../api/client';
import { Sparkles, TrendingUp, RefreshCw, Download, AlertCircle } from 'lucide-react';

interface ModelInfo {
  id: string;
  task_id: string;
  target_col: string;
  created_at: string;
  r2_score: number;
}

interface PredictionResult {
  prediction: number;
  confidence_interval?: [number, number];
  input_features: Record<string, number>;
}

const Prediction: React.FC = () => {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [features, setFeatures] = useState<Record<string, number>>({});
  const [featureNames, setFeatureNames] = useState<string[]>([]);
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingModels, setLoadingModels] = useState(true);
  const [error, setError] = useState('');

  // 获取可用模型列表
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const response = await client.get('/training/');
        const completedTasks = response.data.filter((task: any) => task.status === 'completed');
        
        // 获取每个任务的结果以获取R²分数
        const modelsWithScores = await Promise.all(
          completedTasks.map(async (task: any) => {
            try {
              const resultResponse = await client.get(`/training/${task.id}/result`);
              return {
                id: task.id,
                task_id: task.id,
                target_col: task.config?.target_col || '未知',
                created_at: task.created_at,
                r2_score: resultResponse.data.r2_score || 0
              };
            } catch {
              return {
                id: task.id,
                task_id: task.id,
                target_col: task.config?.target_col || '未知',
                created_at: task.created_at,
                r2_score: 0
              };
            }
          })
        );
        
        setModels(modelsWithScores);
      } catch (err) {
        console.error('获取模型列表失败:', err);
      } finally {
        setLoadingModels(false);
      }
    };

    fetchModels();
  }, []);

  // 当选择模型时，获取特征列表
  useEffect(() => {
    if (selectedModel) {
      const fetchFeatures = async () => {
        try {
          const response = await client.get(`/prediction/features/${selectedModel}`);
          const featuresData = response.data.features;
          setFeatureNames(featuresData);
          
          // 初始化特征值为0
          const initialFeatures: Record<string, number> = {};
          featuresData.forEach((feature: string) => {
            initialFeatures[feature] = 0;
          });
          setFeatures(initialFeatures);
          setPrediction(null);
        } catch (err: any) {
          setError(err.response?.data?.detail || '获取特征列表失败');
        }
      };

      fetchFeatures();
    }
  }, [selectedModel]);

  // 实时预测
  const handlePredict = async () => {
    if (!selectedModel || Object.keys(features).length === 0) {
      setError('请先选择模型并输入特征值');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await client.post(`/prediction/predict/${selectedModel}`, {
        features: features
      });
      setPrediction(response.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || '预测失败');
    } finally {
      setLoading(false);
    }
  };

  // 更新特征值
  const handleFeatureChange = (featureName: string, value: string) => {
    const numValue = parseFloat(value) || 0;
    setFeatures(prev => ({
      ...prev,
      [featureName]: numValue
    }));
  };

  // 随机填充特征值（用于演示）
  const handleRandomFill = () => {
    const randomFeatures: Record<string, number> = {};
    featureNames.forEach(feature => {
      randomFeatures[feature] = Math.random() * 100;
    });
    setFeatures(randomFeatures);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white p-6 rounded-lg shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center">
              <Sparkles className="mr-3" size={32} />
              实时预测
            </h1>
            <p className="mt-2 text-purple-100">使用训练好的模型进行实时预测</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-purple-200">可用模型</p>
            <p className="text-3xl font-bold">{models.length}</p>
          </div>
        </div>
      </div>

      {loadingModels ? (
        <div className="text-center py-12">
          <RefreshCw className="animate-spin mx-auto mb-4 text-gray-400" size={48} />
          <p className="text-gray-500">正在加载模型列表...</p>
        </div>
      ) : models.length === 0 ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <AlertCircle className="mx-auto mb-4 text-yellow-600" size={48} />
          <p className="text-yellow-800 font-medium">暂无可用模型</p>
          <p className="text-yellow-600 text-sm mt-2">请先训练一个模型</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 左侧：模型选择和输入 */}
          <div className="lg:col-span-2 space-y-6">
            {/* 模型选择 */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold mb-4 flex items-center">
                <TrendingUp className="mr-2 text-purple-600" size={24} />
                选择模型
              </h2>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="">-- 请选择模型 --</option>
                {models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.target_col} (R² = {model.r2_score.toFixed(4)}) - {new Date(model.created_at).toLocaleString('zh-CN')}
                  </option>
                ))}
              </select>
            </div>

            {/* 特征输入 */}
            {selectedModel && featureNames.length > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold">输入特征</h2>
                  <button
                    onClick={handleRandomFill}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm flex items-center"
                  >
                    <RefreshCw size={16} className="mr-2" />
                    随机填充
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-96 overflow-y-auto">
                  {featureNames.map((feature) => (
                    <div key={feature}>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {feature}
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={features[feature] || 0}
                        onChange={(e) => handleFeatureChange(feature, e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        placeholder="输入数值"
                      />
                    </div>
                  ))}
                </div>

                <button
                  onClick={handlePredict}
                  disabled={loading}
                  className="mt-6 w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-semibold hover:from-purple-700 hover:to-pink-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="animate-spin mr-2" size={20} />
                      预测中...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2" size={20} />
                      开始预测
                    </>
                  )}
                </button>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start">
                <AlertCircle className="text-red-600 mr-3 flex-shrink-0" size={20} />
                <p className="text-red-800">{error}</p>
              </div>
            )}
          </div>

          {/* 右侧：预测结果 */}
          <div className="lg:col-span-1">
            <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg shadow-md p-6 sticky top-6">
              <h2 className="text-xl font-semibold mb-4 text-purple-900">预测结果</h2>
              {prediction ? (
                <div className="space-y-4">
                  <div className="bg-white rounded-lg p-6 shadow-sm">
                    <p className="text-sm text-gray-600 mb-2">预测值</p>
                    <p className="text-4xl font-bold text-purple-600">
                      {prediction.prediction.toFixed(4)}
                    </p>
                  </div>

                  {prediction.confidence_interval && (
                    <div className="bg-white rounded-lg p-4 shadow-sm">
                      <p className="text-sm text-gray-600 mb-2">置信区间 (95%)</p>
                      <p className="text-lg font-semibold text-gray-800">
                        [{prediction.confidence_interval[0].toFixed(4)}, {prediction.confidence_interval[1].toFixed(4)}]
                      </p>
                    </div>
                  )}

                  <div className="bg-white rounded-lg p-4 shadow-sm">
                    <p className="text-sm text-gray-600 mb-3">输入特征摘要</p>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {Object.entries(prediction.input_features).slice(0, 5).map(([key, value]) => (
                        <div key={key} className="flex justify-between text-sm">
                          <span className="text-gray-600 truncate mr-2">{key}</span>
                          <span className="font-medium text-gray-800">{value.toFixed(2)}</span>
                        </div>
                      ))}
                      {Object.keys(prediction.input_features).length > 5 && (
                        <p className="text-xs text-gray-500 text-center mt-2">
                          ... 还有 {Object.keys(prediction.input_features).length - 5} 个特征
                        </p>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      const data = JSON.stringify(prediction, null, 2);
                      const blob = new Blob([data], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `prediction_${Date.now()}.json`;
                      a.click();
                    }}
                    className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center text-sm"
                  >
                    <Download size={16} className="mr-2" />
                    下载预测结果
                  </button>
                </div>
              ) : (
                <div className="text-center py-12 text-gray-400">
                  <Sparkles size={48} className="mx-auto mb-4 opacity-50" />
                  <p>选择模型并输入特征后</p>
                  <p>点击"开始预测"查看结果</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Prediction;
