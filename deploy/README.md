# 《幸福的丝线》云端部署指南

## 一、部署架构

```
浏览器（任意设备）
      │
      ▼
Nginx (80端口) ── 静态前端 ──→ 前端页面 (React)
      │
      ├── /api/       → 反向代理 → Python 后端 (FastAPI)
      └── /socket.io/ → WebSocket → Python 后端 (Socket.IO)
                                        │
                                        ▼
                                    MySQL 8 (房间/用户/对局记录)
```

## 二、前置要求

- 一台 Linux 服务器（推荐 2核4G 及以上），已开放 **80 端口**（如配置 HTTPS 另开 443）
- 服务器已安装 Docker 与 docker compose 插件
  - 安装 Docker：`curl -fsSL https://get.docker.com | sh`
  - 安装 compose 插件：`apt install docker-compose-plugin`（Debian/Ubuntu）

## 三、部署步骤

### 1. 上传部署包到服务器

将本 `deploy/` 目录整体上传到服务器，例如 `/opt/happy-threads/`：

```bash
scp -r deploy/ root@服务器IP:/opt/happy-threads/
```

或使用宝塔面板 / SFTP 工具上传。

### 2. 进入目录并修改配置（重要）

```bash
cd /opt/happy-threads
```

编辑 `.env` 文件，**务必修改**：

```bash
vim .env
```

```ini
# 修改为强密码
MYSQL_ROOT_PASSWORD=你的数据库密码

# 修改为长随机字符串
JWT_SECRET=你的随机密钥
```

### 3. 一键启动

```bash
docker compose up -d --build
```

首次启动会拉取镜像并构建后端，约需 2~5 分钟。

### 4. 验证启动

```bash
docker compose ps
```

三个服务都应为 `Up`（healthy）状态：

```
NAME                    STATUS
happy-threads-mysql     Up (healthy)
happy-threads-backend   Up
happy-threads-nginx     Up
```

### 5. 访问游戏

- 通过 IP：`http://服务器IP`
- 或为服务器配置域名解析后访问 `http://你的域名`

## 四、常用运维命令

| 操作 | 命令 |
|------|------|
| 查看状态 | `docker compose ps` |
| 查看后端日志 | `docker compose logs -f backend` |
| 重启全部 | `docker compose restart` |
| 更新代码后重建 | `docker compose up -d --build` |
| 停止 | `docker compose down` |
| 停止并删除数据 | `docker compose down -v`（⚠️ 清空对局记录） |

## 五、HTTPS 配置（可选）

如需 HTTPS，推荐二选一：

1. **使用 Caddy 替代 Nginx**（自动申请证书，最简单）
2. 或手动配置 Nginx SSL：

   将证书放到 `nginx/certs/` 下，并启用 `docker-compose.yml` 中 443 端口，参考：

```nginx
server {
    listen 443 ssl;
    server_name 你的域名;
    ssl_certificate     /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;
    # 其余配置同 default.conf
}
```

## 六、安全建议

- ✅ 修改 `.env` 中的数据库密码与 JWT 密钥
- ✅ 云厂商安全组只开放 80/443 端口，**不要暴露 3000/3306 端口**
- ✅ 如需注册功能，建议在 Nginx 层增加限流防刷
- ⚠️ 匹配/联机依赖 Socket.IO 长连接，确保 Nginx 的 `proxy_read_timeout` 配置未被修改

## 七、常见问题

**Q: 访问后页面能打开但登录报错？**
A: 检查后端日志 `docker compose logs backend`，确认 MySQL 连接正常、JWT_SECRET 已配置。

**Q: 匹配时一直"正在寻找对手"？**
A: 确认 WebSocket 连通。浏览器 F12 查看 `/socket.io/` 请求是否 101 切换成功；检查 Nginx 的 Upgrade 头配置。

**Q: 如何更新游戏版本？**
A: 重新构建前端（`npm run build`）和后端，替换 deploy 目录内容，执行 `docker compose up -d --build`。
