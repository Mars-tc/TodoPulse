<template>
  <section class="card section">
    <h3>🔔 提醒设置</h3>
    <p class="section-desc">到点或逾期的未完成待办将弹系统通知；免打扰时段内只记录不弹窗。</p>

    <div class="row">
      <div class="row-text">
        <span class="row-title">启用提醒</span>
        <span class="row-sub">关闭后将停止扫描，不再弹通知</span>
      </div>
      <label class="switch">
        <input type="checkbox" v-model="enabled" />
        <span class="slider"></span>
      </label>
    </div>

    <div class="disabled-area" :class="{ off: !enabled }">
      <div class="row divider">
        <div class="row-text">
          <span class="row-title">默认提前量</span>
          <span class="row-sub">新建 / 编辑待办时提醒下拉的默认值</span>
        </div>
        <select class="select" :value="leadValue" @change="onLeadChange">
          <option value="none">不提醒</option>
          <option value="0">截止时提醒</option>
          <option value="10">提前 10 分钟</option>
          <option :value="30">提前 30 分钟</option>
          <option :value="60">提前 1 小时</option>
          <option :value="180">提前 3 小时</option>
          <option :value="1440">提前 1 天</option>
        </select>
      </div>

      <div class="row divider">
        <div class="row-text">
          <span class="row-title">免打扰时段</span>
          <span class="row-sub">该时段内只记录不弹窗，支持跨零点（如 22:00–08:00）</span>
        </div>
        <label class="switch">
          <input type="checkbox" v-model="dndEnabled" />
          <span class="slider"></span>
        </label>
      </div>

      <div v-if="dndEnabled" class="time-row">
        <input type="time" class="time-input" v-model="dndStart" />
        <span class="time-sep">至</span>
        <input type="time" class="time-input" v-model="dndEnd" />
      </div>

      <div class="row divider">
        <div class="row-text">
          <span class="row-title">扫描间隔</span>
          <span class="row-sub">修改后立即生效，间隔越小越及时</span>
        </div>
        <select class="select" v-model.number="scanInterval">
          <option :value="30">30 秒</option>
          <option :value="60">1 分钟</option>
          <option :value="300">5 分钟</option>
        </select>
      </div>

      <div class="row divider">
        <div class="row-text">
          <span class="row-title">提醒声音</span>
          <span class="row-sub">通知时附带提示音（无声环境不报错）</span>
        </div>
        <label class="switch">
          <input type="checkbox" v-model="sound" />
          <span class="slider"></span>
        </label>
      </div>

      <div class="row divider">
        <div class="row-text">
          <span class="row-title">发送测试通知</span>
          <span class="row-sub">立即验证提醒设置是否生效</span>
        </div>
        <button class="btn primary sm" @click="test">发送测试</button>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { settings, updateSettings } from '../../composables/useSettings'
import { pushToast } from '../../composables/useToast'

function mk(field) {
  return computed({
    get: () => settings.value.reminder[field],
    set: (v) => updateReminder({ [field]: v })
  })
}

const enabled = mk('enabled')
const dndEnabled = mk('dndEnabled')
const dndStart = mk('dndStart')
const dndEnd = mk('dndEnd')
const scanInterval = mk('scanInterval')
const sound = mk('sound')

async function updateReminder(patch) {
  await updateSettings({ reminder: { ...settings.value.reminder, ...patch } })
}

// 默认提前量：null = 不提醒，0 = 截止时提醒，其余为提前分钟数。
// 用字符串做 option value，避免 v-model.number 把 null 转成 0 造成语义混淆
const leadValue = computed(() => {
  const v = settings.value && settings.value.reminder ? settings.value.reminder.defaultLead : null
  return v === null || v === undefined ? 'none' : String(v)
})

function onLeadChange(e) {
  const v = e.target.value
  updateReminder({ defaultLead: v === 'none' ? null : Number(v) })
}

async function test() {
  const res = await window.electronAPI.testNotification()
  if (res && res.success) pushToast({ message: '已发送测试通知', type: 'info' })
  else pushToast({ message: '发送失败', type: 'error' })
}
</script>

<style scoped>
.disabled-area { transition: opacity 0.2s ease; }
.disabled-area.off { opacity: 0.45; pointer-events: none; filter: saturate(0.6) }

.time-row { display: flex; align-items: center; gap: 10px; margin: 12px 0 4px; padding-left: 2px }
.time-input {
  padding: 6px 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: calc(13px * var(--font-scale));
  outline: none;
}
.time-input:focus { border-color: var(--accent-color); box-shadow: 0 0 0 3px var(--accent-soft) }
.time-sep { color: var(--text-muted); font-size: calc(12px * var(--font-scale)) }

/* 复用全局 switch / select 样式片段 */
.switch { position: relative; display: inline-block; width: 38px; height: 21px; flex-shrink: 0 }
.switch input { opacity: 0; width: 0; height: 0 }
.slider {
  position: absolute; inset: 0;
  background: var(--border-color);
  border-radius: 21px;
  cursor: pointer;
  transition: background 0.2s ease;
}
.slider::before {
  content: '';
  position: absolute;
  height: 15px; width: 15px;
  left: 3px; top: 3px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.2s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
}
.switch input:checked + .slider { background: linear-gradient(135deg, #3b82f6, #2563eb) }
.switch input:checked + .slider::before { transform: translateX(17px) }

.select {
  padding: 6px 10px;
  border: 1px solid var(--border-color);
  border-radius: 9px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: calc(12.5px * var(--font-scale));
  outline: none;
  cursor: pointer;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}
.select:focus { border-color: var(--accent-color); box-shadow: 0 0 0 3px var(--accent-soft) }

.btn.primary.sm { padding: 6px 14px; font-size: calc(12px * var(--font-scale)) }
</style>
