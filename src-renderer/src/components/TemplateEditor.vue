<template>
  <div class="tpl-editor">
    <div class="editor-head">
      <input class="field-input icon-input" v-model="form.icon" maxlength="4" title="图标" />
      <input class="field-input name-input" v-model="form.name" placeholder="模板名称（同时作为生成待办的标题模板）" />
      <button class="btn primary" @click="submit">保存</button>
      <button class="btn ghost" @click="$emit('cancel')">取消</button>
    </div>

    <div class="card block">
      <h3>基本信息</h3>
      <label class="field">
        <span class="field-label">描述</span>
        <textarea class="field-input desc-input" v-model="form.description" rows="2" placeholder="支持 {date} {tomorrow} {weekday} {category} 占位符"></textarea>
      </label>

      <div class="field-row">
        <div class="field">
          <span class="field-label">展开方式</span>
          <div class="seg">
            <button class="seg-item" :class="{ active: form.expand_mode === 'single' }" @click="form.expand_mode = 'single'">单条待办 + 子任务</button>
            <button class="seg-item" :class="{ active: form.expand_mode === 'preset' }" @click="form.expand_mode = 'preset'">清单预设（多条待办）</button>
          </div>
        </div>
        <div class="field">
          <span class="field-label">颜色</span>
          <div class="swatches">
            <button v-for="c in PALETTE" :key="c" class="swatch" :style="{ background: c }" :class="{ active: form.color === c }" @click="form.color = c"></button>
          </div>
        </div>
      </div>
    </div>

    <div class="card block">
      <h3>默认属性</h3>
      <div class="grid-2">
        <label class="field">
          <span class="field-label">默认分类</span>
          <select class="field-input" v-model="form.category_id">
            <option value="">未分类</option>
            <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </label>
        <label class="field">
          <span class="field-label">默认优先级</span>
          <select class="field-input" v-model="form.priority">
            <option value="high">高</option>
            <option value="medium">中</option>
            <option value="low">低</option>
          </select>
        </label>
        <label class="field">
          <span class="field-label">提醒提前量</span>
          <select class="field-input" v-model="remindLeadText">
            <option value="none">不提醒</option>
            <option value="0">截止时提醒</option>
            <option value="5">提前 5 分钟</option>
            <option value="10">提前 10 分钟</option>
            <option value="30">提前 30 分钟</option>
            <option value="60">提前 1 小时</option>
            <option value="180">提前 3 小时</option>
            <option value="1440">提前 1 天</option>
          </select>
        </label>
        <label class="field">
          <span class="field-label">重复规则</span>
          <select class="field-input" v-model="repeatType">
            <option value="none">不重复</option>
            <option value="daily">每天</option>
            <option value="weekly">每周</option>
            <option value="monthly">每月</option>
          </select>
        </label>
        <label class="field">
          <span class="field-label">精力档位</span>
          <select class="field-input" v-model="form.energy_level">
            <option value="high">高精力</option>
            <option value="medium">中等精力</option>
            <option value="low">低精力</option>
          </select>
        </label>
        <label class="field">
          <span class="field-label">象限归属</span>
          <select class="field-input" v-model="form.quadrant">
            <option value="">不指定</option>
            <option value="Q1">Q1 重要且紧急</option>
            <option value="Q2">Q2 重要不紧急</option>
            <option value="Q3">Q3 不重要但紧急</option>
            <option value="Q4">Q4 不重要不紧急</option>
          </select>
        </label>
        <label class="field">
          <span class="field-label">相对截止日（今天起算）</span>
          <div class="offset-row">
            <button class="mini-btn" @click="form.deadline_offset_days -= 1">−</button>
            <span class="offset-value">{{ form.deadline_offset_days }} 天</span>
            <button class="mini-btn" @click="form.deadline_offset_days += 1">＋</button>
          </div>
        </label>
      </div>
    </div>

    <div class="card block">
      <div class="items-head">
        <h3>{{ form.expand_mode === 'preset' ? '待办条目' : '子任务条目' }}</h3>
        <span class="items-count">共 {{ form.items.length }} 项</span>
      </div>
      <p class="items-hint">{{ itemsHint }}</p>

      <div class="items">
        <div v-for="(it, idx) in form.items" :key="idx" class="item-line">
          <span class="item-idx">{{ idx + 1 }}</span>
          <input class="field-input item-input" v-model="it.title" :placeholder="form.expand_mode === 'preset' ? '待办标题' : '子任务标题'" />
          <button class="mini-btn" title="上移" :disabled="idx === 0" @click="moveItem(idx, -1)">↑</button>
          <button class="mini-btn" title="下移" :disabled="idx === form.items.length - 1" @click="moveItem(idx, 1)">↓</button>
          <button class="mini-btn danger" title="删除" @click="form.items.splice(idx, 1)">✕</button>
        </div>
      </div>

      <button class="add-item" @click="addItem">＋ 添加条目</button>
    </div>

  </div>
