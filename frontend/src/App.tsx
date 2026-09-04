import { useEffect } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useAutoLogin } from './hooks/useAuth';
import { listBackgrounds } from './api/user';
import { setBackgroundFiles } from './config/illustrations';
import ErrorBoundary from './components/ErrorBoundary';
import StartScreen from './pages/StartScreen';
import LoginPage from './pages/LoginPage';
import MainMenu from './pages/MainMenu';
import SingleModeSelect from './pages/SingleModeSelect';
import MultiModeSelect from './pages/MultiModeSelect';
import GameBoard from './pages/GameBoard';
import ResultScreen from './pages/ResultScreen';

function App() {
  useAutoLogin();

  // 全局兜底：未捕获的 Promise 异常与 window 错误（如插件注入脚本抛错）
  // 不阻塞游戏流程，仅在开发模式输出便于排查
  useEffect(() => {
    const onUnhandled = (e: PromiseRejectionEvent) => {
      e.preventDefault();
      if (import.meta.env.DEV) console.warn('[unhandledrejection]', e.reason);
    };
    const onError = (e: ErrorEvent) => {
      if (import.meta.env.DEV) console.warn('[window.onerror]', e.message);
    };
    window.addEventListener('unhandledrejection', onUnhandled);
    window.addEventListener('error', onError);
    return () => {
      window.removeEventListener('unhandledrejection', onUnhandled);
      window.removeEventListener('error', onError);
    };
  }, []);

  // 预取背景图片列表（后端扫描目录），供随机抽取与切换使用；失败则回退配置列表
  useEffect(() => {
    listBackgrounds().then((res) => {
      if (res?.code === 0 && Array.isArray(res.data) && res.data.length > 0) {
        setBackgroundFiles(res.data);
      }
    }).catch(() => {});
  }, []);

  return (
    <HashRouter>
      <ErrorBoundary>
        <AnimatePresence mode="wait">
          <Routes>
            <Route path="/" element={<StartScreen />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/main" element={<MainMenu />} />
            <Route path="/single" element={<SingleModeSelect />} />
            <Route path="/single/game" element={<GameBoard />} />
            <Route path="/multi" element={<MultiModeSelect />} />
            <Route path="/multi/game" element={<GameBoard />} />
            <Route path="/result" element={<ResultScreen />} />
          </Routes>
        </AnimatePresence>
      </ErrorBoundary>
    </HashRouter>
  );
}

export default App;
