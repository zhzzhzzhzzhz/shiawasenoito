import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * 标题丝线粒子层
 * 6 根冷紫丝线从画面两侧抽出、缠绕汇聚到标题中心"织出"文字，
 * 入场 0.9s 汇聚，循环态 6s 缓慢环绕 + 暖金光点沿丝线游走。
 * 自包含组件：内部管理 Three 场景与渲染循环，卸载时彻底清理。
 */

const THREAD_COUNT = 6;        // 丝线根数
const POINTS_PER_THREAD = 40;  // 每根丝线点数
const TOTAL_POINTS = THREAD_COUNT * POINTS_PER_THREAD; // 240（≤240 约束）

const ENTER_DURATION = 0.9; // 入场汇聚时长（秒）
const LOOP_DURATION = 6;    // 循环态周期（秒）

const COLOR_START = new THREE.Color('#7c3aed'); // 冷紫（丝线起点）
const COLOR_END = new THREE.Color('#a78bfa');   // 淡紫（丝线终点）
const GOLD = new THREE.Color('#f59e0b');        // 暖金光点

interface TitleThreadsProps {
  /** 标题中心位置（从顶部往下的比例 0~1，默认 0.22 即 22vh） */
  centerY?: number;
}

interface Thread {
  p0: THREE.Vector3;
  p1: THREE.Vector3;
  p2: THREE.Vector3;
  p3: THREE.Vector3;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

// 三次贝塞尔采样（手写，避免每帧 new Curve 对象）
function bezier3(
  p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3,
  t: number, out: THREE.Vector3,
): THREE.Vector3 {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  out.x = a * p0.x + b * p1.x + c * p2.x + d * p3.x;
  out.y = a * p0.y + b * p1.y + c * p2.y + d * p3.y;
  out.z = 0;
  return out;
}

// 生成 6 根丝线的基准控制点（x 为"半屏宽"单位，y 为"半屏高"单位 NDC）
function buildThreads(ndcY: number): Thread[] {
  const threads: Thread[] = [];
  for (let i = 0; i < THREAD_COUNT; i++) {
    const side = i % 2 === 0 ? -1 : 1;            // 左右交替
    const jitter = (i - (THREAD_COUNT - 1) / 2) * 0.07; // 纵向错开缠绕
    threads.push({
      p0: new THREE.Vector3(side * 1.4, ndcY + jitter * 1.8, 0),      // 屏幕外
      p1: new THREE.Vector3(side * 0.9, ndcY + 0.16 + jitter, 0),
      p2: new THREE.Vector3(side * 0.35, ndcY - 0.12 - jitter, 0),
      p3: new THREE.Vector3(0, ndcY + jitter * 0.5, 0),                // 汇聚到标题中心
    });
  }
  return threads;
}

export default function TitleThreads({ centerY = 0.22 }: TitleThreadsProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // WebGL 不可用时静默失败：不渲染丝线，标题仍正常显示
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    } catch {
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const canvas = renderer.domElement;
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
    camera.position.z = 1;

    const ndcY = 1 - 2 * centerY; // 标题中心 NDC y
    const threads = buildThreads(ndcY);

    // ---- 丝线 Points（顶点色渐变）----
    const threadGeometry = new THREE.BufferGeometry();
    const threadPositions = new Float32Array(TOTAL_POINTS * 3);
    const threadColors = new Float32Array(TOTAL_POINTS * 3);
    for (let i = 0; i < THREAD_COUNT; i++) {
      for (let j = 0; j < POINTS_PER_THREAD; j++) {
        const s = j / (POINTS_PER_THREAD - 1);
        const idx = i * POINTS_PER_THREAD + j;
        const c = COLOR_START.clone().lerp(COLOR_END, s);
        threadColors[idx * 3] = c.r;
        threadColors[idx * 3 + 1] = c.g;
        threadColors[idx * 3 + 2] = c.b;
        // 初始置于屏幕外，避免首帧闪烁
        threadPositions[idx * 3] = 0;
        threadPositions[idx * 3 + 1] = -2;
        threadPositions[idx * 3 + 2] = 0;
      }
    }
    threadGeometry.setAttribute('position', new THREE.BufferAttribute(threadPositions, 3));
    threadGeometry.setAttribute('color', new THREE.BufferAttribute(threadColors, 3));
    const threadMaterial = new THREE.PointsMaterial({
      size: 2.5,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: false,
    });
    const threadPoints = new THREE.Points(threadGeometry, threadMaterial);
    scene.add(threadPoints);

    // ---- 暖金光点 Points（每根丝线 1 个，沿丝线游走）----
    const goldGeometry = new THREE.BufferGeometry();
    const goldPositions = new Float32Array(THREAD_COUNT * 3);
    const goldColors = new Float32Array(THREAD_COUNT * 3);
    for (let i = 0; i < THREAD_COUNT; i++) {
      goldColors[i * 3] = GOLD.r;
      goldColors[i * 3 + 1] = GOLD.g;
      goldColors[i * 3 + 2] = GOLD.b;
      goldPositions[i * 3 + 1] = -2;
    }
    goldGeometry.setAttribute('position', new THREE.BufferAttribute(goldPositions, 3));
    goldGeometry.setAttribute('color', new THREE.BufferAttribute(goldColors, 3));
    const goldMaterial = new THREE.PointsMaterial({
      size: 5,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: false,
    });
    const goldPoints = new THREE.Points(goldGeometry, goldMaterial);
    scene.add(goldPoints);

    // ---- 尺寸与宽高比 ----
    let aspect = 1;
    const resize = () => {
      const w = container.clientWidth || 1;
      const h = container.clientHeight || 1;
      aspect = w / h;
      renderer.setSize(w, h, false);
      camera.left = -aspect;
      camera.right = aspect;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    // ---- 渲染循环 ----
    const clock = new THREE.Clock();
    let rafId = 0;
    let running = true;
    const tmp = new THREE.Vector3();
    const p1v = new THREE.Vector3();
    const p2v = new THREE.Vector3();

    const animate = () => {
      if (!running) return;
      rafId = requestAnimationFrame(animate);

      const elapsed = clock.getElapsedTime();
      const enterProgress = reduceMotion ? 1 : Math.min(elapsed / ENTER_DURATION, 1);
      const eased = easeOutCubic(enterProgress);
      const loopActive = !reduceMotion && elapsed >= ENTER_DURATION;

      const tp = threadGeometry.attributes.position.array as Float32Array;
      const gp = goldGeometry.attributes.position.array as Float32Array;

      for (let i = 0; i < THREAD_COUNT; i++) {
        const th = threads[i];
        // 循环态：中间控制点做正弦扰动，营造缓慢环绕
        const wobble = loopActive ? Math.sin(elapsed * 0.6 + i * 1.1) * 0.06 : 0;
        const p0 = th.p0;
        const p3 = th.p3;
        p1v.set(
          th.p1.x + wobble,
          th.p1.y + (loopActive ? Math.cos(elapsed * 0.5 + i) * 0.05 : 0),
          0,
        );
        p2v.set(
          th.p2.x - wobble,
          th.p2.y + (loopActive ? Math.sin(elapsed * 0.7 + i) * 0.05 : 0),
          0,
        );

        // 入场：丝线从起点"生长"到终点
        const visible = reduceMotion
          ? POINTS_PER_THREAD
          : Math.max(1, Math.round(eased * POINTS_PER_THREAD));

        for (let j = 0; j < POINTS_PER_THREAD; j++) {
          const idx = (i * POINTS_PER_THREAD + j) * 3;
          if (j < visible) {
            bezier3(p0, p1v, p2v, p3, j / (POINTS_PER_THREAD - 1), tmp);
            tp[idx] = tmp.x * aspect;
            tp[idx + 1] = tmp.y;
            tp[idx + 2] = 0;
          } else {
            tp[idx] = 0;
            tp[idx + 1] = -2; // 屏幕外隐藏
            tp[idx + 2] = 0;
          }
        }

        // 暖金光点沿丝线游走
        const gs = reduceMotion
          ? 0.5
          : ((elapsed % LOOP_DURATION) / LOOP_DURATION + i / THREAD_COUNT) % 1;
        bezier3(p0, p1v, p2v, p3, gs, tmp);
        gp[i * 3] = tmp.x * aspect;
        gp[i * 3 + 1] = tmp.y;
        gp[i * 3 + 2] = 0;
      }

      threadGeometry.attributes.position.needsUpdate = true;
      goldGeometry.attributes.position.needsUpdate = true;
      renderer.render(scene, camera);
    };

    animate();

    // ---- 页面隐藏时暂停 rAF，恢复时继续 ----
    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(rafId);
      } else if (!running) {
        running = true;
        clock.getDelta(); // 丢弃隐藏期间累计时长，避免跳帧
        rafId = requestAnimationFrame(animate);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    // ---- 清理 ----
    return () => {
      running = false;
      cancelAnimationFrame(rafId);
      document.removeEventListener('visibilitychange', onVisibility);
      ro.disconnect();
      threadGeometry.dispose();
      threadMaterial.dispose();
      goldGeometry.dispose();
      goldMaterial.dispose();
      renderer.dispose();
      if (canvas.parentNode === container) container.removeChild(canvas);
    };
  }, [centerY]);

  return <div ref={containerRef} className="absolute inset-0 z-[5] pointer-events-none" aria-hidden />;
}