</template>

<script setup>
import { reactive, ref, computed, watch } from 'vue'

const props = defineProps({
  template: { type: Object, required: true },
  categories: { type: Array, default: () => [] }
})

const emit = defineEmits(['save', 'cancel'])

const PALETTE = [
  '#3b82f6',
  '#2563eb',
  '#16a34a',
  '#eab308',
  '#f97316',
  '#dc2626',
  '#8b5cf6',
  '#64748b'
]

const form = reactive({
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
  items: []
})

const remindLeadText = ref('none')
const repeatType = ref('none')

const itemsHint = computed(() =>
  form.expand_mode === 'preset'
    ? '每个条目会生成一条独立待办'
    : '模板本身生成一条待办，下列条目落地为其子任务'
)

watch(
  () => props.template,
  (tpl) => {
    if (!tpl) return
    Object.assign(form, {
      id: tpl.id || '',
      name: tpl.name || '',
      description: tpl.description || '',
      icon: tpl.icon || '📋',
      color: tpl.color || '#3b82f6',
      category_id: tpl.category_id || '',
      priority: tpl.priority || 'medium',
      remind_lead: tpl.remind_lead === null || tpl.remind_lead === undefined ? null : Number(tpl.remind_lead),
      repeat_rule: tpl.repeat_rule || null,
      energy_level: tpl.energy_level || 'medium',
      quadrant: tpl.quadrant || '',
      deadline_offset_days: Number(tpl.deadline_offset_days) || 0,
      expand_mode: tpl.expand_mode === 'preset' ? 'preset' : 'single',
      enabled: tpl.enabled === undefined ? 1 : tpl.enabled,
      items: (tpl.items || []).map((it) => ({
        title: it.title || '',
        kind: it.kind === 'task' ? 'task' : 'subtask',
        sort_order: it.sort_order
      }))
    })
    remindLeadText.value =
      tpl.remind_lead === null || tpl.remind_lead === undefined ? 'none' : String(tpl.remind_lead)
    repeatType.value = parseRepeatType(tpl.repeat_rule)
  },
  { immediate: true, deep: true }
)

function parseRepeatType(rule) {
  if (!rule) return 'none'
  try {
    const obj = typeof rule === 'string' ? JSON.parse(rule) : rule
    return obj && obj.type ? obj.type : 'none'
  } catch {
    return 'none'
  }
}

function addItem() {
  form.items.push({
    title: '',
    kind: form.expand_mode === 'preset' ? 'task' : 'subtask',
    sort_order: form.items.length
  })
}

function moveItem(index, delta) {
  const target = index + delta
  if (target < 0 || target >= form.items.length) return
  const list = form.items.slice()
  const [item] = list.splice(index, 1)
  list.splice(target, 0, item)
  form.items = list.map((it, i) => ({ ...it, sort_order: i }))
}

