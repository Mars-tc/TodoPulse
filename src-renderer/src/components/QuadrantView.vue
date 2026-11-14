<template>
  <div class="quadrant-view">
    <div class="quad-grid">
      <section
        v-for="q in QUADRANT_META"
        :key="q.key"
        class="quad-card"
        :class="{ 'drop-target': dropTarget === q.key }"
        :style="{ '--quad-color': q.color }"
        @dragover="onDragOver($event, q.key)"
        @dragleave="onDragLeave($event, q.key)"
        @drop="onDrop($event, q.key)"
      >
        <header class="quad-head">
          <div class="quad-title-wrap">
            <span class="quad-key">{{ q.key }}</span>
            <div class="quad-titles">
              <span class="quad-name">{{ q.name }}</span>
              <span class="quad-desc">{{ q.desc }}</span>
            </div>
          </div>
          <div class="quad-head-right">
            <span class="quad-count">{{ (quadrants[q.key] || []).length }}</span>
            <button class="mini-btn" title="采纳自动建议" :disabled="!suggestIds.length" @click="adoptSuggest()">✨</button>
          </div>
        </header>

        <div class="quad-body">
          <div
            v-for="t in quadrants[q.key] || []"
            :key="t.id"
            class="quad-item"
            :class="{ dragging: dragging && dragging.id === t.id }"
            draggable="true"
            @dragstart="onDragStart($event, t)"
            @dragend="onDragEnd"
          >
            <input type="checkbox" class="todo-check" :checked="!!t.completed" @change="toggle(t)" />
            <div class="item-main">
              <span class="item-title">{{ t.title }}</span>
              <div class="item-meta">
                <span v-if="t.category_name" class="cat-tag">{{ t.category_name }}</span>
                <span v-if="t.subtask_total" class="sub-tag">{{ t.subtask_done }}/{{ t.subtask_total }}</span>
                <span class="energy-tag" :class="t.energy_level || 'medium'">
                  {{ ENERGY_META[t.energy_level || 'medium'].label }}精力
                </span>
                <span v-if="t.deadline" class="due-tag" :class="{ overdue: isOverdue(t) }">{{ formatDue(t.deadline) }}</span>
              </div>
            </div>
          </div>

          <div v-if="!(quadrants[q.key] || []).length" class="quad-empty">拖拽待办到此处</div>
        </div>
      </section>
    </div>

    <section
      class="unclassified"
      :class="{ 'drop-target': dropTarget === '' }"
      @dragover="onDragOver($event, '')"
      @dragleave="onDragLeave($event, '')"
      @drop="onDrop($event, '')"
    >
      <header class="quad-head">
        <div class="quad-title-wrap">
          <span class="quad-key">未</span>
          <div class="quad-titles">
            <span class="quad-name">未归类</span>
            <span class="quad-desc">尚未指定象限，可拖拽归位或采纳自动建议</span>
          </div>
        </div>
        <div class="quad-head-right">
          <span class="quad-count">{{ (quadrants.unclassified || []).length }}</span>
          <button class="mini-btn" title="采纳自动建议" :disabled="!suggestIds.length" @click="adoptSuggest()">✨</button>
        </div>
      </header>
      <div class="quad-body unclassified-body">
        <div
          v-for="t in quadrants.unclassified || []"
          :key="t.id"
          class="quad-item"
          :class="{ dragging: dragging && dragging.id === t.id }"
          draggable="true"
          @dragstart="onDragStart($event, t)"
          @dragend="onDragEnd"
        >
          <input type="checkbox" class="todo-check" :checked="!!t.completed" @change="toggle(t)" />
          <div class="item-main">
            <span class="item-title">{{ t.title }}</span>
            <div class="item-meta">
              <span v-if="t.category_name" class="cat-tag">{{ t.category_name }}</span>
              <span class="energy-tag" :class="t.energy_level || 'medium'">
                {{ ENERGY_META[t.energy_level || 'medium'].label }}精力
              </span>
              <span class="suggest-tag" :class="suggestOf(t) ? 'on' : ''">
                建议 {{ suggestOf(t) }}
              </span>
            </div>
          </div>
        </div>
        <div v-if="!(quadrants.unclassified || []).length" class="quad-empty">全部待办都已归入象限</div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import {
  quadrants,
  QUADRANT_META,
  ENERGY_META,
  applySuggestedQuadrant
} from '../composables/usePlanning'
import { pushToast } from '../composables/useToast'

const emit = defineEmits(['refresh'])

const dragging = ref(null)
const dropTarget = ref('')

const suggestIds = computed(() =>
  (quadrants.value.unclassified || []).map((t) => t.id)
)

// 建议象限由主进程算法给出（随 plan-preview 一并返回），渲染层不自行推导
function suggestOf(todo) {
  return todo.suggested_quadrant || ''
}

function onDragStart(e, todo) {
  dragging.value = todo
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', todo.id)
}

function onDragEnd() {
  dragging.value = null
  dropTarget.value = ''
}

function onDragOver(e, key) {
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'
  dropTarget.value = key
}

function onDragLeave(e, key) {
  // 只有真正离开该容器才取消高亮（子元素间的移动不应触发）
  if (e.currentTarget.contains(e.relatedTarget)) return
  if (dropTarget.value === key) dropTarget.value = ''
}

