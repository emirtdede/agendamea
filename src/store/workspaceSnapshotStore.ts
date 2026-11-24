import type { Category, Todo } from '../types';
import {
  createSelectorStore,
  type EqualityFn,
  type SelectorStore,
  shallowEqual,
  useSelectorStore,
} from './createSelectorStore';

export interface WorkspaceSnapshotState {
  totalTodoCount: number;
  completedTodoCount: number;
  trashedCategories: Category[];
  trashedTodos: Todo[];
}

export interface WorkspaceSnapshotStore extends SelectorStore<WorkspaceSnapshotState> {
  syncCounts: (totalTodoCount: number, completedTodoCount: number) => void;
  syncTrash: (trashedCategories: Category[], trashedTodos: Todo[]) => void;
}

function getInitialWorkspaceSnapshot(): WorkspaceSnapshotState {
  return {
    totalTodoCount: 0,
    completedTodoCount: 0,
    trashedCategories: [],
    trashedTodos: [],
  };
}

export function createWorkspaceSnapshotStore(): WorkspaceSnapshotStore {
  const base = createSelectorStore<WorkspaceSnapshotState>(getInitialWorkspaceSnapshot);

  const syncCounts = (totalTodoCount: number, completedTodoCount: number): void => {
    base.patchState({ totalTodoCount, completedTodoCount });
  };

  const syncTrash = (trashedCategories: Category[], trashedTodos: Todo[]): void => {
    base.patchState({ trashedCategories, trashedTodos });
  };

  return {
    ...base,
    syncCounts,
    syncTrash,
  };
}

export const workspaceSnapshotStore = createWorkspaceSnapshotStore();

export function useWorkspaceSnapshotSelector<S>(
  selector: (state: WorkspaceSnapshotState) => S,
  isEqual: EqualityFn<S> = shallowEqual,
): S {
  return useSelectorStore(workspaceSnapshotStore, selector, isEqual);
}
