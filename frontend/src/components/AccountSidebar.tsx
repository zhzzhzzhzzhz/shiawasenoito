import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { updateProfile, changePassword, uploadAvatar, listBackgrounds } from '../api/user';
import AvatarCropper from './AvatarCropper';
import UserAvatar from './UserAvatar';
import { charIllustration, backgroundUrl, getBackgroundFiles, setBackgroundFiles } from '../config/illustrations';
import type { User } from '../types';

// 全部 25 个角色（含 403）作为可选头像
const CHARACTER_IDS: number[] = (() => {
  const ids: number[] = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      ids.push((row + 2) * 100 + (col + 1));
    }
  }
  return ids;
})();

type CategoryKey = 'avatar' | 'name' | 'intro' | 'illust' | 'password' | 'background';

const CATEGORIES: Array<{ key: CategoryKey; icon: string; label: string }> = [
  { key: 'avatar', icon: '🖼️', label: '头像' },
  { key: 'name', icon: '✏️', label: '名称' },
  { key: 'intro', icon: '🎬', label: '开屏动画开关' },
  { key: 'illust', icon: '🎨', label: '插画' },
  { key: 'background', icon: '🌄', label: '房间背景' },
  { key: 'password', icon: '🔒', label: '更改密码' },
];

// 点击按钮后，按钮栏缩进到的固定宽度（px）
const RAIL_WIDTH = 104;

interface AccountSidebarProps {
  open: boolean;
  onClose: () => void;
}

type Msg = { type: 'ok' | 'err'; text: string };

