<template>
  <div class="kanban">
    <div v-if="loading" class="kb-loading">加载中…</div>
    <div v-else-if="categories.length === 0" class="kb-empty">
      <div class="kb-empty-icon">📋</div>
      <p>暂无分类</p>
      <span class="kb-empty-hint">请先在侧边栏创建分类</span>
    </div>
    <div v-else class="kb-columns">
      <!-- 未分类列 -->
      <div
        class="kb-col"
        :class="{ 'kb-col-drop': isDropTarget(null) }"
        :data-cat-id="''"
        @dragover="onDragOver($event, null)"
        @dragleave="onDragLeave($event)"
        @drop="onDrop($event, null)"
      >
        <div class="kb-col-header">
          <span class="kb-col-dot" style="background:#94a3b8"></span>
          <span class="kb-col-name">未分类</span>
          <span class="kb-col-count">{{ groupByCategory[null].length }}</span>
        </div>
        <div class="kb-col-body">
          <div
            v-for="todo in groupByCategory[null]"
            :key="todo.id"
            class="kb-card"
            draggable="true"
            @dragstart="onDragStart($event, todo)"
            @dragend="onDragEnd"
          >
            <div class="kb-card-title">{{ todo.title }}</div>
            <div class="kb-card-meta">
              <span :class="['kb-priority', todo.priority]">{{ priorityLabel(todo.priority) }}</span>
              <span v-if="todo.deadline" :class="['kb-deadline', { overdue: isOverdue(todo.deadline) }]">
                {{ formatDeadline(todo.deadline) }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 分类列 -->
      <div
        v-for="cat in categories"
        :key="cat.id"
        class="kb-col"
        :class="{ 'kb-col-drop': isDropTarget(cat.id) }"
        :data-cat-id="cat.id"
        @dragover="onDragOver($event, cat.id)"
        @dragleave="onDragLeave($event)"
        @drop="onDrop($event, cat.id)"
      >
        <div class="kb-col-header">
          <span class="kb-col-dot" :style="{ background: cat.color }"></span>
          <span class="kb-col-name">{{ cat.name }}</span>
          <span class="kb-col-count">{{ groupByCategory[cat.id].length }}</span>
        </div>
        <div class="kb-col-body">
          <div
            v-for="todo in groupByCategory[cat.id]"
            :key="todo.id"
            class="kb-card"
            draggable="true"
            @dragstart="onDragStart($event, todo)"
            @dragend="onDragEnd"
          >
            <div class="kb-card-title">{{ todo.title }}</div>
            <div class="kb-card-meta">
              <span :class="['kb-priority', todo.priority]">{{ priorityLabel(todo.priority) }}</span>
              <span v-if="todo.deadline" :class="['kb-deadline', { overdue: isOverdue(todo.deadline) }]">
                {{ formatDeadline(todo.deadline) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { pushToast } from '../composables/useToast'

const props = defineProps({
  todos: { type: Array, default: () => [] },
  categories: { type: Array, default: () => [] }
})
const emit = defineEmits(['edit'])

const loading = ref(true)
const draggedTodo = ref(null)
const dropTargetCat = ref(null)

const groupByCategory = computed(() => {
  const map = { null: [] }
  for (const cat of props.categories) map[cat.id] = []
  for (const t of props.todos) {
    const key = t.category_id || null
    if (!map[key]) map[key] = []
    map[key].push(t)
  }
  return map
})

function isDropTarget(catId) {
  return draggedTodo.value !== null && dropTargetCat.value === catId
}

function onDragStart(e, todo) {
  draggedTodo.value = todo
  e.dataTransfer.effectAllowed = 'move'
  // 轻微延迟让拖动幽灵图生成
  requestAnimationFrame(() => {
    e.target.style.opacity = '0.4'
  })
}
function onDragEnd(e) {
  e.target.style.opacity = '1'
  draggedTodo.value = null
  dropTargetCat.value = null
}
function onDragOver(e, catId) {
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'
  dropTargetCat.value = catId
}
function onDragLeave(e) {
  // 只有真正离开列时才清除
  if (!e.currentTarget.contains(e.relatedTarget)) {
    dropTargetCat.value = null
  }
}
async function onDrop(e, newCatId) {
  e.preventDefault()
  dropTargetCat.value = null
  const todo = draggedTodo.value
  if (!todo) return
  const oldCatId = todo.category_id || ''
  if (oldCatId === (newCatId || '')) return

  try {
    await window.electronAPI.updateTodo(todo.id, { category_id: newCatId || '' })
    pushToast({ message: `已移动到「${categories.find(c => c.id === newCatId)?.name || '未分类'}」`, type: 'success' })
  } catch (err) {
    console.error('[KanbanView] 拖拽更新失败:', err.message)
    pushToast({ message: '移动失败：' + err.message, type: 'error' })
  }
}

function priorityLabel(p) { return { high: '高', medium: '中', low: '低' }[p] || p }
function isOverdue(d) { return !!d && new Date(d) < new Date() }
function pad(n) { return String(n).padStart(2, '0') }
function formatDeadline(iso) {
  try {
    const d = new Date(iso)
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  } catch { return iso }
}

onMounted(async () => {
  loading.value = false
})
</script>

<style scoped>
.kanban { display: flex; flex-direction: column; height: 100%; gap: 0 }
.kb-loading, .kb-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1; gap: 10px; color: var(--text-muted); font-size: 13px }
.kb-empty-icon { font-size: 36px }
.kb-empty-hint { font-size: 12px; color: var(--text-muted); opacity: 0.7 }

.kb-columns { display: flex; gap: 10px; flex: 1; overflow-x: auto; padding-bottom: 8px }
.kb-columns::-webkit-scrollbar { height: 6px }
.kb-columns::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 3px }

.kb-col {
  flex: 1; min-width: 180px; max-width: 260px;
  display: flex; flex-direction: column;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
  transition: border-color 0.2s ease, background 0.2s ease;
}
.kb-col.kb-col-drop {
  border-color: var(--accent-color);
  background: var(--accent-soft);
}

.kb-col-header {
  display: flex; align-items: center; gap: 7px;
  padding: 10px 12px; border-bottom: 1px solid var(--border-color);
  font-size: 12.5px; font-weight: 600; color: var(--text-secondary);
  position: sticky; top: 0; background: var(--bg-secondary); z-index: 1;
}
.kb-col-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0 }
.kb-col-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.kb-col-count {
  font-size: 11px; padding: 1px 7px; border-radius: 10px;
  background: var(--bg-primary); color: var(--text-muted);
}

