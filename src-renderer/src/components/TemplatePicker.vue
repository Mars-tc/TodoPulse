<template>
  <Transition name="picker-fade">
    <div v-if="open" class="picker-overlay" @click.self="$emit('close')">
      <div class="picker-panel">
        <div class="picker-input-wrap">
          <span class="search-icon">🔍</span>
          <input
            ref="inputRef"
            class="picker-input"
            v-model="keyword"
            placeholder="输入模板名称，快速生成待办"
            @keydown="onKeyDown"
          />
          <span class="picker-count">{{ filtered.length }} 个模板</span>
        </div>

        <div v-if="filtered.length" class="picker-list">
          <div
            v-for="(t, idx) in filtered"
            :key="t.id"
            class="picker-item"
            :class="{ active: idx === selectedIndex }"
            @click="choose(t)"
            @mouseenter="selectedIndex = idx"
          >
            <span class="dot" :style="{ background: t.color }"></span>
            <span class="tpl-icon">{{ t.icon }}</span>
            <div class="item-text">
              <span class="item-name">{{ t.name || '未命名模板' }}</span>
              <span class="item-desc">{{ t.description || '无描述' }}</span>
            </div>
            <span class="item-badge">{{ (t.items || []).length }} 项</span>
          </div>
        </div>

        <div v-else class="picker-empty">
          <p class="empty-title">没有匹配的模板</p>
          <p class="empty-desc">可在「模板库」中新建，或先创建模板再回来使用</p>
        </div>

        <div class="picker-foot">
          <span>↑↓ 选择</span>
          <span>Enter 生成</span>
          <span>Esc 关闭</span>
          <span class="foot-hint">快捷键 Ctrl+Shift+T</span>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { templates, loadTemplates, applyTemplate } from '../composables/useTemplates'
import { pushToast } from '../composables/useToast'

const props = defineProps({
  open: { type: Boolean, default: false }
})

const emit = defineEmits(['close', 'generated'])

const keyword = ref('')
const selectedIndex = ref(0)
const inputRef = ref(null)

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  const list = templates.value.filter((t) => t.enabled)
  if (!kw) return list
  return list.filter(
    (t) =>
      String(t.name || '').toLowerCase().includes(kw) ||
      String(t.description || '').toLowerCase().includes(kw)
  )
})

watch(
  () => props.open,
  async (val) => {
    if (!val) return
    keyword.value = ''
    selectedIndex.value = 0
    await loadTemplates()
    await nextTick()
    if (inputRef.value) inputRef.value.focus()
  }
)

watch(filtered, () => {
  selectedIndex.value = 0
})

function onKeyDown(e) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (filtered.value.length) selectedIndex.value = (selectedIndex.value + 1) % filtered.value.length
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (filtered.value.length) {
      selectedIndex.value = (selectedIndex.value - 1 + filtered.value.length) % filtered.value.length
    }
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const t = filtered.value[selectedIndex.value]
    if (t) choose(t)
  } else if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
  }
}

async function choose(t) {
  const res = await applyTemplate(t.id)
  if (!res || !res.success) {
    pushToast({ message: (res && res.error) || '生成失败', type: 'error' })
    return
  }
  const count = (res.created || []).length
  pushToast({ message: `已从模板「${t.name}」生成 ${count} 条待办`, type: 'success' })
  emit('generated')
  emit('close')
}
</script>

<style scoped>
.picker-overlay { position: fixed; inset: 0; z-index: 300; background: rgba(15, 23, 42, 0.42); backdrop-filter: blur(3px); display: flex; justify-content: center; align-items: flex-start; padding-top: 12vh }
.picker-panel { width: 560px; max-width: 92vw; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 16px; box-shadow: 0 20px 50px rgba(15, 23, 42, 0.24); overflow: hidden; display: flex; flex-direction: column; max-height: 70vh }
.picker-input-wrap { display: flex; align-items: center; gap: 9px; padding: 13px 15px; border-bottom: 1px solid var(--border-color) }
.search-icon { font-size: calc(13px * var(--font-scale)); opacity: 0.7 }
.picker-input { flex: 1; border: none; background: transparent; outline: none; color: var(--text-primary); font-size: calc(14px * var(--font-scale)); font-family: inherit }
.picker-input::placeholder { color: var(--text-muted) }
.picker-count { font-size: calc(11px * var(--font-scale)); color: var(--text-muted); white-space: nowrap }
.picker-list { flex: 1; overflow-y: auto; padding: 6px }
.picker-item { display: flex; align-items: center; gap: 9px; padding: 9px 11px; border-radius: 10px; cursor: pointer; border-left: 3px solid transparent; transition: background 0.15s ease, border-color 0.15s ease }
.picker-item:hover { background: var(--bg-hover) }
.picker-item.active { background: var(--accent-soft); border-left-color: var(--accent-color) }
.dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0 }
.tpl-icon { font-size: calc(14px * var(--font-scale)); flex-shrink: 0 }
.item-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px }
.item-name { font-size: calc(13px * var(--font-scale)); font-weight: 600; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.item-desc { font-size: calc(11px * var(--font-scale)); color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.item-badge { font-size: calc(11px * var(--font-scale)); color: var(--text-muted); background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; padding: 1px 7px; flex-shrink: 0 }
.picker-empty { padding: 34px 20px; text-align: center }
.empty-title { margin: 0; font-size: calc(13.5px * var(--font-scale)); font-weight: 600; color: var(--text-primary) }
.empty-desc { margin: 5px 0 0; font-size: calc(12px * var(--font-scale)); color: var(--text-muted) }
.picker-foot { display: flex; align-items: center; gap: 14px; padding: 9px 15px; border-top: 1px solid var(--border-color); background: var(--bg-secondary); font-size: calc(11px * var(--font-scale)); color: var(--text-muted) }
.foot-hint { margin-left: auto }
.picker-fade-enter-active, .picker-fade-leave-active { transition: opacity 0.16s ease }
.picker-fade-enter-from, .picker-fade-leave-to { opacity: 0 }
.picker-fade-enter-active .picker-panel { transition: transform 0.16s cubic-bezier(0.34, 1.2, 0.64, 1) }
.picker-fade-enter-from .picker-panel { transform: translateY(-10px) }
</style>
