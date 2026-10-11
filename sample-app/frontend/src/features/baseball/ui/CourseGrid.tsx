import type { GridIndex } from "../types/common";
import type { CourseCell } from "../types/pitch";

const GRID_INDICES = [0, 1, 2, 3, 4] as const satisfies readonly GridIndex[];

function isZoneCell(cell: CourseCell): boolean {
  return cell.col >= 1 && cell.col <= 3 && cell.row >= 1 && cell.row <= 3;
}

type CourseCellButtonProps = {
  readonly cell: CourseCell;
  readonly selected: boolean;
  readonly onSelectCell: (cell: CourseCell) => void;
};

function CourseCellButton({ cell, selected, onSelectCell }: CourseCellButtonProps) {
  return (
    <button
      type="button"
      className={isZoneCell(cell) ? "bb-course-cell bb-course-cell--zone" : "bb-course-cell"}
      data-testid={`course-cell-${cell.col}-${cell.row}`}
      aria-pressed={selected}
      aria-label={`コース ${cell.col + 1}列${cell.row + 1}行`}
      onClick={() => onSelectCell(cell)}
    />
  );
}

type CourseGridProps = {
  readonly selectedCell: CourseCell;
  readonly onSelectCell: (cell: CourseCell) => void;
};

/**
 * 5×5 のコース選択グリッド(制御コンポーネント)。ゾーンの正方形に重ねて使う。
 * セルのクリックは選択するだけで投球はしない。選択中のセル1つが `aria-pressed="true"`。
 */
export function CourseGrid({ selectedCell, onSelectCell }: CourseGridProps) {
  return (
    <div className="bb-course-grid" role="group" aria-label="コース">
      {GRID_INDICES.flatMap((row) =>
        GRID_INDICES.map((col) => (
          <CourseCellButton
            key={`${col}-${row}`}
            cell={{ col, row }}
            selected={selectedCell.col === col && selectedCell.row === row}
            onSelectCell={onSelectCell}
          />
        )),
      )}
    </div>
  );
}
