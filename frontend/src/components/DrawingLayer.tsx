import { useEffect, useRef, useState } from 'react';

/**
 * 对局涂鸦层（右键画笔）：按住鼠标右键拖动绘制，松开立即停止。
 * - 5 色：1 红 #FF3B30 / 2 黄 #FFCC00 / 3 蓝 #007AFF / 4 白 #FFFFFF / 5 绿 #34C759（默认红）
 * - 键盘 1~5 切色，E 橡皮/画笔，Z 撤销，C 清空，+/- 调粗细（2~12px，默认 4px）
 * - 右下角按钮：鼠标左键点击展开菜单（颜色 / 橡皮 / 撤销 / 粗细），再点收起
 * - Pointer Events + setPointerCapture：拖出窗口再松开线条正常收尾
 * - 画布 pointer-events: none，左键/滚轮完全穿透，不影响任何游戏交互
 * - 纯本地涂鸦，不做网络同步；组件卸载（对局结束/重开）自动清空
 */

type Point = { x: number; y: number };
type Tool = 'pen' | 'eraser';
interface Stroke {
  tool: Tool;
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

  // 颜色/粗细/工具存 ref（绘制热路径不触发 React 重渲染），另存 state 供指示器与菜单显示
  const colorIndexRef = useRef(0); // 默认红色
  const widthRef = useRef(DEFAULT_WIDTH);
  const toolRef = useRef<Tool>('pen');
  const [indicator, setIndicator] = useState({ colorIndex: 0, width: DEFAULT_WIDTH });
  const [tool, setTool] = useState<Tool>('pen');
  const [strokeCount, setStrokeCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  const undoRef = useRef<() => void>(() => {});
  const clearRef = useRef<() => void>(() => {});

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const drawStroke = (c: CanvasRenderingContext2D, s: Stroke) => {
      if (s.pts.length < 2) return;
      c.save();
      if (s.tool === 'eraser') {
        c.globalCompositeOperation = 'destination-out';
        c.strokeStyle = 'rgba(0,0,0,1)';
        c.lineWidth = s.width + 14;
      } else {
        c.globalCompositeOperation = 'source-over';
        c.strokeStyle = s.color;
        c.lineWidth = s.width;
      }
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
        tool: toolRef.current,
        color: COLORS[colorIndexRef.current].hex,
        width: widthRef.current,
        pts: [{ x: e.clientX, y: e.clientY }],
      };
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* 忽略捕获失败 */
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
        setStrokeCount(strokesRef.current.length);
      }
      currentRef.current = null;
    };
    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    // 键盘：1~5 切色、E 橡皮/画笔、Z 撤销、C 清空、+/- 粗细（输入框聚焦时忽略）
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      const k = e.key;
      if (k >= '1' && k <= '5') {
        colorIndexRef.current = Number(k) - 1;
        toolRef.current = 'pen';
        setIndicator((s) => ({ ...s, colorIndex: Number(k) - 1 }));
        setTool('pen');
      } else if (k === 'e' || k === 'E') {
        toggleTool();
      } else if (k === 'z' || k === 'Z') {
        undoRef.current();
      } else if (k === 'c' || k === 'C') {
        clearRef.current();
      } else if (k === '+' || k === '=') {
        widthRef.current = Math.min(MAX_WIDTH, widthRef.current + 2);
        setIndicator((s) => ({ ...s, width: widthRef.current }));
      } else if (k === '-' || k === '_') {
        widthRef.current = Math.max(MIN_WIDTH, widthRef.current - 2);
        setIndicator((s) => ({ ...s, width: widthRef.current }));
      }
    };

    const toggleTool = () => {
      toolRef.current = toolRef.current === 'eraser' ? 'pen' : 'eraser';
      setTool(toolRef.current);
    };

    undoRef.current = () => {
      strokesRef.current.pop();
      currentRef.current = null;
      drawingRef.current = false;
      setStrokeCount(strokesRef.current.length);
      redraw();
    };
    clearRef.current = () => {
      strokesRef.current = [];
      currentRef.current = null;
      drawingRef.current = false;
      setStrokeCount(0);
      redraw();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickColor = (i: number) => {
    colorIndexRef.current = i;
    toolRef.current = 'pen';
    setIndicator((s) => ({ ...s, colorIndex: i }));
    setTool('pen');
  };
  const toggleTool = () => {
    toolRef.current = toolRef.current === 'eraser' ? 'pen' : 'eraser';
    setTool(toolRef.current);
  };
  const setWidth = (w: number) => {
    widthRef.current = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w));
    setIndicator((s) => ({ ...s, width: widthRef.current }));
  };

  return (
    <div className="fixed inset-0 z-40 pointer-events-none">
      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* 右下角：左键点击展开菜单（仅此区域拦截左键） */}
      <div className="absolute bottom-4 right-4 flex flex-col items-end gap-2">
        {menuOpen && (
          <div className="pointer-events-auto p-3 rounded-xl bg-black/75 border border-white/15 backdrop-blur-sm shadow-xl">
            <div className="flex items-center gap-1.5 mb-2.5">
              {COLORS.map((c, i) => (
                <button
                  key={c.hex}
                  onClick={() => pickColor(i)}
                  title={`${c.label}色（按键 ${i + 1}）`}
                  className={`w-7 h-7 rounded-full transition-all ${
                    tool === 'pen' && indicator.colorIndex === i
                      ? 'ring-2 ring-white/80 scale-110'
                      : 'hover:scale-110'
                  }`}
                  style={{ background: c.hex }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2 mb-2.5">
              <button
                onClick={toggleTool}
                title="橡皮擦（按键 E）"
                className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-all ${
                  tool === 'eraser' ? 'bg-white/30 text-white' : 'bg-white/10 text-white/70 hover:bg-white/20'
                }`}
              >🧽 橡皮</button>
              <button
                onClick={() => undoRef.current()}
                title="撤销上一笔（按键 Z）"
                className="flex-1 py-1.5 rounded-md text-xs font-bold bg-white/10 text-white/70 hover:bg-white/20 transition-all"
              >↶ 撤销</button>
              <button
                onClick={() => clearRef.current()}
                title="清空（按键 C）"
                className="flex-1 py-1.5 rounded-md text-xs font-bold bg-white/10 text-white/70 hover:bg-white/20 transition-all"
              >🗑 清空</button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-white/60">粗细</span>
              <input
                type="range"
                min={MIN_WIDTH}
                max={MAX_WIDTH}
                step={2}
                value={indicator.width}
                onChange={(e) => setWidth(Number(e.target.value))}
                className="flex-1 accent-purple-500"
              />
              <span className="text-[10px] text-white/70 w-8 text-right">{indicator.width}px</span>
            </div>
          </div>
        )}

        {/* 菜单开关按钮：显示当前颜色圆点 + 粗细 */}
        <button
          onClick={() => setMenuOpen((v) => !v)}
          title="画笔设置（左键展开菜单；右键直接绘制）"
          className="pointer-events-auto flex items-center gap-2 px-2.5 py-1.5 rounded-full bg-black/65 border border-white/15 hover:bg-black/80 transition-colors"
        >
          <span
            className="w-3.5 h-3.5 rounded-full ring-1 ring-white/70"
            style={{ background: COLORS[indicator.colorIndex].hex }}
          />
          <span className="text-[11px] text-white/85">{indicator.width}px</span>
          {strokeCount > 0 && <span className="text-[10px] text-white/50">{strokeCount}笔</span>}
          <span className="text-[10px] text-white/60">{menuOpen ? '▾' : '▴'}</span>
        </button>
      </div>
    </div>
  );
}
