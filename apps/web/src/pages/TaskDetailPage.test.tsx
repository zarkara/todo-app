import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { aTask } from '../test/fakeApi';
import { renderApp } from '../test/renderApp';

const tasks = [
  aTask({ id: 't1', title: 'Buy milk', description: '2 litres', position: 0 }),
  aTask({ id: 't2', title: 'Walk dog', position: 1 }),
  aTask({ id: 'g1', userId: 'grace', title: 'Secret', position: 0 }),
];

const renderDetail = (id = 't1') => renderApp({ route: `/tasks/${id}`, signedInAs: 'ada', tasks });

describe('TaskDetailPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows the task ready to edit', async () => {
    renderDetail();

    expect(await screen.findByLabelText('Title')).toHaveValue('Buy milk');
    expect(screen.getByLabelText('Description')).toHaveValue('2 litres');
    expect(screen.getByLabelText('Done')).not.toBeChecked();
  });

  it('saves edits', async () => {
    const { user, fakeApi } = renderDetail();
    const title = await screen.findByLabelText('Title');

    await user.clear(title);
    await user.type(title, 'Buy oat milk');
    await user.click(screen.getByLabelText('Done'));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Saved');
    expect(fakeApi.tasksOf('ada')[0]).toMatchObject({ title: 'Buy oat milk', completed: true });
  });

  it('refuses to save a blank title', async () => {
    const { user, fakeApi } = renderDetail();
    await user.clear(await screen.findByLabelText('Title'));

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Title is required')).toBeInTheDocument();
    expect(fakeApi.tasksOf('ada')[0]?.title).toBe('Buy milk');
  });

  it('deletes the task after confirmation and returns to the list', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { user, fakeApi } = renderDetail();
    await screen.findByLabelText('Title');

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByRole('heading', { name: 'Your tasks' })).toBeInTheDocument();
    await waitFor(() => expect(fakeApi.tasksOf('ada').map(({ id }) => id)).toEqual(['t2']));
  });

  it('keeps the task when deletion is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { user, fakeApi } = renderDetail();
    await screen.findByLabelText('Title');

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(screen.getByRole('heading', { name: 'Edit task' })).toBeInTheDocument();
    expect(fakeApi.tasksOf('ada')).toHaveLength(2);
  });

  it.each([
    ['a missing task', 'missing'],
    ["another user's task", 'g1'],
  ])('reports %s as not found', async (_label, id) => {
    renderDetail(id);

    expect(await screen.findByRole('heading', { name: 'Task not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to tasks' })).toHaveAttribute('href', '/tasks');
  });
});
