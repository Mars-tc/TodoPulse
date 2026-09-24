<template>
  <div class="settings-panel">
    <header class="settings-head">
      <button class="back-btn" @click="$emit('back')">← 返回列表</button>
      <h2>⚙️ 设置</h2>
      <div class="spacer"></div>
      <button class="btn ghost" :disabled="!settings" @click="confirmReset">↺ 恢复默认</button>
    </header>

    <div class="settings-body" v-if="settings">
      <nav class="settings-nav">
        <button
          v-for="n in nav"
          :key="n.id"
          :class="['nav-item', { active: active === n.id }]"
          @click="scrollTo(n.id)"
        >
          <span class="nav-icon">{{ n.icon }}</span>
          <span class="nav-label">{{ n.label }}</span>
        </button>
      </nav>

      <div class="settings-content" ref="contentRef" @scroll="onScroll">
        <div
          v-for="n in nav"
          :key="n.id"
          class="section-anchor"
          :id="n.id"
          :ref="(el) => (sectionRefs[n.id] = el)"
        >
          <component :is="sections[n.id]" />
        </div>
      </div>
    </div>

    <div v-else class="loading">加载中…</div>
  </div>
</template>

<script setup>
import { ref, onMounted, shallowReactive, markRaw } from 'vue'
import { settings, loadSettings, resetSettings } from '../composables/useSettings'
import { useTheme } from '../composables/useTheme'
import { pushToast } from '../composables/useToast'

import AppearanceSection from './settings/AppearanceSection.vue'
import ReminderSection from './settings/ReminderSection.vue'
import ServerSection from './settings/ServerSection.vue'
import StartupSection from './settings/StartupSection.vue'
import DataSection from './settings/DataSection.vue'
import AboutSection from './settings/AboutSection.vue'
import WidgetSection from './settings/WidgetSection.vue'

defineEmits(['back'])

const nav = [
  { id: 'appearance', label: '外观', icon: '🎨' },
  { id: 'reminder', label: '提醒', icon: '🔔' },
  { id: 'server', label: '服务与扩展', icon: '🔗' },
  { id: 'startup', label: '启动与关闭', icon: '🚀' },
  { id: 'data', label: '数据管理', icon: '💾' },
  { id: 'widget', label: '悬浮窗', icon: '📌' },
  { id: 'about', label: '关于', icon: 'ℹ️' }
]

const sections = {
  appearance: markRaw(AppearanceSection),
  reminder: markRaw(ReminderSection),
  server: markRaw(ServerSection),
  startup: markRaw(StartupSection),
  data: markRaw(DataSection),
  widget: markRaw(WidgetSection),
  about: markRaw(AboutSection)
}

const { applyAppearance } = useTheme()

const contentRef = ref(null)
const sectionRefs = shallowReactive({})
const active = ref('appearance')

onMounted(async () => {
  if (!settings.value) await loadSettings()
  onScroll()
})

function scrollTo(id) {
  const el = sectionRefs[id]
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  active.value = id
}

function onScroll() {
  const c = contentRef.value
  if (!c) return
  let cur = nav[0].id
  for (const n of nav) {
    const el = sectionRefs[n.id]
    if (!el) continue
    const rect = el.getBoundingClientRect()
    if (rect.top <= 120) cur = n.id
  }
  active.value = cur
}

async function confirmReset() {
  if (!window.confirm('确定恢复所有设置为默认值？此操作不可撤销。')) return
  const next = await resetSettings()
  applyAppearance(next)
  pushToast({ message: '已恢复默认设置', type: 'success' })
}
</script>

<style scoped>
.settings-panel { display: flex; flex-direction: column; height: 100%; overflow: hidden }
.settings-head { display: flex; align-items: center; gap: 14px; flex-shrink: 0 }
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
.settings-head h2 { margin: 0; font-size: calc(17px * var(--font-scale)); color: var(--text-primary) }
.spacer { flex: 1 }

.settings-body { flex: 1; display: flex; gap: 16px; overflow: hidden; padding-top: 14px }

.settings-nav {
  width: 176px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  height: fit-content;
  max-height: 100%;
  overflow-y: auto;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--text-secondary);
  font-size: calc(13px * var(--font-scale));
  cursor: pointer;
  text-align: left;
  transition: all 0.18s ease;
  position: relative;
}
.nav-item:hover { background: var(--bg-hover); color: var(--text-primary) }
.nav-item.active { background: var(--accent-soft); color: var(--accent-color); font-weight: 600 }
.nav-item.active::before {
  content: '';
  position: absolute;
  left: -6px;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 18px;
  border-radius: 2px;
  background: linear-gradient(135deg, #3b82f6, #2563eb);
}
.nav-icon { font-size: calc(15px * var(--font-scale)); width: 18px; text-align: center }

.settings-content {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--section-gap);
  padding: 2px 8px 30px 2px;
}
.section-anchor {}

.loading { padding: 40px; text-align: center; color: var(--text-muted); font-size: calc(13px * var(--font-scale)) }

@media (max-width: 820px) {
  .settings-nav { width: 130px }
  .nav-label { display: none }
}
</style>

<!-- 非 scoped：卡片进入动画（按钮 / 卡片 / 行布局已提升至全局 styles/index.css） -->
<style>
@keyframes rise {
  from { opacity: 0; transform: translateY(12px) }
  to { opacity: 1; transform: none }
}
.settings-panel .card { animation: rise 0.4s cubic-bezier(0.22, 1, 0.36, 1) both }
</style>
