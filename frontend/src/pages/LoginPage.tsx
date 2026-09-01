import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { login, register } from '../api/user';
import { useGameStore } from '../store/gameStore';

type Mode = 'login' | 'register';

export default function LoginPage() {
  const navigate = useNavigate();
  const setUser = useGameStore((s) => s.setUser);

  const [mode, setMode] = useState<Mode>('login');
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!account.trim() || !password.trim()) {
      setError('请填写所有必填字段');
      return;
    }
    if (mode === 'register' && !nickname.trim()) {
      setError('请输入昵称');
      return;
    }

    setLoading(true);
    try {
      const res = mode === 'login'
        ? await login(account.trim(), password)
        : await register(account.trim(), password, nickname.trim());

      if (res.code === 0) {
        setUser(res.data.user, res.data.token);
        navigate('/main');
      } else {
        setError(res.message || '操作失败，请重试');
      }
    } catch {
      setError('网络错误，请检查连接后重试');
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setError('');
    setMode((m) => (m === 'login' ? 'register' : 'login'));
  };

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center"
      style={{ background: 'linear-gradient(135deg, #0a0a1a 0%, #1a1040 40%, #0d1b3e 70%, #0a0a1a 100%)' }}>

      {/* Back button */}
      <motion.button
        className="absolute top-6 left-6 btn-secondary flex items-center gap-2"
        onClick={() => navigate('/')}
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.2 }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        返回
      </motion.button>

      {/* Glass panel */}
      <motion.div
        className="glass p-8 w-full max-w-md mx-4"
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        <h2 className="text-2xl text-center mb-8 font-bold tracking-wider"
          style={{ color: 'var(--color-text)', fontFamily: 'var(--font-game)' }}>
          {mode === 'login' ? '登 录' : '注 册'}
        </h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Account */}
          <div>
            <label className="block text-sm mb-1.5" style={{ color: 'var(--color-text-dim)' }}>
              账号
            </label>
            <input
              className="input-field"
              type="text"
              maxLength={16}
              placeholder="请输入账号（字母/数字，最多16位）"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm mb-1.5" style={{ color: 'var(--color-text-dim)' }}>
              密码
            </label>
            <input
              className="input-field"
              type="password"
              maxLength={16}
              placeholder="请输入密码（最多16个字符）"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {/* Nickname (register only) */}
          <AnimatePresence mode="wait">
            {mode === 'register' && (
              <motion.div
                key="nickname"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
              >
                <label className="block text-sm mb-1.5" style={{ color: 'var(--color-text-dim)' }}>
                  昵称
                </label>
                <input
                  className="input-field"
                  type="text"
                  placeholder="请输入昵称"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error message */}
          <AnimatePresence>
            {error && (
              <motion.p
                className="text-sm px-3 py-2 rounded-lg"
                style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--color-evil)' }}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          {/* Submit button */}
          <button
            className="btn-premium w-full mt-2"
            type="submit"
            disabled={loading}
          >
            {loading ? '处理中...' : (mode === 'login' ? '登录' : '注册')}
          </button>
        </form>

        {/* Toggle mode */}
        <p className="text-center mt-6 text-sm" style={{ color: 'var(--color-text-dim)' }}>
          {mode === 'login' ? '还没有账号？' : '已有账号？'}
          <button
            className="ml-1 underline hover:opacity-80 transition-opacity"
            style={{ color: 'var(--color-primary-light)' }}
            onClick={toggleMode}
            type="button"
          >
            {mode === 'login' ? '立即注册' : '去登录'}
          </button>
        </p>
      </motion.div>
    </div>
  );
}
