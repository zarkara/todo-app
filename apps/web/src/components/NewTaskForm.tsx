import { createTaskSchema } from '@todo/shared';
import { type FormEvent, useState } from 'react';
import { useCreateTask } from '../hooks/tasks';
import { TextField } from './TextField';

export const NewTaskForm = () => {
  const create = useCreateTask();
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string>();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = createTaskSchema.safeParse({ title });
    if (!result.success) {
      setError(result.error.issues[0]?.message);
      return;
    }
    setError(undefined);
    create.mutate(result.data, { onSuccess: () => setTitle('') });
  };

  return (
    <form className="new-task" onSubmit={handleSubmit} noValidate>
      <TextField
        label="New task title"
        hideLabel
        placeholder="Add a task…"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        error={error ?? create.error?.message}
      />
      <button type="submit" className="button" disabled={create.isPending}>
        Add
      </button>
    </form>
  );
};
