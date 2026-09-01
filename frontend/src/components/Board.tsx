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
  onCharacterDrop?: (e: React.DragEvent, charId: number) => void;
}

export default function Board({
  board, viewerRole, selectedCharacters, onCharacterClick,
  interactive, dimmedIds, villainHighlightIds, rangeIds,
  dropTargetIds = null, onCharacterDrop,
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

        return (
          <CharacterCard
            key={char.id}
            char={char}
            viewerRole={viewerRole}
            isSelected={selectedCharacters.includes(char.id)}
            onClick={() => canInteract && onCharacterClick(char.id)}
            disabled={!canInteract}
            dimmed={dimmed}
            inRange={inRange}
            villainHighlight={villain}
            dropTarget={canDrop}
            onDragOver={(e) => { if (canDrop) e.preventDefault(); }}
            onDrop={(e) => { if (canDrop) onCharacterDrop?.(e, char.id); }}
          />
        );
      })}
    </div>
  );
}
