import { type Dispatch, type RefObject, type SetStateAction, useCallback } from 'react';
import { api } from '../api/client';
import type { UiDictionary } from '../i18n/translations';
import { preferencesStore } from '../store/preferencesStore';
import { workspaceUiStore } from '../store/workspaceUiStore';
import type { Category, CategoryPatch, Todo } from '../types';
import { sortCategoriesWithPin } from '../utils/todoLogic';

interface CategoryAndSubtaskDeps {
  tRef: RefObject<UiDictionary>;
  formatUiError: (err: unknown, fallback?: string) => string;
  showInfoToast: (message: string, variant?: 'info' | 'error') => void;
  showUndoToast: (kind: 'todo' | 'category', id: string, message: string) => void;
  loadData: (silent?: boolean, fromExternalSse?: boolean) => Promise<void>;
  setCategories: Dispatch<SetStateAction<Category[]>>;
  setTrashedCategories: Dispatch<SetStateAction<Category[]>>;
  setTodos: Dispatch<SetStateAction<Todo[]>>;
  setTrashedTodos: Dispatch<SetStateAction<Todo[]>>;
  categoryUpdateSeqRef: RefObject<Map<string, number>>;
  subtaskUpdateSeqRef: RefObject<Map<string, number>>;
  reorderCatSeqRef: RefObject<number>;
  pendingSubtaskDeletesRef: RefObject<Set<string>>;
  pendingTrashOpsRef: RefObject<Set<string>>;
}

/**
 * Encapsulates category CRUD/reorder/trash and subtask mutations with monotonic
 * sequence barriers, keeping `useTodoWorkspaceData` focused on bootstrap & todo lifecycle.
 */
