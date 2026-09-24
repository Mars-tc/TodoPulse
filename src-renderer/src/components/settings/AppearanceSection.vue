<template>
  <section class="card section">
    <h3>🎨 外观</h3>
    <p class="section-desc">设置主题、界面密度与字号，修改即时生效。</p>

    <!-- 主题 -->
    <div class="row">
      <div class="row-text">
        <span class="row-title">主题</span>
        <span class="row-sub">浅色 / 深色，或跟随系统实时切换</span>
      </div>
    </div>
    <div class="theme-grid">
      <button
        v-for="opt in themeOptions"
        :key="opt.key"
        :class="['theme-opt', { active: theme === opt.key }]"
        @click="setTheme(opt.key)"
      >
        <span class="theme-preview" :class="opt.key"></span>
        <span class="theme-name">{{ opt.label }}</span>
      </button>
    </div>

    <!-- 密度 -->
    <div class="row divider">
      <div class="row-text">
        <span class="row-title">界面密度</span>
        <span class="row-sub">紧凑模式减小行高与间距，同屏显示更多内容</span>
      </div>
    </div>
    <div class="seg">
      <button
        v-for="opt in densityOptions"
        :key="opt.key"
        :class="['seg-item', { active: density === opt.key }]"
        @click="setDensity(opt.key)"
      >{{ opt.label }}</button>
    </div>

    <!-- 字号 -->
    <div class="row divider">
      <div class="row-text">
        <span class="row-title">字号</span>
        <span class="row-sub">全局缩放界面文字，不影响布局破版</span>
      </div>
    </div>
    <div class="seg">
      <button
        v-for="opt in fontOptions"
        :key="opt.key"
        :class="['seg-item', { active: fontScale === opt.key }]"
        @click="setFont(opt.key)"
      >{{ opt.label }}</button>
    </div>
  </section>
</template>

<script setup>
import { useTheme } from '../../composables/useTheme'
import { updateSettings } from '../../composables/useSettings'
import { pushToast } from '../../composables/useToast'

const { theme, density, fontScale, setActualDark } = useTheme()

const themeOptions = [
  { key: 'light', label: '浅色' },
  { key: 'dark', label: '深色' },
  { key: 'system', label: '跟随系统' }
]
const densityOptions = [
  { key: 'comfortable', label: '舒适' },
  { key: 'compact', label: '紧凑' }
]
const fontOptions = [
  { key: 'normal', label: '常规' },
  { key: 'large', label: '大' },
  { key: 'xlarge', label: '特大' }
]

async function persist(patch, msg) {
  await updateSettings(patch)
  pushToast({ message: msg, type: 'success' })
}

function setTheme(v) {
  theme.value = v
  if (v === 'light') setActualDark(false)
  else if (v === 'dark') setActualDark(true)
  persist({ theme: v }, '外观已保存')
}
function setDensity(v) {
  density.value = v
  persist({ density: v }, '外观已保存')
}
function setFont(v) {
  fontScale.value = v
  persist({ fontScale: v }, '外观已保存')
}
</script>

<style scoped>
.theme-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 12px }
.theme-opt {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px 8px;
  border: 1.5px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}
.theme-opt:hover { border-color: var(--accent-color); transform: translateY(-2px) }
.theme-opt.active { border-color: var(--accent-color); background: var(--accent-soft) }
.theme-preview {
  width: 100%;
  height: 42px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
}
.theme-preview.light { background: linear-gradient(135deg, #ffffff, #f1f5f9) }
.theme-preview.dark { background: linear-gradient(135deg, #0f172a, #1e293b) }
.theme-preview.system {
  background: linear-gradient(135deg, #ffffff 0%, #ffffff 50%, #0f172a 50%, #1e293b 100%);
}
.theme-name { font-size: calc(12.5px * var(--font-scale)); color: var(--text-secondary) }
.theme-opt.active .theme-name { color: var(--accent-color); font-weight: 600 }

.seg {
  display: inline-flex;
  margin-top: 12px;
  padding: 3px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  gap: 2px;
}
.seg-item {
  padding: 6px 18px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  font-size: calc(12.5px * var(--font-scale));
  color: var(--text-secondary);
  transition: all 0.18s ease;
}
.seg-item:hover { color: var(--text-primary) }
.seg-item.active {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: #fff;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(37, 99, 235, 0.28);
}
</style>
