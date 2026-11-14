<template>
  <aside class="sidebar">
    <div class="quick-group">
      <button
        v-for="q in quickViews"
        :key="q.key"
        :class="['quick-item', { active: view === q.key && !categoryId }]"
        @click="$emit('view', q.key)"
      >
        <span class="dot" :style="{ background: q.color }"></span>
        <span class="name">{{ q.label }}</span>
        <span class="badge">{{ q.count }}</span>
      </button>
    </div>

    <div class="section-title">
      <span>我的分类</span>
      <button class="mini-btn" title="新建分类" @click="startCreate">＋</button>
    </div>

    <div class="cat-list">
      <div v-if="creating" class="cat-item creating">
        <span class="dot" :style="{ background: newColor }"></span>
        <input
          ref="nameInput"
          v-model="newName"
          class="cat-input"
          placeholder="分类名称"
          @keyup.enter="confirmCreate"
          @keyup.esc="creating = false"
        />
        <button class="mini-btn" title="保存" @click="confirmCreate">✓</button>
        <button class="mini-btn" title="取消" @click="creating = false">×</button>
      </div>

      <div
        v-for="c in categories"
        :key="c.id"
        :class="['cat-item', { active: categoryId === c.id }]"
        @click="$emit('select', c.id)"
      >
        <span class="dot" :style="{ background: c.color }"></span>

        <input
          v-if="editingId === c.id"
          v-model="editingName"
          class="cat-input"
          @keyup.enter="confirmRename(c.id)"
          @keyup.esc="editingId = ''"
          @click.stop
        />
        <span v-else class="name">{{ c.name }}</span>

        <span class="badge">{{ c.todo_count }}</span>

        <span class="ops" @click.stop>
          <button class="mini-btn" title="重命名" @click="startRename(c)">✏️</button>
          <button class="mini-btn danger" title="删除" @click="confirmRemove(c)">🗑️</button>
        </span>
      </div>

      <div
        :class="['cat-item', { active: categoryId === 'none' }]"
        @click="$emit('select', 'none')"
      >
        <span class="dot" style="background: #94a3b8"></span>
        <span class="name">未分类</span>
        <span class="badge">{{ uncategorizedCount }}</span>
      </div>
    </div>

    <div class="sidebar-footer">
      <button class="ghost-btn" @click="$emit('manage-planning')">🧭 智能规划</button>
      <button class="ghost-btn" @click="$emit('manage-templates')">🧰 模板库</button>
      <button class="ghost-btn" @click="$emit('manage-scripts')">🧩 网页脚本</button>
      <button class="ghost-btn" @click="$emit('manage-trash')">🗑️ 回收站</button>
      <button class="ghost-btn" @click="$emit('show-stats')">📊 统计</button>
    </div>
  </aside>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { useCategories } from '../composables/useCategories'
import { stats } from '../composables/useTodos'

defineEmits(['select', 'view', 'show-stats', 'manage-trash', 'manage-scripts', 'manage-templates', 'manage-planning'])

const props = defineProps({
  view: { type: String, default: 'all' },
  categoryId: { type: String, default: '' },
  uncategorizedCount: { type: Number, default: 0 }
})

const { categories, addCategory, renameCategory, removeCategory } = useCategories()

const creating = ref(false)
const newName = ref('')
const newColor = ref('#3b82f6')
const editingId = ref('')
const editingName = ref('')
const nameInput = ref(null)

const quickViews = computed(() => [
  { key: 'all', label: '全部待办', color: '#3b82f6', count: stats.value.all },
  { key: 'today', label: '今天到期', color: '#eab308', count: stats.value.today },
  { key: 'overdue', label: '已逾期', color: '#dc2626', count: stats.value.overdue }
])

async function startCreate() {
  creating.value = true
  newName.value = ''
  await nextTick()
  nameInput.value && nameInput.value.focus()
}

async function confirmCreate() {
  const name = newName.value.trim()
  if (!name) { creating.value = false; return }
  await addCategory(name, newColor.value)
  creating.value = false
  newName.value = ''
}

function startRename(c) {
  editingId.value = c.id
  editingName.value = c.name
}

