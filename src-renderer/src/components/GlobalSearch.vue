<template>
  <div v-if="open" class="gs-overlay" @click.self="close">
    <div class="gs-panel">
      <div class="gs-header">
        <span class="gs-search-icon">🔍</span>
        <input
          ref="inputRef"
          v-model="query"
          type="text"
          class="gs-input"
          placeholder="搜索待办、分类或跳转页面…"
          autocomplete="off"
          @keydown.down="moveFocus(1)"
          @keydown.up="moveFocus(-1)"
          @keydown.enter="confirmSelected"
        />
        <kbd class="gs-esc">ESC</kbd>
      </div>

      <div v-if="loading" class="gs-loading">加载中…</div>

      <div v-else-if="!query.trim() && results.length === 0" class="gs-empty">
        <div class="gs-empty-icon">⌨️</div>
        <p>快捷键</p>
        <ul class="gs-keys">
          <li><kbd>Ctrl+K</kbd> 全局搜索</li>
          <li><kbd>Ctrl+Shift+A</kbd> 快速添加</li>
          <li><kbd>N</kbd> 新建待办</li>
          <li><kbd>Space</kbd> 完成选中</li>
          <li><kbd>Del</kbd> 删除选中</li>
        </ul>
      </div>

      <div v-else-if="results.length === 0" class="gs-empty">
        <div class="gs-empty-icon">🔍</div>
        <p>未找到匹配结果</p>
      </div>

      <ul v-else class="gs-results">
        <li
          v-for="(item, idx) in results"
          :key="item.key"
          :class="['gs-item', { selected: idx === focusIdx }]"
          @mouseenter="focusIdx = idx"
          @click="confirmItem(item)"
        >
          <span class="gs-item-type">{{ item.type }}</span>
          <span class="gs-item-title">{{ item.title }}</span>
          <span v-if="item.subtitle" class="gs-item-sub">{{ item.subtitle }}</span>
        </li>
      </ul>

      <div class="gs-footer">
        <span><kbd>↑↓</kbd> 选择 &nbsp; <kbd>↵</kbd> 确认 &nbsp; <kbd>Esc</kbd> 关闭</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, nextTick } from 'vue'
import { searchOpen } from '../composables/useKeyboardShortcuts'
import { useCategories } from '../composables/useCategories'
import { pushToast } from '../composables/useToast'

const props = defineProps({
  todos: { type: Array, default: () => [] },
  categories: { type: Array, default: () => [] }
})
const emit = defineEmits(['close', 'goto', 'focus'])

const open = ref(false)
const query = ref('')
const loading = ref(false)
const focusIdx = ref(0)
const inputRef = ref(null)

watch(searchOpen, val => {
  if (val) {
    open.value = true
    nextTick(() => { inputRef.value?.focus() })
  } else {
    close()
  }
})

function close() {
  open.value = false
  query.value = ''
  focusIdx.value = 0
  emit('close')
}

function moveFocus(dir) {
  if (results.value.length === 0) return
  focusIdx.value = Math.max(0, Math.min(results.value.length - 1, focusIdx.value + dir))
  const el = document.querySelectorAll('.gs-item')[focusIdx.value]
  el?.scrollIntoView({ block: 'nearest' })
}

function confirmSelected() {
  if (results.value[focusIdx.value]) confirmItem(results.value[focusIdx.value])
}

function confirmItem(item) {
  emit('goto', item)
  close()
}

const results = ref([])

watch(query, async (q) => {
  focusIdx.value = 0
  if (!q.trim()) {
    // 无关键词时显示快捷跳转项
    results.value = buildQuickNav()
    return
  }
  loading.value = true
  try {
    results.value = await buildResults(q)
  } catch (e) {
    console.error('[GlobalSearch] 搜索失败:', e.message)
    results.value = []
  } finally {
    loading.value = false
  }
})

function buildQuickNav() {
  const items = []
  const today = { key: 'view-today', type: '视图', title: '📅 今天', subtitle: '查看今日待办', action: 'view-today' }
  const overdue = { key: 'view-overdue', type: '视图', title: '⚠️ 已逾期', subtitle: '查看逾期任务', action: 'view-overdue' }
  const stats = { key: 'view-stats', type: '页面', title: '📊 数据统计', subtitle: '查看统计数据', action: 'view-stats' }
  const settings = { key: 'view-settings', type: '页面', title: '⚙️ 设置', subtitle: '应用设置', action: 'view-settings' }
  const trash = { key: 'view-trash', type: '页面', title: '🗑️ 回收站', subtitle: '已删除的待办', action: 'view-trash' }
  items.push(today, overdue, stats, settings, trash)
  // 添加分类快捷跳转
  props.categories.forEach(cat => {
    items.push({ key: `cat-${cat.id}`, type: '分类', title: `${cat.name}`, subtitle: `${cat.color}`, action: `category:${cat.id}` })
  })
  return items
}

