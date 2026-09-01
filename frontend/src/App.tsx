import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useAutoLogin } from './hooks/useAuth';
import { listBackgrounds } from './api/user';
import { setBackgroundFiles } from './config/illustrations';
import StartScreen from './pages/StartScreen';
import LoginPage from './pages/LoginPage';
import MainMenu from './pages/MainMenu';
import SingleModeSelect from './pages/SingleModeSelect';
import MultiModeSelect from './pages/MultiModeSelect';
import GameBoard from './pages/GameBoard';
import ResultScreen from './pages/ResultScreen';

function App() {
  useAutoLogin();

  // 预取背景图片列表（后端扫描目录），供随机抽取与切换使用；失败则回退配置列表
  useEffect(() => {
    listBackgrounds().then((res) => {
      if (res?.code === 0 && Array.isArray(res.data) && res.data.length > 0) {
        setBackgroundFiles(res.data);
      }
    }).catch(() => {});
  }, []);

  return (
    <BrowserRouter>
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
    </BrowserRouter>
  );
}

export default App;
