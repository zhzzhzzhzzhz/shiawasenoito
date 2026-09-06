import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore, restoreActiveGame } from '../store/gameStore';
import { connectSocket, getSocket } from '../socket/gameSocket';
import Board from '../components/Board';
import CharacterCard from '../components/CharacterCard';
import MarkerPanel from '../components/MarkerPanel';
import PhaseIndicator from '../components/PhaseIndicator';
import TurnTimer from '../components/TurnTimer';
import DrawingLayer from '../components/DrawingLayer';
import DisconnectNotice from '../components/DisconnectNotice';
import FullscreenButton from '../components/FullscreenButton';
import RoundRecordsPanel from '../components/RoundRecordsPanel';
import ActionCardHistory from '../components/ActionCardHistory';
import ActionCardReveal from '../components/ActionCardReveal';
import { getAffectedCharIds, charIdToPos } from '../utils/board';
import type { DragPayload } from '../utils/drag';
import { randomBackground, backgroundUrl, getBackgroundFiles, markerIllustration, surveillanceIllustration } from '../config/illustrations';
import type { DeathAction } from '../types';

// 反派范围高亮分色（按可行动反派顺序取色，重叠处另有提示）
const RANGE_COLORS = ['#f59e0b', '#ec4899', '#22d3ee'];