async function buildResults(q) {
  const qLower = q.toLowerCase()
  const items = []

  // 匹配待办
  const todos = props.todos || []
  todos.forEach(t => {
    if (t.title.toLowerCase().includes(qLower) || (t.description || '').toLowerCase().includes(qLower)) {
      const cat = props.categories.find(c => c.id === t.category_id)
      items.push({
        key: `todo-${t.id}`,
        type: '待办',
        title: t.title,
        subtitle: [cat?.name, t.deadline ? formatDate(t.deadline) : null].filter(Boolean).join(' · '),
        action: `focus:${t.id}`,
        todo: t
      })
    }
  })

  // 匹配分类
  props.categories.forEach(cat => {
    if (cat.name.toLowerCase().includes(qLower)) {
      items.push({
        key: `cat-${cat.id}`,
        type: '分类',
        title: cat.name,
        subtitle: `${cat.color}`,
        action: `category:${cat.id}`
      })
    }
  })

  // 页面跳转
  const pageMatches = [
    { q: '统计', action: 'view-stats', title: '📊 数据统计', type: '页面' },
    { q: '设置', action: 'view-settings', title: '⚙️ 设置', type: '页面' },
    { q: '回收', action: 'view-trash', title: '🗑️ 回收站', type: '页面' },
    { q: '脚本', action: 'view-scripts', title: '🧩 网页脚本', type: '页面' },
    { q: '今天', action: 'view-today', title: '📅 今天', type: '视图' },
    { q: '逾期', action: 'view-overdue', title: '⚠️ 已逾期', type: '视图' }
  ]
  pageMatches.forEach(p => {
    if (p.q.includes(qLower) || qLower.includes(p.q)) {
      items.push({ key: p.action, type: p.type, title: p.title, action: p.action })
    }
  })

  return items.slice(0, 30)
}

function formatDate(iso) {
  try {
    const d = new Date(iso)
    return `${d.getMonth() + 1}/${d.getDate()}`
  } catch { return '' }
}

defineExpose({ close })
</script>

<style scoped>
.gs-overlay {
  position: fixed; inset: 0; z-index: 2000;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(6px);
  display: flex; align-items: flex-start; justify-content: center;
  padding-top: 12vh;
  animation: gsFade 0.15s ease;
}
@keyframes gsFade { from { opacity: 0 } to { opacity: 1 } }

.gs-panel {
  width: 620px; max-width: 92vw;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(15, 23, 42, 0.35);
  display: flex; flex-direction: column;
  overflow: hidden;
  animation: gsPop 0.2s cubic-bezier(0.34, 1.4, 0.64, 1);
}
@keyframes gsPop { from { opacity: 0; transform: scale(0.96) translateY(-8px) } to { opacity: 1; transform: none } }

.gs-header {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-color);
}
.gs-search-icon { font-size: 18px; flex-shrink: 0 }
.gs-input {
  flex: 1; border: none; outline: none; background: transparent;
  color: var(--text-primary); font-size: 14px;
}
.gs-input::placeholder { color: var(--text-muted) }
.gs-esc {
  font-size: 11px; padding: 2px 7px; border-radius: 5px;
  background: var(--bg-secondary); color: var(--text-muted);
  border: 1px solid var(--border-color); font-family: monospace;
}

.gs-loading, .gs-empty { padding: 36px 20px; text-align: center; color: var(--text-muted); font-size: 13px }
.gs-empty-icon { font-size: 32px; margin-bottom: 8px }
.gs-empty p { margin: 0 0 12px; color: var(--text-secondary) }
.gs-keys { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px }
.gs-keys li { font-size: 12px; color: var(--text-muted) }
.gs-keys kbd {
  padding: 1px 6px; border-radius: 4px; font-size: 11px;
  background: var(--bg-secondary); border: 1px solid var(--border-color);
  font-family: monospace; color: var(--text-secondary);
}

.gs-results { list-style: none; padding: 6px 0; margin: 0; max-height: 360px; overflow-y: auto }
.gs-item {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 16px; cursor: pointer; transition: background 0.12s ease;
}
.gs-item:hover, .gs-item.selected { background: var(--accent-soft) }
.gs-item.selected { outline: 2px solid var(--accent-color); outline-offset: -2px; border-radius: 6px; margin: 0 6px }
.gs-item-type {
  font-size: 11px; padding: 2px 7px; border-radius: 5px;
  background: var(--bg-secondary); color: var(--text-muted);
  border: 1px solid var(--border-color); flex-shrink: 0;
}
.gs-item-title { flex: 1; font-size: 13.5px; color: var(--text-primary); font-weight: 500 }
.gs-item-sub { font-size: 12px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px }

.gs-footer {
  padding: 8px 16px; border-top: 1px solid var(--border-color);
  font-size: 11.5px; color: var(--text-muted);
}
.gs-footer kbd {
  padding: 1px 5px; border-radius: 3px; font-size: 10.5px;
  background: var(--bg-secondary); border: 1px solid var(--border-color);
  font-family: monospace;
}
</style>
