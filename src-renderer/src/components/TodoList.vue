<template>
  <div class="todo-list">
    <TransitionGroup name="item">
      <div
        v-for="todo in todos"
        :key="todo.id"
        :class="['todo-item', {
          completed: todo.completed,
          overdue: isOverdue(todo.deadline) && !todo.completed,
          selected: selectedIds.includes(todo.id)
        }]"
      >
        <span v-if="isOverdue(todo.deadline) && !todo.completed" class="overdue-bar"></span>

        <input
          type="checkbox"
          :checked="selectedIds.includes(todo.id)"
          class="todo-checkbox"
          title="选择"
          @change="$emit('select', todo.id)"
          @click.stop
        />

        <button
          :class="['check-btn', { checked: todo.completed }]"
          :title="todo.completed ? '标记未完成' : '标记完成'"
          @click="$emit('toggle', todo)"
        >
          <svg v-if="todo.completed" viewBox="0 0 24 24" class="tick"><path d="M5 13l4 4L19 7" /></svg>
        </button>

        <!-- 行内悬停操作 -->
        <div class="todo-row-ops">
          <button class="row-op" :title="'编辑'" @click.stop="$emit('edit', todo)">✏️</button>
          <button class="row-op row-op-del" :title="'删除'" @click.stop="$emit('delete', todo.id)">🗑️</button>
          <button
            v-if="!todo.completed"
            class="row-op row-op-quick"
            :title="'快速完成'"
            @click.stop="$emit('toggle', todo)"
          >⚡</button>
        </div>

        <div class="todo-content" @click="$emit('edit', todo)">
          <div class="todo-title-row">
            <span class="todo-title" v-html="highlight(todo.title, keyword)"></span>

            <span v-if="todo.repeat_rule && todo.repeat_rule !== 'null'" class="repeat-tag" title="重复任务">🔁</span>

            <span :class="['priority-tag', todo.priority]">{{ priorityLabel(todo.priority) }}</span>

            <span
              v-if="categoryOf(todo)"
              class="category-tag"
              :style="{ color: categoryOf(todo).color, background: hexToSoft(categoryOf(todo).color) }"
            >
              {{ categoryOf(todo).name }}
            </span>
          </div>

          <div v-if="todo.description" class="todo-desc" v-html="highlight(todo.description, keyword)"></div>

          <div class="todo-meta">
            <span v-if="todo.deadline" :class="['deadline-badge', { overdue: isOverdue(todo.deadline) && !todo.completed }]">
              ⏰ {{ formatDeadline(todo.deadline) }}
            </span>
            <span v-else class="no-deadline">⏳ 无截止时间</span>

            <span v-if="todo.remind_at" class="remind-badge" title="已设置提醒">🔔 {{ formatShort(todo.remind_at) }}</span>

            <a
              v-if="todo.source_url"
              class="source-link"
              :title="todo.source_url"
              @click.stop.prevent="openSourceUrl(todo.source_url)"
            >
              🔗 {{ truncate(todo.source_page_title || todo.source_url, 28) }}
            </a>

            <span v-if="todo.subtask_total" class="subtask-badge" :title="`子任务 ${todo.subtask_done}/${todo.subtask_total}`">
              <span class="mini-progress">
                <span class="mini-progress-inner" :style="{ width: subtaskPercent(todo) + '%' }"></span>
              </span>
              ☑️ {{ todo.subtask_done }}/{{ todo.subtask_total }}
            </span>
          </div>

          <div v-if="todo.source_selected_text" class="selected-text-preview">
            “<span v-html="highlight(todo.source_selected_text.slice(0, 90), keyword)"></span><span v-if="todo.source_selected_text.length > 90">…</span>”
          </div>

          <div class="create-time">创建于 {{ formatTime(todo.create_at) }}</div>
        </div>

        <div class="todo-actions">
          <button class="action-btn remind-btn" title="设置提醒" @click="$emit('remind', todo)">🔔</button>
          <button class="action-btn edit-btn" title="编辑" @click="$emit('edit', todo)">✏️</button>
          <button class="action-btn delete-btn" title="删除" @click="$emit('delete', todo.id)">🗑️</button>
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup>
import { highlightHtml, truncate } from '../utils/highlight'
import { useCategories } from '../composables/useCategories'

const props = defineProps({
  todos: { type: Array, default: () => [] },
  selectedIds: { type: Array, default: () => [] },
  keyword: { type: String, default: '' }
})
defineEmits(['toggle', 'delete', 'edit', 'select', 'remind'])

const { categoryMap } = useCategories()