function submit() {
  const lead = remindLeadText.value === 'none' ? null : Number(remindLeadText.value)
  const repeat = repeatType.value === 'none' ? null : JSON.stringify({ type: repeatType.value, interval: 1 })
  emit('save', {
    id: form.id,
    name: form.name.trim(),
    description: form.description,
    icon: form.icon || '📋',
    color: form.color,
    category_id: form.category_id,
    priority: form.priority,
    remind_lead: lead,
    repeat_rule: repeat,
    energy_level: form.energy_level,
    quadrant: form.quadrant,
    deadline_offset_days: form.deadline_offset_days,
    expand_mode: form.expand_mode,
    enabled: form.enabled,
    items: form.items.map((it, i) => ({
      title: it.title,
      kind: form.expand_mode === 'preset' ? 'task' : 'subtask',
      sort_order: i
    }))
  })
}

</script>

<style scoped>
.tpl-editor { display: flex; flex-direction: column; gap: 12px; padding-bottom: 20px }
.editor-head { display: flex; align-items: center; gap: 8px }
.icon-input { width: 52px; flex-shrink: 0; text-align: center; padding: 7px 4px }
.name-input { flex: 1 }
.block { padding: 14px 16px }
.block h3 { margin: 0 0 10px; font-size: calc(14px * var(--font-scale)); font-weight: 700; color: var(--text-primary) }
.field { display: flex; flex-direction: column; gap: 5px; flex: 1; min-width: 0 }
.field-label { font-size: calc(11.5px * var(--font-scale)); color: var(--text-muted); font-weight: 600 }
.desc-input { resize: vertical; font-family: inherit }
.field-row { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 12px }
.grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 16px }
.swatches { display: flex; gap: 6px; flex-wrap: wrap }
.swatch { width: 22px; height: 22px; border-radius: 7px; border: 2px solid transparent; cursor: pointer; transition: all 0.16s ease; padding: 0 }
.swatch:hover { transform: translateY(-1px) }
.swatch.active { border-color: var(--text-primary); transform: scale(1.08) }
.offset-row { display: flex; align-items: center; gap: 8px }
.offset-value { min-width: 56px; text-align: center; font-size: calc(12.5px * var(--font-scale)); font-weight: 600; color: var(--text-primary) }
.mini-btn { border: 1px solid var(--border-color); background: var(--bg-primary); cursor: pointer; font-size: calc(12px * var(--font-scale)); padding: 4px 8px; border-radius: 7px; color: var(--text-secondary); transition: all 0.15s ease }
.mini-btn:hover:not(:disabled) { border-color: var(--accent-color); color: var(--accent-color) }
.mini-btn:disabled { opacity: 0.35; cursor: not-allowed }
.mini-btn.danger:hover { border-color: rgba(220, 38, 38, 0.55); color: #dc2626 }
.items-head { display: flex; align-items: baseline; justify-content: space-between }
.items-count { font-size: calc(11.5px * var(--font-scale)); color: var(--text-muted) }
.items-hint { margin: -4px 0 10px; font-size: calc(11.5px * var(--font-scale)); color: var(--text-muted) }
.items { display: flex; flex-direction: column; gap: 6px }
.item-line { display: flex; align-items: center; gap: 6px }
.item-idx { width: 20px; flex-shrink: 0; text-align: center; font-size: calc(11px * var(--font-scale)); color: var(--text-muted); font-weight: 700 }
.item-input { flex: 1 }
.add-item { margin-top: 10px; width: 100%; padding: 8px; border: 1px dashed var(--border-color); border-radius: 9px; background: transparent; color: var(--text-secondary); font-size: calc(12.5px * var(--font-scale)); cursor: pointer; transition: all 0.18s ease }
.add-item:hover { border-color: var(--accent-color); color: var(--accent-color); background: var(--accent-soft) }
@media (max-width: 720px) { .grid-2 { grid-template-columns: 1fr } }

</style>
