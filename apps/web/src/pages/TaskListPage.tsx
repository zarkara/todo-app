import { useSearchParams } from 'react-router-dom';
import { NewTaskForm } from '../components/NewTaskForm';
import { TaskList } from '../components/TaskList';
import { useTasks } from '../hooks/tasks';
import { useDebouncedValue } from '../hooks/useDebouncedValue';

const TaskListContent = ({ query, canReorder }: { query: string; canReorder: boolean }) => {
  const tasks = useTasks(query);

  if (tasks.isPending) return <p role="status">Loading tasks…</p>;
  if (tasks.isError) {
    return (
      <p role="alert" className="error-banner">
        Couldn’t load your tasks.{' '}
        <button type="button" className="button button-quiet" onClick={() => tasks.refetch()}>
          Try again
        </button>
      </p>
    );
  }
  if (tasks.data.length === 0) {
    return (
      <p className="empty">
        {query ? `No tasks match “${query}”.` : 'No tasks yet. Add your first one above.'}
      </p>
    );
  }
  return <TaskList tasks={tasks.data} canReorder={canReorder} />;
};

export const TaskListPage = () => {
  // The search lives in the URL so it survives reloads and can be shared or bookmarked.
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('q') ?? '';
  const query = useDebouncedValue(search.trim());

  return (
    <section>
      <h1>Your tasks</h1>
      <input
        type="search"
        className="input search"
        aria-label="Search tasks"
        placeholder="Search tasks"
        value={search}
        onChange={(event) =>
          setSearchParams(event.target.value ? { q: event.target.value } : {}, { replace: true })
        }
      />
      <NewTaskForm />
      <TaskListContent query={query} canReorder={search.trim() === ''} />
    </section>
  );
};
