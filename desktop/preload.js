// 预加载脚本：注入后端地址 + 暴露窗口控制（全屏切换/退出应用）
const { contextBridge, ipcRenderer } = require('electron');

const arg = process.argv.find((a) => a.startsWith('--backend-url='));
const backendUrl = arg ? arg.split('=')[1] : '';

contextBridge.exposeInMainWorld('__BACKEND_URL__', backendUrl);

contextBridge.exposeInMainWorld('windowControls', {
  /** 切换原生全屏，返回切换后的全屏状态 */
  toggleFullscreen: () => ipcRenderer.invoke('window:toggle-fullscreen'),
  /** 订阅全屏状态变化（主进程推送），返回取消订阅函数 */
  onFullscreenChanged: (callback) => {
    const handler = (_event, value) => callback(Boolean(value));
    ipcRenderer.on('window:fullscreen-changed', handler);
    return () => ipcRenderer.removeListener('window:fullscreen-changed', handler);
  },
  /** 退出应用 */
  quitGame: () => ipcRenderer.send('window:quit'),
});
