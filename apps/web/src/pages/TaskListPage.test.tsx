import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { aTask, API_URL } from '../test/fakeApi';
import { renderApp } from '../test/renderApp';

const threeTasks = [
  aTask({ id: 'b', title: 'Walk dog', position: 1 }),
  aTask({ id: 'a', title: 'Buy milk', description: 'From the corner shop', position: 0 }),
  aTask({ id: 'c', title: 'Call mum', position: 2 }),
  aTask({ id: 'g', userId: 'grace', title: "Grace's task", position: 0 }),
];

const renderList = (tasks = threeTasks, route = '/tasks') =>
  renderApp({ route, signedInAs: 'ada', tasks });

const visibleTitles = async () => {
  const list = await screen.findByRole('list', { name: 'Tasks' });
  return within(list)
    .getAllByRole('link')
    .map((link) => link.textContent);
};

describe('TaskListPage', () => {
  it("lists the user's tasks in their saved order", async () => {
    renderList();

    expect(await visibleTitles()).toEqual(['Buy milk', 'Walk dog', 'Call mum']);
  });

  it('invites the user to add a first task when the list is empty', async () => {
    renderList([]);

    expect(await screen.findByText('No tasks yet. Add your first one above.')).toBeInTheDocument();
  });

  it('filters the list as the user searches, including descriptions', async () => {
    const { user } = renderList();
    await visibleTitles();

    await user.type(screen.getByRole('searchbox', { name: 'Search tasks' }), 'corner');

    await waitFor(async () => expect(await visibleTitles()).toEqual(['Buy milk']));
  });

  it('restores a search from the URL and explains when nothing matches', async () => {
    renderList(threeTasks, '/tasks?q=zebra');

    expect(await screen.findByText('No tasks match “zebra”.')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search tasks' })).toHaveValue('zebra');
  });

  it('adds a task to the end of the list', async () => {
    const { user } = renderList();
    await visibleTitles();

    await user.type(screen.getByLabelText('New task title'), 'Pay rent');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(async () =>
      expect(await visibleTitles()).toEqual(['Buy milk', 'Walk dog', 'Call mum', 'Pay rent']),
    );
    expect(screen.getByLabelText('New task title')).toHaveValue('');
  });

  it('refuses to add a blank task', async () => {
    const { user } = renderList();
    await visibleTitles();

    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByText('Title is required')).toBeInTheDocument();
  });

  it('marks a task complete', async () => {
    const { user, fakeApi } = renderList();
    await visibleTitles();

    await user.click(screen.getByRole('checkbox', { name: 'Mark “Buy milk” as done' }));

    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Mark “Buy milk” as not done' })).toBeChecked(),
    );
    expect(fakeApi.tasksOf('ada').find(({ id }) => id === 'a')?.completed).toBe(true);
  });

  it('moves a task down and saves the new order', async () => {
    const { user, fakeApi } = renderList();
    await visibleTitles();

    await user.click(screen.getByRole('button', { name: 'Move “Buy milk” down' }));

    await waitFor(async () =>
      expect(await visibleTitles()).toEqual(['Walk dog', 'Buy milk', 'Call mum']),
    );
    await waitFor(() =>
      expect(fakeApi.tasksOf('ada').map(({ title }) => title)).toEqual([
        'Walk dog',
        'Buy milk',
        'Call mum',
      ]),
    );
  });

  it('cannot move the first task up or the last task down', async () => {
    renderList();
    await visibleTitles();

    expect(screen.getByRole('button', { name: 'Move “Buy milk” up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move “Call mum” down' })).toBeDisabled();
  });

  it('hides reordering while a search is active, since only part of the list is shown', async () => {
    renderList(threeTasks, '/tasks?q=milk');
    await visibleTitles();

    expect(screen.queryByRole('button', { name: /^Move/ })).not.toBeInTheDocument();
    expect(screen.getByText('Clear the search to reorder tasks.')).toBeInTheDocument();
  });

  it('offers a retry when the list fails to load', async () => {
    let attempts = 0;
    const { user } = renderApp({
      route: '/tasks',
      signedInAs: 'ada',
      tasks: threeTasks,
      handlers: [
        http.get(`${API_URL}/tasks`, () => {
          attempts += 1;
          return attempts === 1
            ? HttpResponse.json({ error: { code: 'X', message: 'down' } }, { status: 400 })
            : HttpResponse.json([aTask({ id: 'a', title: 'Buy milk' })]);
        }),
      ],
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load your tasks.');
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await visibleTitles()).toEqual(['Buy milk']);
  });
});
