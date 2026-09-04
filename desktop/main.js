// Electron 主进程：加载前端构建产物，并把后端地址注入渲染进程
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

// 读取后端地址配置：
// 1) 安装版：resources/config.json（asar 外，用户可直接编辑）
// 2) 开发模式：项目目录下的 config.json
function loadBackendUrl() {
  const candidates = [
    path.join(process.resourcesPath || '', 'config.json'),
    path.join(__dirname, 'config.json'),
  ];
  for (const p of candidates) {
    try {
      const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (cfg && cfg.backendUrl) return String(cfg.backendUrl).replace(/\/+$/, '');
    } catch (e) {
      // 尝试下一个候选
    }
  }
  return '';
}

const BACKEND_URL = loadBackendUrl();

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    autoHideMenuBar: true,
    backgroundColor: '#0a0a1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // 通过渲染进程命令行参数把后端地址传给 preload
      additionalArguments: [`--backend-url=${BACKEND_URL}`],
    },
  });

  // 加载前端构建产物（desktop/dist，打包前由 frontend/dist 复制而来）
  win.loadFile(path.join(__dirname, 'dist', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
