<template>
  <div class="repeat-editor">
    <div class="rule-tabs">
      <button
        v-for="r in rules"
        :key="r.key"
        :class="['rule-btn', { active: type === r.key }]"
        @click="setType(r.key)"
      >{{ r.label }}</button>
    </div>

    <div v-if="type !== 'none'" class="rule-detail">
      <span class="rule-label">每</span>
      <input
        type="number"
        min="1"
        max="99"
        class="interval-input"
        :value="interval"
        @input="setInterval($event.target.value)"
      />
      <span class="rule-label">{{ unitLabel }}</span>
      <span class="rule-preview">下一次：{{ preview || '—' }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  modelValue: { type: [Object, String, null], default: null },
  deadline: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue'])

const rules = [
  { key: 'none', label: '不重复' },
  { key: 'daily', label: '每天' },
  { key: 'weekly', label: '每周' },
  { key: 'monthly', label: '每月' }
]

function parseRule(v) {
  if (!v) return { type: 'none', interval: 1 }
  if (typeof v === 'string') {
    try { return { type: 'none', interval: 1, ...JSON.parse(v) } } catch { return { type: 'none', interval: 1 } }
  }
  return { type: 'none', interval: 1, ...v }
}

const initial = parseRule(props.modelValue)
const type = ref(initial.type || 'none')
const interval = ref(Number(initial.interval) || 1)

watch(() => props.modelValue, (v) => {
  const p = parseRule(v)
  type.value = p.type || 'none'
  interval.value = Number(p.interval) || 1
})

const unitLabel = computed(() =>
  ({ daily: '天', weekly: '周', monthly: '个月' }[type.value] || '')
)

// 预览由主进程计算（与主进程真正生成下一轮用同一份 repeat_rule.js），
// 避免两处算法漂移导致「预览显示 A、实际生成 B」
const preview = ref('')

function formatLocal(d) {
  const pad = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function refreshPreview() {
  if (type.value === 'none') {
    preview.value = ''
    return
  }
  const n = Math.max(1, Math.min(99, Number(interval.value) || 1))
  try {
    const res = await window.electronAPI.computeRepeatNext(
      props.deadline || new Date().toISOString(),
      { type: type.value, interval: n }
    )
    preview.value = res && res.success && res.next ? formatLocal(new Date(res.next)) : ''
  } catch {
    preview.value = ''
  }
}

watch([type, interval, () => props.deadline], refreshPreview, { immediate: true })

function emitChange() {
  emit('update:modelValue', type.value === 'none' ? null : { type: type.value, interval: Math.max(1, Number(interval.value) || 1) })
}
function setType(t) { type.value = t; emitChange() }
function setInterval(v) { interval.value = v; emitChange() }
</script>

<style scoped>
.repeat-editor { display: flex; flex-direction: column; gap: 8px }
.rule-tabs { display: flex; gap: 4px; flex-wrap: wrap }
.rule-btn {
  padding: 5px 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: calc(12px * var(--font-scale));
  cursor: pointer;
  transition: all 0.18s ease;
}
.rule-btn:hover { border-color: var(--accent-color); color: var(--accent-color) }
.rule-btn.active {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  border-color: transparent;
  color: #fff;
  font-weight: 600;
}
.rule-detail { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: calc(12px * var(--font-scale)); color: var(--text-secondary) }
.interval-input {
  width: 52px;
  padding: 4px 8px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: calc(12px * var(--font-scale));
  outline: none;
}
.interval-input:focus { border-color: var(--accent-color) }
.rule-preview { margin-left: auto; color: var(--accent-color); font-weight: 600 }
</style>
