<template>
  <div class="trash-view">
    <header class="trash-head">
      <button class="back-btn" @click="$emit('back')">← 返回列表</button>
      <h2>🗑️ 回收站</h2>
      <span class="count-tag">{{ items.length }} 条</span>
      <div class="spacer"></div>
      <button class="btn ghost" :disabled="!selectedIds.length" @click="restoreSelected">
        ↩️ 恢复已选（{{ selectedIds.length }}）
      </button>
      <button class="btn danger" :disabled="!items.length" @click="confirmPurgeAll">清空回收站</button>
    </header>

    <p class="trash-tip">删除的待办会保留在这里，可随时恢复；清空后将无法找回。</p>

    <div class="trash-list">
      <div v-if="loading" class="loading">加载中…</div>

      <div v-else-if="items.length === 0" class="empty">
        <div class="empty-icon">🧼</div>
        <p>回收站是空的</p>
      </div>

      <div
        v-for="t in items"
        :key="t.id"
        :class="['trash-item', { selected: selectedIds.includes(t.id) }]"
      >
        <input
          type="checkbox"
          class="checkbox"
          :checked="selectedIds.includes(t.id)"
          @change="toggleSelect(t.id)"
        />
        <div class="item-main">
          <div class="item-title">{{ t.title }}</div>
          <div class="item-meta">
            <span v-if="t.deadline">⏰ {{ formatDeadline(t.deadline) }}</span>
            <span class="deleted">删除于 {{ formatDeadline(t.deleted_at) }}</span>
          </div>
        </div>
        <div class="item-actions">
          <button class="act restore" title="恢复" @click="restore([t.id])">↩️ 恢复</button>
          <button class="act remove" title="彻底删除" @click="purge([t.id])">🗑️ 彻底删除</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { pushToast } from '../composables/useToast'

const emit = defineEmits(['back', 'changed'])

const items = ref([])
const selectedIds = ref([])
const loading = ref(true)

async function load() {
  loading.value = true
  try {
    items.value = await window.electronAPI.listTrash()
  } catch (e) {
    console.error('[TrashView] 加载回收站失败:', e.message)
    items.value = []
  } finally {
    loading.value = false
  }
}

onMounted(load)

function toggleSelect(id) {
  const i = selectedIds.value.indexOf(id)
  if (i >= 0) selectedIds.value.splice(i, 1)
  else selectedIds.value.push(id)
}

async function restore(ids) {
  await window.electronAPI.restoreTodos(ids)
  selectedIds.value = selectedIds.value.filter((s) => !ids.includes(s))
  pushToast({ message: `已恢复 ${ids.length} 条待办`, type: 'success' })
  await load()
  emit('changed')
}

async function restoreSelected() {
  if (!selectedIds.value.length) return
  await restore(selectedIds.value.slice())
}

async function purge(ids) {
  if (!window.confirm('彻底删除后无法恢复，确定继续？')) return
  await window.electronAPI.batchDeleteTodos(ids)
  selectedIds.value = selectedIds.value.filter((s) => !ids.includes(s))
  pushToast({ message: `已彻底删除 ${ids.length} 条`, type: 'info' })
  await load()
  emit('changed')
}

async function confirmPurgeAll() {
  if (!items.value.length) return
  if (!window.confirm(`确定清空回收站？共 ${items.value.length} 条待办将被永久删除。`)) return
  await window.electronAPI.purgeTrash()
  selectedIds.value = []
  pushToast({ message: '回收站已清空', type: 'info' })
  await load()
  emit('changed')
}

const pad = (n) => String(n).padStart(2, '0')
function formatDeadline(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch { return iso }
}
</script>

<style scoped>
.trash-view { display: flex; flex-direction: column; gap: 12px; height: 100%; overflow: hidden }
.trash-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap }
.back-btn {
  padding: 6px 14px;
  border: 1px solid var(--border-color);
  border-radius: 9px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: calc(12.5px * var(--font-scale));
  cursor: pointer;
  transition: all 0.18s ease;
}
.back-btn:hover { border-color: var(--accent-color); color: var(--accent-color); transform: translateX(-2px) }
.trash-head h2 { margin: 0; font-size: calc(17px * var(--font-scale)); color: var(--text-primary) }
.count-tag {
  padding: 2px 9px;
  border-radius: 10px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  font-size: calc(11.5px * var(--font-scale));
  color: var(--text-muted);
}
.spacer { flex: 1 }
.btn { padding: 6px 13px; border-radius: 9px; border: 1px solid transparent; font-size: calc(12.5px * var(--font-scale)); cursor: pointer; transition: all 0.18s ease }
.btn.ghost { background: var(--bg-secondary); border-color: var(--border-color); color: var(--text-secondary) }
.btn.ghost:hover:not(:disabled) { border-color: var(--accent-color); color: var(--accent-color) }
.btn.danger { background: linear-gradient(135deg, #ef4444, #dc2626); color: #fff; font-weight: 600 }
.btn.danger:hover:not(:disabled) { filter: brightness(1.07) }
.btn:disabled { opacity: 0.45; cursor: not-allowed }

.trash-tip { font-size: calc(12px * var(--font-scale)); color: var(--text-muted); margin: 0 }

.trash-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding-right: 4px }
.loading, .empty { padding: 40px; text-align: center; color: var(--text-muted); font-size: calc(13px * var(--font-scale)) }
.empty-icon { font-size: calc(42px * var(--font-scale)); margin-bottom: 8px }

.trash-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-secondary);
  filter: saturate(0.55);
  transition: all 0.2s ease;
}
.trash-item:hover { border-color: var(--accent-color); filter: saturate(1) }
.trash-item.selected { border-color: var(--accent-color); background: var(--accent-soft) }
.checkbox { width: 15px; height: 15px; accent-color: var(--accent-color); cursor: pointer; flex-shrink: 0 }
.item-main { flex: 1; min-width: 0 }
.item-title { font-size: calc(14px * var(--font-scale)); color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.item-meta { display: flex; gap: 12px; font-size: calc(11.5px * var(--font-scale)); color: var(--text-muted); margin-top: 3px }
.deleted { color: #dc2626 }
.item-actions { display: flex; gap: 6px; flex-shrink: 0 }
.act {
  padding: 5px 11px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-primary);
  color: var(--text-secondary);
  font-size: calc(12px * var(--font-scale));
  cursor: pointer;
  transition: all 0.18s ease;
}
.act.restore:hover { border-color: #16a34a; color: #16a34a }
.act.remove:hover { border-color: #dc2626; color: #dc2626 }
</style>
