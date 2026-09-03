// 预加载脚本：从渲染进程命令行参数解析后端地址，注入 window.__BACKEND_URL__
const { contextBridge } = require('electron');

const arg = process.argv.find((a) => a.startsWith('--backend-url='));
const backendUrl = arg ? arg.split('=')[1] : '';

contextBridge.exposeInMainWorld('__BACKEND_URL__', backendUrl);