export function useCategoryAndSubtaskActions({
  tRef,
  formatUiError,
  showInfoToast,
  showUndoToast,
  loadData,
  setCategories,
  setTrashedCategories,
  setTodos,
  setTrashedTodos,
  categoryUpdateSeqRef,
  subtaskUpdateSeqRef,
  reorderCatSeqRef,
  pendingSubtaskDeletesRef,
  pendingTrashOpsRef,
}: CategoryAndSubtaskDeps) {
  const handleCreateCategory = useCallback(
    async (payload: { id: string; name: string; color: string }) => {
      try {
        const created = await api.createCategory(payload);
        setCategories((prev) =>
          sortCategoriesWithPin([...prev.filter((c) => c.id !== created.id), created]),
        );
        workspaceUiStore.setActiveView({ type: 'category', id: created.id });
      } catch (err) {
        showInfoToast(formatUiError(err), 'error');
        throw err;
      }
    },
    [setCategories, showInfoToast, formatUiError],
  );

  const handleUpdateCategory = useCallback(
    async (id: string, patch: CategoryPatch) => {
      const seq = (categoryUpdateSeqRef.current.get(id) ?? 0) + 1;
      categoryUpdateSeqRef.current.set(id, seq);
      try {
        const updated = await api.updateCategory(id, patch);
        if (categoryUpdateSeqRef.current.get(id) === seq) {
          setCategories((prev) =>
            sortCategoriesWithPin(prev.map((c) => (c.id === id ? updated : c))),
          );
        }
      } catch (err) {
        showInfoToast(formatUiError(err), 'error');
        if (categoryUpdateSeqRef.current.get(id) === seq) {
          void loadData(true);
        }
        throw err;
      }
    },
    [categoryUpdateSeqRef, setCategories, showInfoToast, loadData, formatUiError],
  );

  const handleTogglePinCategory = useCallback(
    async (id: string, pinned: boolean) => {
      const seq = (categoryUpdateSeqRef.current.get(id) ?? 0) + 1;
      categoryUpdateSeqRef.current.set(id, seq);
      setCategories((prev) =>
        sortCategoriesWithPin(prev.map((c) => (c.id === id ? { ...c, pinned } : c))),
      );
      try {
        const updated = await api.updateCategory(id, { pinned });
        if (categoryUpdateSeqRef.current.get(id) === seq) {
          setCategories((prev) =>
            sortCategoriesWithPin(prev.map((c) => (c.id === id ? updated : c))),
          );
        }
      } catch (err) {
        showInfoToast(formatUiError(err), 'error');
        if (categoryUpdateSeqRef.current.get(id) === seq) {
          void loadData(true);
        }
      }
    },
    [categoryUpdateSeqRef, setCategories, showInfoToast, loadData, formatUiError],
  );

  const handleDeleteCategory = useCallback(
    async (id: string) => {
      if (
        preferencesStore.getState().confirmBeforeDelete &&
        typeof window !== 'undefined' &&
        typeof window.confirm === 'function'
      ) {
        const confirmed = window.confirm(
          `${tRef.current.deleteToTrashButton} (${tRef.current.categories})?`,
        );
        if (!confirmed) return;
      }
      try {
        const trashed = await api.deleteCategory(id);
        categoryUpdateSeqRef.current.delete(id);
        setCategories((prev) => prev.filter((c) => c.id !== id));
        setTrashedCategories((prev) => [trashed, ...prev.filter((c) => c.id !== id)]);
        workspaceUiStore.setActiveView((prev) =>
          prev.type === 'category' && prev.id === id ? { type: 'smart', id: 'all' } : prev,
        );
        showUndoToast('category', id, tRef.current.categoryMovedToTrashToast);
      } catch (err) {
        showInfoToast(formatUiError(err), 'error');
        void loadData(true);
        throw err;
      }
    },
    [
      categoryUpdateSeqRef,
      setCategories,
      setTrashedCategories,
      showUndoToast,
      showInfoToast,
      loadData,
      formatUiError,
      tRef,
    ],
  );

  const handleRestoreCategory = useCallback(
    async (id: string) => {
      const opKey = `cat:${id}`;
      if (pendingTrashOpsRef.current.has(opKey)) return;
      pendingTrashOpsRef.current.add(opKey);
      try {
        const restored = await api.restoreCategory(id);
        setTrashedCategories((prev) => prev.filter((c) => c.id !== id));
        setCategories((prev) =>
          sortCategoriesWithPin([...prev.filter((c) => c.id !== id), restored]),
        );
      } catch (err) {
        showInfoToast(formatUiError(err), 'error');
        void loadData(true);
      } finally {
        pendingTrashOpsRef.current.delete(opKey);
      }
    },
    [
      pendingTrashOpsRef,
      setTrashedCategories,
      setCategories,
      showInfoToast,
      loadData,
      formatUiError,
    ],
  );

  const handlePermanentDeleteCategory = useCallback(
    async (id: string) => {
      const opKey = `cat:${id}`;
      if (pendingTrashOpsRef.current.has(opKey)) return;
      pendingTrashOpsRef.current.add(opKey);
      try {
        await api.permanentDeleteCategory(id);
        categoryUpdateSeqRef.current.delete(id);
        setTrashedCategories((prev) => prev.filter((c) => c.id !== id));
        setTodos((prev) =>
          prev.map((tItem) => (tItem.categoryId === id ? { ...tItem, categoryId: null } : tItem)),
        );
        setTrashedTodos((prev) =>
          prev.map((tItem) => (tItem.categoryId === id ? { ...tItem, categoryId: null } : tItem)),
        );
      } catch (err) {
        showInfoToast(formatUiError(err), 'error');
        void loadData(true);
      } finally {
        pendingTrashOpsRef.current.delete(opKey);
      }
    },
    [
      pendingTrashOpsRef,
      categoryUpdateSeqRef,
      setTrashedCategories,
      setTodos,
      setTrashedTodos,
      showInfoToast,
      loadData,
      formatUiError,
    ],
  );

  const handleReorderCategories = useCallback(
    (orderedIds: string[]) => {
      const seq = reorderCatSeqRef.current + 1;
      reorderCatSeqRef.current = seq;
      const orderLookup = new Map(orderedIds.map((id, idx) => [id, idx]));
      setCategories((prev) =>
        sortCategoriesWithPin(
          prev.map((c) => ({ ...c, sortOrder: orderLookup.get(c.id) ?? c.sortOrder })),
        ),
      );
      void api.reorderCategories(orderedIds).catch((err) => {
        if (reorderCatSeqRef.current === seq) {
          showInfoToast(formatUiError(err), 'error');
          void loadData(true);
        }
      });
    },
    [reorderCatSeqRef, setCategories, showInfoToast, loadData, formatUiError],
  );

  const handleAddSubtask = useCallback(
    async (todoId: string, title: string): Promise<boolean> => {
      try {
        const created = await api.createSubtask(todoId, title);
        setTodos((prev) =>
          prev.map((tItem) =>
            tItem.id === todoId ? { ...tItem, subtasks: [...tItem.subtasks, created] } : tItem,
          ),
        );
        return true;
      } catch (err) {
        showInfoToast(formatUiError(err), 'error');
        return false;
      }
    },
    [setTodos, showInfoToast, formatUiError],
  );

  const handleToggleSubtask = useCallback(
    async (todoId: string, subtaskId: string, completed: boolean) => {
      if (pendingSubtaskDeletesRef.current.has(subtaskId)) return;
      const seq = (subtaskUpdateSeqRef.current.get(subtaskId) ?? 0) + 1;
      subtaskUpdateSeqRef.current.set(subtaskId, seq);

      setTodos((prev) =>
        prev.map((tItem) =>
          tItem.id === todoId
            ? {
                ...tItem,
                subtasks: tItem.subtasks.map((s) => (s.id === subtaskId ? { ...s, completed } : s)),
              }
            : tItem,
        ),
      );
      try {
        await api.updateSubtask(subtaskId, { completed });
      } catch (err) {
        if (
          !pendingSubtaskDeletesRef.current.has(subtaskId) &&
          subtaskUpdateSeqRef.current.get(subtaskId) === seq
        ) {
          showInfoToast(formatUiError(err), 'error');
          void loadData(true);
        }
      }
    },
    [
      pendingSubtaskDeletesRef,
      subtaskUpdateSeqRef,
      setTodos,
      showInfoToast,
      loadData,
      formatUiError,
    ],
  );

  const handleRenameSubtask = useCallback(
    async (todoId: string, subtaskId: string, title: string) => {
      const trimmed = title.trim();
      if (!trimmed || pendingSubtaskDeletesRef.current.has(subtaskId)) return;
      const seq = (subtaskUpdateSeqRef.current.get(subtaskId) ?? 0) + 1;
      subtaskUpdateSeqRef.current.set(subtaskId, seq);

      setTodos((prev) =>
        prev.map((tItem) =>
          tItem.id === todoId
            ? {
                ...tItem,
                subtasks: tItem.subtasks.map((s) =>
                  s.id === subtaskId ? { ...s, title: trimmed } : s,
                ),
              }
            : tItem,
        ),
      );
      try {
        await api.updateSubtask(subtaskId, { title: trimmed });
      } catch (err) {
        if (
          !pendingSubtaskDeletesRef.current.has(subtaskId) &&
          subtaskUpdateSeqRef.current.get(subtaskId) === seq
        ) {
          showInfoToast(formatUiError(err), 'error');
          void loadData(true);
        }
      }
    },
    [
      pendingSubtaskDeletesRef,
      subtaskUpdateSeqRef,
      setTodos,
      showInfoToast,
      loadData,
      formatUiError,
    ],
  );

  const handleDeleteSubtask = useCallback(
    async (todoId: string, subtaskId: string) => {
      if (pendingSubtaskDeletesRef.current.has(subtaskId)) return;
      pendingSubtaskDeletesRef.current.add(subtaskId);
      subtaskUpdateSeqRef.current.delete(subtaskId);

      setTodos((prev) =>
        prev.map((tItem) =>
          tItem.id === todoId
            ? { ...tItem, subtasks: tItem.subtasks.filter((s) => s.id !== subtaskId) }
            : tItem,
        ),
      );
      try {
        await api.deleteSubtask(subtaskId);
      } catch (err) {
        showInfoToast(formatUiError(err), 'error');
        void loadData(true);
      } finally {
        pendingSubtaskDeletesRef.current.delete(subtaskId);
      }
    },
    [
      pendingSubtaskDeletesRef,
      subtaskUpdateSeqRef,
      setTodos,
      showInfoToast,
      loadData,
      formatUiError,
    ],
  );

  return {
    handleCreateCategory,
    handleUpdateCategory,
    handleTogglePinCategory,
    handleDeleteCategory,
    handleRestoreCategory,
    handlePermanentDeleteCategory,
    handleReorderCategories,
    handleAddSubtask,
    handleToggleSubtask,
    handleRenameSubtask,
    handleDeleteSubtask,
  };
}
