<template>
  <div class="script-manager">
    <header class="manager-head">
      <button class="back-btn" @click="$emit('back')">← 返回列表</button>
      <h2>🧩 网页脚本</h2>
      <div class="spacer"></div>
      <button class="btn primary" @click="createNew">＋ 新建脚本</button>
    </header>

    <div class="manager-body">
      <!-- 左侧脚本列表 -->
      <aside class="script-list">
        <div class="list-title">全部脚本（{{ scripts.length }}）</div>

        <div v-if="scripts.length" class="list-items">
          <div
            v-for="s in scripts"
            :key="s.id"
            :class="['script-item', { active: selectedId === s.id, off: !s.enabled }]"
            @click="select(s)"
          >
            <span :class="['status-dot', s.enabled ? 'on' : 'off']"></span>
            <div class="item-main">
              <span class="item-name">{{ s.name }}</span>
              <span class="item-meta">
                <span :class="['mode-tag', s.mode]">{{ s.mode === 'js' ? 'JS' : '选择器' }}</span>
                {{ s.patterns.length }} 条规则 · {{ s.action === 'submit' ? '一键入库' : '预填' }}
              </span>
            </div>
            <div class="item-ops" @click.stop>
              <button class="mini-btn" title="复制" @click="duplicate(s.id)">⧉</button>
              <button class="mini-btn danger" title="删除" @click="remove(s.id)">🗑</button>
            </div>
          </div>
        </div>

        <div v-else class="empty-list">
          <div class="empty-icon">🧩</div>
          <p class="empty-title">还没有脚本</p>
          <p class="empty-desc">新建脚本，让扩展自动抓取网页内容</p>
        </div>
      </aside>

      <!-- 右侧编辑区 -->
      <div class="editor-pane">
        <ScriptEditor
          v-if="editing"
          :key="editorKey"
          :script="editing"
          @save="handleSave"
          @cancel="cancelEdit"
          @delete="remove(editing.id)"
        />

        <div v-else class="empty-editor">
          <div class="empty-icon">📝</div>
          <p class="empty-title">未选择脚本</p>
          <p class="empty-desc">从左侧选择一个脚本进行编辑，或新建一条</p>
          <button class="btn primary" @click="createNew">＋ 新建脚本</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import ScriptEditor from './ScriptEditor.vue'
import {
  scripts, loadScripts, upsertScript, duplicateScript, removeScript, createScript
} from '../composables/useScripts'
import { pushToast } from '../composables/useToast'

defineEmits(['back'])

const selectedId = ref('')
const editorKey = ref(0)
// 新建中的临时脚本（未落盘），保存后会被真实 id 取代
const draftNew = ref(null)

const editing = computed(() => {
  if (draftNew.value) return draftNew.value
  return scripts.value.find((s) => s.id === selectedId.value) || null
})

onMounted(async () => {
  if (!scripts.value.length) await loadScripts()
})

function select(s) {
  draftNew.value = null
  selectedId.value = s.id
  editorKey.value++
}

function createNew() {
  draftNew.value = createScript()
  selectedId.value = ''
  editorKey.value++
}

function cancelEdit() {
  draftNew.value = null
  selectedId.value = ''
}

async function handleSave(payload) {
  // 按 id 定位而非按名称：名称可重复（如「xx 副本」），按名称找会选中错的那条
  const beforeIds = new Set(scripts.value.map((s) => s.id))
  const saved = await upsertScript(payload)
  const added = saved.find((s) => !beforeIds.has(s.id))
  const target = added || saved.find((s) => s.id === payload.id) || saved[saved.length - 1]
  draftNew.value = null
  if (target) {
    selectedId.value = target.id
    editorKey.value++
  }
  pushToast({ message: '脚本已保存，扩展将在下次打开面板时生效', type: 'success' })
}

async function duplicate(id) {
  await duplicateScript(id)
  pushToast({ message: '已复制脚本', type: 'success' })
}

