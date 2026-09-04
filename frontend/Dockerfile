# 前端镜像（多阶段）：Node 构建 React → Nginx 托管 + 反代后端
# 构建上下文：frontend/

# ========== 阶段 1：构建前端 ==========
FROM node:22-alpine AS build
WORKDIR /app

# 国内服务器用 npmmirror 加速
RUN npm config set registry https://registry.npmmirror.com

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# ========== 阶段 2：Nginx 托管 + 反代 ==========
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
