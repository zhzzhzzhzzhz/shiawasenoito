import { useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { getProfile } from '../api/user';

/**
 * 应用启动时从 localStorage 恢复登录态
 */
export function useAutoLogin() {
  const setUser = useGameStore((s) => s.setUser);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    // 先恢复 token（即使 profile 请求失败也保留，因为单机模式不需要登录）
    getProfile()
      .then((res) => {
        if (res.code === 0 && res.data) {
          setUser(res.data, token);
        }
      })
      .catch(() => {
        // profile 失败不清除 token，允许离线/游客体验
      });
  }, []);
}
