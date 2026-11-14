<template>
  <div class="widget-root" :style="{ opacity: hovered ? 1 : opacityValue, '--w-accent': accent }" @mouseenter="hovered = true" @mouseleave="hovered = false">
    <!-- 标题栏（可拖动） -->
    <header class="w-head" style="-webkit-app-region: drag">
      <div class="w-title">
        <span class="w-logo">📋</span>
        <span class="w-name">到期事项</span>
        <span class="w-badge">{{ totalCount }}</span>
      </div>
      <div class="w-ops" style="-webkit-app-region: no-drag">
        <button class="w-btn" :class="{ spinning: refreshing }" title="刷新" @click="refresh">↻</button>
        <button class="w-btn close" title="关闭" @click="close">×</button>
      </div>
    </header>

    <!-- 三段看板 -->
    <div class="w-body" style="-webkit-app-region: no-drag">
      <section
        v-for="(s, i) in sections"
        :key="s.key"
        class="w-section stagger"
        :style="{ animationDelay: i * 0.06 + 's' }"
      >
        <div class="w-sec-head" @click="toggle(s.key)">
          <span class="w-dot" :style="{ background: s.color }"></span>
          <span class="w-sec-name">{{ s.name }}</span>
          <span class="w-sec-count" :style="{ color: s.color, background: s.color + '1a' }">{{ s.list.length }}</span>
          <span class="w-fold" :class="{ open: !collapsed[s.key] }">▾</span>
        </div>

        <div v-show="!collapsed[s.key]" class="w-list">
          <div
            v-for="t in s.list"
            :key="t.id"
            class="w-item"
            :class="{ done: completingIds[t.id] }"
            @click="onItemClick(t)"
          >
            <label class="w-check" @click.stop>
              <input type="checkbox" :checked="!!t.completed || !!completingIds[t.id]" :disabled="completingIds[t.id]" @change="complete(t)" />
              <span class="w-check-box"></span>
            </label>
            <span class="w-item-title">{{ t.title }}</span>
            <span class="w-item-due" :style="{ color: s.color }">{{ formatRel(t.deadline, s.key) }}</span>
          </div>
        </div>
      </section>

      <div v-if="totalCount === 0 && !loading" class="w-empty">
        <div class="w-empty-icon">🎉</div>
        <p class="w-empty-title">本周没有到期事项</p>
        <p class="w-empty-hint">点击右上角 ↻ 刷新，或前往主窗口添加</p>
      </div>

      <div v-if="loading" class="w-loading">
        <span class="w-spinner"></span> 加载中…
      </div>
    </div>

    <!-- 连续打卡追踪 -->
    <div v-if="streak > 0" class="w-streak">
      <span class="w-streak-fire">🔥</span>
      <span class="w-streak-text">连续打卡 {{ streak }} 天</span>
    </div>

    <!-- 底部状态栏 -->
    <footer class="w-foot">
      <span>更新于 {{ updatedAtText }}</span>
      <span class="w-foot-right">合计 {{ totalCount }}</span>
    </footer>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { loadSettings } from './composables/useSettings'
import { pushToast } from './composables/useToast'

const data = ref({ overdue: [], today: [], week: [], updatedAt: null })
const loading = ref(false)
const refreshing = ref(false)
const hovered = ref(false)
const completingIds = reactive({})
const collapsed = reactive({})
const opacityValue = ref(1)
const accent = ref('#3b82f6')
const streak = ref(0)

let disposers = []

const sections = computed(() => {
  const all = [
    { key: 'overdue', name: '已逾期', color: '#dc2626', list: data.value.overdue || [] },
    { key: 'today', name: '今天到期', color: '#ea580c', list: data.value.today || [] },
    { key: 'week', name: '本周到期', color: '#3b82f6', list: data.value.week || [] }
  ]
  // 数量为 0 的段不展示；三段皆空时由空态引导兜底
  return all.filter((s) => s.list.length > 0)
})

