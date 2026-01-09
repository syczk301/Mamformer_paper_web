import React, { useState, useEffect } from 'react';
import { client } from '../api/client';
import { Link } from 'react-router-dom';
import { Eye, Activity, CheckCircle, XCircle, Clock, Trash2, Cpu } from 'lucide-react';
// import { format } from 'date-fns'; 

// 模型名称映射
const MODEL_NAMES: { [key: string]: string } = {
  'mamformer': 'Mamformer',
  'auto-mamformer': 'Auto-Mamformer',
};

const getModelDisplayName = (modelType: string | undefined): string => {
  if (!modelType) return 'Mamformer'; // 默认值
  return MODEL_NAMES[modelType] || modelType;
};

const History: React.FC = () => {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchTasks = async () => {
    try {
      const response = await client.get('/training/');
      setTasks(response.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const handleDelete = async (taskId: string) => {
    if (!window.confirm('确定要删除这个训练任务吗？此操作无法撤销。')) {
      return;
    }

    setDeleting(taskId);
    try {
      await client.delete(`/training/${taskId}`);
      // Remove from local state
      setTasks(tasks.filter(task => task.id !== taskId));
    } catch (err: any) {
      alert(err.response?.data?.detail || '删除失败');
      console.error(err);
    } finally {
      setDeleting(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <span className="flex items-center text-green-600 bg-green-50 px-2 py-1 rounded-full text-xs font-medium"><CheckCircle size={14} className="mr-1" /> 已完成</span>;
      case 'running':
        return <span className="flex items-center text-blue-600 bg-blue-50 px-2 py-1 rounded-full text-xs font-medium"><Activity size={14} className="mr-1" /> 训练中</span>;
      case 'failed':
        return <span className="flex items-center text-red-600 bg-red-50 px-2 py-1 rounded-full text-xs font-medium"><XCircle size={14} className="mr-1" /> 失败</span>;
      default:
        return <span className="flex items-center text-gray-600 bg-gray-50 px-2 py-1 rounded-full text-xs font-medium"><Clock size={14} className="mr-1" /> 等待中</span>;
    }
  };

  if (loading) return <div className="p-8 text-center">正在加载历史记录...</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-800 mb-4">训练历史</h2>
      
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">模型</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">目标列</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">开始时间</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {tasks.map((task) => (
                <tr key={task.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-500 font-mono text-xs">
                    {task.id.slice(0, 8)}...
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      task.config?.model_type === 'auto-mamformer' 
                        ? 'bg-purple-100 text-purple-800' 
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      <Cpu size={12} className="mr-1" />
                      {getModelDisplayName(task.config?.model_type)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-800 font-medium">
                    {task.config?.target_col || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(task.status)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                    {task.started_at ? new Date(task.started_at).toLocaleString() : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end space-x-3">
                      {task.status === 'completed' ? (
                        <Link to={`/results/${task.id}`} className="text-blue-600 hover:text-blue-900 flex items-center">
                          <Eye size={16} className="mr-1" /> 查看结果
                        </Link>
                      ) : (
                        <Link to={`/monitor/${task.id}`} className="text-indigo-600 hover:text-indigo-900 flex items-center">
                          <Activity size={16} className="mr-1" /> 监控
                        </Link>
                      )}
                      <button
                        onClick={() => handleDelete(task.id)}
                        disabled={deleting === task.id}
                        className="text-red-600 hover:text-red-900 flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                        title="删除任务"
                      >
                        <Trash2 size={16} className={deleting === task.id ? 'animate-pulse' : ''} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {tasks.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              暂无训练任务。 <Link to="/upload" className="text-blue-600 hover:underline">开始新训练</Link>。
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default History;
