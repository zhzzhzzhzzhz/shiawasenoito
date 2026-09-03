# 幸せの糸 桌面版（Electron 套壳）

把前端 React 打包进 Electron，双击即开，连同一个后端（本地 / 蒲公英虚拟网 / 云服务器）。

## 前置条件

1. 后端已运行（`backend-python` 的 FastAPI，端口 3000）。
2. 前端已构建：在 `frontend/` 执行 `npm run build` 生成 `dist/`。

## 使用步骤

1. 配置后端地址：编辑 `config.json` 的 `backendUrl`。
   - 本机后端：`http://127.0.0.1:3000`
   - 蒲公英联机：填你本机的**蒲公英虚拟 IP**，如 `http://10.168.x.x:3000`
   - 云服务器：填服务器 IP / 域名
2. 安装依赖：`npm install`
3. 开发运行：`npm start`
4. 打包成 exe：`npm run dist`（产物在 `release/`）

## 原理

- 前端通过 `window.__BACKEND_URL__`（由 `preload.js` 注入）拿到后端地址。
- `frontend/src/config/env.ts` 统一解析：Electron 用绝对地址，Web 部署仍用相对路径。
- 后端、游戏逻辑、AI、数据库**完全复用，无需改动**。

## 注意

- `config.json` 里的后端地址改动后需重启应用（`npm start` 重新读）。
- 打包前建议先把图片压缩（当前 146MB 会拖大安装包）。
- 双人联机仍需后端服务器（桌面端只是换了外壳）。