export default function AccountSidebar({ open, onClose }: AccountSidebarProps) {
  const navigate = useNavigate();
  const user = useGameStore((s) => s.user);
  const setUser = useGameStore((s) => s.setUser);
  const reset = useGameStore((s) => s.reset);
  const storeToken = useGameStore((s) => s.token);

  const [activeCategory, setActiveCategory] = useState<CategoryKey | null>(null);
  const [nickname, setNickname] = useState(user?.nickname ?? '');
  const [msg, setMsg] = useState<Msg | null>(null);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedBg, setSelectedBg] = useState<string>('random');
  const [bgList, setBgList] = useState<string[]>(getBackgroundFiles());
  // 待裁剪的头像文件（非空时显示裁剪弹窗）
  const [cropFile, setCropFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // 应用后端返回的用户信息：仅更新 user，不触碰 token（用 store 里的 token 兜底，避免竞态误清登录态）
  const applyUser = (u: User | null) => {
    if (u) setUser(u, storeToken ?? localStorage.getItem('token'));
  };

  // 侧边栏关闭时重置选中分类，回到默认铺满布局；打开时同步已保存的背景偏好
  useEffect(() => {
    if (!open) {
      setActiveCategory(null);
      setMsg(null);
    } else {
      setSelectedBg(user?.backgroundPref ?? 'random');
    }
  }, [open]);

  // 拉取目录下所有背景图（后端扫描），失败回退配置列表
  useEffect(() => {
    listBackgrounds().then((res) => {
      if (res?.code === 0 && Array.isArray(res.data) && res.data.length > 0) {
        setBgList(res.data);
        setBackgroundFiles(res.data);
      }
    }).catch(() => {});
  }, []);

  const toggleCategory = (key: CategoryKey) => {
    setMsg(null);
    setActiveCategory((cur) => (cur === key ? null : key));
  };

  const saveNickname = async () => {
    const name = nickname.trim();
    if (!name) return setMsg({ type: 'err', text: '昵称不能为空' });
    setBusy(true);
    const res = await updateProfile({ nickname: name });
    setBusy(false);
    if (res.code === 0) { applyUser(res.data); setMsg({ type: 'ok', text: '昵称已更新' }); }
    else setMsg({ type: 'err', text: res.message || '更新失败' });
  };

  const selectCharAvatar = async (id: number) => {
    setBusy(true);
    const res = await updateProfile({ avatarType: 'char', avatarValue: String(id) });
    setBusy(false);
    if (res.code === 0) { applyUser(res.data); setMsg({ type: 'ok', text: '头像已更新' }); }
    else setMsg({ type: 'err', text: res.message || '更新失败' });
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // 客户端校验：格式 jpg/png/webp，大小 ≤5MB
    const okExt = /\.(jpe?g|png|webp)$/i.test(file.name);
    if (!okExt) {
      setMsg({ type: 'err', text: '仅支持 jpg/png/webp 格式' });
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMsg({ type: 'err', text: '图片大小不能超过 5MB' });
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    setCropFile(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  // 裁剪完成：blob → File → 上传
  const handleCropConfirm = async (blob: Blob) => {
    setCropFile(null);
    setBusy(true);
    const file = new File([blob], `avatar_${Date.now()}.webp`, { type: 'image/webp' });
    const res = await uploadAvatar(file);
    setBusy(false);
    if (res.code === 0 && user) {
      applyUser({ ...user, avatarType: 'upload', avatarValue: res.data.avatarValue });
      setMsg({ type: 'ok', text: '头像已更新' });
    } else {
      setMsg({ type: 'err', text: res.message || '上传失败' });
    }
  };

  const togglePlayIntro = async () => {
    const next = !(user?.playIntro ?? true);
    setBusy(true);
    const res = await updateProfile({ playIntro: next });
    setBusy(false);
    if (res.code === 0) { applyUser(res.data); setMsg({ type: 'ok', text: '已保存' }); }
    else setMsg({ type: 'err', text: res.message || '保存失败' });
  };

  const setIllustVersion = async (v: 'v1' | 'v2') => {
    setBusy(true);
    const res = await updateProfile({ illustVersion: v });
    setBusy(false);
    if (res.code === 0) { applyUser(res.data); setMsg({ type: 'ok', text: '已切换插画版本' }); }
    else setMsg({ type: 'err', text: res.message || '切换失败' });
  };

  const submitPassword = async () => {
    if (!oldPwd || !newPwd) return setMsg({ type: 'err', text: '请填写旧密码与新密码' });
    setBusy(true);
    const res = await changePassword(oldPwd, newPwd);
    setBusy(false);
    if (res.code === 0) { setOldPwd(''); setNewPwd(''); setMsg({ type: 'ok', text: '密码已更新' }); }
    else setMsg({ type: 'err', text: res.message || '修改失败' });
  };

  const saveBackground = async () => {
    setBusy(true);
    const res = await updateProfile({ backgroundPref: selectedBg });
    setBusy(false);
    if (res.code === 0) { applyUser(res.data); setMsg({ type: 'ok', text: '背景已保存' }); }
    else setMsg({ type: 'err', text: res.message || '保存失败' });
  };

  const handleLogout = () => {
    setUser(null, null);
    reset();
    navigate('/');
  };

  // ===== 各分类面板内容 =====
  const renderPanel = () => {
    switch (activeCategory) {
      case 'avatar':
        return (
          <>
            <div className="grid grid-cols-3 gap-1.5">
              {CHARACTER_IDS.map((id) => (
                <button
                  key={id}
                  onClick={() => selectCharAvatar(id)}
                  disabled={busy}
                  className={`relative rounded-lg overflow-hidden border-2 aspect-[3/4] transition-all ${
                    user?.avatarType === 'char' && user.avatarValue === String(id)
                      ? 'border-[#7c3aed] ring-2 ring-[#7c3aed]/40'
                      : 'border-white/10 hover:border-white/30'
                  }`}
                  title={`角色 ${id}`}
                >
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-[var(--color-text-dim)] bg-white/5">
                    {id}
                  </span>
                  <img
                    src={charIllustration(id)}
                    alt={`角色${id}`}
                    className="relative w-full h-full object-cover"
                    draggable={false}
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                </button>
              ))}
            </div>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="mt-3 w-full py-2.5 rounded-lg border border-white/15 text-sm text-gray-300 hover:bg-white/5 transition-all"
            >
              📁 从本地文件上传
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
          </>
        );

      case 'name':
        return (
          <div className="flex flex-col gap-2">
            <input
              className="input-field"
              value={nickname}
              maxLength={20}
              placeholder="输入新昵称"
              onChange={(e) => setNickname(e.target.value)}
            />
            <button className="btn-premium" onClick={saveNickname} disabled={busy}>保存名称</button>
          </div>
        );

      case 'intro':
        return (
          <button
            onClick={togglePlayIntro}
            disabled={busy}
            className="w-full flex items-center justify-between px-4 py-4 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 transition-all"
          >
            <span className="text-sm text-gray-200 text-left">每次打开游戏时播放动画</span>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${user?.playIntro === false ? 'bg-gray-600 text-gray-300' : 'bg-[#7c3aed]/40 text-[#a78bfa]'}`}>
              {user?.playIntro === false ? '关' : '开'}
            </span>
          </button>
        );

      case 'illust':
        return (
          <div className="grid grid-cols-1 gap-2">
            <button
              onClick={() => setIllustVersion('v1')}
              disabled={busy}
              className={`py-3 rounded-xl text-sm font-bold border transition-all ${
                (user?.illustVersion ?? 'v1') === 'v1'
                  ? 'bg-[#7c3aed]/30 border-[#7c3aed]/60 text-white'
                  : 'border-white/10 text-gray-400 hover:border-white/20'
              }`}
            >
              原版插画
            </button>
            <button
              onClick={() => setIllustVersion('v2')}
              disabled={busy}
              className={`py-3 rounded-xl text-sm font-bold border transition-all ${
                user?.illustVersion === 'v2'
                  ? 'bg-[#7c3aed]/30 border-[#7c3aed]/60 text-white'
                  : 'border-white/10 text-gray-400 hover:border-white/20'
              }`}
            >
              第二版插画
            </button>
          </div>
        );

      case 'password':
        return (
          <div className="flex flex-col gap-2">
            <input
              className="input-field"
              type="password"
              maxLength={16}
              placeholder="旧密码"
              value={oldPwd}
              onChange={(e) => setOldPwd(e.target.value)}
            />
            <input
              className="input-field"
              type="password"
              maxLength={16}
              placeholder="新密码（1-16位）"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
            />
            <button className="btn-premium" onClick={submitPassword} disabled={busy}>确认修改密码</button>
          </div>
        );

      case 'background':
        return (
          <>
            {/* 大预览框：即时预览当前选中背景 */}
            <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-white/15 mb-3">
              {selectedBg === 'random' ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-[#1e1e40] to-[#0a0a1a] text-[var(--color-text-dim)]">
                  <span className="text-3xl mb-1">🎲</span>
                  <span className="text-sm">默认随机抽取</span>
                  <span className="text-xs mt-1">每次进房间随机一张</span>
                </div>
              ) : (
                <img
                  src={backgroundUrl(selectedBg)}
                  alt="背景预览"
                  className="absolute inset-0 w-full h-full object-cover"
                  draggable={false}
                />
              )}
              <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/60 text-xs text-white">
                {selectedBg === 'random' ? '随机' : selectedBg}
              </span>
            </div>

            {/* 默认随机抽取选项 */}
            <button
              onClick={() => setSelectedBg('random')}
              disabled={busy}
              className={`w-full mb-2 py-2.5 rounded-lg border text-sm font-bold transition-all ${
                selectedBg === 'random'
                  ? 'bg-[#7c3aed]/30 border-[#7c3aed]/60 text-white'
                  : 'border-white/10 text-gray-400 hover:border-white/25'
              }`}
            >
              🎲 默认随机抽取
            </button>

            {/* 背景缩略图网格 */}
            <div className="grid grid-cols-2 gap-2">
              {bgList.map((f) => (
                <button
                  key={f}
                  onClick={() => setSelectedBg(f)}
                  disabled={busy}
                  className={`relative rounded-lg overflow-hidden border-2 aspect-video transition-all ${
                    selectedBg === f
                      ? 'border-[#7c3aed] ring-2 ring-[#7c3aed]/40'
                      : 'border-white/10 hover:border-white/30'
                  }`}
                >
                  <img
                    src={backgroundUrl(f)}
                    alt={f}
                    className="absolute inset-0 w-full h-full object-cover"
                    draggable={false}
                  />
                </button>
              ))}
            </div>

            <button className="mt-3 w-full btn-premium" onClick={saveBackground} disabled={busy}>
              保存背景
            </button>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* 右侧空白遮罩，点击关闭 */}
          <motion.div
            className="fixed inset-0 z-40 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* 侧边栏：默认 1/5，展开后平滑伸展为 1/4；min/max 保证响应式 */}
          <motion.div
            className="fixed left-0 top-0 bottom-0 min-w-[280px] max-w-[520px] z-50 flex flex-col bg-[#151530]/95 backdrop-blur-xl border-r border-white/10"
            initial={{ x: '-100%' }}
            animate={{ x: 0, width: activeCategory ? '25%' : '20%' }}
            exit={{ x: '-100%' }}
            transition={{
              x: { type: 'tween', duration: 0.28, ease: 'easeOut' },
              width: { type: 'spring', stiffness: 260, damping: 30 },
            }}
          >
            {/* 顶部用户信息 */}
            <div className="flex items-center gap-3 p-4 border-b border-white/10">
              <UserAvatar user={user} size={44} />
              {user ? (
                <div className="min-w-0">
                  <div className="text-white font-bold truncate">{user.nickname || '未命名'}</div>
                  <div className="text-xs text-[var(--color-text-dim)] truncate">账号：{user.account}</div>
                </div>
              ) : (
                <div>
                  <div className="text-white font-bold">游客</div>
                  <div className="text-xs text-[var(--color-text-dim)]">登录后可管理账号</div>
                </div>
              )}
            </div>

            {user ? (
              <div className="flex-1 flex min-h-0">
                {/* 功能按钮区：默认占满宽度，激活时向左缩进 */}
                <motion.div
                  className="shrink-0 flex flex-col overflow-x-hidden overflow-y-auto border-r border-white/10"
                  animate={{ width: activeCategory ? RAIL_WIDTH : '100%' }}
                  transition={{ type: 'spring', stiffness: 260, damping: 30 }}
                >
                  <div className={`flex-1 flex flex-col py-2 ${activeCategory ? 'justify-start gap-1.5' : 'justify-evenly'}`}>
                    {CATEGORIES.map((cat) => (
                      <button
                        key={cat.key}
                        onClick={() => toggleCategory(cat.key)}
                        className={`w-full px-1 py-3 flex flex-col items-center gap-1 transition-colors ${
                          activeCategory === cat.key
                            ? 'bg-[#7c3aed]/15 text-white'
                            : 'text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        <span className="text-lg leading-none">{cat.icon}</span>
                        <span className="text-xs font-bold leading-tight whitespace-nowrap">{cat.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* 退出登录（直接动作） */}
                  <div className="shrink-0 border-t border-white/10 py-1.5">
                    <button
                      onClick={handleLogout}
                      className="w-full px-1 py-3 flex flex-col items-center gap-1 text-red-300 hover:bg-red-500/10 transition-colors"
                    >
                      <span className="text-lg leading-none">🚪</span>
                      <span className="text-xs font-bold leading-tight whitespace-nowrap">退出登录</span>
                    </button>
                    {/* 关闭游戏：桌面端退出应用，网页版尽力关闭窗口 */}
                    <button
                      onClick={() => {
                        const wc = (window as unknown as { windowControls?: { quitGame?: () => void } }).windowControls;
                        if (wc?.quitGame) {
                          wc.quitGame();
                        } else {
                          window.close();
                        }
                      }}
                      className="w-full px-1 py-2 flex flex-col items-center gap-1 text-gray-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
                      title="退出游戏应用"
                    >
                      <span className="text-base leading-none">🔚</span>
                      <span className="text-[10px] font-bold leading-tight whitespace-nowrap">关闭游戏</span>
                    </button>
                  </div>
                </motion.div>

                {/* 展开面板（向右展开） */}
                <AnimatePresence>
                  {activeCategory && (
                    <motion.div
                      className="flex-1 min-w-0 overflow-y-auto p-4"
                      initial={{ opacity: 0, x: 24 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 24 }}
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                    >
                      <h3 className="text-base font-bold text-white mb-3">
                        {CATEGORIES.find((c) => c.key === activeCategory)?.label}
                      </h3>
                      {msg && (
                        <div className={`mb-3 text-sm px-3 py-2 rounded-lg ${msg.type === 'ok' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>
                          {msg.text}
                        </div>
                      )}
                      {renderPanel()}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <div className="flex-1 p-5">
                <p className="text-[var(--color-text-dim)] text-sm mb-4">登录后即可设置头像与各项偏好</p>
                <button onClick={() => navigate('/login')} className="w-full btn-premium">
                  登录 / 注册账号
                </button>
              </div>
            )}

            {/* 底部返回箭头 */}
            <div className="flex-shrink-0 p-3 border-t border-white/10">
              <button
                onClick={onClose}
                className="w-full py-3 rounded-xl bg-white/5 border border-white/10 text-gray-200 hover:bg-white/10 transition-all flex items-center justify-center gap-2"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                返回
              </button>
            </div>
          </motion.div>

          {/* 头像裁剪弹窗 */}
          {cropFile && (
            <div className="fixed inset-0 z-[70]">
              <AvatarCropper
                file={cropFile}
                busy={busy}
                onCancel={() => setCropFile(null)}
                onConfirm={handleCropConfirm}
              />
            </div>
          )}
        </>
      )}
    </AnimatePresence>
  );
}
