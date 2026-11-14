<template>
  <section class="section">
    <h3>🧭 智能规划</h3>
    <p class="hint">配置每日容量、精力时段与逾期顺延策略，决定「今日排期」如何排列待办。</p>

    <div class="field-grid">
      <label class="field">
        <span class="field-label">每日容量（分钟）</span>
        <input class="field-input" type="number" min="30" step="30" v-model.number="planning.daily_capacity_minutes" @change="save" />
      </label>
      <label class="field">
        <span class="field-label">默认预估耗时（分钟）</span>
        <input class="field-input" type="number" min="5" step="5" v-model.number="planning.default_estimate_minutes" @change="save" />
      </label>
      <label class="field">
        <span class="field-label">紧急阈值（距截止 N 天内）</span>
        <input class="field-input" type="number" min="1" step="1" v-model.number="planning.urgent_within_days" @change="save" />
      </label>
    </div>

    <div class="row divider">
      <div class="row-text">
        <span class="row-title">象限自动建议</span>
        <span class="row-sub">按优先级与截止时间推荐象限，仅作建议，采纳后才写入</span>
      </div>
      <input type="checkbox" class="switch" v-model="planning.quadrant_suggest_enabled" @change="save" />
    </div>

    <div class="row divider">
      <div class="row-text">
        <span class="row-title">逾期自动顺延</span>
        <span class="row-sub">默认关闭；开启后按策略批量改写逾期待办的截止时间</span>
      </div>
      <input type="checkbox" class="switch" v-model="planning.auto_defer_enabled" @change="save" />
    </div>

    <label v-if="planning.auto_defer_enabled" class="field strategy-field">
      <span class="field-label">顺延策略</span>
      <select class="field-input" v-model="planning.auto_defer_strategy" @change="save">
        <option value="today">顺延到今天</option>
        <option value="next_workday">顺延到下一个工作日（跳过周末）</option>
        <option value="mark_only">仅标记逾期，不修改时间</option>
      </select>
    </label>

    <div class="slots-head">
      <span class="field-label">精力时段表</span>
      <button class="btn ghost sm" @click="addSlot">＋ 添加时段</button>
    </div>
    <p class="hint slots-hint">排期时按精力档位匹配时段：高精力优先安排在上午时段。</p>

    <div v-if="planning.energy_slots.length === 0" class="empty-slots">暂无时段，排期时不做时段匹配</div>

    <div v-for="(slot, idx) in planning.energy_slots" :key="idx" class="slot-row">
      <input class="field-input slot-label" v-model="slot.label" placeholder="时段名称" @blur="save" />
      <input class="field-input slot-time" v-model="slot.start" placeholder="08:00" @blur="save" />
      <span class="dash">→</span>
      <input class="field-input slot-time" v-model="slot.end" placeholder="12:00" @blur="save" />
      <select class="field-input slot-energy" v-model="slot.energy" @change="save">
        <option value="high">高精力</option>
        <option value="medium">中等精力</option>
        <option value="low">低精力</option>
      </select>
      <button class="del-btn" title="删除时段" @click="removeSlot(idx)">✕</button>
    </div>
  </section>
</template>

<script setup>
import { reactive, onMounted } from 'vue'
import { settings, loadSettings, updateSettings } from '../../composables/useSettings'
import { pushToast } from '../../composables/useToast'

const planning = reactive({
  daily_capacity_minutes: 240,
  default_estimate_minutes: 30,
  urgent_within_days: 3,
  auto_defer_enabled: false,
  auto_defer_strategy: 'today',
  quadrant_suggest_enabled: true,
  energy_slots: []
})

onMounted(async () => {
  await loadSettings()
  const p = (settings.value && settings.value.planning) || {}
  Object.assign(planning, {
    daily_capacity_minutes: Number(p.daily_capacity_minutes) || 240,
    default_estimate_minutes: Number(p.default_estimate_minutes) || 30,
    urgent_within_days: Number(p.urgent_within_days) || 3,
    auto_defer_enabled: !!p.auto_defer_enabled,
    auto_defer_strategy: p.auto_defer_strategy || 'today',
    quadrant_suggest_enabled: p.quadrant_suggest_enabled !== false,
    energy_slots: Array.isArray(p.energy_slots)
      ? p.energy_slots.map((s) => ({
          label: s.label || '',
          start: s.start || '08:00',
          end: s.end || '12:00',
          energy: s.energy || 'medium'
        }))
      : []
  })
})

function addSlot() {
  planning.energy_slots.push({ label: '新时段', start: '08:00', end: '12:00', energy: 'medium' })
  save()
}

function removeSlot(idx) {
  planning.energy_slots.splice(idx, 1)
  save()
}

async function save() {
  try {
    await updateSettings({ planning: JSON.parse(JSON.stringify(planning)) })
    pushToast({ message: '智能规划设置已保存', type: 'success' })
  } catch (e) {
    pushToast({ message: '保存失败：' + e.message, type: 'error' })
  }
}
</script>

<style scoped>
.section { margin-bottom: 28px }
.section h3 { margin: 0 0 6px; font-size: calc(13.5px * var(--font-scale)); font-weight: 600; color: var(--text-primary) }
.hint { margin: 0 0 14px; font-size: calc(12px * var(--font-scale)); color: var(--text-muted) }
.field-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px }
.field { display: flex; flex-direction: column; gap: 5px }
.field-label { font-size: calc(11.5px * var(--font-scale)); color: var(--text-muted); font-weight: 600 }
.strategy-field { max-width: 340px; margin-top: 12px }
.switch { width: 17px; height: 17px; cursor: pointer; accent-color: var(--accent-color) }
.slots-head { display: flex; align-items: center; justify-content: space-between; margin-top: 20px }
.slots-hint { margin: -8px 0 12px }
.empty-slots { padding: 16px 0; text-align: center; color: var(--text-muted); font-size: calc(12.5px * var(--font-scale)); border-bottom: 1px solid var(--border-color); margin-bottom: 12px }
.slot-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px }
.slot-label { flex: 1 }
.slot-time { width: 84px }
.slot-energy { width: 106px }
.dash { color: var(--text-muted); font-size: calc(12px * var(--font-scale)) }
.del-btn { width: 28px; height: 28px; border: 1px solid var(--border-color); border-radius: 7px; background: var(--bg-secondary); color: var(--text-muted); font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s; flex-shrink: 0 }
.del-btn:hover { color: #dc2626; border-color: #dc2626 }
@media (max-width: 720px) { .field-grid { grid-template-columns: 1fr } .slot-row { flex-wrap: wrap } }
</style>
