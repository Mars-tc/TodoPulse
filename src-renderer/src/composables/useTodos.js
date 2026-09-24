/**
 * composables/useTodos.js
 * 待办列表状态：筛选 / 搜索 / 排序 / CRUD / 软删除与撤销
 */
import { ref } from 'vue';
import { pushToast } from './useToast';
import { useCategories } from './useCategories';

// ---------- 模块级共享状态 ----------
export const todos = ref([]);
export const loading = ref(false);

export const filter = ref('all'); // all | pending | completed
export const keyword = ref('');
export const categoryId = ref(''); // '' 全部 | 'none' 未分类 | id
export const view = ref('all'); // all | today | overdue
export const sortBy = ref('create_at');
export const order = ref('desc');

const { loadCategories } = useCategories();

// ---------- 派生数据 ----------
// 计数由服务端聚合得出：只受关键词 / 分类影响，不受状态与快捷视图影响，
// 保证侧边栏与筛选条的角标始终反映真实分布
export const stats = ref({ all: 0, pending: 0, completed: 0, today: 0, overdue: 0, uncategorized: 0 });

async function loadCounts() {
  try {
    stats.value = await window.electronAPI.getCounts({
      keyword: keyword.value,
      categoryId: categoryId.value
    });
  } catch (e) {
    console.error('[useTodos] 加载计数失败:', e.message);
  }
}

// ---------- 加载 ----------
export async function loadTodos() {
  loading.value = true;
  try {
    const res = await window.electronAPI.getTodos({
      status: filter.value,
      keyword: keyword.value,
      categoryId: categoryId.value,
      view: view.value,
      sortBy: sortBy.value,
      order: order.value,
      page: 1,
      pageSize: 500
    });
    todos.value = (res && res.list) || [];
    await loadCounts();
  } catch (e) {
    console.error('[useTodos] 加载待办失败:', e.message);
    todos.value = [];
  } finally {
    loading.value = false;
  }
}

// ---------- 增删改 ----------
export async function saveTodo(formData, editingId = null) {
  if (editingId) {
    const updated = await window.electronAPI.updateTodo(editingId, formData);
    const idx = todos.value.findIndex((t) => t.id === editingId);
    if (idx >= 0) todos.value[idx] = updated;
    await loadTodos();
    return updated;
  }

  const created = await window.electronAPI.addTodo(formData);
  await loadTodos();
  await loadCategories(true);
  return created;
}

export async function toggleTodo(todo) {
  const updated = await window.electronAPI.updateTodo(todo.id, { completed: !todo.completed });
  if (updated && updated.repeat_rule && !todo.completed) {
    pushToast({ message: '已完成，已自动生成下一轮重复待办', type: 'success' });
  }
  await loadTodos();
}

/**
 * 软删除 + 撤销
 */
export async function removeTodos(ids, { silent = false } = {}) {
  const list = Array.isArray(ids) ? ids : [ids];
  if (!list.length) return;

  await window.electronAPI.softDeleteTodos(list);
  await loadTodos();

  if (silent) return;

  pushToast({
    message: `已删除 ${list.length} 条待办`,
    type: 'info',
    actionLabel: '撤销',
    onAction: async () => {
      await window.electronAPI.restoreTodos(list);
      await loadTodos();
      pushToast({ message: '已恢复', type: 'success' });
    }
  });
}

export async function clearCompleted() {
  const ids = todos.value.filter((t) => t.completed).map((t) => t.id);
  if (!ids.length) return;
  await removeTodos(ids);
}

export async function restoreTodos(ids) {
  await window.electronAPI.restoreTodos(ids);
  await loadTodos();
}

export async function purgeTodos(ids) {
  await window.electronAPI.batchDeleteTodos(ids);
  await loadTodos();
}

// ---------- 筛选控制 ----------
export function setFilter(value) {
  filter.value = value;
  loadTodos();
}

export function setCategory(value) {
  categoryId.value = value;
  view.value = 'all';
  loadTodos();
}

export function setView(value) {
  view.value = value;
  categoryId.value = '';
  loadTodos();
}

export function setSort(value) {
  if (sortBy.value === value) {
    order.value = order.value === 'desc' ? 'asc' : 'desc';
  } else {
    sortBy.value = value;
    order.value = value === 'priority' ? 'desc' : 'desc';
  }
  loadTodos();
}

export function resetFilters() {
  filter.value = 'all';
  keyword.value = '';
  categoryId.value = '';
  view.value = 'all';
  sortBy.value = 'create_at';
  order.value = 'desc';
  loadTodos();
}

export function useTodos() {
  return {
    todos,
    loading,
    // 筛选条件
    filter,
    keyword,
    categoryId,
    view,
    sortBy,
    order,
    // 派生
    stats,
    // 操作
    loadTodos,
    saveTodo,
    toggleTodo,
    removeTodos,
    clearCompleted,
    restoreTodos,
    purgeTodos,
    // 筛选控制
    setFilter,
    setCategory,
    setView,
    setSort,
    resetFilters
  };
}
