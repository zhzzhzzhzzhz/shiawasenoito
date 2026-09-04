# 《幸福的丝线》智能体版后端镜像 — Python 3.11 + FastAPI + Socket.IO
# 构建上下文：backend-python/（含 agents/ 智能体代码）
FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# 安装依赖（国内服务器用清华镜像加速）
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

# 复制完整后端代码（含 agents/、data/、services/）
COPY . .

EXPOSE 3000

CMD ["python", "main.py"]
