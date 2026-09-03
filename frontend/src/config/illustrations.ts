/**
 * 插画资源配置 —— 先占位、后补充策略
 *
 * 所有卡片（人物卡/行动卡/标记）的图片都从这里取路径。
 * 后续制作固定插画后，将图片放入 `frontend/public/placeholder-illust/` 目录
 * 并按以下命名规则放置，无需修改任何代码：
 *
 *   character/{id}.webp     → 人物角色插画（如 character/601.webp）
 *   action/{index}.webp     → 行动卡插画（如 action/0.webp）
 *   marker/{type}.webp      → 标记插画（marker/jiugongge.webp / marker/shizi.webp）
 *   dead.webp               → 死亡角色插画
 */

const BASE = '/placeholder-illust';
const BASE_V2 = '/placeholder-illust-v2';

/** 人物卡图片路径（id: 角色编号 201~605；version: v1 原版 / v2 第二版） */
export function charIllustration(id: number, version: 'v1' | 'v2' = 'v1'): string {
  const base = version === 'v2' ? BASE_V2 : BASE;
  return `${base}/character/${id}.webp`;
}

/** 角色死亡状态插画路径（被死亡标记后的卡片插画；暂为占位路径） */
export function charDeadIllustration(id: number, version: 'v1' | 'v2' = 'v1'): string {
  const base = version === 'v2' ? BASE_V2 : BASE;
  return `${base}/character/${id}_dead.webp`;
}

/** 行动卡图片路径（index: 0~4） */
export function actionCardIllustration(index: number): string {
  return `${BASE}/action/${index}.webp`;
}

/** 死亡标记图片路径（shape: 九宫格 / 十字；round: 所属回合，可选，缺失时回退第 1 回合） */
export function markerIllustration(shape: string, round?: number): string {
  const key = shape === '九宫格' ? 'jiugongge' : 'shizi';
  const r = round != null && round >= 1 && round <= 5 ? round : 1;
  return `${BASE}/marker/r${r}_${key}.webp`;
}

/** 监视标记图片路径（round: 所属回合；第 2~6 回合用金色带回合号标记 golden_mark_r{N}.webp，其余回退到第 2 回合） */
export function surveillanceIllustration(round?: number): string {
  const r = round != null && round >= 2 && round <= 6 ? round : 2;
  return `${BASE}/marker/golden_mark_r${r}.webp`;
}

/** 死亡角色图片路径 */
export const deadIllustration = `${BASE}/dead.webp`;

/**
 * 房间背景插画 —— 集中管理。
 * 加图：往 BACKGROUND_FILES 追加文件名，并在 public/placeholder-illust/background/ 放入同名文件。
 * 替换：同名覆盖文件，或改数组里的文件名，均无需改动核心逻辑。
 */
export const BACKGROUND_FILES: string[] = [
  'bg_1.webp',
  'bg_2.webp',
  'bg_3.webp',
  'bg_4.webp',
];

/** 背景文件名 → 完整 URL */
export function backgroundUrl(filename: string): string {
  return `${BASE}/background/${filename}`;
}

/** 完整 URL 列表（随机抽取用） */
export const BACKGROUNDS: string[] = BACKGROUND_FILES.map(backgroundUrl);

// 背景文件名缓存：由后端扫描目录后写入（listBackgrounds 成功时），失败则回退配置列表
let _bgFiles: string[] = BACKGROUND_FILES;

/** 设置背景文件名列表（后端扫描结果） */
export function setBackgroundFiles(files: string[]): void {
  if (Array.isArray(files) && files.length > 0) {
    _bgFiles = files;
  }
}

/** 获取当前背景文件名列表（缓存或配置兜底） */
export function getBackgroundFiles(): string[] {
  return _bgFiles;
}

/** 随机返回一张房间背景图（每次进入房间时调用，实现随机轮换） */
export function randomBackground(): string {
  const files = getBackgroundFiles();
  return backgroundUrl(files[Math.floor(Math.random() * files.length)]);
}
