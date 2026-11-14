<template>
  <div class="tpl-manager">
    <header class="manager-head">
      <button class="back-btn" @click="$emit('back')">← 返回列表</button>
      <h2>🧰 模板库</h2>
      <span class="head-desc">把每天重复做的事沉淀为模板，一键展开成待办</span>
      <div class="spacer"></div>
      <input class="field-input search-input" v-model="keyword" placeholder="搜索模板" />
      <button class="btn primary" @click="createNew">＋ 新建模板</button>
    </header>

    <div class="manager-body">
      <aside class="tpl-list">
        <div class="list-title">全部模板（{{ filtered.length }}）</div>

        <div v-if="filtered.length" class="list-items">
          <div
            v-for="t in filtered"
            :key="t.id"
            class="tpl-item"
            :class="{ active: selectedId === t.id, off: !t.enabled }"
            @click="select(t)"
          >
            <span class="color-bar" :style="{ background: t.color }"></span>
            <span class="tpl-icon">{{ t.icon }}</span>
            <div class="item-main">
              <span class="item-name">{{ t.name || '未命名模板' }}</span>
              <span class="item-meta">
                <span class="builtin-tag" v-if="t.builtin">内置</span>
                <span>{{ (t.items || []).length }} 项</span>
                <span>· {{ t.expand_mode === 'preset' ? '清单预设' : '单条待办' }}</span>
              </span>
            </div>
            <div class="item-ops" @click.stop>
              <button class="mini-btn" title="复制" @click="duplicate(t.id)">⧉</button>
              <button class="mini-btn danger" title="删除" @click="remove(t.id)">🗑</button>
            </div>
          </div>
        </div>

        <div v-else class="empty-list">
          <div class="empty-icon">🧰</div>
          <p class="empty-title">还没有模板</p>
          <p class="empty-desc">新建模板，让例行工作一键生成待办</p>
        </div>
      </aside>

      <div class="editor-pane">
        <TemplateEditor
          v-if="editing"
          :key="editorKey"
          :template="editing"
          :categories="categories"
          @save="handleSave"
          @cancel="cancelEdit"
        />

        <div v-else class="empty-editor">
          <div class="empty-icon">📝</div>
          <p class="empty-title">未选择模板</p>
          <p class="empty-desc">从左侧选择一个模板进行编辑，或新建一条</p>
          <button class="btn primary" @click="createNew">＋ 新建模板</button>
        </div>

        <div v-if="editing && editing.id" class="action-bar">
          <div class="action-left">
            <label class="switch-line">
              <input type="checkbox" :checked="!!editing.enabled" @change="toggleEnabled(editing.id, $event.target.checked)" />
              <span>{{ editing.enabled ? '已启用' : '已停用' }}</span>
            </label>
            <span class="meta-text">创建于 {{ formatTime(editing.create_at) }}</span>
          </div>
          <div class="action-right">
            <button class="btn ghost sm" @click="duplicate(editing.id)">⧉ 复制模板</button>
            <button class="btn danger-ghost sm" :disabled="!!editing.builtin" @click="remove(editing.id)">删除</button>
            <button class="btn primary sm" :disabled="!editing.enabled" @click="generate(editing.id)">⚡ 一键生成</button>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import TemplateEditor from './TemplateEditor.vue'
import {
  templates,
  loadTemplates,
  saveTemplate,
  deleteTemplate,
  duplicateTemplate,
  applyTemplate
} from '../composables/useTemplates'
import { useCategories } from '../composables/useCategories'
import { pushToast } from '../composables/useToast'

const { categories, loadCategories } = useCategories()

defineEmits(['back'])

const keyword = ref('')
const selectedId = ref('')
const editorKey = ref(0)
// 新建中的临时模板（未落库），保存后会被真实 id 取代
const draftNew = ref(null)

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return templates.value
  return templates.value.filter(
    (t) =>
      String(t.name || '').toLowerCase().includes(kw) ||
      String(t.description || '').toLowerCase().includes(kw)
  )
})

const editing = computed(() => {
  if (draftNew.value) return draftNew.value
  return templates.value.find((t) => t.id === selectedId.value) || null
})

onMounted(async () => {
  if (!templates.value.length) await loadTemplates()
  if (!categories.value.length) await loadCategories()
})

function select(t) {
  draftNew.value = null
  selectedId.value = t.id
  editorKey.value++
}

function createNew() {
  draftNew.value = {
    id: '',
    name: '',
    description: '',
    icon: '📋',
    color: '#3b82f6',
    category_id: '',
    priority: 'medium',
    remind_lead: null,
    repeat_rule: null,
    energy_level: 'medium',
    quadrant: '',
    deadline_offset_days: 0,
    expand_mode: 'single',
    enabled: 1,
    builtin: 0,
    items: []
  }
  selectedId.value = ''
  editorKey.value++
}

function cancelEdit() {
  draftNew.value = null
  selectedId.value = ''
}

async function handleSave(payload) {
  if (!payload.name) {
    pushToast({ message: '请填写模板名称', type: 'error' })
    return
  }
  const saved = await saveTemplate(payload)
  if (saved && saved.error) {
    pushToast({ message: saved.error, type: 'error' })
    return
  }
  draftNew.value = null
  if (saved && saved.id) {
    selectedId.value = saved.id
    editorKey.value++
  }
  pushToast({ message: '模板已保存', type: 'success' })
}

async function duplicate(id) {
  const created = await duplicateTemplate(id)
  if (created && created.id) {
    selectedId.value = created.id
    editorKey.value++
  }
  pushToast({ message: '已复制为自定义模板', type: 'success' })
}