function categoryOf(todo) {
  return todo.category_id ? categoryMap.value[todo.category_id] || null : null
}
function hexToSoft(hex) {
  if (!hex || !hex.startsWith('#')) return 'var(--bg-hover)'
  return hex + '22'
}
function highlight(text, kw) { return highlightHtml(text, kw) }
function priorityLabel(p) { return { high: '高', medium: '中', low: '低' }[p] || p }
function isOverdue(d) { return !!d && new Date(d) < new Date() }
function subtaskPercent(t) {
  if (!t.subtask_total) return 0
  return Math.round((t.subtask_done / t.subtask_total) * 100)
}
function pad(n) { return String(n).padStart(2, '0') }
function formatTime(s) {
  try {
    const d = new Date(s)
    if (isNaN(d.getTime())) return s
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch { return s }
}
function formatShort(s) {
  try {
    const d = new Date(s)
    if (isNaN(d.getTime())) return s
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch { return s }
}
function formatDeadline(iso) {
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch { return iso }
}
function openSourceUrl(url) {
  if (window.electronAPI && window.electronAPI.openUrl) window.electronAPI.openUrl(url)
  else window.open(url, '_blank')
}
</script>

<style scoped>
.todo-list { display: flex; flex-direction: column; gap: 10px }
.todo-item {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 14px 16px;
  background: var(--bg-secondary);
  border-radius: 14px;
  border: 1px solid var(--border-color);
  overflow: hidden;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.18s ease, opacity 0.2s ease;
}
.todo-item:hover {
  border-color: var(--accent-color);
  box-shadow: 0 4px 14px var(--shadow-color);
  transform: translateY(-1px);
}
.todo-item.selected { border-color: var(--accent-color); background: var(--accent-soft) }
.todo-item.completed { opacity: 0.58 }
.todo-item.overdue { border-left: 3px solid #dc2626 }
.overdue-bar { display: none }

.todo-checkbox { width: 16px; height: 16px; margin-top: 4px; cursor: pointer; flex-shrink: 0; accent-color: var(--accent-color) }

.check-btn {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid var(--border-color);
  background: transparent;
  cursor: pointer;
  flex-shrink: 0;
  margin-top: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.check-btn:hover { border-color: var(--accent-color); transform: scale(1.12) }
.check-btn.checked {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  border-color: transparent;
}
.tick { width: 13px; height: 13px; fill: none; stroke: #fff; stroke-width: 3.2; stroke-linecap: round; stroke-linejoin: round }

.todo-content { flex: 1; min-width: 0; cursor: pointer }
.todo-title-row { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin-bottom: 4px }
.todo-title { font-size: calc(15px * var(--font-scale)); font-weight: 500; color: var(--text-primary); word-break: break-word }
.todo-item.completed .todo-title { text-decoration: line-through; color: var(--text-secondary) }
.todo-desc {
  font-size: calc(13px * var(--font-scale));
  color: var(--text-secondary);
  margin-bottom: 4px;
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.priority-tag { font-size: calc(11px * var(--font-scale)); padding: 2px 8px; border-radius: 10px; font-weight: 600; flex-shrink: 0 }
.priority-tag.high { background: rgba(220, 38, 38, 0.15); color: #dc2626 }
.priority-tag.medium { background: rgba(234, 88, 12, 0.15); color: #ea580c }
.priority-tag.low { background: rgba(22, 163, 74, 0.15); color: #16a34a }

.category-tag { font-size: calc(11px * var(--font-scale)); padding: 2px 8px; border-radius: 10px; font-weight: 600; flex-shrink: 0 }
.repeat-tag { font-size: calc(12px * var(--font-scale)) }

.todo-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 3px }
.deadline-badge, .remind-badge, .subtask-badge {
  font-size: calc(12px * var(--font-scale));
  padding: 2px 8px;
  border-radius: 5px;
  background: var(--bg-primary);
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.deadline-badge.overdue { color: #dc2626; background: rgba(220, 38, 38, 0.1); font-weight: 600 }
.no-deadline { font-size: calc(12px * var(--font-scale)); color: var(--text-muted) }
.mini-progress {
  display: inline-block;
  width: 34px;
  height: 4px;
  border-radius: 2px;
  background: var(--border-color);
  overflow: hidden;
}
.mini-progress-inner {
  display: block;
  height: 100%;
  border-radius: 2px;
  background: linear-gradient(90deg, #60a5fa, #3b82f6);
  transition: width 0.3s ease;
}
.source-link {
  font-size: calc(12px * var(--font-scale));
  color: var(--accent-color);
  text-decoration: none;
  cursor: pointer;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: inline-block;
}
.source-link:hover { text-decoration: underline }
.selected-text-preview {
  font-size: calc(12px * var(--font-scale));
  color: var(--text-muted);
  font-style: italic;
  margin-top: 4px;
  word-break: break-all;
  padding-left: 8px;
  border-left: 2px solid var(--border-color);
}
.create-time { font-size: calc(11px * var(--font-scale)); color: var(--text-muted); margin-top: 5px }

/* 行内悬停操作（右侧快速操作） */
.todo-row-ops {
  display: flex; gap: 2px; flex-shrink: 0; opacity: 0;
  transition: opacity 0.2s ease;
}
.todo-item:hover .todo-row-ops { opacity: 1 }
.row-op {
  width: 26px; height: 26px; border: none; border-radius: 6px;
  background: transparent; cursor: pointer; font-size: 12px;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s ease, transform 0.15s ease;
}
.row-op:hover { transform: scale(1.15) }
.row-op-del:hover { background: rgba(239, 68, 68, 0.15) }
.row-op-quick:hover { background: rgba(22, 163, 74, 0.15) }

.todo-actions { display: flex; gap: 2px; flex-shrink: 0; opacity: 0; transition: opacity 0.2s ease }
.todo-item:hover .todo-actions { opacity: 1 }
.action-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 7px;
  background: transparent;
  cursor: pointer;
  font-size: calc(13px * var(--font-scale));
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s ease, transform 0.15s ease;
}
.action-btn:hover { transform: scale(1.1) }
.edit-btn:hover { background: rgba(59, 130, 246, 0.15) }
.delete-btn:hover { background: rgba(239, 68, 68, 0.15) }
.remind-btn:hover { background: rgba(234, 179, 8, 0.18) }

:deep(mark.hl) {
  background: linear-gradient(180deg, transparent 55%, rgba(234, 179, 8, 0.55) 55%);
  color: inherit;
  padding: 0 1px;
  border-radius: 2px;
}

.item-enter-active { transition: all 0.28s cubic-bezier(0.22, 1, 0.36, 1) }
.item-leave-active { transition: all 0.2s ease; position: absolute; width: 100% }
.item-enter-from { opacity: 0; transform: translateY(-8px) }
.item-leave-to { opacity: 0; transform: translateX(20px) }
.item-move { transition: transform 0.25s ease }
</style>
