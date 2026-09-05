import { useEffect, useRef, useState } from 'react';

/**
 * 对局笔记层：按住鼠标右键拖动绘制（松开即停止），仅当前玩家可见、只存内存、对局结束即清。
 * - 多色画笔（金/红/绿/蓝/白）+ 橡皮擦，工具栏切换；键盘 1~5 切色、E 橡皮、Z 撤销、C 清除
 * - 单步撤销 / 一键清除
 * - 画布 pointer-events: none，不阻挡游戏交互；工具栏按钮单独可点
 */

type Point = { x: number; y: number };
type Tool = 'pen' | 'eraser';
interface Stroke {
  tool: Tool;
  color: string;
  pts: Point[];
}

const COLORS = [
  { hex: '#f5c542', label: '金' },
  { hex: '#ef4444', label: '红' },
  { hex: '#22c55e', label: '绿' },
  { hex: '#3b82f6', label: '蓝' },
  { hex: '#e5e7eb', label: '白' },
];

export default function NoteLayer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const currentRef = useRef<Stroke | null>(null);
  const drawingRef = useRef(false);
  const [colorIndex, setColorIndex] = useState(0);
  const [tool, setTool] = useState<Tool>('pen');
  const [strokeCount, setStrokeCount] = useState(0);

  // 最新值同步进 ref（供 window 事件监听读取，避免闭包过期）
  const colorIndexRef = useRef(colorIndex);
  const toolRef = useRef(tool);
  useEffect(() => { colorIndexRef.current = colorIndex; }, [colorIndex]);
  useEffect(() => { toolRef.current = tool; }, [tool]);

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
        c.lineWidth = 18;
      } else {
        c.globalCompositeOperation = 'source-over';
        c.strokeStyle = s.color;
        c.lineWidth = 3;
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

    // 仅按住右键期间绘制：mousedown 开始、mousemove 延伸、mouseup 停止
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 2) return;
      drawingRef.current = true;
      currentRef.current = {
        tool: toolRef.current,
        color: COLORS[colorIndexRef.current].hex,
        pts: [{ x: e.clientX, y: e.clientY }],
      };
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!drawingRef.current || !currentRef.current) return;
      currentRef.current.pts.push({ x: e.clientX, y: e.clientY });
      redraw();
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button !== 2 || !drawingRef.current) return;
      drawingRef.current = false;
      if (currentRef.current && currentRef.current.pts.length > 0) {
        strokesRef.current.push(currentRef.current);
        setStrokeCount(strokesRef.current.length);
      }
      currentRef.current = null;
    };
    // 屏蔽浏览器右键菜单（绘制已由 mousedown 接管）
    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    // 键盘：1~5 切色、E 橡皮/画笔、Z 撤销、C 清除（输入框聚焦时忽略）
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      const k = e.key.toLowerCase();
      if (k >= '1' && k <= '5') {
        setColorIndex(Number(k) - 1);
        setTool('pen');
      } else if (k === 'e') {
        setTool((prev) => (prev === 'eraser' ? 'pen' : 'eraser'));
      } else if (k === 'z') {
        undoRef.current();
      } else if (k === 'c') {
        clearRef.current();
      }
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

    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', resize);
    resize();
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-40 pointer-events-none">
      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* 画笔工具栏：颜色 / 橡皮 / 撤销 / 清除 */}
      <div className="absolute top-16 right-4 flex items-center gap-1.5 p-1.5 rounded-xl bg-black/65 border border-white/15 pointer-events-auto">
        {COLORS.map((c, i) => (
          <button
            key={c.hex}
            onClick={() => { setColorIndex(i); setTool('pen'); }}
            title={`${c.label}色画笔（按键 ${i + 1}）`}
            className={`w-7 h-7 rounded-full transition-all ${
              tool === 'pen' && colorIndex === i
                ? 'ring-2 ring-white/80 scale-110'
                : 'hover:scale-110'
            }`}
            style={{ background: c.hex }}
          />
        ))}
        <span className="w-px h-5 bg-white/20 mx-0.5" />
        <button
          onClick={() => setTool((prev) => (prev === 'eraser' ? 'pen' : 'eraser'))}
          title="橡皮擦（按键 E）"
          className={`w-7 h-7 rounded-md flex items-center justify-center text-xs transition-all ${
            tool === 'eraser' ? 'bg-white/30 ring-2 ring-white/80' : 'bg-white/10 hover:bg-white/20'
          }`}
        >🧽</button>
        <button
          onClick={() => undoRef.current()}
          title="撤销上一笔（按键 Z）"
          className="w-7 h-7 rounded-md bg-white/10 hover:bg-white/20 text-white/80 text-sm transition-colors"
        >↶</button>
        <button
          onClick={() => clearRef.current()}
          title="清除全部（按键 C）"
          className="w-7 h-7 rounded-md bg-white/10 hover:bg-white/20 text-white/80 text-sm transition-colors"
        >🗑</button>
        {strokeCount > 0 && (
          <span className="text-[10px] text-white/60 ml-0.5">{strokeCount} 笔</span>
        )}
      </div>
    </div>
  );
}
