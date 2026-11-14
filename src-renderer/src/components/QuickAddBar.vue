<template>
  <Transition name="qab">
    <div v-if="open" class="qab-overlay" @click.self="close">
      <div class="qab-bar">
        <div class="qab-inner">
          <span class="qab-icon">＋</span>
          <input
            ref="inputRef"
            v-model="title"
            type="text"
            class="qab-input"
            placeholder="快速添加待办（回车保存）…"
            maxlength="100"
            @keydown.enter="save"
            @keydown.escape="close"
          />
          <div class="qab-options">
            <button
              v-for="p in priorityOpts"
              :key="p.value"
              :class="['qab-priority', p.value, { active: formPriority === p.value }]"
              @click="formPriority = p.value"
            >{{ p.label }}</button>
            <select v-model="formCategory" class="qab-cat-select">
              <option value="">未分类</option>
              <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
            <div class="tpl-picker">
              <button class="qab-tpl-trigger" title="从模板生成待办" @click="tplMenuOpen = !tplMenuOpen">🧰 模板</button>
              <div v-if="tplMenuOpen" class="tpl-menu">
                <div class="tpl-menu-title">从模板生成</div>
                <button v-for="t in tplList" :key="t.id" class="tpl-menu-item" @click="useTemplate(t)">
                  <span class="dot" :style="{ background: t.color }"></span>
                  <span class="name">{{ t.name || '未命名模板' }}</span>
                  <span class="meta">{{ (t.items || []).length }} 项</span>
                </button>
                <div v-if="!tplList.length" class="tpl-menu-empty">暂无启用的模板</div>
              </div>
            </div>
            <button class="qab-close" @click="close">×</button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, onMounted, watch, nextTick, computed } from 'vue'
import { quickAddOpen } from '../composables/useKeyboardShortcuts'
import { useCategories } from '../composables/useCategories'
import { templates, loadTemplates, applyTemplate } from '../composables/useTemplates'
import { pushToast } from '../composables/useToast'

const props = defineProps({
  defaultPriority: { type: String, default: 'medium' }
})
const emit = defineEmits(['saved', 'close'])

const { categories, loadCategories } = useCategories()

const open = ref(false)
const title = ref('')
const formPriority = ref(props.defaultPriority)
const formCategory = ref('')
const inputRef = ref(null)
const tplMenuOpen = ref(false)

const tplList = computed(() => templates.value.filter((t) => t.enabled))

watch(quickAddOpen, val => {
  if (val) {
    open.value = true
    formPriority.value = props.defaultPriority
    tplMenuOpen.value = false
    nextTick(() => { inputRef.value?.focus() })
  } else {
    close()
  }
})

async function save() {
  const t = title.value.trim()
  if (!t) return
  try {
    await window.electronAPI.addTodo({
      title: t,
      description: '',
      priority: formPriority.value,
      category_id: formCategory.value || '',
      deadline: null,
      remind_lead: null,
      remind_at: null,
      repeat_rule: null,
      parent_id: null,
      create_at: new Date().toISOString()
    })
    pushToast({ message: `已添加「${t.slice(0, 20)}${t.length > 20 ? '…' : ''}」`, type: 'success' })
    close()
    emit('saved')
  } catch (e) {
    pushToast({ message: '保存失败：' + (e?.message || '未知错误'), type: 'error' })
  }
}

async function useTemplate(t) {
  tplMenuOpen.value = false
  const res = await applyTemplate(t.id)
  if (!res || !res.success) {
    pushToast({ message: (res && res.error) || '生成失败', type: 'error' })
    return
  }
  const count = (res.created || []).length
  pushToast({ message: `已从模板「${t.name || '未命名模板'}」生成 ${count} 条待办`, type: 'success' })
  close()
  emit('saved')
}

onMounted(() => { loadCategories(); loadTemplates() })
</script>

<style scoped>
.qab-overlay {
  position: fixed; inset: 0; z-index: 1999;
  background: rgba(15, 23, 42, 0.35);
  animation: qabBg 0.15s ease;
}
@keyframes qabBg { from { opacity: 0 } to { opacity: 1 } }

