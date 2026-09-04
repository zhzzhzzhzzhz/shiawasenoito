# 幸せの糸 桌面版（Electron 套壳）

把前端 React 打包进 Electron，双击即开，连同一个后端（本地 / 蒲公英虚拟网 / 云服务器）。

## 双客户端架构

同一个后端（云端 Docker 部署），两种玩法：

```
                ┌─ Web 版：浏览器访问 http://服务器IP
后端(云端) ←────┤
                └─ 桌面版：Electron exe 连服务器（config.json 配地址）
```

- 两端共用同一套账号系统，战绩互通；
- 桌面用户与 Web 用户可以互相匹配联机；
- 前端代码同一份（React），Web 是 Nginx 托管 dist，桌面是 Electron 加载 dist。

## 前置条件

1. 后端已运行（`backend-python` 的 FastAPI，端口 3000；或云端 Docker 部署的智能体版）。
2. 前端已构建：在 `frontend/` 执行 `npm run build` 生成 `dist/`。

## 使用步骤

1. 配置后端地址：编辑 `config.json` 的 `backendUrl`。
   - **开发模式**：项目目录下的 `config.json`
   - **安装版**：安装目录的 `resources/config.json`（如 `C:\Users\TX\AppData\Local\Programs\happy-threads-desktop\resources\config.json`，改完重启应用生效）
   - 本机后端：`http://127.0.0.1:3000`
   - 蒲公英联机：填你本机的**蒲公英虚拟 IP**，如 `http://10.168.x.x:3000`
   - 云服务器：填服务器 IP / 域名（生产建议 `https://你的域名`）
2. 安装依赖：`npm install`
3. 开发运行：`npm start`
4. 打包成 exe：`npm run dist`（产物在 `release2/`；需先复制前端 dist 到 `desktop/dist`）

## 原理

- 前端通过 `window.__BACKEND_URL__`（由 `preload.js` 注入）拿到后端地址。
- `frontend/src/config/env.ts` 统一解析：Electron 用绝对地址，Web 部署仍用相对路径。
- 后端、游戏逻辑、AI、数据库**完全复用，无需改动**。

## 注意

- `config.json` 里的后端地址改动后需重启应用（`npm start` 重新读）。
- 图片/视频已压缩为 WebP/H.264（dist 约 13MB），打包体积可控。
- 单人模式也需联网（AI 在后端）；服务器不可用时游戏无法开始。
- 生产环境后端建议启用 HTTPS，桌面版地址填 `https://` 开头。
