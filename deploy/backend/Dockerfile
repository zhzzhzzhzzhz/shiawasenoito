# 《幸福的丝线》后端镜像 — Python 3.11 + FastAPI + Socket.IO
FROM python:3.11-slim

WORKDIR /app

# 安装系统依赖（pymysql 等纯 Python 无需额外系统包）
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# 复制依赖并安装
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制后端代码
COPY . .

EXPOSE 3000

CMD ["python", "main.py"]