.kb-col-body { flex: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 6px }
.kb-col-body::-webkit-scrollbar { width: 4px }
.kb-col-body::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 2px }

.kb-card {
  padding: 9px 10px; background: var(--bg-primary);
  border: 1px solid var(--border-color); border-radius: 9px;
  cursor: grab; transition: box-shadow 0.15s ease, transform 0.15s ease;
}
.kb-card:hover { box-shadow: 0 3px 10px var(--shadow-color); transform: translateY(-1px) }
.kb-card:active { cursor: grabbing }
.kb-card-title {
  font-size: 12.5px; color: var(--text-primary); line-height: 1.4;
  overflow: hidden; text-overflow: ellipsis; display: -webkit-box;
  -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  margin-bottom: 6px;
}
.kb-card-meta { display: flex; align-items: center; gap: 5px; flex-wrap: wrap }
.kb-priority {
  font-size: 10px; padding: 1px 6px; border-radius: 6px; font-weight: 600;
}
.kb-priority.high { background: rgba(220,38,38,0.15); color: #dc2626 }
.kb-priority.medium { background: rgba(234,88,12,0.15); color: #ea580c }
.kb-priority.low { background: rgba(22,163,74,0.15); color: #16a34a }
.kb-deadline { font-size: 10.5px; color: var(--text-muted) }
.kb-deadline.overdue { color: #dc2626; font-weight: 600 }
</style>
