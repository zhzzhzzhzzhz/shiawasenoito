import { useEffect, useRef, useState } from 'react';

/**
 * 对局笔记层：按住鼠标右键在任意位置绘制笔记（仅当前玩家可见，只存内存，对局结束即清）。
 * - 右键按下开始一笔，移动延伸，松开结束
 * - 单步撤销 / 一键清除
 * - 画布 pointer-events: none，不阻挡任何游戏交互；工具栏按钮单独可点
 */

type Point = { x: number; y: number };

export default function NoteLayer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Point[][]>([]);        // 已完成笔迹
  const currentRef = useRef<Point[] | null>(null); // 绘制中的笔迹
  const drawingRef = useRef(false);
  const [strokeCount, setStrokeCount] = useState(0);

  // 撤销/清除函数存 ref，供工具栏直接调用
  const undoRef = useRef<() => void>(() => {});
  const clearRef = useRef<() => void>(() => {});

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const drawStroke = (c: CanvasRenderingContext2D, pts: Point[]) => {
      if (pts.length < 2) return;
      c.beginPath();
      c.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
      c.stroke();
    };

    const redraw = () => {
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#f5c542';
      ctx.lineWidth = 3;
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

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault(); // 屏蔽浏览器右键菜单
      drawingRef.current = true;
      currentRef.current = [{ x: e.clientX, y: e.clientY }];
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!drawingRef.current || !currentRef.current) return;
      currentRef.current.push({ x: e.clientX, y: e.clientY });
      redraw();
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button !== 2 || !drawingRef.current) return;
      drawingRef.current = false;
      if (currentRef.current && currentRef.current.length > 0) {
        strokesRef.current.push(currentRef.current);
        setStrokeCount(strokesRef.current.length);
      }
      currentRef.current = null;
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

    window.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('resize', resize);
    resize();
    return () => {
      window.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-40 pointer-events-none">
      <canvas ref={canvasRef} className="absolute inset-0" />
      {strokeCount > 0 && (
        <div className="absolute top-16 right-4 flex gap-2 pointer-events-auto">
          <button
            onClick={() => undoRef.current()}
            title="撤销上一笔"
            className="w-9 h-9 rounded-lg bg-black/60 border border-white/20 text-white/80 hover:bg-black/80 transition-colors text-base"
          >↶</button>
          <button
            onClick={() => clearRef.current()}
            title="清除全部笔记"
            className="w-9 h-9 rounded-lg bg-black/60 border border-white/20 text-white/80 hover:bg-black/80 transition-colors text-base"
          >🗑</button>
        </div>
      )}
    </div>
  );
}
