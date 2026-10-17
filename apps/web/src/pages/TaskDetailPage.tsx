import { type Task, updateTaskSchema } from '@todo/shared';
import { type FormEvent, useId, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { TextField } from '../components/TextField';
import { useDeleteTask, useTask, useUpdateTask } from '../hooks/tasks';

const BackLink = () => (
  <Link to="/tasks" className="back-link">
    <span aria-hidden="true">← </span>Back to tasks
  </Link>
);

const TaskEditor = ({ task }: { task: Task }) => {
  const update = useUpdateTask();
  const remove = useDeleteTask();
  const navigate = useNavigate();
  const descriptionId = useId();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [completed, setCompleted] = useState(task.completed);
  const [titleError, setTitleError] = useState<string>();

  // Any edit after a save means the "Saved" confirmation no longer applies.
  const edit =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      update.reset();
      setter(value);
    };

  const handleSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = updateTaskSchema.safeParse({ title, description, completed });
    if (!result.success) {
      setTitleError(result.error.flatten().fieldErrors.title?.[0]);
      return;
    }
    setTitleError(undefined);
    update.mutate({ id: task.id, patch: result.data });
  };

  const handleDelete = () => {
    if (window.confirm(`Delete “${task.title}”? This can’t be undone.`)) {
      remove.mutate(task.id, { onSuccess: () => navigate('/tasks') });
    }
  };

  const failure = update.error ?? remove.error;

  return (
    <form className="card" onSubmit={handleSave} noValidate>
      <BackLink />
      <h1>Edit task</h1>
      {failure && (
        <p role="alert" className="error-banner">
          {failure.message}
        </p>
      )}
      <TextField
        label="Title"
        value={title}
        onChange={(event) => edit(setTitle)(event.target.value)}
        error={titleError}
      />
      <div className="field">
        <label htmlFor={descriptionId} className="field-label">
          Description
        </label>
        <textarea
          id={descriptionId}
          className="input"
          rows={5}
          value={description}
          onChange={(event) => edit(setDescription)(event.target.value)}
        />
      </div>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={completed}
          onChange={(event) => edit(setCompleted)(event.target.checked)}
        />
        Done
      </label>
      <div className="actions">
        <button type="submit" className="button" disabled={update.isPending}>
          Save
        </button>
        <button
          type="button"
          className="button button-danger"
          onClick={handleDelete}
          disabled={remove.isPending}
        >
          Delete
        </button>
        {update.isSuccess && (
          <p role="status" className="saved">
            Saved
          </p>
        )}
      </div>
    </form>
  );
};

export const TaskDetailPage = () => {
  const { id = '' } = useParams();
  const task = useTask(id);

  if (task.isPending) return <p role="status">Loading task…</p>;
  if (task.isError) {
    if (task.error instanceof ApiError && task.error.status === 404) {
      return (
        <section className="card">
          <h1>Task not found</h1>
          <p>It may have been deleted, or it belongs to another account.</p>
          <BackLink />
        </section>
      );
    }
    return (
      <p role="alert" className="error-banner">
        {task.error.message}
      </p>
    );
  }
  // Keyed by id so navigating to another task starts from fresh form state.
  return <TaskEditor key={task.data.id} task={task.data} />;
};
