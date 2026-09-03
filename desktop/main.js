// Electron 主进程：加载前端构建产物，并把后端地址注入渲染进程
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

// 读取后端地址配置（desktop/config.json）
function loadBackendUrl() {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
    return (cfg.backendUrl || '').replace(/\/+$/, '');
  } catch (e) {
    return '';
  }
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
