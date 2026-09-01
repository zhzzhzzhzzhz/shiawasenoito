/**
 * 拖拽放置标记的共享数据约定
 *
 * 标记面板（可拖拽源）通过 dataTransfer 携带标记类型，
 * 角色卡（放置目标）在 onDrop 时解析后交由 GameBoard 分派。
 */

export type DragPayload =
  | { kind: 'death'; shape: '九宫格' | '十字' }
  | { kind: 'surveillance' };

/** dataTransfer 使用的 MIME 类型（自定义，避免与 text/plain 冲突） */
export const DRAG_MIME = 'application/x-marker';

/** 拖拽源：写入标记类型数据 */
export function setMarkerDragData(e: React.DragEvent, payload: DragPayload): void {
  e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload));
  e.dataTransfer.effectAllowed = 'move';
}

/** 放置目标：解析标记类型数据 */
export function readMarkerDragData(e: React.DragEvent): DragPayload | null {
  const raw = e.dataTransfer.getData(DRAG_MIME);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DragPayload;
    if (parsed.kind === 'death' || parsed.kind === 'surveillance') return parsed;
    return null;
  } catch {
    return null;
  }
}