const totalCount = computed(() =>
  (data.value.overdue?.length || 0) +
  (data.value.today?.length || 0) +
  (data.value.week?.length || 0)
)

const updatedAtText = computed(() => {
  if (!data.value.updatedAt) return '—'
  const d = new Date(data.value.updatedAt)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
})

function toggle(key) { collapsed[key] = !collapsed[key] }

async function refresh() {
  if (refreshing.value) return
  refreshing.value = true
  try {
    data.value = await window.electronAPI.getWidgetData()
    streak.value = await calcStreak()
  } catch (e) {
    console.error('[widget] 刷新失败:', e)
  } finally {
    setTimeout(() => { refreshing.value = false }, 600)
  }
}

// 计算连续打卡天数：从今天往前数，连续完成过至少1条的日期天数
async function calcStreak() {
  try {
    const todos = await window.electronAPI.getTodos({ filter: { completed: true } })
    if (!todos.length) return 0
    // 按 completed_at 去重每天
    const daySet = new Set()
    for (const t of todos) {
      if (t.completed_at) {
        const d = new Date(t.completed_at)
        daySet.add(`${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`)
      }
    }
    const days = Array.from(daySet).sort().reverse()
    let s = 0
    const today = new Date()
    for (let i = 0; i < 365; i++) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
      if (daySet.has(key)) {
        s++
      } else if (i > 0) {
        break // 中断：今天或昨天之后断了就不再连续
      }
    }
    return s
  } catch { return 0 }
}

async function complete(t) {
  if (completingIds[t.id] || t.completed) return
  completingIds[t.id] = true
  // 乐观更新：划线淡出 250ms 后从段中移除
  setTimeout(() => removeFromList(t.id), 250)
  try {
    await window.electronAPI.updateTodo(t.id, { completed: true })
    pushToast({ message: '已完成', type: 'success' })
  } catch (e) {
    delete completingIds[t.id]
    pushToast({ message: '操作失败', type: 'error' })
    await refresh()
  }
}

function removeFromList(id) {
  for (const k of ['overdue', 'today', 'week']) {
    const arr = data.value[k] || []
    const i = arr.findIndex((x) => x.id === id)
    if (i >= 0) { arr.splice(i, 1); break }
  }
  delete completingIds[id]
}

function onItemClick(t) {
  window.electronAPI.focusTodo(t.id)
}

function close() {
  window.electronAPI.widgetAction('close')
}

// ---------- 时间格式化 ----------
function formatRel(iso, section) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const diffMs = d.getTime() - now.getTime()
  const absMin = Math.abs(diffMs) / 60000
  const absHour = absMin / 60
  const absDay = absHour / 24

  if (section === 'overdue') {
    if (absDay >= 1) return `逾期 ${Math.floor(absDay)}天`
    if (absHour >= 1) return `逾期 ${Math.floor(absHour)}小时`
    return `逾期 ${Math.max(1, Math.floor(absMin))}分钟`
  }
  if (section === 'today') {
    if (absHour >= 1) return `${Math.floor(absHour)}小时后`
    if (absMin >= 5) return `${Math.floor(absMin)}分钟后`
    return '即将到期'
  }
  // 本周
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
  const dayDiff = Math.floor((d.getTime() - todayStart.getTime()) / 86400000)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const time = `${hh}:${mm}`
  if (dayDiff === 1) return `明天 ${time}`
  if (dayDiff === 2) return `后天 ${time}`
  const weekNames = ['日', '一', '二', '三', '四', '五', '六']
  return `周${weekNames[d.getDay()]} ${time}`
}

// ---------- 主题与初始化 ----------
function applyThemeFromSettings(s) {
  const root = document.documentElement
  let isDark = false
  if (s.theme === 'dark') isDark = true
  else if (s.theme === 'light') isDark = false
  else isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
  root.setAttribute('data-theme', isDark ? 'dark' : 'light')
  root.setAttribute('data-density', s.density || 'comfortable')
  const scale = s.fontScale === 'large' ? 1.12 : s.fontScale === 'xlarge' ? 1.24 : 1
  root.style.setProperty('--font-scale', scale)
}

