import React, { useState, useEffect, useRef } from 'react';
import { client } from '../api/client';
import { Line, Bar } from 'react-chartjs-2';
import { Activity, TrendingUp, Target, Zap, AlertCircle } from 'lucide-react';
import { useModelStore } from '../store/modelStore';

const Display: React.FC = () => {
  const { selectedModel, getSelectedModelName } = useModelStore();
  const [latestTask, setLatestTask] = useState<any>(null);
  const [prediction, setPrediction] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [streamingData, setStreamingData] = useState<{predictions: number[], trueValues: number[]}>({
    predictions: [],
    trueValues: []
  });
  const [dataIndex, setDataIndex] = useState(0);
  const [noDataForModel, setNoDataForModel] = useState(false);
  const maxDataPoints = 50; // 显示最近50个数据点
  const prevPredictionRef = useRef<any>(null);
  const prevModelRef = useRef<string>(selectedModel);

  // 获取当前选择模型的最新完成训练任务和结果
  const fetchLatestData = async () => {
    try {
      setNoDataForModel(false);
      // 获取所有已完成任务
      const tasksRes = await client.get('/training/');
      const completedTasks = tasksRes.data.filter((t: any) => t.status === 'completed');
      
      // 根据当前选择的模型筛选任务
      const modelTasks = completedTasks.filter((t: any) => {
        const taskModelType = t.config?.model_type || 'mamformer';
        return taskModelType === selectedModel;
      });
      
      if (modelTasks.length > 0) {
        const latest = modelTasks[0];
        setLatestTask(latest);

        // 获取该任务的结果
        const resultRes = await client.get(`/training/${latest.id}/result`);
        
        // 检查数据是否有变化或模型是否切换
        const modelChanged = prevModelRef.current !== selectedModel;
        if (modelChanged || JSON.stringify(prevPredictionRef.current) !== JSON.stringify(resultRes.data)) {
          setPrediction(resultRes.data);
          prevPredictionRef.current = resultRes.data;
          prevModelRef.current = selectedModel;
          
          // 初始化流数据
          const preds = resultRes.data.predictions?.preds || [];
          const trues = resultRes.data.predictions?.true || [];
          if (preds.length > 0) {
            setStreamingData({
              predictions: preds.slice(0, maxDataPoints),
              trueValues: trues.slice(0, maxDataPoints)
            });
            setDataIndex(Math.min(maxDataPoints, preds.length));
          }
        }
      } else {
        // 当前模型没有训练结果
        setNoDataForModel(true);
        setLatestTask(null);
        setPrediction(null);
        setStreamingData({ predictions: [], trueValues: [] });
      }
      setLoading(false);
    } catch (err) {
      console.error('Error fetching display data:', err);
      setLoading(false);
    }
  };

  // 当选择的模型变化时重新获取数据
  useEffect(() => {
    setLoading(true);
    fetchLatestData();
  }, [selectedModel]);

  useEffect(() => {
    // 每30秒刷新一次完整数据
    const dataInterval = setInterval(fetchLatestData, 30000);
    
    // 每秒更新时间
    const timeInterval = setInterval(() => setCurrentTime(new Date()), 1000);

    return () => {
      clearInterval(dataInterval);
      clearInterval(timeInterval);
    };
  }, [selectedModel]);

  // 数据流动效果 - 每秒添加新数据点
  useEffect(() => {
    if (!prediction) return;

    const streamInterval = setInterval(() => {
      const allPreds = prediction.predictions?.preds || [];
      const allTrues = prediction.predictions?.true || [];
      
      if (allPreds.length === 0) return;

      setStreamingData(prev => {
        // 从原始数据中循环获取下一个数据点
        const nextIndex = dataIndex % allPreds.length;
        const newPred = allPreds[nextIndex];
        const newTrue = allTrues[nextIndex] || newPred;

        // 添加新数据点，移除最旧的（保持最多maxDataPoints个点）
        const newPredictions = [...prev.predictions, newPred].slice(-maxDataPoints);
        const newTrueValues = [...prev.trueValues, newTrue].slice(-maxDataPoints);

        return {
          predictions: newPredictions,
          trueValues: newTrueValues
        };
      });

      setDataIndex(prev => prev + 1);
    }, 5000); // 每5秒添加一个新数据点

    return () => clearInterval(streamInterval);
  }, [prediction, dataIndex]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex items-center justify-center">
        <div className="text-white text-2xl">加载数据中...</div>
      </div>
    );
  }

  if (noDataForModel || !latestTask || !prediction) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex items-center justify-center">
        <div className="text-white text-center">
          <AlertCircle size={64} className="mx-auto mb-4 text-yellow-400" />
          <h2 className="text-2xl font-bold mb-2">{getSelectedModelName()} 暂无预测数据</h2>
          <p className="text-gray-300">请先使用 <span className="text-blue-400 font-semibold">{getSelectedModelName()}</span> 模型完成至少一次训练</p>
          <p className="text-gray-400 text-sm mt-4">可在仪表盘切换模型，或前往训练配置开始新的训练任务</p>
        </div>
      </div>
    );
  }


  const { r2_score, mae, rmse, mape } = prediction;
  const predictions = prediction.predictions?.preds || (Array.isArray(prediction.predictions) ? prediction.predictions : []);
  const trueValues = prediction.predictions?.true || [];

  // 使用流数据
  const displayCount = streamingData.predictions.length;
  const recentPredictions = streamingData.predictions;
  const recentTrueValues = streamingData.trueValues;

  const lineChartData = {
    labels: Array.from({ length: displayCount }, (_, i) => `${i + 1}`),
    datasets: [
      {
        label: '真实值',
        data: recentTrueValues,
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.2)',
        borderWidth: 3,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: 'rgb(59, 130, 246)',
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 2,
        fill: true,
        cubicInterpolationMode: 'monotone' as const,
      },
      {
        label: '预测值',
        data: recentPredictions,
        borderColor: 'rgb(34, 197, 94)',
        backgroundColor: 'rgba(34, 197, 94, 0.2)',
        borderWidth: 3,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: 'rgb(34, 197, 94)',
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 2,
        fill: true,
        cubicInterpolationMode: 'monotone' as const,
      },
    ],
  };

  const lineChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 750, // 更快的动画，让流动更流畅
      easing: 'linear' as const, // 线性动画，更自然的流动效果
    },
    transitions: {
      active: {
        animation: {
          duration: 0
        }
      }
    },
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        labels: {
          color: '#fff',
          font: { size: 14, weight: 'bold' },
        },
      },
      title: {
        display: false,
      },
    },
    scales: {
      x: {
        display: false,
      },
      y: {
        ticks: { color: '#fff', font: { size: 12 } },
        grid: { color: 'rgba(255, 255, 255, 0.1)' },
      },
    },
  };

  // 误差分布数据
  const errors = predictions.map((pred: number, idx: number) => Math.abs(pred - trueValues[idx]));
  const avgError = errors.reduce((a: number, b: number) => a + b, 0) / errors.length;
  const maxError = Math.max(...errors);
  const minError = Math.min(...errors);

  const errorBarData = {
    labels: ['平均误差', '最大误差', '最小误差', 'MAE', 'RMSE'],
    datasets: [
      {
        label: '误差指标',
        data: [avgError, maxError, minError, mae, rmse],
        backgroundColor: [
          'rgba(59, 130, 246, 0.8)',
          'rgba(239, 68, 68, 0.8)',
          'rgba(34, 197, 94, 0.8)',
          'rgba(251, 146, 60, 0.8)',
          'rgba(168, 85, 247, 0.8)',
        ],
        borderColor: [
          'rgb(59, 130, 246)',
          'rgb(239, 68, 68)',
          'rgb(34, 197, 94)',
          'rgb(251, 146, 60)',
          'rgb(168, 85, 247)',
        ],
        borderWidth: 2,
      },
    ],
  };

  const errorBarOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 1500,
      easing: 'easeOutBounce' as const,
      delay: (context: any) => {
        let delay = 0;
        if (context.type === 'data' && context.mode === 'default') {
          delay = context.dataIndex * 150;
        }
        return delay;
      },
    },
    plugins: {
      legend: { display: false },
    },
    scales: {
      x: {
        ticks: { color: '#fff', font: { size: 11 } },
        grid: { display: false },
      },
      y: {
        ticks: { color: '#fff', font: { size: 12 } },
        grid: { color: 'rgba(255, 255, 255, 0.1)' },
      },
    },
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 p-6 overflow-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2 flex items-center">
              <Zap className="mr-3 text-yellow-400 animate-pulse" size={40} />
              {getSelectedModelName()} 实时预测监控大屏
            </h1>
            <p className="text-gray-300 text-lg flex items-center">
              智能造纸数据预测系统 - 实时数据流动
            </p>
          </div>
          <div className="text-right">
            <div className="text-white text-3xl font-mono font-bold transition-all duration-300 hover:scale-110">
              {currentTime.toLocaleTimeString('zh-CN')}
            </div>
            <div className="text-gray-400 text-sm mt-1">
              {currentTime.toLocaleDateString('zh-CN', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric',
                weekday: 'long' 
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 核心指标卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        {/* R² Score */}
        <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl p-6 shadow-2xl border-2 border-blue-400 transform hover:scale-105 transition-all duration-300">
          <div className="flex items-center justify-between mb-3">
            <Target size={32} className="text-blue-200 animate-spin" style={{animationDuration: '3s'}} />
            <div className="bg-blue-900 px-3 py-1 rounded-full animate-pulse">
              <span className="text-blue-200 text-sm font-semibold">R² Score</span>
            </div>
          </div>
          <div className="text-5xl font-bold text-white mb-2 transition-all duration-500 transform hover:scale-110">
            {(r2_score * 100).toFixed(1)}%
          </div>
          <div className="text-blue-200 text-sm">决定系数</div>
          <div className="mt-3 h-2 bg-blue-900 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-blue-300 to-blue-100 transition-all duration-1000 animate-pulse"
              style={{ width: `${Math.max(0, Math.min(100, r2_score * 100))}%` }}
            />
          </div>
        </div>

        {/* MAE */}
        <div className="bg-gradient-to-br from-green-600 to-green-800 rounded-2xl p-6 shadow-2xl border-2 border-green-400 transform hover:scale-105 transition-all duration-300">
          <div className="flex items-center justify-between mb-3">
            <TrendingUp size={32} className="text-green-200 animate-bounce" />
            <div className="bg-green-900 px-3 py-1 rounded-full animate-pulse">
              <span className="text-green-200 text-sm font-semibold">MAE</span>
            </div>
          </div>
          <div className="text-5xl font-bold text-white mb-2 transition-all duration-500 transform hover:scale-110">
            {mae.toFixed(3)}
          </div>
          <div className="text-green-200 text-sm">平均绝对误差</div>
          <div className="mt-3 flex items-center text-green-300 text-sm">
            <Activity size={16} className="mr-1 animate-pulse" />
            <span>精度指标</span>
          </div>
        </div>

        {/* RMSE */}
        <div className="bg-gradient-to-br from-purple-600 to-purple-800 rounded-2xl p-6 shadow-2xl border-2 border-purple-400 transform hover:scale-105 transition-all duration-300">
          <div className="flex items-center justify-between mb-3">
            <Activity size={32} className="text-purple-200 animate-pulse" />
            <div className="bg-purple-900 px-3 py-1 rounded-full animate-pulse">
              <span className="text-purple-200 text-sm font-semibold">RMSE</span>
            </div>
          </div>
          <div className="text-5xl font-bold text-white mb-2 transition-all duration-500 transform hover:scale-110">
            {rmse.toFixed(3)}
          </div>
          <div className="text-purple-200 text-sm">均方根误差</div>
          <div className="mt-3 flex items-center text-purple-300 text-sm">
            <Activity size={16} className="mr-1 animate-pulse" />
            <span>稳定性指标</span>
          </div>
        </div>

        {/* MAPE */}
        <div className="bg-gradient-to-br from-orange-600 to-orange-800 rounded-2xl p-6 shadow-2xl border-2 border-orange-400 transform hover:scale-105 transition-all duration-300">
          <div className="flex items-center justify-between mb-3">
            <Target size={32} className="text-orange-200 animate-spin" style={{animationDuration: '4s'}} />
            <div className="bg-orange-900 px-3 py-1 rounded-full animate-pulse">
              <span className="text-orange-200 text-sm font-semibold">MAPE</span>
            </div>
          </div>
          <div className="text-5xl font-bold text-white mb-2 transition-all duration-500 transform hover:scale-110">
            {(mape * 100).toFixed(2)}%
          </div>
          <div className="text-orange-200 text-sm">平均绝对百分比误差</div>
          <div className="mt-3 flex items-center text-orange-300 text-sm">
            <Activity size={16} className="mr-1 animate-pulse" />
            <span>相对误差</span>
          </div>
        </div>
      </div>

      {/* 图表区域 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 实时预测曲线 */}
        <div className="lg:col-span-2 bg-gray-800 bg-opacity-60 backdrop-blur-lg rounded-2xl p-6 shadow-2xl border border-gray-700 transition-all duration-300">
          <h3 className="text-2xl font-bold text-white mb-4 flex items-center">
            <div className="w-1 h-8 bg-blue-500 mr-3 rounded animate-pulse"></div>
            实时预测曲线
            <span className="ml-auto text-sm text-gray-400 font-normal flex items-center">
              <div className="w-2 h-2 rounded-full mr-2 bg-green-400 animate-pulse"></div>
              流动中 ({displayCount}/{maxDataPoints})
            </span>
          </h3>
          <div style={{ height: '400px' }} className="transition-opacity duration-300">
            <Line data={lineChartData} options={lineChartOptions} />
          </div>
        </div>

        {/* 误差分析 */}
        <div className="bg-gray-800 bg-opacity-60 backdrop-blur-lg rounded-2xl p-6 shadow-2xl border border-gray-700 transition-all duration-300">
          <h3 className="text-2xl font-bold text-white mb-4 flex items-center">
            <div className="w-1 h-8 bg-green-500 mr-3 rounded animate-pulse"></div>
            误差分析
          </h3>
          <div style={{ height: '400px' }} className="transition-opacity duration-300">
            <Bar data={errorBarData} options={errorBarOptions} />
          </div>
        </div>
      </div>

      {/* 底部信息栏 */}
      <div className="mt-6 bg-gray-800 bg-opacity-60 backdrop-blur-lg rounded-2xl p-4 shadow-2xl border border-gray-700 hover:border-blue-500 transition-all duration-300">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
          <div className="transform hover:scale-105 transition-transform duration-200">
            <div className="text-gray-400 text-sm mb-1">当前模型</div>
            <div className="text-white font-semibold text-lg">{getSelectedModelName()}</div>
          </div>
          <div className="transform hover:scale-105 transition-transform duration-200">
            <div className="text-gray-400 text-sm mb-1">目标列</div>
            <div className="text-white font-semibold text-lg">{latestTask.config?.target_col || '未知'}</div>
          </div>
          <div className="transform hover:scale-105 transition-transform duration-200">
            <div className="text-gray-400 text-sm mb-1">样本数量</div>
            <div className="text-white font-semibold text-lg animate-pulse">{predictions.length} 个</div>
          </div>
        </div>
      </div>

      {/* 自动刷新提示 */}
      <div className="mt-4 text-center">
        <div className="inline-flex items-center px-4 py-2 bg-green-600 bg-opacity-20 border border-green-500 rounded-full transition-all duration-300">
          <div className="relative mr-2">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-ping absolute"></div>
            <div className="w-2 h-2 bg-green-400 rounded-full"></div>
          </div>
          <span className="text-green-300 text-sm font-medium">数据每5秒横向流动 →</span>
        </div>
      </div>
    </div>
  );
};

export default Display;
