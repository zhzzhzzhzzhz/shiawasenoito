/**
 * 棋盘坐标工具函数
 */

export function charIdToPos(id: number): { row: number; col: number } {
  const row = Math.floor(id / 100) - 2;
  const col = (id % 100) - 1;
  return { row, col };
}

export function posToCharId(row: number, col: number): number {
  return (row + 2) * 100 + (col + 1);
}

/**
 * 获取角色卡的颜色主题
 */
export function getCharCardTheme(
  _id: number,
  role: string,
  status: string,
  viewerRole: string | null
): { bg: string; border: string; text: string; label: string } {
  if (status === 'dead' || status === 'default_dead') {
    return { bg: '#1a1a2e', border: '#374151', text: '#6b7280', label: '死亡' };
  }

  if (viewerRole === 'evil' || viewerRole === 'good' && role === 'evil') {
    if (role === 'evil') {
      return { bg: '#3b0a0a', border: '#ef4444', text: '#fca5a5', label: '反派' };
    }
    if (role === 'good') {
      return { bg: '#0a1a3b', border: '#10b981', text: '#6ee7b7', label: '正派' };
    }
  }

  // unknown (正派视角看不到反派身份)
  if (role === 'unknown') {
    return { bg: '#1a1a3e', border: '#4b5563', text: '#9ca3af', label: '???' };
  }

  return { bg: '#1a1a3e', border: '#4b5563', text: '#9ca3af', label: '???' };
}

/**
 * 获取编号在棋盘中的位置描述
 */
export function getPositionLabel(row: number, col: number): string {
  const rows = ['底行', '二行', '中行', '四行', '顶行'];
  const cols = ['左1', '左2', '中', '右2', '右1'];
  return `${rows[row]}${cols[col]}`;
}

/**
 * 角色编号在指定形状下影响的所有角色 ID
 */
export function getAffectedCharIds(row: number, col: number, shape: '九宫格' | '十字'): number[] {
  if (shape === '九宫格') {
    const ids: number[] = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = row + dr, nc = col + dc;
        if (nr >= 0 && nr < 5 && nc >= 0 && nc < 5) {
          ids.push(posToCharId(nr, nc));
        }
      }
    }
    return ids;
  }
  const ids: number[] = [];
  for (let r = 0; r < 5; r++) ids.push(posToCharId(r, col));
  for (let c = 0; c < 5; c++) {
    if (c !== col) ids.push(posToCharId(row, c));
  }
  return ids;
}
