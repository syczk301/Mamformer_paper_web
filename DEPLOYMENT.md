# Mamformer 白度预测系统部署文档

## 1. 项目简介
本项目是一个基于 Mamformer 模型的白度预测 Web 应用程序，旨在为工业生产提供高效、准确的白度预测服务。系统包含基于 React 的前端界面、基于 FastAPI 的后端服务、以及 Celery 异步任务队列，支持数据上传、模型训练、实时监控和结果分析。

## 2. 环境要求
在开始部署之前，请确保服务器满足以下要求：
- **操作系统**: Linux (推荐 Ubuntu 20.04+), Windows (WSL2), 或 macOS
- **Docker**: 版本 20.10+
- **Docker Compose**: 版本 2.0+
- **硬件**: 建议至少 4GB RAM (用于模型训练)

## 3. 快速部署 (Docker Compose)

本项目提供了完整的 Docker 容器化部署方案，可一键启动所有服务。

### 3.1 获取代码
```bash
git clone <repository_url>
cd Mamformer_paper_web
```

### 3.2 配置环境变量
项目包含默认的 docker-compose 配置，通常无需修改即可运行。如果需要自定义配置（如数据库密码、密钥等），请修改 `api/app/core/config.py` 或通过环境变量覆盖。

### 3.3 启动服务
在项目根目录下运行以下命令：

```bash
docker-compose up --build -d
```

该命令将启动以下容器：
- `db`: PostgreSQL 数据库
- `redis`: Redis 消息队列
- `api`: FastAPI 后端服务
- `worker`: Celery 异步任务工作节点
- `frontend`: React 前端应用 (开发模式下通常通过 Host 映射或单独构建 Nginx 镜像，本配置假设开发环境)

### 3.4 验证部署
服务启动后，可以通过以下地址访问：

- **前端界面**: http://localhost:5173
- **后端 API**: http://localhost:8000
- **API 文档 (Swagger UI)**: http://localhost:8000/docs

## 4. 手动开发环境部署

如果您需要进行二次开发，可以分别启动前后端服务。

### 4.1 后端 (API & Worker)
1. 进入 `api` 目录：
   ```bash
   cd api
   ```
2. 创建虚拟环境并安装依赖：
   ```bash
   python -m venv venv
   source venv/bin/activate  # Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```
3. 启动数据库和 Redis (可以使用 Docker 仅启动这两个)：
   ```bash
   docker run -d -p 5432:5432 -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=mamformer postgres:13
   docker run -d -p 6379:6379 redis:alpine
   ```
4. 启动 API 服务：
   ```bash
   uvicorn app.main:app --reload
   ```
5. 启动 Celery Worker (在另一个终端)：
   ```bash
   celery -A app.worker.celery worker --loglevel=info
   ```

### 4.2 前端
1. 进入项目根目录：
   ```bash
   cd .
   ```
2. 安装依赖：
   ```bash
   npm install  # 或 pnpm install
   ```
3. 启动开发服务器：
   ```bash
   npm run dev
   ```

## 5. 故障排查

- **数据库连接失败**: 请检查 `docker-compose logs db`，确保数据库已成功初始化。
- **Celery 任务不执行**: 检查 Redis 连接是否正常，以及 Worker 是否启动 (`docker-compose logs worker`)。
- **前端无法连接后端**: 检查前端配置的 API URL 是否正确 (默认指向 `http://localhost:8000`)，以及是否存在跨域问题 (CORS 已在后端配置允许所有来源)。

## 6. 维护与更新
- **查看日志**: `docker-compose logs -f [service_name]`
- **停止服务**: `docker-compose down`
- **重建服务**: `docker-compose up --build -d`
