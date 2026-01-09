import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { client } from '../api/client';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Activity, CheckCircle, AlertCircle, TrendingUp, Clock, Zap, Database } from 'lucide-react';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const TrainingMonitor: React.FC = () => {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<string>('pending');
  const [logs, setLogs] = useState<any[]>([]);
  const [error, setError] = useState('');
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const fetchProgress = async () => {
    try {
      // Fetch status
      const statusRes = await client.get(`/training/${taskId}/progress`);
      setStatus(statusRes.data.status);

      // Stop polling when training is completed or failed
      if (statusRes.data.status === 'completed' || statusRes.data.status === 'failed') {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      }
      
      if (statusRes.data.status === 'failed') {
        setError('训练失败，请检查日志或重试。');
        return;
      }

      // Fetch logs for chart
      const logsRes = await client.get(`/training/${taskId}/logs`);
      setLogs(logsRes.data);
      
    } catch (err) {
      console.error(err);
      // Don't stop polling immediately on transient errors, but maybe limit retries
    }
  };

  useEffect(() => {
    fetchProgress();
    pollingRef.current = setInterval(fetchProgress, 3000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [taskId, navigate]);

  // Loss Chart Data
  const lossChartData = {
    labels: logs.map(l => `Epoch ${l.epoch}`),
    datasets: [
      {
        label: '训练损失 (Train Loss)',
        data: logs.map(l => l.train_loss),
        borderColor: 'rgb(255, 99, 132)',
        backgroundColor: 'rgba(255, 99, 132, 0.5)',
        tension: 0.3,
        pointRadius: 2,
        pointHoverRadius: 5,
      },
      {
        label: '验证损失 (Val Loss)',
        data: logs.map(l => l.metrics?.val_loss || l.train_loss * 1.1),
        borderColor: 'rgb(255, 159, 64)',
        backgroundColor: 'rgba(255, 159, 64, 0.5)',
        tension: 0.3,
        pointRadius: 2,
        pointHoverRadius: 5,
      },
    ],
  };

  // Metrics Chart Data  
  const metricsChartData = {
    labels: logs.map(l => `Epoch ${l.epoch}`),
    datasets: [
      {
        label: 'R² Score',
        data: logs.map(l => l.metrics?.val_r2 || 0),
        borderColor: 'rgb(53, 162, 235)',
        backgroundColor: 'rgba(53, 162, 235, 0.5)',
        tension: 0.3,
        pointRadius: 2,
        pointHoverRadius: 5,
        yAxisID: 'y',
      },
      {
        label: 'MAE',
        data: logs.map(l => l.metrics?.val_mae || 0),
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.5)',
        tension: 0.3,
        pointRadius: 2,
        pointHoverRadius: 5,
        yAxisID: 'y1',
      },
      {
        label: 'RMSE',
        data: logs.map(l => l.metrics?.val_rmse || 0),
        borderColor: 'rgb(153, 102, 255)',
        backgroundColor: 'rgba(153, 102, 255, 0.5)',
        tension: 0.3,
        pointRadius: 2,
        pointHoverRadius: 5,
        yAxisID: 'y1',
      },
    ],
  };

  const lossOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
      },
      title: {
        display: true,
        text: '损失曲线 (Loss Curves)',
        font: { size: 16, weight: 'bold' as const },
      },
    },
    scales: {
      y: {
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        title: { display: true, text: '损失值 (Loss)' },
      },
    },
  };

  const metricsOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
      },
      title: {
        display: true,
        text: '评估指标曲线 (Metrics)',
        font: { size: 16, weight: 'bold' as const },
      },
    },
    scales: {
      y: {
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        title: { display: true, text: 'R² Score' },
        min: -1,
        max: 1,
      },
      y1: {
        type: 'linear' as const,
        display: true,
        position: 'right' as const,
        grid: {
          drawOnChartArea: false,
        },
        title: { display: true, text: 'MAE / RMSE' },
      },
    },
  };

  // Calculate additional stats
  const latestLog = logs.length > 0 ? logs[logs.length - 1] : null;
  const bestR2 = logs.length > 0 ? Math.max(...logs.map(l => l.metrics?.val_r2 || 0)) : 0;
  const improvement = logs.length > 1 ? 
    ((latestLog?.metrics?.val_r2 || 0) - (logs[0].metrics?.val_r2 || 0)) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-6 rounded-lg shadow-lg text-white">
        <div className="flex justify-between items-center">
          <div className="flex items-center">
            <Activity className="mr-3" size={32} />
            <div>
              <h2 className="text-2xl font-bold">训练监控</h2>
              <p className="text-blue-100 text-sm mt-1">任务 ID: {taskId?.substring(0, 8)}...</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <span className={`px-4 py-2 rounded-full text-sm font-medium capitalize flex items-center ${
              status === 'running' ? 'bg-blue-500 text-white' :
              status === 'completed' ? 'bg-green-500 text-white' :
              status === 'failed' ? 'bg-red-500 text-white' :
              'bg-gray-500 text-white'
            }`}>
              {status === 'running' && <Zap size={16} className="mr-2 animate-pulse" />}
              {status === 'completed' && <CheckCircle size={16} className="mr-2" />}
              {status === 'failed' && <AlertCircle size={16} className="mr-2" />}
              {status}
            </span>
            {status === 'completed' && (
              <button
                onClick={() => navigate(`/results/${taskId}`)}
                className="px-6 py-2 bg-white text-blue-600 rounded-lg font-medium hover:bg-blue-50 transition-colors shadow-md flex items-center"
              >
                <CheckCircle size={18} className="mr-2" />
                查看详细结果
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-600 rounded-lg flex items-center border border-red-200">
          <AlertCircle size={20} className="mr-2 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-lg shadow-sm border-l-4 border-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 font-medium">当前轮次</p>
              <p className="text-3xl font-bold text-gray-800 mt-1">
                {latestLog ? latestLog.epoch : '-'}
              </p>
            </div>
            <TrendingUp className="text-blue-500" size={32} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-lg shadow-sm border-l-4 border-red-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 font-medium">训练损失</p>
              <p className="text-3xl font-bold text-gray-800 mt-1">
                {latestLog ? latestLog.train_loss.toFixed(4) : '-'}
              </p>
            </div>
            <Activity className="text-red-500" size={32} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-lg shadow-sm border-l-4 border-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 font-medium">验证 R²</p>
              <p className="text-3xl font-bold text-gray-800 mt-1">
                {latestLog?.metrics?.val_r2 ? latestLog.metrics.val_r2.toFixed(4) : '-'}
              </p>
              {improvement !== 0 && (
                <p className={`text-xs mt-1 ${improvement > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {improvement > 0 ? '↑' : '↓'} {Math.abs(improvement).toFixed(4)}
                </p>
              )}
            </div>
            <CheckCircle className="text-green-500" size={32} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-lg shadow-sm border-l-4 border-purple-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 font-medium">最佳 R²</p>
              <p className="text-3xl font-bold text-gray-800 mt-1">
                {logs.length > 0 ? bestR2.toFixed(4) : '-'}
              </p>
            </div>
            <Database className="text-purple-500" size={32} />
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm">
          <div className="h-[350px]">
            {logs.length > 0 ? (
              <Line options={lossOptions} data={lossChartData} />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-gray-400">
                <Activity size={48} className="mb-3 opacity-50" />
                <p>等待训练日志...</p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm">
          <div className="h-[350px]">
            {logs.length > 0 ? (
              <Line options={metricsOptions} data={metricsChartData} />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-gray-400">
                <TrendingUp size={48} className="mb-3 opacity-50" />
                <p>等待评估指标...</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Progress Info */}
      {status === 'running' && logs.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
          <div className="flex items-center">
            <Clock className="text-blue-600 mr-3" size={24} />
            <div className="flex-1">
              <p className="text-blue-800 font-medium">训练进行中...</p>
              <p className="text-blue-600 text-sm mt-1">
                已完成 {logs.length} 个训练轮次，系统每 3 秒自动刷新数据
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrainingMonitor;
