import type { NewTask, Task, TaskPatch } from '@todo/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../api/ApiClientProvider';

export const taskKeys = {
  all: ['tasks'] as const,
  lists: () => [...taskKeys.all, 'list'] as const,
  list: (query: string) => [...taskKeys.lists(), query] as const,
  detail: (id: string) => [...taskKeys.all, 'detail', id] as const,
};

// Reordering needs the complete list, so it only ever applies to the unfiltered view.
const UNFILTERED_LIST = taskKeys.list('');

export const useTasks = (query: string) => {
  const api = useApiClient();
  return useQuery({
    queryKey: taskKeys.list(query),
    queryFn: () => api.listTasks(query),
    placeholderData: keepPreviousData,
  });
};

export const useTask = (id: string) => {
  const api = useApiClient();
  return useQuery({ queryKey: taskKeys.detail(id), queryFn: () => api.getTask(id) });
};

export const useCreateTask = () => {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewTask) => api.createTask(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: taskKeys.lists() }),
  });
};

export const useUpdateTask = () => {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TaskPatch }) => api.updateTask(id, patch),
    onSuccess: (task) => {
      queryClient.setQueryData(taskKeys.detail(task.id), task);
      return queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
    },
  });
};

export const useDeleteTask = () => {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteTask(id),
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: taskKeys.detail(id) });
      return queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
    },
  });
};

// Optimistic: the list shows the new order at once and rolls back if the server rejects it.
export const useReorderTasks = () => {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ordered: Task[]) => api.reorderTasks(ordered.map(({ id }) => id)),
    onMutate: async (ordered) => {
      await queryClient.cancelQueries({ queryKey: UNFILTERED_LIST });
      const previous = queryClient.getQueryData<Task[]>(UNFILTERED_LIST);
      queryClient.setQueryData(
        UNFILTERED_LIST,
        ordered.map((task, position) => ({ ...task, position })),
      );
      return { previous };
    },
    onError: (_error, _ordered, context) => {
      queryClient.setQueryData(UNFILTERED_LIST, context?.previous);
    },
    // Not awaited: the mutation settles without waiting on the background refetch.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
    },
  });
};