async function onDrop(e, key) {
  e.preventDefault()
  const todo = dragging.value
  dropTarget.value = ''
  dragging.value = ''
  if (!todo) return
  try {
    await window.electronAPI.updateTodo(todo.id, { quadrant: key })
    pushToast({ message: `已归入「${nameOf(key)}」`, type: 'success' })
    emit('refresh')
  } catch (err) {
    pushToast({ message: '移动失败', type: 'error' })
  }
}

function nameOf(key) {
  if (!key) return '未归类'
  const meta = QUADRANT_META.find((q) => q.key === key)
  return meta ? meta.name : key
}

async function toggle(todo) {
  await window.electronAPI.updateTodo(todo.id, { completed: todo.completed ? 0 : 1 })
  emit('refresh')
}

async function adoptSuggest() {
  const ids = suggestIds.value
  if (!ids.length) return
  const res = await applySuggestedQuadrant(ids)
  if (res && res.changed > 0) {
    pushToast({ message: `已采纳 ${res.changed} 条象限建议`, type: 'success' })
    emit('refresh')
  }
}

function isOverdue(todo) {
  if (!todo.deadline) return false
  return new Date(todo.deadline).getTime() < Date.now()
}

function formatDue(iso) {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return `${d.getMonth() + 1}/${d.getDate()}`
}
</script>

<style scoped>
.quadrant-view { display: flex; flex-direction: column; gap: 12px; height: 100%; overflow-y: auto }
.quad-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px }
.quad-card, .unclassified { --quad-color: #94a3b8; display: flex; flex-direction: column; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 14px; overflow: hidden; transition: all 0.18s ease }
.quad-card.drop-target, .unclassified.drop-target { border-color: var(--quad-color); box-shadow: 0 0 0 3px var(--accent-soft); transform: scale(1.01) }
.quad-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 13px; border-bottom: 1px solid var(--border-color); border-left: 3px solid var(--quad-color) }
.quad-title-wrap { display: flex; align-items: center; gap: 9px; min-width: 0 }
.quad-key { font-size: calc(11px * var(--font-scale)); font-weight: 700; color: #fff; background: var(--quad-color); border-radius: 6px; padding: 2px 6px; letter-spacing: 0.04em }
.quad-titles { display: flex; flex-direction: column; min-width: 0 }
.quad-name { font-size: calc(13px * var(--font-scale)); font-weight: 700; color: var(--text-primary) }
.quad-desc { font-size: calc(11px * var(--font-scale)); color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.quad-head-right { display: flex; align-items: center; gap: 6px; flex-shrink: 0 }
.quad-count { font-size: calc(11.5px * var(--font-scale)); font-weight: 700; color: var(--text-secondary); background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 12px; padding: 1px 9px }
.quad-body { display: flex; flex-direction: column; gap: 6px; padding: 9px; min-height: 90px }
.unclassified-body { flex-direction: row; flex-wrap: wrap; gap: 8px }
.unclassified-body .quad-item { width: calc(50% - 4px) }
.quad-item { display: flex; align-items: flex-start; gap: 8px; padding: 8px 10px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 10px; cursor: grab; transition: all 0.16s ease }
.quad-item:hover { border-color: var(--quad-color); box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06); transform: translateY(-1px) }
.quad-item.dragging { opacity: 0.42; transform: scale(0.98) }
.todo-check { margin-top: 3px; cursor: pointer; accent-color: var(--quad-color) }
.item-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px }
.item-title { font-size: calc(12.5px * var(--font-scale)); color: var(--text-primary); line-height: 1.5; word-break: break-word }
.item-meta { display: flex; align-items: center; gap: 5px; flex-wrap: wrap }
.cat-tag, .sub-tag, .energy-tag, .due-tag, .suggest-tag { font-size: calc(10px * var(--font-scale)); border-radius: 5px; padding: 1px 6px; line-height: 15px; white-space: nowrap }
.cat-tag { background: var(--accent-soft); color: var(--accent-hover) }
.sub-tag { background: rgba(22, 163, 74, 0.14); color: #15803d }
.energy-tag.high { background: rgba(220, 38, 38, 0.14); color: #dc2626 }
.energy-tag.medium { background: rgba(234, 179, 8, 0.16); color: #b45309 }
.energy-tag.low { background: rgba(22, 163, 74, 0.14); color: #15803d }
.due-tag { background: var(--bg-hover); color: var(--text-muted) }
.due-tag.overdue { background: rgba(220, 38, 38, 0.14); color: #dc2626 }
.suggest-tag { background: var(--bg-hover); color: var(--text-muted) }
.suggest-tag.on { background: rgba(139, 92, 246, 0.14); color: #7c3aed; font-weight: 700 }
.quad-empty { font-size: calc(11.5px * var(--font-scale)); color: var(--text-muted); text-align: center; padding: 18px 8px; border: 1px dashed var(--border-color); border-radius: 10px }
.mini-btn { border: none; background: transparent; cursor: pointer; font-size: calc(12px * var(--font-scale)); padding: 3px 6px; border-radius: 6px; color: var(--text-muted); transition: all 0.15s ease }
.mini-btn:hover:not(:disabled) { background: var(--bg-primary); color: var(--accent-color) }
.mini-btn:disabled { opacity: 0.35; cursor: not-allowed }
@media (max-width: 1100px) { .quad-grid { grid-template-columns: 1fr } .unclassified-body .quad-item { width: 100% } }
</style>
