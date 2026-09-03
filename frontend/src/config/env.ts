/**
 * 后端地址解析
 * - Electron 桌面环境：由 preload 注入绝对地址（window.__BACKEND_URL__）
 * - Web 部署环境：返回空字符串，走相对路径（同源部署）
 */

declare global {
  interface Window {
    __BACKEND_URL__?: string;
  }
}

export function getBackendUrl(): string {
  return window.__BACKEND_URL__?.replace(/\/+$/, '') ?? '';
}

/** REST API 前缀 */
export const API_BASE = `${getBackendUrl()}/api`;

/** Socket.IO 连接地址（空字符串 → 相对路径，与 Web 部署一致） */
export const SOCKET_URL = getBackendUrl();