async function confirmRename(id) {
  const name = editingName.value.trim()
  editingId.value = ''
  if (!name) return
  await renameCategory(id, name)
}

async function confirmRemove(c) {
  if (!window.confirm(`删除分类「${c.name}」？该分类下的待办将变为「未分类」。`)) return
  await removeCategory(c.id)
}
</script>

<style scoped>
.sidebar {
  width: 208px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px 12px;
  border-right: 1px solid var(--border-color);
  background: var(--bg-secondary);
  overflow-y: auto;
}
.quick-group { display: flex; flex-direction: column; gap: 2px }
.quick-item,
.cat-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 9px;
  cursor: pointer;
  font-size: calc(13px * var(--font-scale));
  color: var(--text-secondary);
  background: transparent;
  border: none;
  transition: background 0.2s ease, color 0.2s ease, transform 0.15s ease;
  position: relative;
  user-select: none;
}
.quick-item:hover,
.cat-item:hover { background: var(--bg-hover); color: var(--text-primary) }
.quick-item.active,
.cat-item.active {
  background: var(--accent-soft);
  color: var(--accent-color);
  font-weight: 600;
}
.quick-item.active::before,
.cat-item.active::before {
  content: '';
  position: absolute;
  left: -12px;
  top: 8px;
  bottom: 8px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--accent-color);
}

/* 深色模式下降低选中项背景饱和度，避免过亮；提升徽标对比度
   注意：[data-theme] 位于 <html>（组件外部），不能用 :deep() 包裹，
   否则会被编译成 [data-v-x] [data-theme="dark"] .x，永远匹配不到 */
[data-theme="dark"] .quick-item.active,
[data-theme="dark"] .cat-item.active {
  background: rgba(96, 165, 250, 0.12);
  color: #93c5fd;
}
[data-theme="dark"] .quick-item.active .badge,
[data-theme="dark"] .cat-item.active .badge {
  background: rgba(15, 23, 42, 0.7);
  color: #bfdbfe;
  border-color: rgba(96, 165, 250, 0.35);
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: 0 0 0 3px rgba(148, 163, 184, 0.12);
}
.name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.badge {
  font-size: calc(11px * var(--font-scale));
  min-width: 20px;
  text-align: center;
  padding: 1px 6px;
  border-radius: 10px;
  background: var(--bg-primary);
  color: var(--text-muted);
  border: 1px solid var(--border-color);
}
.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: calc(11px * var(--font-scale));
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  padding: 0 4px;
  margin-top: 4px;
}
.cat-list { display: flex; flex-direction: column; gap: 2px }
.cat-input {
  flex: 1;
  min-width: 0;
  padding: 3px 8px;
  border: 1px solid var(--accent-color);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: calc(13px * var(--font-scale));
  outline: none;
}
.mini-btn {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: calc(13px * var(--font-scale));
  padding: 2px 4px;
  border-radius: 5px;
  color: var(--text-muted);
  transition: background 0.15s ease, color 0.15s ease;
}
.mini-btn:hover { background: var(--bg-hover); color: var(--text-primary) }
.mini-btn.danger:hover { background: rgba(220, 38, 38, 0.14); color: #dc2626 }
.ops { display: none; gap: 2px }
.cat-item:hover .ops { display: flex }
.sidebar-footer {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 10px;
  border-top: 1px solid var(--border-color);
}
.ghost-btn {
  padding: 7px 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-primary);
  color: var(--text-secondary);
  font-size: calc(12px * var(--font-scale));
  cursor: pointer;
  text-align: left;
  transition: all 0.2s ease;
}
.ghost-btn:hover {
  border-color: var(--accent-color);
  color: var(--accent-color);
  transform: translateX(2px);
}

/* 深色模式下让底部按钮与侧边栏区分更明显 */
[data-theme="dark"] .ghost-btn {
  background: #27364f;
  border-color: #475569;
  color: #cbd5e1;
}
[data-theme="dark"] .ghost-btn:hover {
  background: #334155;
  border-color: var(--accent-color);
  color: #93c5fd;
}
</style>