onMounted(async () => {
  const settings = await loadSettings()
  applyThemeFromSettings(settings)
  if (settings.widget) {
    const op = Math.min(100, Math.max(60, Number(settings.widget.opacity) || 100))
    opacityValue.value = op / 100
  }

  await refresh()

  if (window.electronAPI.onTodosChanged) {
    disposers.push(window.electronAPI.onTodosChanged(() => refresh()))
  }
  if (window.electronAPI.onThemeChanged) {
    disposers.push(window.electronAPI.onThemeChanged((isDark) => {
      document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
    }))
  }
  // 设置变更（不透明度 / 主题等）时实时生效
  if (window.electronAPI.onWidgetSettingsChanged) {
    disposers.push(window.electronAPI.onWidgetSettingsChanged(async () => {
      const s = await loadSettings()
      applyThemeFromSettings(s)
      if (s.widget) {
        const op = Math.min(100, Math.max(60, Number(s.widget.opacity) || 100))
        opacityValue.value = op / 100
      }
    }))
  }
})

onBeforeUnmount(() => {
  disposers.forEach((d) => typeof d === 'function' && d())
  disposers = []
})
</script>

<style scoped>
.widget-root {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  border-radius: 14px;
  border: 1px solid var(--border-color);
  box-shadow: 0 12px 36px rgba(15, 23, 42, 0.22);
  overflow: hidden;
  transition: opacity 0.2s ease;
}

/* ---- 标题栏 ---- */
.w-head {
  height: 38px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  background: var(--header-bg, var(--bg-secondary));
  border-bottom: 1px solid var(--border-color);
  cursor: grab;
}
.w-head:active { cursor: grabbing }
.w-title { display: flex; align-items: center; gap: 7px }
.w-logo {
  width: 22px; height: 22px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 6px;
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  font-size: calc(12px * var(--font-scale));
  box-shadow: 0 2px 6px rgba(37, 99, 235, 0.32);
}
.w-name { font-size: calc(13px * var(--font-scale)); font-weight: 700; color: var(--text-primary) }
.w-badge {
  font-size: calc(11px * var(--font-scale)); font-weight: 600;
  padding: 1px 7px;
  border-radius: 10px;
  background: var(--accent-soft);
  color: var(--accent-color);
}
.w-ops { display: flex; gap: 4px }
.w-btn {
  width: 26px; height: 26px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--text-muted);
  font-size: calc(15px * var(--font-scale));
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.18s ease;
}
.w-btn:hover { background: var(--bg-hover); color: var(--text-primary); border-color: var(--border-color) }
.w-btn.spinning { animation: spin 0.6s linear }
@keyframes spin { to { transform: rotate(360deg) } }
.w-btn.close:hover { background: rgba(220, 38, 38, 0.1); color: #dc2626; border-color: rgba(220, 38, 38, 0.35) }

/* ---- 看板 ---- */
.w-body { flex: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 8px }

.w-section {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 11px;
  overflow: hidden;
  animation: rise 0.4s cubic-bezier(0.22, 1, 0.36, 1) both;
}
@keyframes rise { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }

.w-sec-head {
  display: flex; align-items: center; gap: 7px;
  padding: 8px 10px;
  cursor: pointer;
  user-select: none;
  transition: background 0.16s ease;
}
.w-sec-head:hover { background: var(--bg-hover) }
.w-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; box-shadow: 0 0 0 3px rgba(0,0,0,0.04) }
.w-sec-name { font-size: calc(12.5px * var(--font-scale)); font-weight: 600; color: var(--text-primary); flex: 1 }
.w-sec-count { font-size: calc(10.5px * var(--font-scale)); font-weight: 700; padding: 1px 7px; border-radius: 9px }
.w-fold { font-size: calc(11px * var(--font-scale)); color: var(--text-muted); transition: transform 0.2s ease }
.w-fold.open { transform: rotate(0) }
.w-fold:not(.open) { transform: rotate(-90deg) }

