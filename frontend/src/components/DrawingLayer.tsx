import { useEffect, useRef, useState } from 'react';

/**
 * 对局涂鸦层（右键画笔）：按住鼠标右键拖动绘制，松开立即停止。
 * - 5 色：1 红 #FF3B30 / 2 黄 #FFCC00 / 3 蓝 #007AFF / 4 白 #FFFFFF / 5 绿 #34C759（默认红）
 * - 键盘 1~5 切色，+/- 调粗细（2~12px，默认 4px），C 清空
 * - 右下角指示器显示当前颜色圆点与粗细
 * - Pointer Events + setPointerCapture：拖出窗口再松开线条正常收尾
 * - 画布 pointer-events: none，左键/滚轮完全穿透，不影响任何游戏交互
 * - 纯本地涂鸦，不做网络同步；组件卸载（对局结束/重开）自动清空
 */

type Point = { x: number; y: number };
interface Stroke {
  color: string;
  width: number;
  pts: Point[];
}

const COLORS = [
  { hex: '#FF3B30', label: '红' },
  { hex: '#FFCC00', label: '黄' },
  { hex: '#007AFF', label: '蓝' },
  { hex: '#FFFFFF', label: '白' },
  { hex: '#34C759', label: '绿' },
];
const MIN_WIDTH = 2;
const MAX_WIDTH = 12;
const DEFAULT_WIDTH = 4;

export default function DrawingLayer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const currentRef = useRef<Stroke | null>(null);
  const drawingRef = useRef(false);

  // 颜色与粗细存 ref（绘制热路径不触发 React 重渲染），另存 state 供指示器显示
  const colorIndexRef = useRef(0); // 默认红色
  const widthRef = useRef(DEFAULT_WIDTH);
  const [indicator, setIndicator] = useState({ colorIndex: 0, width: DEFAULT_WIDTH });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const drawStroke = (c: CanvasRenderingContext2D, s: Stroke) => {
      if (s.pts.length < 2) return;
      c.save();
      c.strokeStyle = s.color;
      c.lineWidth = s.width;
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.beginPath();
      c.moveTo(s.pts[0].x, s.pts[0].y);
      for (let i = 1; i < s.pts.length; i++) c.lineTo(s.pts[i].x, s.pts[i].y);
      c.stroke();
      c.restore();
    };

    const redraw = () => {
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      for (const stroke of strokesRef.current) drawStroke(ctx, stroke);
      if (currentRef.current) drawStroke(ctx, currentRef.current);
    };

    // 高 DPI 适配：画布物理像素 ×dpr，绘制坐标用 CSS 像素（setTransform 换算）
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      redraw();
    };

    // 仅响应右键：button === 2；左键/滚轮不处理，游戏交互不受影响
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 2) return;
      drawingRef.current = true;
      currentRef.current = {
        color: COLORS[colorIndexRef.current].hex,
        width: widthRef.current,
        pts: [{ x: e.clientX, y: e.clientY }],
      };
      // 捕获指针：鼠标拖出窗口再松开，move/up 仍能送达，线条正常收尾
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* 忽略捕获失败（不影响窗口内绘制） */
      }
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!drawingRef.current || !currentRef.current) return;
      currentRef.current.pts.push({ x: e.clientX, y: e.clientY });
      redraw();
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.button !== 2 || !drawingRef.current) return;
      drawingRef.current = false;
      if (currentRef.current && currentRef.current.pts.length > 0) {
        strokesRef.current.push(currentRef.current);
      }
      currentRef.current = null;
    };
    // 屏蔽浏览器右键菜单
    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    // 键盘：1~5 切色、+/- 调粗细、C 清空（输入框聚焦时忽略，避免打字误触）
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      const k = e.key;
      if (k >= '1' && k <= '5') {
        colorIndexRef.current = Number(k) - 1;
        setIndicator((s) => ({ ...s, colorIndex: Number(k) - 1 }));
      } else if (k === 'c' || k === 'C') {
        strokesRef.current = [];
        currentRef.current = null;
        drawingRef.current = false;
        redraw();
      } else if (k === '+' || k === '=') {
        widthRef.current = Math.min(MAX_WIDTH, widthRef.current + 2);
        setIndicator((s) => ({ ...s, width: widthRef.current }));
      } else if (k === '-' || k === '_') {
        widthRef.current = Math.max(MIN_WIDTH, widthRef.current - 2);
        setIndicator((s) => ({ ...s, width: widthRef.current }));
      }
    };

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', resize);
    resize();
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-40 pointer-events-none">
      <canvas ref={canvasRef} className="absolute inset-0" />
      {/* 右下角指示器：当前颜色圆点 + 粗细（纯显示，不拦截事件） */}
      <div className="absolute bottom-4 right-4 flex items-center gap-2">
        <span
          className="w-4 h-4 rounded-full ring-2 ring-white/70 shadow"
          style={{ background: COLORS[indicator.colorIndex].hex }}
          title={`${COLORS[indicator.colorIndex].label}色`}
        />
        <span className="text-[11px] text-white/85 bg-black/50 px-2 py-0.5 rounded-full">
          {indicator.width}px
        </span>
      </div>
    </div>
  );
}
