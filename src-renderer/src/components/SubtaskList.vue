<template>
  <div class="subtask-list">
    <div v-for="(s, i) in items" :key="i" class="subtask-row">
      <button :class="['sub-check', { checked: s.completed }]" @click="toggle(i)" :title="s.completed ? '标记未完成' : '标记完成'">
        <svg v-if="s.completed" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>
      </button>
      <input
        v-model="s.title"
        class="sub-input"
        :class="{ done: s.completed }"
        placeholder="子任务内容"
        @input="emitChange"
      />
      <button class="sub-del" title="移除" @click="remove(i)">×</button>
    </div>

    <div class="subtask-add">
      <input
        v-model="draft"
        class="sub-input"
        placeholder="添加子任务后回车"
        @keyup.enter="add"
      />
      <button class="add-btn-sm" :disabled="!draft.trim()" @click="add">添加</button>
    </div>

    <div v-if="items.length" class="subtask-summary">
      已完成 {{ doneCount }} / {{ items.length }}
      <span class="sub-progress"><span :style="{ width: percent + '%' }"></span></span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  modelValue: { type: Array, default: () => [] }
})
const emit = defineEmits(['update:modelValue'])

const items = ref(normalize(props.modelValue))
const draft = ref('')

watch(
  () => props.modelValue,
  (v) => {
    const next = normalize(v)
    // 与当前内容一致时跳过重建：输入过程中 emitChange 会把新数组回传给父级，
    // 若无条件重建 items，输入框会被整体替换，导致光标跳到末尾
    if (JSON.stringify(next) === JSON.stringify(items.value)) return
    items.value = next
  },
  { deep: false }
)

function normalize(list) {
  return (list || []).map((s) =>
    typeof s === 'string' ? { title: s, completed: false } : { title: s.title || '', completed: !!s.completed }
  )
}

const doneCount = computed(() => items.value.filter((s) => s.completed).length)
const percent = computed(() => (items.value.length ? Math.round((doneCount.value / items.value.length) * 100) : 0))

function emitChange() { emit('update:modelValue', items.value.slice()) }
function add() {
  const t = draft.value.trim()
  if (!t) return
  items.value.push({ title: t, completed: false })
  draft.value = ''
  emitChange()
}
function remove(i) { items.value.splice(i, 1); emitChange() }
function toggle(i) { items.value[i].completed = !items.value[i].completed; emitChange() }
</script>

<style scoped>
.subtask-list { display: flex; flex-direction: column; gap: 6px }
.subtask-row { display: flex; align-items: center; gap: 8px }
.sub-check {
  width: 18px; height: 18px;
  flex-shrink: 0;
  border: 2px solid var(--border-color);
  border-radius: 5px;
  background: transparent;
  cursor: pointer;
  padding: 0;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.18s ease;
}
.sub-check:hover { border-color: var(--accent-color) }
.sub-check.checked { background: linear-gradient(135deg, #3b82f6, #2563eb); border-color: transparent }
.sub-check svg { width: 11px; height: 11px; fill: none; stroke: #fff; stroke-width: 3.4; stroke-linecap: round; stroke-linejoin: round }
.sub-input {
  flex: 1;
  min-width: 0;
  padding: 6px 10px;
  border: 1px solid var(--border-color);
  border-radius: 7px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: calc(13px * var(--font-scale));
  outline: none;
  transition: border-color 0.2s ease;
}
.sub-input:focus { border-color: var(--accent-color) }
.sub-input.done { text-decoration: line-through; color: var(--text-muted) }
.sub-del {
  width: 22px; height: 22px;
  flex-shrink: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: calc(15px * var(--font-scale));
  line-height: 1;
}
.sub-del:hover { background: rgba(239, 68, 68, 0.14); color: #dc2626 }
.subtask-add { display: flex; gap: 6px }
.add-btn-sm {
  padding: 6px 12px;
  border: none;
  border-radius: 7px;
  background: var(--bg-hover);
  color: var(--text-secondary);
  font-size: calc(12px * var(--font-scale));
  cursor: pointer;
  transition: all 0.18s ease;
}
.add-btn-sm:hover:not(:disabled) { background: var(--accent-color); color: #fff }
.add-btn-sm:disabled { opacity: 0.5; cursor: not-allowed }
.subtask-summary {
  display: flex; align-items: center; gap: 8px;
  font-size: calc(11.5px * var(--font-scale));
  color: var(--text-muted);
  padding-top: 2px;
}
.sub-progress {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: var(--border-color);
  overflow: hidden;
}
.sub-progress > span {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #60a5fa, #3b82f6);
  transition: width 0.3s ease;
}
</style>
