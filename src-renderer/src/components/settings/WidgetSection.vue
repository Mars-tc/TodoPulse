<template>
  <section class="card section">
    <h3>📌 到期悬浮窗</h3>
    <p class="section-desc">独立置顶小窗，分「已逾期 / 今天 / 本周」三段展示到期待办，主窗口最小化到托盘时仍常驻可见。</p>

    <!-- 总开关 -->
    <div class="row">
      <div class="row-text">
        <span class="row-title">开启悬浮窗</span>
        <span class="row-sub">开启后每次启动自动显示，位置与尺寸会被记住</span>
      </div>
      <label class="switch">
        <input type="checkbox" :checked="enabled" @change="onToggle" />
        <span class="slider"></span>
      </label>
    </div>

    <!-- 不透明度 -->
    <div class="row divider">
      <div class="row-text">
        <span class="row-title">不透明度</span>
        <span class="row-sub">鼠标悬停时自动恢复 100%，兼顾常驻不遮挡与可读性</span>
      </div>
      <div class="opacity-row">
        <input type="range" class="opacity-slider" min="60" max="100" step="5" :value="opacity" @input="onOpacityInput" @change="onOpacityCommit" />
        <span class="opacity-val">{{ opacity }}%</span>
      </div>
    </div>

    <!-- 显示已完成 -->
    <div class="row divider">
      <div class="row-text">
        <span class="row-title">显示已完成</span>
        <span class="row-sub">看板默认仅展示未完成项；开启后已完成事项也会出现在对应分段</span>
      </div>
      <label class="switch">
        <input type="checkbox" :checked="showCompleted" @change="onShowCompleted" />
        <span class="slider"></span>
      </label>
    </div>

    <!-- 操作按钮 -->
    <div class="row divider">
      <div class="row-text">
        <span class="row-title">手动控制</span>
        <span class="row-sub">立即显示或隐藏悬浮窗，不影响「开启」开关状态</span>
      </div>
      <div class="ops">
        <button class="btn ghost sm" @click="showNow">立即显示</button>
        <button class="btn ghost sm" @click="hideNow">立即隐藏</button>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, computed } from 'vue'
import { settings, updateSettings } from '../../composables/useSettings'
import { pushToast } from '../../composables/useToast'

const enabled = computed(() => !!(settings.value && settings.value.widget && settings.value.widget.enabled))
const opacity = ref(readOpacity())
const showCompleted = computed(() => !!(settings.value && settings.value.widget && settings.value.widget.showCompleted))

function readOpacity() {
  const w = settings.value && settings.value.widget
  return (w && typeof w.opacity === 'number') ? w.opacity : 100
}

async function onToggle(e) {
  const next = e.target.checked
  await window.electronAPI.setWidgetEnabled(next)
  // setWidgetEnabled 不走 updateSettings，需手动同步本地状态，否则开关视觉不刷新
  if (settings.value) {
    settings.value.widget = { ...(settings.value.widget || {}), enabled: next }
  }
  pushToast({ message: next ? '悬浮窗已开启' : '悬浮窗已关闭', type: 'success' })
}

// 拖动时只更新本地值，保证滑块即时跟手，不触发高频落盘
function onOpacityInput(e) {
  opacity.value = Number(e.target.value)
}

// 松开滑块时才落盘（一次），主进程会通知悬浮窗实时生效
async function onOpacityCommit(e) {
  const v = Number(e.target.value)
  opacity.value = v
  const cur = settings.value ? settings.value.widget : null
  await updateSettings({ widget: { ...(cur || {}), opacity: v } })
}

async function onShowCompleted(e) {
  const next = e.target.checked
  const cur = settings.value ? settings.value.widget : null
  await updateSettings({ widget: { ...(cur || {}), showCompleted: next } })
  pushToast({ message: next ? '悬浮窗将显示已完成事项' : '悬浮窗仅显示未完成事项', type: 'success' })
}

function showNow() { window.electronAPI.setWidgetEnabled(true) }
function hideNow() { window.electronAPI.setWidgetEnabled(false) }
</script>

<style scoped>
.opacity-row { display: flex; align-items: center; gap: 10px }
.opacity-slider {
  width: 130px;
  -webkit-appearance: none;
  height: 5px;
  border-radius: 3px;
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  outline: none;
  cursor: pointer;
}
.opacity-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 15px; height: 15px;
  border-radius: 50%;
  background: #fff;
  border: 2px solid #3b82f6;
  box-shadow: 0 1px 4px rgba(37, 99, 235, 0.3);
  cursor: pointer;
  transition: transform 0.15s ease;
}
.opacity-slider::-webkit-slider-thumb:hover { transform: scale(1.15) }
.opacity-val { font-size: calc(12px * var(--font-scale)); font-weight: 600; color: var(--text-secondary); min-width: 36px; text-align: right }
.ops { display: flex; gap: 8px }

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
.switch input:disabled + .slider { opacity: 0.5; cursor: not-allowed }
</style>