async function remove(id) {
  if (!id) {
    cancelEdit()
    return
  }
  const target = templates.value.find((t) => t.id === id)
  if (target && target.builtin) {
    pushToast({ message: '内置模板不可删除，可复制为自定义模板', type: 'info' })
    return
  }
  if (!window.confirm(`确定删除模板「${target ? target.name : ''}」？`)) return
  const res = await deleteTemplate(id)
  if (res && res.success) {
    if (selectedId.value === id) cancelEdit()
    pushToast({ message: '模板已删除', type: 'info' })
  } else if (res && res.error) {
    pushToast({ message: res.error, type: 'error' })
  }
}

async function toggleEnabled(id, enabled) {
  await saveTemplate({ id, enabled: enabled ? 1 : 0 })
  pushToast({ message: enabled ? '模板已启用' : '模板已停用', type: 'info' })
}

async function generate(id) {
  const res = await applyTemplate(id)
  if (!res || !res.success) {
    pushToast({ message: (res && res.error) || '生成失败', type: 'error' })
    return
  }
  const count = (res.created || []).length
  pushToast({ message: `已生成 ${count} 条待办`, type: 'success' })
}

function formatTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

</script>

<style scoped>
.tpl-manager { display: flex; flex-direction: column; height: 100%; overflow: hidden }
.manager-head { display: flex; align-items: center; gap: 14px; flex-shrink: 0 }
.back-btn { padding: 6px 14px; border: 1px solid var(--border-color); border-radius: 9px; background: var(--bg-secondary); color: var(--text-secondary); font-size: calc(12.5px * var(--font-scale)); cursor: pointer; transition: all 0.18s ease }
.back-btn:hover { border-color: var(--accent-color); color: var(--accent-color); transform: translateX(-2px) }
.manager-head h2 { margin: 0; font-size: calc(17px * var(--font-scale)); color: var(--text-primary); white-space: nowrap }
.head-desc { font-size: calc(11.5px * var(--font-scale)); color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.spacer { flex: 1 }
.search-input { width: 180px; flex-shrink: 0 }
.manager-body { flex: 1; display: flex; gap: 16px; overflow: hidden; padding-top: 14px }
.tpl-list { width: 250px; flex-shrink: 0; display: flex; flex-direction: column; gap: 6px; padding: 10px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 14px; overflow-y: auto }
.list-title { font-size: calc(11px * var(--font-scale)); font-weight: 700; letter-spacing: 0.06em; color: var(--text-muted); padding: 2px 4px 4px }
.list-items { display: flex; flex-direction: column; gap: 4px }
.tpl-item { display: flex; align-items: center; gap: 8px; padding: 9px 10px; border-radius: 10px; border: 1px solid transparent; cursor: pointer; position: relative; transition: all 0.18s ease }
.tpl-item:hover { background: var(--bg-hover) }
.tpl-item.active { background: var(--accent-soft); border-color: var(--accent-color) }
.tpl-item.off { opacity: 0.55 }
.color-bar { width: 3px; height: 22px; border-radius: 2px; flex-shrink: 0 }
.tpl-icon { font-size: calc(15px * var(--font-scale)); flex-shrink: 0 }
.item-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px }
.item-name { font-size: calc(13px * var(--font-scale)); font-weight: 600; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.item-meta { display: flex; align-items: center; gap: 5px; font-size: calc(11px * var(--font-scale)); color: var(--text-muted) }
.builtin-tag { padding: 0 5px; border-radius: 4px; font-size: calc(10px * var(--font-scale)); font-weight: 600; line-height: 15px; background: rgba(124, 58, 237, 0.14); color: #7c3aed }
.item-ops { display: none; gap: 2px; flex-shrink: 0 }
.tpl-item:hover .item-ops { display: flex }
.mini-btn { border: none; background: transparent; cursor: pointer; font-size: calc(12px * var(--font-scale)); padding: 3px 5px; border-radius: 5px; color: var(--text-muted); transition: all 0.15s ease }
.mini-btn:hover { background: var(--bg-primary); color: var(--text-primary) }
.mini-btn.danger:hover { background: rgba(220, 38, 38, 0.14); color: #dc2626 }
.editor-pane { flex: 1; overflow-y: auto; padding: 2px 8px 20px 2px; min-width: 0; display: flex; flex-direction: column }
.empty-list, .empty-editor { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; padding: 40px 20px; text-align: center }
.empty-icon { font-size: calc(40px * var(--font-scale)); margin-bottom: 4px; animation: float 2.6s ease-in-out infinite }
@keyframes float { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-6px) } }
.empty-title { font-size: calc(14px * var(--font-scale)); font-weight: 600; color: var(--text-primary); margin: 0 }
.empty-desc { font-size: calc(12px * var(--font-scale)); color: var(--text-muted); margin: 0 0 10px }
.empty-editor { flex: 1; border: 1px dashed var(--border-color); border-radius: 14px }
.action-bar { position: sticky; bottom: 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; margin-top: 12px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 12px; box-shadow: 0 -2px 12px rgba(15, 23, 42, 0.05); flex-wrap: wrap }
.action-left { display: flex; align-items: center; gap: 12px }
.action-right { display: flex; align-items: center; gap: 8px }
.switch-line { display: flex; align-items: center; gap: 6px; font-size: calc(12px * var(--font-scale)); color: var(--text-secondary); cursor: pointer }
.switch-line input { cursor: pointer; accent-color: var(--accent-color) }
.meta-text { font-size: calc(11px * var(--font-scale)); color: var(--text-muted) }
@media (max-width: 860px) { .manager-body { flex-direction: column } .tpl-list { width: 100%; max-height: 200px } .search-input { width: 120px } .head-desc { display: none } }

</style>