async function remove(id) {
  if (!id) {
    draftNew.value = null
    selectedId.value = ''
    return
  }
  const target = scripts.value.find((s) => s.id === id)
  if (!window.confirm(`确定删除脚本「${target ? target.name : ''}」？`)) return
  await removeScript(id)
  if (selectedId.value === id) {
    selectedId.value = ''
    draftNew.value = null
  }
  pushToast({ message: '脚本已删除', type: 'info' })
}
</script>

<style scoped>
.script-manager { display: flex; flex-direction: column; height: 100%; overflow: hidden }
.manager-head { display: flex; align-items: center; gap: 14px; flex-shrink: 0 }
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
.manager-head h2 { margin: 0; font-size: calc(17px * var(--font-scale)); color: var(--text-primary) }
.spacer { flex: 1 }

.manager-body { flex: 1; display: flex; gap: 16px; overflow: hidden; padding-top: 14px }

/* ---- 左侧列表 ---- */
.script-list {
  width: 240px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  overflow-y: auto;
}
.list-title {
  font-size: calc(11px * var(--font-scale));
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  padding: 2px 4px 4px;
}
.list-items { display: flex; flex-direction: column; gap: 4px }
.script-item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 10px;
  border-radius: 10px;
  border: 1px solid transparent;
  cursor: pointer;
  position: relative;
  transition: all 0.18s ease;
}
.script-item:hover { background: var(--bg-hover) }
.script-item.active {
  background: var(--accent-soft);
  border-color: var(--accent-color);
}
.script-item.active::before {
  content: '';
  position: absolute;
  left: -10px; top: 50%;
  transform: translateY(-50%);
  width: 3px; height: 18px;
  border-radius: 2px;
  background: linear-gradient(135deg, #3b82f6, #2563eb);
}
.script-item.off { opacity: 0.55 }

.status-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}
.status-dot.on { background: #16a34a; box-shadow: 0 0 0 3px rgba(22, 163, 74, 0.16) }
.status-dot.off { background: #94a3b8 }

.item-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px }
.item-name {
  font-size: calc(13px * var(--font-scale));
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.item-meta {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: calc(11px * var(--font-scale));
  color: var(--text-muted);
}
.mode-tag {
  padding: 0 5px;
  border-radius: 4px;
  font-size: calc(10px * var(--font-scale));
  font-weight: 600;
  line-height: 15px;
}
.mode-tag.selector { background: rgba(59, 130, 246, 0.14); color: #3b82f6 }
.mode-tag.js { background: rgba(124, 58, 237, 0.14); color: #7c3aed }

.item-ops { display: none; gap: 2px; flex-shrink: 0 }
.script-item:hover .item-ops { display: flex }
.mini-btn {
  border: none; background: transparent; cursor: pointer;
  font-size: calc(12px * var(--font-scale)); padding: 3px 5px;
  border-radius: 5px; color: var(--text-muted);
  transition: all 0.15s ease;
}
.mini-btn:hover { background: var(--bg-primary); color: var(--text-primary) }
.mini-btn.danger:hover { background: rgba(220, 38, 38, 0.14); color: #dc2626 }

.empty-list, .empty-editor {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 40px 20px;
  text-align: center;
}
.empty-icon { font-size: calc(40px * var(--font-scale)); margin-bottom: 4px; animation: float 2.6s ease-in-out infinite }
@keyframes float { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-6px) } }
.empty-title { font-size: calc(14px * var(--font-scale)); font-weight: 600; color: var(--text-primary); margin: 0 }
.empty-desc { font-size: calc(12px * var(--font-scale)); color: var(--text-muted); margin: 0 0 10px }

/* ---- 右侧编辑区 ---- */
.editor-pane { flex: 1; overflow-y: auto; padding: 2px 8px 20px 2px; min-width: 0 }
.empty-editor {
  height: 100%;
  border: 1px dashed var(--border-color);
  border-radius: 14px;
}
</style>
