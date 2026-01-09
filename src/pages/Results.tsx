import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { client } from '../api/client';
import { Line, Scatter, Bar } from 'react-chartjs-2';
import { Award, Download, ArrowLeft, TrendingUp, Target, BarChart3, Activity } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
);

const Results: React.FC = () => {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchResult = async () => {
      try {
        const response = await client.get(`/training/${taskId}/result`);
        setResult(response.data);
      } catch (err: any) {
        setError(err.response?.data?.detail || '获取结果失败');
      } finally {
        setLoading(false);
      }
    };

    fetchResult();
  }, [taskId]);

  if (loading) return <div className="p-8 text-center">正在加载结果...</div>;
  if (error) return <div className="p-8 text-center text-red-600">{error}</div>;
  if (!result) return <div className="p-8 text-center">未找到结果</div>;

  // Extract predictions and true values
  const preds = result.predictions?.preds || (Array.isArray(result.predictions) ? result.predictions : []);
  const trues = result.predictions?.true || [];

  // Calculate residuals and statistics
  const residuals = preds.map((pred: number, idx: number) => pred - (trues[idx] || pred));
  const meanResidual = residuals.reduce((a: number, b: number) => a + b, 0) / residuals.length;
  const stdResidual = Math.sqrt(
    residuals.reduce((sum: number, r: number) => sum + Math.pow(r - meanResidual, 2), 0) / residuals.length
  );

  // Line comparison chart
  const comparisonData = {
    labels: Array.from({ length: preds.length }, (_, i) => i + 1),
    datasets: [
      {
        label: '真实值',
        data: trues,
        borderColor: 'rgb(53, 162, 235)',
        backgroundColor: 'rgba(53, 162, 235, 0.5)',
        pointRadius: 3,
        borderWidth: 2,
        tension: 0.1,
      },
      {
        label: '预测值',
        data: preds,
        borderColor: 'rgb(255, 99, 132)',
        backgroundColor: 'rgba(255, 99, 132, 0.5)',
        pointRadius: 3,
        borderWidth: 2,
        tension: 0.1,
      },
    ],
  };

  // Scatter plot: Predicted vs Actual
  const scatterData = {
    datasets: [
      {
        label: '预测 vs 实际',
        data: preds.map((pred: number, idx: number) => ({
          x: trues[idx] || 0,
          y: pred,
        })),
        backgroundColor: 'rgba(75, 192, 192, 0.6)',
        borderColor: 'rgba(75, 192, 192, 1)',
        pointRadius: 5,
        pointHoverRadius: 7,
      },
      {
        label: '理想线 (y=x)',
        data: [
          { x: Math.min(...trues), y: Math.min(...trues) },
          { x: Math.max(...trues), y: Math.max(...trues) },
        ],
        type: 'line',
        borderColor: 'rgba(255, 99, 132, 0.8)',
        borderWidth: 2,
        borderDash: [5, 5],
        pointRadius: 0,
        fill: false,
      },
    ],
  };

  // Residuals plot
  const residualsData = {
    labels: Array.from({ length: residuals.length }, (_, i) => i + 1),
    datasets: [
      {
        label: '残差',
        data: residuals,
        backgroundColor: residuals.map((r: number) => 
          r > 0 ? 'rgba(255, 99, 132, 0.6)' : 'rgba(54, 162, 235, 0.6)'
        ),
        borderColor: residuals.map((r: number) => 
          r > 0 ? 'rgba(255, 99, 132, 1)' : 'rgba(54, 162, 235, 1)'
        ),
        borderWidth: 1,
      },
    ],
  };

  // Error distribution histogram
  const binCount = 20;
  const minRes = Math.min(...residuals);
  const maxRes = Math.max(...residuals);
  const binWidth = (maxRes - minRes) / binCount;
  const bins = Array(binCount).fill(0);
  
  residuals.forEach((r: number) => {
    const binIndex = Math.min(Math.floor((r - minRes) / binWidth), binCount - 1);
    bins[binIndex]++;
  });

  const histogramData = {
    labels: bins.map((_, i) => (minRes + i * binWidth).toFixed(2)),
    datasets: [
      {
        label: '误差分布',
        data: bins,
        backgroundColor: 'rgba(153, 102, 255, 0.6)',
        borderColor: 'rgba(153, 102, 255, 1)',
        borderWidth: 1,
      },
    ],
  };
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-yellow-500 to-orange-500 p-6 rounded-lg shadow-lg text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Link to="/history" className="mr-4 hover:bg-white/20 p-2 rounded-lg transition">
              <ArrowLeft size={24} />
            </Link>
            <div className="flex items-center">
              <Award size={36} className="mr-3" />
              <div>
                <h2 className="text-2xl font-bold">训练结果</h2>
                <p className="text-yellow-100 text-sm mt-1">任务 ID: {taskId?.substring(0, 8)}...</p>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button 
              onClick={() => navigate(`/monitor/${taskId}`)}
              className="flex items-center px-5 py-2 bg-white/10 text-white border border-white/30 rounded-lg hover:bg-white/20 font-medium transition"
            >
              <Activity size={18} className="mr-2" />
              查看训练过程
            </button>
            <button 
              onClick={() => window.open(`${client.defaults.baseURL}/training/${taskId}/download`, '_blank')}
              className="flex items-center px-5 py-2 bg-white text-orange-600 rounded-lg hover:bg-yellow-50 font-medium shadow-md transition"
            >
              <Download size={18} className="mr-2" />
              下载模型
            </button>
          </div>
        </div>
      </div>

      {/* Main Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-blue-500 hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 uppercase tracking-wide font-semibold">R² Score</p>
              <p className="text-4xl font-bold text-gray-800 mt-2">{result.r2_score.toFixed(4)}</p>
              <p className="text-xs text-gray-500 mt-2">决定系数</p>
            </div>
            <Target className="text-blue-500" size={40} />
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-green-500 hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 uppercase tracking-wide font-semibold">RMSE</p>
              <p className="text-4xl font-bold text-gray-800 mt-2">{result.rmse.toFixed(4)}</p>
              <p className="text-xs text-gray-500 mt-2">均方根误差</p>
            </div>
            <TrendingUp className="text-green-500" size={40} />
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-purple-500 hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 uppercase tracking-wide font-semibold">MAE</p>
              <p className="text-4xl font-bold text-gray-800 mt-2">{result.mae.toFixed(4)}</p>
              <p className="text-xs text-gray-500 mt-2">平均绝对误差</p>
            </div>
            <BarChart3 className="text-purple-500" size={40} />
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-orange-500 hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 uppercase tracking-wide font-semibold">MAPE</p>
              <p className="text-4xl font-bold text-gray-800 mt-2">{result.mape.toFixed(2)}%</p>
              <p className="text-xs text-gray-500 mt-2">平均绝对百分比误差</p>
            </div>
            <Award className="text-orange-500" size={40} />
          </div>
        </div>
      </div>

      {/* Additional Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-cyan-50 to-cyan-100 p-5 rounded-lg">
          <p className="text-sm text-cyan-700 font-semibold">样本数量</p>
          <p className="text-2xl font-bold text-cyan-900 mt-2">{preds.length}</p>
        </div>
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-5 rounded-lg">
          <p className="text-sm text-purple-700 font-semibold">平均残差</p>
          <p className="text-2xl font-bold text-purple-900 mt-2">{meanResidual.toFixed(4)}</p>
        </div>
        <div className="bg-gradient-to-br from-pink-50 to-pink-100 p-5 rounded-lg">
          <p className="text-sm text-pink-700 font-semibold">残差标准差</p>
          <p className="text-2xl font-bold text-pink-900 mt-2">{stdResidual.toFixed(4)}</p>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Line Comparison */}
        <div className="bg-white p-6 rounded-lg shadow-sm">
          <h3 className="text-lg font-semibold mb-4 text-gray-800 flex items-center">
            <TrendingUp className="mr-2 text-blue-600" size={20} />
            预测值 vs 真实值对比
          </h3>
          <div className="h-[350px]">
            <Line data={comparisonData} options={{ 
              maintainAspectRatio: false,
              plugins: {
                legend: { position: 'top' as const },
                title: { display: false }
              }
            }} />
          </div>
        </div>

        {/* Scatter Plot */}
        <div className="bg-white p-6 rounded-lg shadow-sm">
          <h3 className="text-lg font-semibold mb-4 text-gray-800 flex items-center">
            <Target className="mr-2 text-green-600" size={20} />
            预测准确度散点图
          </h3>
          <div className="h-[350px]">
            <Scatter data={scatterData} options={{ 
              maintainAspectRatio: false,
              plugins: {
                legend: { position: 'top' as const },
                title: { display: false }
              },
              scales: {
                x: { title: { display: true, text: '真实值' } },
                y: { title: { display: true, text: '预测值' } }
              }
            }} />
          </div>
        </div>

        {/* Residuals */}
        <div className="bg-white p-6 rounded-lg shadow-sm">
          <h3 className="text-lg font-semibold mb-4 text-gray-800 flex items-center">
            <BarChart3 className="mr-2 text-purple-600" size={20} />
            残差分析
          </h3>
          <div className="h-[350px]">
            <Bar data={residualsData} options={{ 
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                title: { display: false }
              },
              scales: {
                x: { title: { display: true, text: '样本索引' } },
                y: { title: { display: true, text: '残差 (预测 - 真实)' } }
              }
            }} />
          </div>
        </div>

        {/* Error Distribution */}
        <div className="bg-white p-6 rounded-lg shadow-sm">
          <h3 className="text-lg font-semibold mb-4 text-gray-800 flex items-center">
            <Award className="mr-2 text-orange-600" size={20} />
            误差分布直方图
          </h3>
          <div className="h-[350px]">
            <Bar data={histogramData} options={{ 
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                title: { display: false }
              },
              scales: {
                x: { title: { display: true, text: '残差值' } },
                y: { title: { display: true, text: '频数' } }
              }
            }} />
          </div>
        </div>
      </div>

      {/* Performance Summary */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-6 rounded-lg border border-blue-200">
        <h3 className="text-lg font-semibold mb-3 text-gray-800">模型性能总结</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-600"><span className="font-semibold">✓</span> R² Score 越接近 1 表示模型拟合度越好</p>
            <p className="text-gray-600"><span className="font-semibold">✓</span> RMSE 和 MAE 越小表示预测误差越小</p>
          </div>
          <div>
            <p className="text-gray-600"><span className="font-semibold">✓</span> 散点图越接近对角线表示预测越准确</p>
            <p className="text-gray-600"><span className="font-semibold">✓</span> 残差分布越接近 0 表示模型越稳定</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Results;
