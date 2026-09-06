// Electron 主进程：加载前端构建产物，并把后端地址注入渲染进程
const { app, BrowserWindow, ipcMain } = require('electron');
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

let mainWin = null;

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
  mainWin = win;

  // 窗口最大化按钮统一为全屏（与游戏内右上角全屏按钮行为一致）
  win.on('maximize', () => {
    if (!win.isFullScreen()) {
      win.unmaximize();
      win.setFullScreen(true);
    }
  });

  // 全屏状态变化推送给渲染进程（游戏内按钮图标实时同步）
  win.on('enter-full-screen', () => {
    if (!win.isDestroyed()) win.webContents.send('window:fullscreen-changed', true);
  });
  win.on('leave-full-screen', () => {
    if (!win.isDestroyed()) win.webContents.send('window:fullscreen-changed', false);
  });

  // 原生全屏时按 Esc 退出全屏（不 preventDefault，页面其他 Esc 功能不受影响）
  win.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape' && win.isFullScreen()) {
      win.setFullScreen(false);
    }
  });

  win.on('closed', () => { if (mainWin === win) mainWin = null; });

  // 加载前端构建产物（desktop/dist，打包前由 frontend/dist 复制而来）
  win.loadFile(path.join(__dirname, 'dist', 'index.html'));
}

app.whenReady().then(() => {
  // 切换原生全屏（游戏内按钮调用），返回切换后的全屏状态
  ipcMain.handle('window:toggle-fullscreen', () => {
    const w = mainWin;
    if (!w || w.isDestroyed()) return false;
    w.setFullScreen(!w.isFullScreen());
    return w.isFullScreen();
  });

  // 退出应用（玩家信息面板「关闭游戏」）
  ipcMain.on('window:quit', () => {
    app.quit();
  });

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
