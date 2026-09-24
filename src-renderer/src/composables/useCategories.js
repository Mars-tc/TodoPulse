/**
 * composables/useCategories.js
 * 分类状态与操作（模块级单例，多个组件共享同一份数据）
 */
import { ref, computed } from 'vue';

const categories = ref([]);
const loading = ref(false);
let loaded = false;

const PRESET_COLORS = [
  '#3b82f6',
  '#16a34a',
  '#eab308',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#f97316',
  '#ec4899'
];

async function loadCategories(force = false) {
  if (loaded && !force) return categories.value;
  loading.value = true;
  try {
    categories.value = (await window.electronAPI.listCategories()) || [];
    loaded = true;
  } catch (e) {
    console.error('[useCategories] 加载分类失败:', e.message);
    categories.value = [];
  } finally {
    loading.value = false;
  }
  return categories.value;
}

async function addCategory(name, color) {
  const created = await window.electronAPI.addCategory({
    name,
    color: color || PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)]
  });
  await loadCategories(true);
  return created;
}

async function renameCategory(id, name) {
  const updated = await window.electronAPI.updateCategory(id, { name });
  await loadCategories(true);
  return updated;
}

async function recolorCategory(id, color) {
  const updated = await window.electronAPI.updateCategory(id, { color });
  await loadCategories(true);
  return updated;
}

async function removeCategory(id) {
  await window.electronAPI.deleteCategory(id);
  await loadCategories(true);
}

export function useCategories() {
  const categoryMap = computed(() => {
    const map = {};
    for (const c of categories.value) map[c.id] = c;
    return map;
  });

  const getCategory = (id) => categoryMap.value[id] || null;

  return {
    categories,
    loading,
    categoryMap,
    getCategory,
    loadCategories,
    addCategory,
    renameCategory,
    recolorCategory,
    removeCategory,
    presetColors: PRESET_COLORS
  };
}
