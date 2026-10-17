import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Task } from '@todo/shared';
import { Link } from 'react-router-dom';

interface TaskItemProps {
  task: Task;
  index: number;
  count: number;
  canReorder: boolean;
  onMove: (from: number, to: number) => void;
  onToggle: (task: Task) => void;
}

export const TaskItem = ({ task, index, count, canReorder, onMove, onToggle }: TaskItemProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: !canReorder,
  });
  const { title, completed } = task;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`task-item${isDragging ? ' is-dragging' : ''}`}
    >
      {canReorder && (
        <button
          type="button"
          className="drag-handle"
          aria-label={`Drag “${title}” to reorder`}
          {...attributes}
          {...listeners}
        >
          <span aria-hidden="true">⠿</span>
        </button>
      )}
      <input
        type="checkbox"
        checked={completed}
        onChange={() => onToggle(task)}
        aria-label={`Mark “${title}” as ${completed ? 'not done' : 'done'}`}
      />
      <Link to={`/tasks/${task.id}`} className={`task-title${completed ? ' is-done' : ''}`}>
        {title}
      </Link>
      {canReorder && (
        <span className="move-buttons">
          <button
            type="button"
            className="icon-button"
            aria-label={`Move “${title}” up`}
            disabled={index === 0}
            onClick={() => onMove(index, index - 1)}
          >
            <span aria-hidden="true">▲</span>
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={`Move “${title}” down`}
            disabled={index === count - 1}
            onClick={() => onMove(index, index + 1)}
          >
            <span aria-hidden="true">▼</span>
          </button>
        </span>
      )}
    </li>
  );
};
