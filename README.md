# Mamformer Web - 造纸工业数据分析平台

Mamformer Web 是一个基于深度学习的造纸工业智能分析平台。系统集成了 **Mamformer** 深度学习模型，旨在通过对造纸生产过程数据的分析，优化生产工艺、预测纸张质量指标（如定量、厚度、水分等）。

## 🚀 功能特性

*   **智能预测**: 使用集成 Transformer 模型（Mamformer）对造纸生产过程数据进行深度分析和关键指标预测。
*   **数据管理**: 支持工业时序数据/表格数据的上传和管理（CSV等格式）。
*   **模型训练**: 内置训练模块，支持自定义配置模型训练任务，适应不同纸种和生产线。
*   **可视化大屏**: 提供训练过程监控（Loss/Metrics）和预测结果的可视化对比（R2, RMSE, MAE）。
*   **任务队列**: 使用 Celery + Redis 高效处理耗时的模型训练和推理任务。

## 🛠️ 技术栈

### 前端 (Frontend)
*   **框架**: React 18 + TypeScript
*   **构建工具**: Vite
*   **UI 组件**: Tailwind CSS, Lucide React
*   **图表**: Chart.js, React-Chartjs-2
*   **状态管理**: Zustand
*   **网络请求**: Axios

### 后端 (Backend)
*   **Web 框架**: FastAPI
*   **深度学习**: PyTorch, Scikit-learn, Pandas, NumPy
*   **数据库**: PostgreSQL (SQLAlchemy ORM)
*   **异步任务**: Celery
*   **消息队列**: Redis
*   **认证**: Python-Jose (JWT)

## 📦 快速开始

### 前置要求
*   Python 3.10+ (建议使用 Conda 环境)
*   Node.js 18+
*   PostgreSQL
*   Redis (可选，如需异步任务)

### 方式一：Docker 部署 (推荐生产环境)

```bash
docker-compose up -d --build
```
服务将在 `http://localhost` (前端) 和 `http://localhost:8000` (后端) 启动。

### 方式二：本地开发 (推荐开发环境)

#### 1. 后端启动 (Backend)

确保你已经配置好了 Python 环境（推荐使用 `DL` Conda 环境）：

```bash
cd api

# 激活你的 Conda 环境 (如果需要)
# conda activate DL

# 安装依赖
pip install -r requirements.txt

# 启动服务器
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

#### 2. 前端启动 (Frontend)

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev
```
前端将在 `http://localhost:5173` 启动。

## 📂 项目结构

```
.
├── api/                 # 后端 FastAPI 代码
│   ├── app/             # 应用核心代码 (API, Models, Schemas)
│   ├── model/           # CHECKPOINTS (.pth 模型权重文件)
│   ├── uploads/         # 上传文件存储目录
│   └── mamformer.db     # SQLite 数据库 (本地开发默认)
├── src/                 # 前端 React 代码
├── docker-compose.yml   # Docker 编排文件
└── README.md            # 项目文档
```

## 🔐 默认账号

首次启动时，系统会自动创建一个默认管理员账号：
*   **用户名**: `123`
*   **密码**: `123456`

## 📄 许可证

[MIT License](LICENSE)
