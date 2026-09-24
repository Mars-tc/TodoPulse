<template>
  <section class="card section">
    <h3>💾 数据管理</h3>
    <p class="section-desc">备份与迁移你的待办数据；危险操作请谨慎。</p>

    <!-- 常规操作 -->
    <div class="row">
      <div class="row-text">
        <span class="row-title">数据备份与迁移</span>
        <span class="row-sub">导出 JSON 备份或 CSV；导入可合并或覆盖</span>
      </div>
    </div>
    <div class="data-actions">
      <button class="btn ghost sm" @click="importData">📥 导入备份</button>
      <button class="btn ghost sm" @click="exportJson">📤 导出 JSON</button>
      <button class="btn ghost sm" @click="exportCsv">📄 导出 CSV</button>
    </div>

    <div v-if="showImportMode" class="import-mode">
      <span>导入模式：</span>
      <div class="seg">
        <button :class="['seg-item', { active: importMode === 'merge' }]" @click="importMode = 'merge'">合并</button>
        <button :class="['seg-item', { active: importMode === 'replace' }]" @click="importMode = 'replace'">覆盖</button>
      </div>
      <button class="btn primary sm" @click="doImport">开始导入</button>
    </div>

    <!-- 清空回收站 -->
    <div class="row divider">
      <div class="row-text">
        <span class="row-title">清空回收站</span>
        <span class="row-sub">彻底删除回收站中已软删除的待办</span>
      </div>
      <button class="btn danger-ghost sm" @click="clearTrash">清空回收站</button>
    </div>

    <!-- 危险区 -->
    <div class="danger-zone">
      <div class="danger-head">⚠️ 危险操作区</div>
      <p class="danger-tip">清空全部数据将永久删除所有待办（保留分类），<b>不可恢复</b>。建议先导出备份。</p>
      <div class="row">
        <div class="row-text">
          <span class="row-title">清空全部数据</span>
          <span class="row-sub">请输入 <code>DELETE</code> 以确认</span>
        </div>
        <input class="confirm-input" :class="{ invalid: confirmText && confirmText !== 'DELETE' }" v-model="confirmText" placeholder="DELETE" />
      </div>
      <button class="btn danger sm" :disabled="confirmText !== 'DELETE'" @click="clearAll">永久清空全部数据</button>
    </div>
  </section>
</template>

<script setup>
import { ref } from 'vue'
import { pushToast } from '../../composables/useToast'
import { loadTodos } from '../../composables/useTodos'

const emit = defineEmits(['refresh'])

const showImportMode = ref(false)
const importMode = ref('merge')
const confirmText = ref('')

function exportJson() {
  window.electronAPI.exportData('json').then((res) => {
    if (res.canceled) return
    res.success ? pushToast({ message: '备份已导出', type: 'success' }) : pushToast({ message: '导出失败', type: 'error' })
  })
}
function exportCsv() {
  window.electronAPI.exportData('csv').then((res) => {
    if (res.canceled) return
    res.success ? pushToast({ message: 'CSV 已导出', type: 'success' }) : pushToast({ message: '导出失败', type: 'error' })
  })
}
function importData() {
  showImportMode.value = !showImportMode.value
}
async function doImport() {
  const res = await window.electronAPI.importData(importMode.value)
  if (res.canceled) return
  if (res.success) {
    pushToast({ message: `已导入 ${res.imported} 条待办`, type: 'success' })
    showImportMode.value = false
    emit('refresh')
    await loadTodos()
  } else {
    pushToast({ message: '导入失败：' + (res.error || ''), type: 'error' })
  }
}
async function clearTrash() {
  if (!window.confirm('确定清空回收站？此操作不可恢复。')) return
  const res = await window.electronAPI.purgeTrash()
  if (res.success !== false) {
    pushToast({ message: '回收站已清空', type: 'info' })
    emit('refresh')
  }
}
async function clearAll() {
  if (confirmText.value !== 'DELETE') return
  if (!window.confirm('此操作将永久删除全部待办且不可恢复，确定继续？')) return
  const res = await window.electronAPI.clearAllData()
  if (res.success) {
    confirmText.value = ''
    pushToast({ message: '已清空全部数据', type: 'info' })
    emit('refresh')
    await loadTodos()
  } else {
    pushToast({ message: '清空失败：' + (res.error || ''), type: 'error' })
  }
}
</script>

<style scoped>
.data-actions { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap }
.import-mode {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  font-size: calc(12.5px * var(--font-scale));
  color: var(--text-secondary);
}

.danger-zone {
  margin-top: 16px;
  padding: 14px;
  border: 1.5px solid rgba(220, 38, 38, 0.4);
  border-radius: 12px;
  background: rgba(220, 38, 38, 0.06);
}
.danger-head { font-size: calc(13px * var(--font-scale)); font-weight: 700; color: #dc2626; margin-bottom: 6px }
.danger-tip { font-size: calc(12px * var(--font-scale)); color: var(--text-secondary); line-height: 1.7; margin: 0 0 12px }
.danger-tip code { background: var(--bg-secondary); padding: 1px 6px; border-radius: 5px; color: #dc2626; font-weight: 600 }
.confirm-input {
  width: 110px;
  padding: 6px 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: calc(12.5px * var(--font-scale));
  outline: none;
  letter-spacing: 1px;
}
.confirm-input:focus { border-color: var(--accent-color); box-shadow: 0 0 0 3px var(--accent-soft) }
.confirm-input.invalid { border-color: #dc2626 }
</style>