.qab-bar {
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-color);
  box-shadow: 0 8px 30px rgba(15, 23, 42, 0.25);
  padding: 0;
}

.qab-inner {
  display: flex; align-items: center; gap: 12px;
  max-width: 800px; margin: 0 auto;
  padding: 12px 20px 10px;
}

.qab-icon {
  width: 34px; height: 34px; border-radius: 10px;
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: #fff; font-size: 20px;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}

.qab-input {
  flex: 1; border: none; outline: none; background: transparent;
  color: var(--text-primary); font-size: 15px; font-weight: 500;
}
.qab-input::placeholder { color: var(--text-muted) }

.qab-options {
  display: flex; align-items: center; gap: 6px; flex-shrink: 0;
}

.qab-priority {
  padding: 4px 10px; border-radius: 7px; border: 1px solid var(--border-color);
  background: var(--bg-secondary); color: var(--text-secondary);
  font-size: 12px; cursor: pointer; transition: all 0.15s ease;
}
.qab-priority:hover { border-color: var(--accent-color) }
.qab-priority.high.active { background: #dc2626; color: #fff; border-color: #dc2626 }
.qab-priority.medium.active { background: #ea580c; color: #fff; border-color: #ea580c }
.qab-priority.low.active { background: #16a34a; color: #fff; border-color: #16a34a }

.qab-cat-select {
  padding: 4px 8px; border-radius: 7px; border: 1px solid var(--border-color);
  background: var(--bg-secondary); color: var(--text-secondary);
  font-size: 12px; cursor: pointer; outline: none;
}
.qab-cat-select:focus { border-color: var(--accent-color) }

.qab-tpl-trigger {
  padding: 4px 10px; border-radius: 7px; border: 1px solid var(--border-color);
  background: var(--bg-secondary); color: var(--text-secondary);
  font-size: 12px; cursor: pointer; transition: all 0.15s ease; white-space: nowrap;
}
.qab-tpl-trigger:hover { border-color: var(--accent-color); color: var(--accent-color) }
.tpl-picker { position: relative; flex-shrink: 0 }
.tpl-menu {
  position: absolute; top: calc(100% + 8px); right: 0; z-index: 20;
  min-width: 210px; max-height: 260px; overflow-y: auto;
  padding: 6px; background: var(--bg-primary);
  border: 1px solid var(--border-color); border-radius: 11px;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.2);
}
.tpl-menu-title {
  padding: 4px 8px 6px; font-size: 11px; font-weight: 700;
  letter-spacing: 0.05em; color: var(--text-muted);
}
.tpl-menu-item {
  display: flex; align-items: center; gap: 8px; width: 100%;
  padding: 7px 8px; border: none; background: transparent; border-radius: 8px;
  cursor: pointer; text-align: left; transition: background 0.15s ease;
}
.tpl-menu-item:hover { background: var(--accent-soft) }
.tpl-menu-item .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0 }
.tpl-menu-item .name {
  flex: 1; min-width: 0; font-size: 12.5px; color: var(--text-primary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.tpl-menu-item .meta { font-size: 11px; color: var(--text-muted); flex-shrink: 0 }
.tpl-menu-empty { padding: 12px 8px; text-align: center; font-size: 12px; color: var(--text-muted) }

.qab-close {
  width: 28px; height: 28px; border: 1px solid var(--border-color); border-radius: 7px;
  background: var(--bg-secondary); color: var(--text-muted); font-size: 18px;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: all 0.15s ease;
}
.qab-close:hover { color: var(--text-primary); border-color: var(--accent-color) }

/* Transition */
.qab-enter-active { transition: all 0.22s cubic-bezier(0.34, 1.4, 0.64, 1) }
.qab-leave-active { transition: opacity 0.15s ease }
.qab-enter-from { opacity: 0; transform: translateY(-10px) }
.qab-leave-to { opacity: 0 }
</style>
