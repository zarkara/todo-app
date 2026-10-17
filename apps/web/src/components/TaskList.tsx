import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { Task } from '@todo/shared';
import { useReorderTasks, useUpdateTask } from '../hooks/tasks';
import { dragMove } from '../lib/dragMove';
import { moveItem } from '../lib/moveItem';
import { TaskItem } from './TaskItem';

// Small threshold so a tap on the handle is not mistaken for a drag.
const DRAG_ACTIVATION_DISTANCE_PX = 5;

interface TaskListProps {
  tasks: Task[];
  canReorder: boolean;
}

export const TaskList = ({ tasks, canReorder }: TaskListProps) => {
  const reorder = useReorderTasks();
  const update = useUpdateTask();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: DRAG_ACTIVATION_DISTANCE_PX } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = tasks.map(({ id }) => id);

  const move = (from: number, to: number) => reorder.mutate(moveItem(tasks, from, to));
  const toggle = (task: Task) =>
    update.mutate({ id: task.id, patch: { completed: !task.completed } });
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const gesture = dragMove(ids, String(active.id), over ? String(over.id) : null);
    if (gesture) move(gesture.from, gesture.to);
  };

  return (
    <>
      {!canReorder && <p className="hint">Clear the search to reorder tasks.</p>}
      {reorder.isError && (
        <p role="alert" className="error-banner">
          Couldn’t save the new order. Please try again.
        </p>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy} disabled={!canReorder}>
          <ul aria-label="Tasks" className="task-list">
            {tasks.map((task, index) => (
              <TaskItem
                key={task.id}
                task={task}
                index={index}
                count={tasks.length}
                canReorder={canReorder}
                onMove={move}
                onToggle={toggle}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </>
  );
};
