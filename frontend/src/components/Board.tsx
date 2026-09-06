import CharacterCard from './CharacterCard';
import type { CharacterState } from '../types';

interface BoardProps {
  board: CharacterState[];
  viewerRole: string | null;
  selectedCharacters: number[];
  onCharacterClick: (charId: number) => void;
  interactive: boolean;
  dimmedIds?: Set<number>;
  villainHighlightIds?: Set<number>;
  rangeIds?: Set<number>;
  /** 拖拽放置目标集合（null 表示当前不可拖拽放置） */
  dropTargetIds?: Set<number> | null;
  /** 左键拖拽中悬停的角色卡（高亮提示放置目标） */
  hoverCharId?: number | null;
  /** 本地已放置的标记（targetId → 标记信息，回合提交前可反悔移除） */
  localMarkers?: Map<number, { kind: 'death' | 'surveillance'; shape?: '九宫格' | '十字' }>;
  /** 本地标记插画使用的回合 */
  localMarkerRound?: number;
  onRemoveLocalMarker?: (targetId: number) => void;
  /** 已放置标记左键按住开始拖拽（换目标/回面板） */
  onLocalMarkerPointerDown?: (e: React.MouseEvent, targetId: number) => void;
}

export default function Board({
  board, viewerRole, selectedCharacters, onCharacterClick,
  interactive, dimmedIds, villainHighlightIds, rangeIds,
  dropTargetIds = null, hoverCharId = null,
  localMarkers, localMarkerRound = 1, onRemoveLocalMarker, onLocalMarkerPointerDown,
}: BoardProps) {
  return (
    <div className="board-grid">
      {board.map((char) => {
        const isDead = char.status === 'dead' || char.status === 'default_dead';
        const canInteract = interactive && !isDead;
        const dimmed = dimmedIds ? dimmedIds.has(char.id) : false;
        const inRange = rangeIds ? rangeIds.has(char.id) : false;
        const villain = villainHighlightIds ? villainHighlightIds.has(char.id) : false;
        const canDrop = dropTargetIds ? dropTargetIds.has(char.id) : false;
        const hovered = hoverCharId === char.id;
        const localMarker = localMarkers?.get(char.id) ?? null;

        return (
          <CharacterCard
            key={char.id}
            char={char}
            viewerRole={viewerRole}
            isSelected={selectedCharacters.includes(char.id)}
            onClick={() => canInteract && onCharacterClick(char.id)}
            disabled={!canInteract}
            dimmed={localMarker ? false : dimmed}
            inRange={inRange}
            villainHighlight={villain}
            dropTarget={canDrop || hovered}
            hovered={hovered}
            localMarker={localMarker}
            localMarkerRound={localMarkerRound}
            onRemoveLocalMarker={localMarker ? () => onRemoveLocalMarker?.(char.id) : undefined}
            onLocalMarkerPointerDown={localMarker ? (e) => onLocalMarkerPointerDown?.(e, char.id) : undefined}
          />
        );
      })}
    </div>
  );
}