.w-list { display: flex; flex-direction: column }
.w-item {
  display: flex; align-items: center; gap: 9px;
  height: 34px;
  padding: 0 10px;
  cursor: pointer;
  position: relative;
  transition: background 0.16s ease;
}
.w-item:hover { background: var(--bg-hover) }
.w-item:hover::before { content: ''; position: absolute; left: 0; top: 6px; bottom: 6px; width: 2px; background: var(--w-accent, #3b82f6); border-radius: 0 2px 2px 0 }
.w-item.done { opacity: 0.4 }
.w-item.done .w-item-title { text-decoration: line-through; transition: opacity 0.25s ease }

.w-check { position: relative; display: flex; align-items: center; cursor: pointer; flex-shrink: 0 }
.w-check input { position: absolute; opacity: 0; width: 16px; height: 16px; cursor: pointer }
.w-check-box {
  width: 16px; height: 16px;
  border: 1.5px solid var(--border-color);
  border-radius: 50%;
  background: var(--bg-primary);
  transition: all 0.18s ease;
  display: flex; align-items: center; justify-content: center;
}
.w-check:hover .w-check-box { border-color: var(--accent-color) }
.w-check input:checked + .w-check-box {
  background: linear-gradient(135deg, #16a34a, #15803d);
  border-color: #16a34a;
}
.w-check input:checked + .w-check-box::after {
  content: '';
  width: 4px; height: 8px;
  border: solid #fff;
  border-width: 0 1.5px 1.5px 0;
  transform: rotate(45deg) translate(-1px, -1px);
}

.w-item-title {
  flex: 1; min-width: 0;
  font-size: calc(12.5px * var(--font-scale));
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.w-item-due { font-size: calc(11px * var(--font-scale)); font-weight: 600; flex-shrink: 0 }

.w-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 30px 20px;
  text-align: center;
}
.w-empty-icon { font-size: calc(32px * var(--font-scale)); margin-bottom: 4px; animation: float 2.6s ease-in-out infinite }
@keyframes float { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-5px) } }
.w-empty-title { font-size: calc(13px * var(--font-scale)); font-weight: 600; color: var(--text-primary); margin: 0 }
.w-empty-hint { font-size: calc(11px * var(--font-scale)); color: var(--text-muted); margin: 0 }

.w-loading { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 30px; color: var(--text-muted); font-size: calc(12px * var(--font-scale)) }
.w-spinner {
  width: 13px; height: 13px;
  border: 2px solid var(--border-color);
  border-top-color: var(--accent-color);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

/* ---- 连续打卡 ---- */
.w-streak {
  flex-shrink: 0;
  display: flex; align-items: center; gap: 6px;
  padding: 5px 12px;
  background: linear-gradient(90deg, rgba(249,115,22,0.12), rgba(234,179,8,0.10));
  border-bottom: 1px solid var(--border-color);
  font-size: calc(11.5px * var(--font-scale));
  color: var(--text-secondary);
}
.w-streak-fire { font-size: 14px }
.w-streak-text { font-weight: 600; color: #ea580c }

/* ---- 底部 ---- */
.w-foot {
  flex-shrink: 0;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-secondary);
  font-size: calc(10.5px * var(--font-scale));
  color: var(--text-muted);
}
</style>

<style>
/* 悬浮窗 body 透明，让窗口圆角生效 */
html, body { margin: 0; padding: 0; background: transparent !important; overflow: hidden }
#widget { width: 100vw; height: 100vh }

/* 悬浮窗是小尺寸挂件，Toast 需收紧尺寸并贴近底部（ToastHost 是独立 app，故用非 scoped 覆盖） */
#toast-root .toast-host { bottom: 14px; gap: 6px }
#toast-root .toast { min-width: 0; max-width: 92vw; padding: 7px 10px; border-radius: 10px }
</style>