export default function GameBoardPage() {
  const navigate = useNavigate();
  const store = useGameStore();
  const {
    token, roomId, mode, myRole, phase, round, board, handCards,
    winner, gameStatus, notification, countdown, roundRecords,
    setNotification, roomInfo, user,
  } = store;

  // ---- 正派监视 ----
  const [surveillanceTargets, setSurveillanceTargets] = useState<number[]>([]);

  // ---- 对局菜单：退出 / 投降 / 放弃 ----
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'quit' | 'surrender' | 'abandon' | null>(null);

  // ---- 反派行动 ----
  const [selectedCard, setSelectedCard] = useState<number | null>(null);
  // 重叠归属选择：松手目标落在多个反派范围时，玩家点击候选反派卡选定行动者
  const [pendingVillainChoice, setPendingVillainChoice] = useState<{
    targetId: number;
    shape: '九宫格' | '十字';
    candidates: number[];
  } | null>(null);
  // 拖拽中的死亡标记形状（用于实时范围预览；形状由拖动的标记决定）
  const [dragShape, setDragShape] = useState<'九宫格' | '十字' | null>(null);
  // ---- 左键拖拽引擎（标记：按住拖动、松开放置/取消/换目标/回面板） ----
  type DragState = {
    payload: DragPayload;
    x: number;
    y: number;
    hoverCharId: number | null;
    hoverPanel: boolean;
  };
  const [dragState, setDragState] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [localDeathActions, setLocalDeathActions] = useState<DeathAction[]>([]);
  // 反派开局确认：是否已查看本局三位反派角色（确认后关闭遮罩）
  const [villainConfirmed, setVillainConfirmed] = useState(false);

  const roomIdRef = useRef(roomId);
  const myRoleRef = useRef(myRole);
  roomIdRef.current = roomId;
  myRoleRef.current = myRole;

  // ---- Socket 初始化 ----
  useEffect(() => {
    // 刷新恢复：store 中 roomId 丢失时（页面刷新），从 localStorage 恢复进行中的对局
    if (!roomIdRef.current) {
      const saved = restoreActiveGame();
      if (saved) {
        store.setRoom(saved.roomId, saved.mode, saved.myRole);
        roomIdRef.current = saved.roomId;
        myRoleRef.current = saved.myRole;
      } else {
        navigate('/');
        return;
      }
    }
    const t = token || localStorage.getItem('token') || '';
    const socket = connectSocket(t);
    const mode = store.mode;
    const onConnect = () => {
      if (mode === 'single') {
        socket.emit('game:single_start', { roomId: roomIdRef.current, role: myRoleRef.current });
      } else {
        // 联机模式：进入房间 + 同步状态（匹配/邀请流程已分配阵营）
        socket.emit('game:sync', { roomId: roomIdRef.current });
        // 邀请模式：等玩家点「准备」再发 game:ready；匹配模式：进入即准备
        if (mode !== 'invite') {
          socket.emit('game:ready', { roomId: roomIdRef.current });
        }
      }
    };
    if (socket.connected) onConnect();
    // 每次（重）连接都重新同步：断线后 Socket.IO 自动重连会再次触发 connect，
    // 从而自动 game:sync 恢复最新状态（修复断线重连后不恢复的 bug）
    socket.on('connect', onConnect);
    return () => { socket.off('connect', onConnect); };
  }, []);

  // ---- 结算导航 ----
  useEffect(() => {
    if (gameStatus === 'finished' || winner) {
      const t = setTimeout(() => navigate('/result'), 2000);
      return () => clearTimeout(t);
    }
  }, [gameStatus, winner, navigate]);

  // ---- 阶段展示缓冲倒计时 ----
  // 后端在每个阶段结束后广播 countdown（秒），前端本地每秒递减用于展示
  const [displayCountdown, setDisplayCountdown] = useState(0);
  useEffect(() => {
    setDisplayCountdown(countdown);
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setDisplayCountdown(prev => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  // ---- 可行动的反派数量（对齐后端：存活、未被监视、未被死亡标记） ----
  const activeVillains = useMemo(() =>
    board.filter(c =>
      c.role === 'evil' && c.status === 'alive' &&
      !c.hasDeathMarker &&
      !(c.hasSurveillance && c.surveillanceActive)
    ), [board]
  );

  // ---- 已用反派 ID（每反派每回合至多一个标记） ----
  const usedVillainIds = useMemo(() =>
    new Set(localDeathActions.map(a => a.villainId)), [localDeathActions]
  );

  // ---- 反派当前是否可行动（阶段/身份/倒计时/模式） ----
  const canPlayAction = phase === 'action' && myRole === 'evil' &&
    displayCountdown <= 0 &&
    (mode === 'single' || mode === 'match' || mode === 'invite');

  // ---- 当前选卡的最大行动数 ----
  const maxActions = useMemo(() => {
    if (selectedCard === null) return 0;
    const card = handCards.find(c => c.index === selectedCard);
    if (!card) return 0;
    return Math.min(card.actions.length, activeVillains.length);
  }, [selectedCard, handCards, activeVillains]);

  // ---- 卡牌规定的形状及数量（如 {十字:2} / {十字:1, 九宫格:1}） ----
  const cardShapeCounts = useMemo(() => {
    if (selectedCard === null) return new Map<string, number>();
    const card = handCards.find(c => c.index === selectedCard);
    if (!card) return new Map<string, number>();
    const counts = new Map<string, number>();
    for (const a of card.actions) {
      counts.set(a.shape, (counts.get(a.shape) || 0) + 1);
    }
    return counts;
  }, [selectedCard, handCards]);

  // ---- 已放置标记中使用的形状数量 ----
  const usedShapeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of localDeathActions) {
      counts.set(a.shape, (counts.get(a.shape) || 0) + 1);
    }
    return counts;
  }, [localDeathActions]);

  // ---- 剩余可用形状（混合卡两种都能选，纯卡只剩一种） ----
  const remainingShapes = useMemo(() => {
    const set = new Set<'九宫格' | '十字'>();
    for (const [shape, count] of cardShapeCounts) {
      if (count > (usedShapeCounts.get(shape) || 0)) set.add(shape as '九宫格' | '十字');
    }
    return set;
  }, [cardShapeCounts, usedShapeCounts]);

  // ---- 拖拽中的聚合范围：每个可行动反派 → 该形状的合法目标集 ----
  const allVillainRanges = useMemo(() => {
    const m = new Map<number, Set<number>>();
    if (!dragShape || !canPlayAction) return m;
    const avail = activeVillains.filter(v => !usedVillainIds.has(v.id));
    for (const v of avail) {
      const pos = charIdToPos(v.id);
      const ids = new Set(getAffectedCharIds(pos.row, pos.col, dragShape).filter(id => {
        const c = board.find(ch => ch.id === id);
        return c && c.status === 'alive' &&
          !localDeathActions.some(a => a.targetId === id);
      }));
      m.set(v.id, ids);
    }
    return m;
  }, [dragShape, canPlayAction, activeVillains, usedVillainIds, board, localDeathActions]);

  // ---- 反派高亮（重叠选择时：候选反派金色高亮供点击选定） ----
  const villainHighlightIds = useMemo(() => {
    if (!pendingVillainChoice) return new Set<number>();
    return new Set(pendingVillainChoice.candidates);
  }, [pendingVillainChoice]);

  // ---- 羽化 ID ----
  // 拖拽中：范围并集外的卡羽化；选择行动者时：非候选卡羽化
  const dimmedIds = useMemo(() => {
    if (pendingVillainChoice) {
      const result = new Set<number>();
      for (const c of board) {
        if (c.status === 'dead' || c.status === 'default_dead') continue;
        if (!pendingVillainChoice.candidates.includes(c.id)) result.add(c.id);
      }
      return result;
    }
    if (dragShape) {
      const union = new Set<number>();
      for (const ids of allVillainRanges.values()) for (const id of ids) union.add(id);
      const result = new Set<number>();
      for (const c of board) {
        if (c.status === 'dead' || c.status === 'default_dead') continue;
        if (!union.has(c.id)) result.add(c.id);
      }
      return result;
    }
    return new Set<number>();
  }, [pendingVillainChoice, board, dragShape, allVillainRanges]);

  // ==================== 正派操作 ====================

  // 正派仅在第一阶段（placement）放置监视标记；第1回合跳过正派行动
  const canPlaceSurveillance = phase === 'placement' && myRole === 'good' &&
    (mode === 'single' || mode === 'match' || mode === 'invite');
  const goodCanSelect = canPlaceSurveillance;
  const maxSurveillance = 3;

  const handleGoodCharClick = useCallback((charId: number) => {
    if (!goodCanSelect) return;
    let next: number[];
    if (surveillanceTargets.includes(charId)) {
      next = surveillanceTargets.filter(id => id !== charId);
    } else if (surveillanceTargets.length < maxSurveillance) {
      next = [...surveillanceTargets, charId];
    } else return;
    setSurveillanceTargets(next);
  }, [goodCanSelect, maxSurveillance, surveillanceTargets]);

  const submitSurveillance = () => {
    if (surveillanceTargets.length !== maxSurveillance) {
      setNotification({
        type: 'error',
        message: '请选择3个监视目标',
      });
      return;
    }
    const sock = getSocket();
    if (sock) {
      sock.emit('game:place_surveillance', { roomId, targets: surveillanceTargets });
    }
    setSurveillanceTargets([]);
  };

  // ==================== 反派操作 ====================

  // ---- 反派是否无可行动（无可用卡 / 无可行动反派 / 无未标记目标）----
  const evilCannotAct = useMemo(() => {
    if (!canPlayAction) return false;
    const hasCard = handCards.some(c => !c.used);
    const hasTarget = board.some(c =>
      c.status === 'alive' && !c.hasDeathMarker
    );
    return !hasCard || activeVillains.length === 0 || !hasTarget;
  }, [canPlayAction, handCards, board, activeVillains]);

  const skipEvilAction = () => {
    const sock = getSocket();
    if (sock) {
      sock.emit('game:skip_action', { roomId });
    }
    setSelectedCard(null);
    setLocalDeathActions([]);
    setPendingVillainChoice(null);
    setDragShape(null);
  };

  const handleCardSelect = (index: number) => {
    if (!canPlayAction) return;
    const card = handCards.find(c => c.index === index);
    if (!card || card.used) return;
    setSelectedCard(index);
    setPendingVillainChoice(null);
    setDragShape(null);
    setLocalDeathActions([]);
  };

  // 重叠归属选择：点击候选反派卡选定行动者
  const handleChooseVillain = (villainId: number) => {
    if (!pendingVillainChoice) return;
    if (!pendingVillainChoice.candidates.includes(villainId)) return;
    placeDeathMarker(villainId, pendingVillainChoice.targetId, pendingVillainChoice.shape);
    setPendingVillainChoice(null);
  };

  // 放置死亡标记（行动者已确定）：现场按形状计算合法范围校验
  const placeDeathMarker = useCallback((villainId: number, charId: number, shape: '九宫格' | '十字') => {
    if (!canPlayAction) return;
    const pos = charIdToPos(villainId);
    const ids = new Set(getAffectedCharIds(pos.row, pos.col, shape).filter(id => {
      const c = board.find(ch => ch.id === id);
      return c && c.status === 'alive' &&
        !localDeathActions.some(a => a.targetId === id);
    }));
    if (!ids.has(charId)) return; // 只能放在该反派范围内

    const action: DeathAction = {
      villainId,
      targetId: charId,
      shape,
    };
    setLocalDeathActions([...localDeathActions, action]);
    setDragShape(null);
  }, [canPlayAction, board, localDeathActions]);

  const submitEvilActions = () => {
    if (localDeathActions.length !== maxActions) return;
    const sock = getSocket();
    if (sock) {
      sock.emit('game:play_action_card', {
        roomId, cardIndex: selectedCard, actions: localDeathActions,
      });
    }
    setSelectedCard(null);
    setLocalDeathActions([]);
    setPendingVillainChoice(null);
    setDragShape(null);
  };

  const cancelEvilAction = () => {
    setDragShape(null);
    setPendingVillainChoice(null);
    setSelectedCard(null);
    setLocalDeathActions([]);
  };

  // ---- 拖拽放置目标集合 ----
  const dropTargetIds = useMemo(() => {
    if (goodCanSelect) {
      // 正派：所有存活角色（403 复活变体下 403 状态为 alive，自然可被监视）
      return new Set(board.filter(c => c.status === 'alive').map(c => c.id));
    }
    if (canPlayAction && dragShape) {
      // 反派：所有可行动反派范围的并集（拖拽中）
      const union = new Set<number>();
      for (const ids of allVillainRanges.values()) for (const id of ids) union.add(id);
      return union;
    }
    return null;
  }, [goodCanSelect, canPlayAction, dragShape, board, allVillainRanges]);

  // ---- 本地已放置标记（回合提交前可反悔）：targetId → 标记信息 ----
  const localMarkers = useMemo(() => {
    const m = new Map<number, { kind: 'death' | 'surveillance'; shape?: '九宫格' | '十字' }>();
    for (const a of localDeathActions) m.set(a.targetId, { kind: 'death', shape: a.shape });
    for (const id of surveillanceTargets) m.set(id, { kind: 'surveillance' });
    return m;
  }, [localDeathActions, surveillanceTargets]);

  // 移除已放置的本地标记（反悔）：按标记类型分派
  const removeLocalMarker = useCallback((targetId: number) => {
    setLocalDeathActions((prev) => {
      if (prev.some((a) => a.targetId === targetId)) {
        return prev.filter((a) => a.targetId !== targetId);
      }
      return prev;
    });
    setSurveillanceTargets((prev) => prev.filter((id) => id !== targetId));
  }, []);

  // 已放置标记切换目标（拖到其他角色卡）：按标记类型分派
  const moveLocalMarker = useCallback((targetId: number, newTargetId: number, markerKind: 'death' | 'surveillance') => {
    if (markerKind === 'surveillance') {
      // 监视换目标：新目标须存活且未被监视
      setSurveillanceTargets((prev) => {
        if (!prev.includes(targetId)) return prev;
        if (prev.includes(newTargetId)) return prev;
        const c = board.find((ch) => ch.id === newTargetId);
        if (!c || c.status !== 'alive') return prev;
        return prev.map((id) => (id === targetId ? newTargetId : id));
      });
      return;
    }
    setLocalDeathActions((prev) => {
      const act = prev.find((a) => a.targetId === targetId);
      if (!act) return prev;
      if (prev.some((a) => a.targetId === newTargetId)) return prev; // 目标已被占用
      const pos = charIdToPos(act.villainId);
      const ids = new Set(getAffectedCharIds(pos.row, pos.col, act.shape).filter(id => {
        const c = board.find(ch => ch.id === id);
        return c && c.status === 'alive';
      }));
      if (!ids.has(newTargetId)) return prev; // 新目标不在合法范围内
      return prev.map((a) => (a.targetId === targetId ? { ...a, targetId: newTargetId } : a));
    });
  }, [board]);

  // ---- 左键拖拽引擎：按住拖动、松开放置 ----
  const startMarkerDrag = useCallback((payload: DragPayload, e: React.MouseEvent) => {
    setPendingVillainChoice(null); // 开始新拖拽时放弃重叠选择
    const st: DragState = { payload, x: e.clientX, y: e.clientY, hoverCharId: null, hoverPanel: false };
    dragRef.current = st;
    setDragState(st);
    if (payload.kind === 'death') setDragShape(payload.shape);
  }, []);

  // 拖拽分派所需的最新值（全局监听用 ref 避免闭包过期）
  const dropTargetIdsRef = useRef(dropTargetIds);
  useEffect(() => { dropTargetIdsRef.current = dropTargetIds; }, [dropTargetIds]);
  const allVillainRangesRef = useRef(allVillainRanges);
  useEffect(() => { allVillainRangesRef.current = allVillainRanges; }, [allVillainRanges]);
  const activeVillainsRef = useRef(activeVillains);
  useEffect(() => { activeVillainsRef.current = activeVillains; }, [activeVillains]);
  const usedVillainIdsRef = useRef(usedVillainIds);
  useEffect(() => { usedVillainIdsRef.current = usedVillainIds; }, [usedVillainIds]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const st = dragRef.current;
      if (!st) return;
      st.x = e.clientX;
      st.y = e.clientY;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      st.hoverCharId = el?.closest?.('[data-char-id]')
        ? Number((el.closest('[data-char-id]') as HTMLElement).dataset.charId)
        : null;
      st.hoverPanel = !!el?.closest?.('[data-marker-panel]');
      setDragState({ ...st });
    };
    const onUp = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const st = dragRef.current;
      if (!st) return;
      dragRef.current = null;
      setDragState(null);
      setDragShape(null);

      if (st.payload.kind === 'remove-local') {
        // 已放置标记拖拽：换目标 / 拖到空白或面板（反悔，回到回合开始时的位置）
        if (st.hoverCharId != null && st.hoverCharId !== st.payload.targetId) {
          moveLocalMarker(st.payload.targetId, st.hoverCharId, st.payload.markerKind);
        } else if (st.hoverCharId == null) {
          removeLocalMarker(st.payload.targetId);
        }
        // 拖回原目标卡本身 → 保持不动
      } else if (st.payload.kind === 'surveillance') {
        // 正派监视：放到可放置角色卡 → 直接生效
        if (st.hoverCharId != null && dropTargetIdsRef.current?.has(st.hoverCharId)) {
          handleGoodCharClick(st.hoverCharId);
        }
      } else {
        // 反派死亡标记：放到范围内 → 按归属自动分派（唯一直接放，重叠弹选择）
        const targetId = st.hoverCharId;
        if (targetId == null || !dropTargetIdsRef.current?.has(targetId)) return;
        const ranges = allVillainRangesRef.current;
        const avail = activeVillainsRef.current.filter(v => !usedVillainIdsRef.current.has(v.id));
        const candidates = avail.filter(v => ranges.get(v.id)?.has(targetId)).map(v => v.id);
        if (candidates.length === 1) {
          placeDeathMarker(candidates[0], targetId, st.payload.shape);
        } else if (candidates.length > 1) {
          setPendingVillainChoice({ targetId, shape: st.payload.shape, candidates });
        }
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [moveLocalMarker, removeLocalMarker, handleGoodCharClick, placeDeathMarker]);

  const allActionsDone = localDeathActions.length === maxActions && maxActions > 0;

  // ---- 某形状剩余可用次数 ----
  const getRemainingCount = (shape: '九宫格' | '十字') =>
    (cardShapeCounts.get(shape) || 0) - (usedShapeCounts.get(shape) || 0);

  // ---- 阶段消息 ----
  const getPhaseMessage = () => {
    if (winner) return winner === (myRole === 'good' ? 'good' : 'evil') ? '你赢了!' : '你输了!';
    if (phase === 'placement' && myRole === 'good') return '拖动监视标记到角色卡';
    if (phase === 'placement' && myRole === 'evil') return '等待正派放置监视标记...';
    if (phase === 'reveal') return '公示本回合结果，结算中...';
    if (canPlayAction) {
      if (pendingVillainChoice) return '标记范围重叠，点击候选反派选定行动者';
      if (dragShape) return '拖动标记到高亮范围内';
      return evilCannotAct ? '无可用行动，请跳过本回合' : '请选择1张行动卡';
    }
    if (phase === 'action' && myRole === 'good') return '等待反派行动...';
    return '';
  };

  const viewerRole = myRole === 'evil' ? 'evil' : null;

  // ---- 等待界面：我方是否已准备 ----
  const myReady = roomInfo?.players.find(p => p.role === myRole)?.ready ?? false;

  const handleReady = () => {
    const sock = getSocket();
    if (sock && roomId) {
      sock.emit('game:ready', { roomId });
    }
  };

  // ---- 等待阶段离开房间（邀请码作废，双方可重新创建/加入） ----
  const handleLeaveRoom = () => {
    const sock = getSocket();
    if (sock && roomId) {
      sock.emit('game:leave_room', { roomId });
    }
    useGameStore.getState().reset();
    navigate('/multi');
  };

  // ---- 对局操作：退出 / 投降 / 放弃 ----
  const ACTION_CONFIG = {
    quit: {
      title: '退出对局',
      desc: '退出后本局判负，对手将获胜。',
      confirmText: '确定退出',
      tone: 'amber' as const,
    },
    surrender: {
      title: '投降',
      desc: '投降后本局判负，对手获胜并正常结算。',
      confirmText: '确定投降',
      tone: 'rose' as const,
    },
    abandon: {
      title: '放弃对局',
      desc: '放弃后本局作废，不计胜负与结算。',
      confirmText: '确定放弃',
      tone: 'amber' as const,
    },
  } as const;

  const handleConfirmAction = () => {
    if (!confirmAction) return;
    const sock = getSocket();
    if (!sock || !roomId) { setConfirmAction(null); return; }
    if (confirmAction === 'quit') {
      sock.emit('game:quit', { roomId });
    } else if (confirmAction === 'surrender') {
      sock.emit('game:surrender', { roomId });
    } else {
      sock.emit('game:abandon', { roomId });
      navigate('/main');
    }
    setConfirmAction(null);
    setMenuOpen(false);
  };

  // ---- 角色卡交互：重叠选择时点击候选反派选定；其余状态点击无操作 ----
  const boardInteractive = goodCanSelect || !!pendingVillainChoice;
  const boardOnClick = pendingVillainChoice ? handleChooseVillain : () => {};

  // ---- 范围分色：每张卡归属的反派范围色（重叠处标记提示） ----
  const rangeColorByChar = useMemo(() => {
    const m = new Map<number, string>();
    if (!dragShape || !canPlayAction || pendingVillainChoice) return m;
    let idx = 0;
    for (const v of activeVillains) {
      if (usedVillainIds.has(v.id)) continue;
      const ids = allVillainRanges.get(v.id);
      if (!ids) continue;
      const color = RANGE_COLORS[idx % RANGE_COLORS.length];
      idx += 1;
      for (const id of ids) m.set(id, color);
    }
    return m;
  }, [dragShape, canPlayAction, pendingVillainChoice, activeVillains, usedVillainIds, allVillainRanges]);

  // ---- 范围重叠的卡（多个反派范围同时覆盖） ----
  const rangeOverlapIds = useMemo(() => {
    const count = new Map<number, number>();
    for (const ids of allVillainRanges.values()) {
      for (const id of ids) count.set(id, (count.get(id) || 0) + 1);
    }
    return new Set([...count.entries()].filter(([, n]) => n > 1).map(([id]) => id));
  }, [allVillainRanges]);

  const boardArea = (
    <div className="flex-1 flex overflow-y-auto min-w-[360px]">
      <motion.div
        key={`round-${round}-phase-${phase}`}
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="m-auto w-full max-w-[672px]"
      >
        <Board
          board={board}
          viewerRole={viewerRole}
          selectedCharacters={[]}
          onCharacterClick={boardOnClick}
          interactive={boardInteractive}
          dimmedIds={dimmedIds}
          villainHighlightIds={villainHighlightIds}
          rangeColors={rangeColorByChar}
          rangeOverlapIds={rangeOverlapIds}
          dropTargetIds={dropTargetIds}
          hoverCharId={dragState?.hoverCharId ?? null}
          localMarkers={localMarkers}
          localMarkerRound={round}
          onRemoveLocalMarker={removeLocalMarker}
          onLocalMarkerPointerDown={(e, targetId) =>
            startMarkerDrag(
              { kind: 'remove-local', targetId, markerKind: localMarkers.get(targetId)?.kind ?? 'death', shape: localMarkers.get(targetId)?.shape },
              e
            )
          }
        />
      </motion.div>
    </div>
  );

  // 房间背景：优先用用户保存的背景，未设置或"随机"则随机抽取
  const background = useMemo(() => {
    const pref = user?.backgroundPref;
    if (pref && pref !== 'random' && getBackgroundFiles().includes(pref)) {
      return backgroundUrl(pref);
    }
    return randomBackground();
  }, [user?.backgroundPref]);

  // ---- 反派开局确认界面 ----
  // 本局三位反派（反派视角 board 已含真实 role）
  const villainChars = useMemo(() => board.filter(c => c.role === 'evil'), [board]);
  const showVillainIntro = myRole === 'evil' && !villainConfirmed &&
    gameStatus === 'playing' && villainChars.length === 3;

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* 背景插画 + 暗色遮罩 */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${background})` }}
      />
      <div className="absolute inset-0 bg-black/50" />
      {/* 内容层 */}
      <div className="relative z-10 w-full h-full flex flex-col">
        <FullscreenButton />
        <DisconnectNotice />
        {/* 右键涂鸦层（覆盖棋盘，不挡交互） */}
        <DrawingLayer />

        {/* 左键拖拽幽灵：跟随鼠标的标记图标 */}
        {dragState && (
          <div
            className="fixed z-[60] pointer-events-none -translate-x-1/2 -translate-y-1/2"
            style={{ left: dragState.x, top: dragState.y }}
          >
            {dragState.payload.kind === 'surveillance' || (dragState.payload.kind === 'remove-local' && dragState.payload.markerKind === 'surveillance') ? (
              <img src={surveillanceIllustration(round)} alt="监视" className="w-10 h-10 object-contain drop-shadow-lg" draggable={false} />
            ) : dragState.payload.kind === 'death' || (dragState.payload.kind === 'remove-local' && dragState.payload.shape) ? (
              <img
                src={markerIllustration(dragState.payload.kind === 'death' ? dragState.payload.shape : dragState.payload.shape!, round)}
                alt="标记"
                className="w-10 h-10 object-contain drop-shadow-lg"
                draggable={false}
              />
            ) : (
              <span className="text-2xl">💨</span>
            )}
          </div>
        )}

      {/* 通知 */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className={`absolute top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full text-sm ${
              notification.type === 'error' ? 'bg-red-500/20 text-red-300 border border-red-500/30'
              : notification.type === 'success' ? 'bg-green-500/20 text-green-300 border border-green-500/30'
              : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'}`}>
            {notification.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 顶部栏 */}
      <div className="flex-shrink-0 pt-3 px-4 flex items-center justify-center gap-3 relative">
        <PhaseIndicator phase={phase} round={round} myRole={myRole} message={getPhaseMessage()} />
        <TurnTimer />

        {/* 对局菜单按钮 */}
        <button
          onClick={() => { setMenuOpen(v => !v); setConfirmAction(null); }}
          title="对局菜单"
          className="absolute right-4 top-3 w-9 h-9 rounded-lg flex items-center justify-center
            text-white/70 hover:text-white hover:bg-white/10 border border-white/10 transition-colors text-lg leading-none"
        >☰</button>

        {/* 菜单浮层 */}
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
              className="absolute right-4 top-14 z-40 flex flex-col gap-1.5 w-40 p-2 rounded-xl
                bg-[#12122e]/95 border border-white/15 backdrop-blur-sm shadow-xl"
            >
              {mode !== 'single' ? (
                <>
                  <button
                    onClick={() => { setConfirmAction('quit'); setMenuOpen(false); }}
                    className="py-2 px-3 rounded-lg text-sm font-bold text-amber-300/90 hover:bg-amber-500/15 border border-amber-500/25 transition-colors"
                  >🚪 退出对局</button>
                  <button
                    onClick={() => { setConfirmAction('surrender'); setMenuOpen(false); }}
                    className="py-2 px-3 rounded-lg text-sm font-bold text-rose-300/90 hover:bg-rose-500/15 border border-rose-500/25 transition-colors"
                  >🏳 投降认输</button>
                </>
              ) : (
                <button
                  onClick={() => { setConfirmAction('abandon'); setMenuOpen(false); }}
                  className="py-2 px-3 rounded-lg text-sm font-bold text-amber-300/90 hover:bg-amber-500/15 border border-amber-500/25 transition-colors"
                >🚪 放弃对局</button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 对局操作二次确认弹窗 */}
      <AnimatePresence>
        {confirmAction && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={() => setConfirmAction(null)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
              className="w-[320px] p-6 rounded-2xl bg-[#16163a] border border-white/15 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-white mb-2" style={{ fontFamily: 'var(--font-title)' }}>
                {ACTION_CONFIG[confirmAction].title}
              </h3>
              <p className="text-sm text-[var(--color-text-dim)] mb-5 leading-relaxed">
                {ACTION_CONFIG[confirmAction].desc}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmAction(null)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-bold border border-white/15 text-gray-300 hover:border-white/30 transition-colors"
                >再想想</button>
                <button
                  onClick={handleConfirmAction}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-bold text-white transition-colors ${
                    ACTION_CONFIG[confirmAction].tone === 'rose'
                      ? 'bg-rose-600 hover:bg-rose-500'
                      : 'bg-amber-600 hover:bg-amber-500'
                  }`}
                >{ACTION_CONFIG[confirmAction].confirmText}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== 阶段展示缓冲倒计时 ===== */}
      <AnimatePresence>
        {displayCountdown > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="absolute top-16 left-1/2 -translate-x-1/2 z-30 px-4 py-1.5 rounded-full bg-purple-600/30 border border-purple-500/40 backdrop-blur-sm"
          >
            <span className="text-sm font-bold text-purple-200">
              ⏱ {displayCountdown}s 后进入下一阶段
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 主区域：按角色镜像布局（正派棋盘在右、反派棋盘在左） */}
      <div className="flex-1 flex items-stretch overflow-x-auto overflow-y-hidden px-2 gap-2">
        {/* ===== 左侧：回合记录框（公共，可滚动） ===== */}
        <RoundRecordsPanel records={roundRecords} />

        {myRole === 'good' ? (
          <>
            {/* 正派：监视标记面板在左 */}
            <MarkerPanel
              role="good"
              round={round}
              maxSurveillance={maxSurveillance}
              surveillancePlaced={surveillanceTargets.length}
              canPlaceSurveillance={goodCanSelect}
              onMarkerPointerDown={(payload, e) => startMarkerDrag(payload, e)}
            />
            {/* 棋盘在右 */}
            {boardArea}
            {/* 正派视角右侧：行动卡插画公示（复用反派视角的卡面） */}
            <ActionCardReveal records={roundRecords} />
          </>
        ) : (
          <>
            {/* 反派：棋盘在左 */}
            {boardArea}
            {/* 标记 + 行动卡面板在右 */}
            <MarkerPanel
              role="evil"
              round={round}
              handCards={handCards}
              selectedCard={selectedCard}
              onCardSelect={handleCardSelect}
              canPlayAction={canPlayAction}
              remainingShapes={remainingShapes}
              getRemainingCount={getRemainingCount}
              onMarkerPointerDown={(payload, e) => startMarkerDrag(payload, e)}
            />
            {/* 反派视角右侧：行动卡公示历史 */}
            <ActionCardHistory records={roundRecords} />
          </>
        )}
      </div>

      {/* ===== 底部：提交 / 取消 / 跳过 / 结束 ===== */}
      <div className="flex-shrink-0 pb-4 px-4 flex justify-center gap-3 items-center">
        {/* 正派提交（放置监视） */}
        {goodCanSelect && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3 items-center">
            <span className="text-sm text-gray-400">
              已选 {surveillanceTargets.length}/{maxSurveillance}
              {surveillanceTargets.map(id => <span key={id} className="text-blue-400 ml-1">#{id}</span>)}
            </span>
            <button className="btn-premium" onClick={submitSurveillance} disabled={surveillanceTargets.length !== maxSurveillance}>
              确认放置
            </button>
          </motion.div>
        )}

        {/* 反派操作按钮 */}
        {canPlayAction && (
          <>
            {/* 无可行动时：跳过行动 */}
            {evilCannotAct && !selectedCard && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                onClick={skipEvilAction}
                className="py-3 px-3 rounded-xl text-sm font-bold bg-gray-600 hover:bg-gray-500 text-white transition-all"
              >
                跳过行动
              </motion.button>
            )}

            {/* 结束回合 */}
            {allActionsDone && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                onClick={submitEvilActions}
                className="py-3 px-3 rounded-xl text-sm font-bold bg-red-600 hover:bg-red-500 text-white transition-all shadow-[0_0_20px_rgba(239,68,68,0.4)]"
              >
                结束回合
              </motion.button>
            )}

            {/* 取消当前选择 */}
            {(selectedCard !== null || pendingVillainChoice) && (
              <motion.button
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="btn-secondary"
                onClick={cancelEvilAction}
              >
                取消
              </motion.button>
            )}

            {/* 当前行动进度 */}
            {localDeathActions.length > 0 && (
              <div className="text-[10px] text-gray-400 text-center">
                已放置 {localDeathActions.length}/{maxActions}
              </div>
            )}
          </>
        )}
      </div>

      {/* 等待界面（邀请模式，双方准备后开局） */}
      {gameStatus === 'waiting' && mode === 'invite' && (
        <div className="absolute inset-0 bg-black/75 flex items-center justify-center z-50">
          <div className="glass p-8 text-center max-w-sm w-full">
            <h2 className="text-2xl font-bold text-white mb-1" style={{ fontFamily: 'var(--font-game)' }}>
              等待对手
            </h2>
            <p className="text-[var(--color-text-dim)] text-sm mb-6">双方都点「准备」后开始对局</p>

            <div className="space-y-3 mb-6 text-left">
              {(roomInfo?.players ?? []).map(p => {
                const isMe = p.role === myRole;
                const roleLabel = p.role === 'good' ? '正派' : '反派';
                const status = !p.joined ? '未加入' : p.ready ? '已准备' : '已加入';
                const statusColor = !p.joined ? 'text-gray-500' : p.ready ? 'text-emerald-400' : 'text-amber-400';
                return (
                  <div key={p.role} className="flex items-center justify-between rounded-xl px-4 py-3 bg-white/5 border border-white/10">
                    <div>
                      <span className="text-white font-bold">{isMe ? '你' : '好友'} · {roleLabel}</span>
                      {!isMe && p.account && (
                        <span className="text-xs text-[var(--color-text-dim)] block">{p.account}</span>
                      )}
                    </div>
                    <span className={`text-sm font-bold ${statusColor}`}>{status}</span>
                  </div>
                );
              })}
            </div>

            {!myReady ? (
              <button
                onClick={handleReady}
                className="w-full py-4 rounded-xl bg-[#7c3aed] hover:bg-[#8b5cf6] text-white font-bold transition-all"
              >
                准备
              </button>
            ) : (
              <div className="text-[var(--color-text-dim)] text-sm">已准备，等待对方...</div>
            )}
            <button
              onClick={handleLeaveRoom}
              className="w-full mt-3 py-2.5 rounded-lg border border-white/15 text-sm text-gray-400 hover:border-rose-400/40 hover:text-rose-300 transition-all"
            >
              离开房间（邀请码将作废）
            </button>
          </div>
        </div>
      )}

      {/* ===== 反派开局确认界面（正派不显示） ===== */}
      <AnimatePresence>
        {showVillainIntro && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/85 flex items-center justify-center z-50"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', damping: 18 }}
              className="glass p-8 text-center max-w-xl w-full mx-4"
            >
              <h2 className="text-2xl font-bold text-white mb-1" style={{ fontFamily: 'var(--font-title)' }}>
                你的反派角色
              </h2>
              <p className="text-[var(--color-text-dim)] text-sm mb-8">
                记住这三位反派，对局中只有你能看到他们的身份
              </p>

              <div className="grid grid-cols-3 gap-4 mb-8">
                {villainChars.map(c => (
                  <CharacterCard
                    key={c.id}
                    char={c}
                    viewerRole="evil"
                    isSelected={false}
                    onClick={() => {}}
                    disabled
                  />
                ))}
              </div>

              <button
                className="btn-premium w-full"
                onClick={() => setVillainConfirmed(true)}
              >
                确认开始
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 游戏结束遮罩 */}
      <AnimatePresence>
        {(gameStatus === 'finished' || winner) && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 flex items-center justify-center z-40">
            <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', damping: 15 }} className="glass p-8 text-center">
              <div className="text-6xl mb-4">{winner === 'good' ? '🛡️' : '👹'}</div>
              <h2 className={`text-3xl font-bold mb-2 ${winner === 'good' ? 'text-green-400' : 'text-red-400'}`}>
                {winner === 'good' ? '正派胜利!' : '反派胜利!'}
              </h2>
              <p className="text-gray-400 text-sm">正在前往结算界面...</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}
