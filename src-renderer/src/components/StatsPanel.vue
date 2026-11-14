<template>
  <div class="stats-panel">
    <header class="stats-head">
      <button class="back-btn" @click="$emit('back')">← 返回列表</button>
      <h2>📊 数据统计</h2>
    </header>

    <div v-if="loading" class="loading">加载中…</div>

    <div v-else class="stats-body">
      <!-- 指标卡 -->
      <div class="metric-grid">
        <div v-for="(m, i) in metrics" :key="m.label" class="metric-card" :style="{ animationDelay: i * 60 + 'ms' }">
          <span class="metric-icon" :style="{ background: m.soft }">{{ m.icon }}</span>
          <div class="metric-main">
            <span class="metric-value" :style="{ color: m.color }">{{ m.value }}</span>
            <span class="metric-label">{{ m.label }}</span>
          </div>
        </div>
      </div>

      <!-- 快捷跳转 -->
      <div class="quick-jumps">
        <button class="qj" @click="$emit('goto', 'view-overdue')">⚠️ 逾期 {{ stats.overdue }} 项</button>
        <button class="qj" @click="$emit('goto', 'view-today')">📅 今天</button>
        <button class="qj" @click="$emit('goto', 'view-week')">📆 本周</button>
        <button class="qj" @click="$emit('goto', 'view-pending')">⏳ 待完成</button>
      </div>

      <!-- 趋势 -->
      <section class="card" style="animation-delay: 240ms">
        <h3>近 7 天趋势</h3>
        <div class="legend">
          <span><i style="background: #3b82f6"></i>新增</span>
          <span><i style="background: #16a34a"></i>完成</span>
        </div>
        <div class="chart-box">
          <svg :viewBox="`0 0 ${W} ${H}`" class="chart" preserveAspectRatio="none">
            <defs>
              <linearGradient id="areaCreated" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.32" />
                <stop offset="100%" stop-color="#3b82f6" stop-opacity="0" />
              </linearGradient>
            </defs>
            <line v-for="g in 4" :key="g"
              :x1="0" :x2="W"
              :y1="(H / 4) * (g - 1)" :y2="(H / 4) * (g - 1)"
              stroke="var(--border-color)" stroke-width="1" />
            <path v-if="areaPath" :d="areaPath" fill="url(#areaCreated)" />
            <path v-if="createdPath" :d="createdPath" fill="none" stroke="#3b82f6" stroke-width="2.2"
              stroke-linecap="round" stroke-linejoin="round" />
            <path v-if="donePath" :d="donePath" fill="none" stroke="#16a34a" stroke-width="2.2"
              stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="4 3" />
            <g v-for="(p, i) in createdPoints" :key="'c' + i">
              <circle :cx="p.x" :cy="p.y" r="3.4" fill="#3b82f6" stroke="var(--bg-primary)" stroke-width="1.6"
                @mouseenter="hover = { i, type: 'created' }" @mouseleave="hover = null" />
            </g>
            <g v-for="(p, i) in donePoints" :key="'d' + i">
              <circle :cx="p.x" :cy="p.y" r="3" fill="#16a34a" stroke="var(--bg-primary)" stroke-width="1.6"
                @mouseenter="hover = { i, type: 'completed' }" @mouseleave="hover = null" />
            </g>
          </svg>
          <div v-if="hover" class="tooltip" :style="tooltipStyle">
            {{ trend[hover.i].date }} · {{ hover.type === 'created' ? '新增' : '完成' }}
            <b>{{ hover.type === 'created' ? trend[hover.i].created : trend[hover.i].completed }}</b>
          </div>
          <div class="x-axis">
            <span v-for="d in trend" :key="d.date">{{ d.date }}</span>
          </div>
        </div>
      </section>

      <div class="two-col">
        <!-- 优先级分布 -->
        <section class="card" style="animation-delay: 320ms">
          <h3>优先级分布</h3>
          <div class="bar-list">
            <div v-for="p in priorityRows" :key="p.key" class="bar-row">
              <span class="bar-label">{{ p.label }}</span>
              <span class="bar-track">
                <span class="bar-fill" :style="{ width: p.percent + '%', background: p.color }"></span>
              </span>
              <span class="bar-value">{{ p.count }}</span>
            </div>
          </div>
        </section>

        <!-- 分类分布 -->
        <section class="card" style="animation-delay: 380ms">
          <h3>分类分布</h3>
          <div class="donut-wrap">
            <svg viewBox="0 0 120 120" class="donut">
              <circle cx="60" cy="60" r="46" fill="none" stroke="var(--border-color)" stroke-width="16" />
              <circle v-for="s in donutSegments" :key="s.name"
                cx="60" cy="60" r="46" fill="none"
                :stroke="s.color" stroke-width="16"
                :stroke-dasharray="`${s.len} ${circumference - s.len}`"
                :stroke-dashoffset="-s.offset"
                stroke-linecap="butt"
                transform="rotate(-90 60 60)" />
              <text x="60" y="56" text-anchor="middle" class="donut-num">{{ stats.total }}</text>
              <text x="60" y="72" text-anchor="middle" class="donut-cap">总待办</text>
            </svg>
            <ul class="donut-legend">
              <li v-for="s in donutSegments" :key="s.name">
                <i :style="{ background: s.color }"></i>
                <span>{{ s.name }}</span>
                <b>{{ s.count }}</b>
              </li>
            </ul>
          </div>
        </section>
      </div>

      <!-- 导出按钮 -->
      <div class="export-section">
        <button class="btn-export" @click="exportCSV">📤 导出 CSV</button>
        <p class="export-note">CSV 将保存至桌面</p>
      </div>

      <!-- 逾期预警卡片 -->
      <div v-if="overdueWarn.length > 0" class="warn-card">
        <div class="warn-header">
          <span class="warn-icon">⚠️</span>
          <span class="warn-title">逾期预警</span>
          <span class="warn-count">{{ stats.overdue }} 项逾期</span>
        </div>
        <div class="warn-list">
          <div v-for="t in overdueWarn" :key="t.id" class="warn-item" @click="$emit('goto', `view:${t.id}`)">
            <span class="warn-days" :style="{ color: t.days >= 7 ? 'var(--danger)' : t.days >= 3 ? 'var(--warning)' : '#eab308' }">
              {{ t.days >= 7 ? '🔴' : t.days >= 3 ? '🟠' : '🟡' }} +{{ t.days }}天
            </span>
            <span class="warn-text">{{ t.title }}</span>
          </div>
        </div>
        <button class="warn-more" @click="$emit('goto', 'view-overdue')">查看全部逾期 →</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

defineEmits(['back', 'goto'])

const W = 560
const H = 150
const circumference = 2 * Math.PI * 46

const loading = ref(true)
const stats = ref({ total: 0, completed: 0, pending: 0, overdue: 0, completionRate: 0, trend: [], priority: { high: 0, medium: 0, low: 0 }, categories: [], uncategorized: 0 })
const hover = ref(null)
const overdueWarn = ref([])

onMounted(async () => {
  try {
    const [s, todos] = await Promise.all([
      window.electronAPI.getStats(),
      window.electronAPI.getTodos({ filter: { completed: false } })
    ])
    stats.value = s || {}
    // 逾期预警：逾期天数最多的3条
    const now = new Date().toISOString()
    overdueWarn.value = (todos || [])
      .filter(t => t.deadline && t.deadline < now)
      .map(t => ({
        ...t,
        days: Math.floor((new Date(now) - new Date(t.deadline)) / 86400000)
      }))
      .sort((a, b) => b.days - a.days)
      .slice(0, 3)
  } catch (e) {
    console.error('[StatsPanel] 加载统计失败:', e.message)
  } finally {
    loading.value = false
  }
})

const metrics = computed(() => [
  { label: '总待办', value: stats.value.total, icon: '📋', color: '#3b82f6', soft: 'rgba(59,130,246,0.14)' },
  { label: '已完成', value: stats.value.completed, icon: '✅', color: '#16a34a', soft: 'rgba(22,163,74,0.14)' },
  { label: '完成率', value: stats.value.completionRate + '%', icon: '📈', color: '#eab308', soft: 'rgba(234,179,8,0.16)' },
  { label: '已逾期', value: stats.value.overdue, icon: '⚠️', color: '#dc2626', soft: 'rgba(220,38,38,0.14)' }
])

const trend = computed(() => stats.value.trend || [])

function scaleY(value, max) {
  if (!max) return H - 8
  return H - 8 - (value / max) * (H - 24)
}
function scaleX(i, len) {
  if (len <= 1) return W / 2
  return 12 + (i * (W - 24)) / (len - 1)
}

const maxTrend = computed(() => {
  const m = Math.max(...trend.value.map(d => Math.max(d.created, d.completed)), 1)
  return m
})

const createdPoints = computed(() =>
  trend.value.map((d, i) => ({ x: scaleX(i, trend.value.length), y: scaleY(d.created, maxTrend.value) }))
)
const donePoints = computed(() =>
  trend.value.map((d, i) => ({ x: scaleX(i, trend.value.length), y: scaleY(d.completed, maxTrend.value) }))
)

function toPath(points) {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
}

const createdPath = computed(() => (createdPoints.value.length ? toPath(createdPoints.value) : ''))
const donePath = computed(() => (donePoints.value.length ? toPath(donePoints.value) : ''))
const areaPath = computed(() => {
  const pts = createdPoints.value
  if (!pts.length) return ''
  return `${toPath(pts)} L${pts[pts.length - 1].x.toFixed(1)},${H} L${pts[0].x.toFixed(1)},${H} Z`
})

const tooltipStyle = computed(() => {
  if (!hover.value) return {}
  const p = hover.value.type === 'created'
    ? createdPoints.value[hover.value.i]
    : donePoints.value[hover.value.i]
  if (!p) return {}
  return { left: `calc(${(p.x / W) * 100}% - 44px)`, top: `${(p.y / H) * 100}%` }
})

const priorityRows = computed(() => {
  const p = stats.value.priority || { high: 0, medium: 0, low: 0 }
  const total = Math.max(p.high + p.medium + p.low, 1)
  return [
    { key: 'high', label: '高', count: p.high, color: 'linear-gradient(90deg,#ef4444,#dc2626)', percent: (p.high / total) * 100 },
    { key: 'medium', label: '中', count: p.medium, color: 'linear-gradient(90deg,#f97316,#ea580c)', percent: (p.medium / total) * 100 },
    { key: 'low', label: '低', count: p.low, color: 'linear-gradient(90deg,#22c55e,#16a34a)', percent: (p.low / total) * 100 }
  ]
})

const donutSegments = computed(() => {
  const cats = (stats.value.categories || []).map(c => ({ name: c.name, color: c.color, count: c.count || 0 }))
  if (stats.value.uncategorized) cats.push({ name: '未分类', color: '#94a3b8', count: stats.value.uncategorized })
  const total = cats.reduce((s, c) => s + c.count, 0)
  if (!total) return []
  let offset = 0
  return cats.filter(c => c.count > 0).map(c => {
    const len = (c.count / total) * circumference
    const seg = { ...c, len, offset }
    offset += len
    return seg
  })
})

function exportCSV() {
  window.electronAPI.exportCsv().then(buf => {
    window.electronAPI.saveFile('', buf, 'TodoPulse-统计-' + new Date().toISOString().slice(0, 10) + '.csv')
      .then(path => pushToast({ message: `已导出：${path}`, type: 'success' }))
      .catch(e => pushToast({ message: '导出失败：' + (e?.message || '未知错误'), type: 'error' }))
  }).catch(e => pushToast({ message: '导出失败：' + (e?.message || '未知错误'), type: 'error' }))
}
</script>

<style scoped>
.stats-panel { display: flex; flex-direction: column; gap: 14px; height: 100%; overflow: hidden }
.stats-head { display: flex; align-items: center; gap: 14px }
.back-btn {
  padding: 6px 14px; border: 1px solid var(--border-color); border-radius: 9px;
  background: var(--bg-secondary); color: var(--text-secondary);
  font-size: calc(12.5px * var(--font-scale)); cursor: pointer; transition: all 0.18s ease;
}
.back-btn:hover { border-color: var(--accent-color); color: var(--accent-color); transform: translateX(-2px) }
.stats-head h2 { margin: 0; font-size: calc(17px * var(--font-scale)); color: var(--text-primary) }
.loading { padding: 40px; text-align: center; color: var(--text-muted); font-size: calc(13px * var(--font-scale)) }

.stats-body { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; padding-right: 4px }

.metric-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px }
.metric-card {
  display: flex; align-items: center; gap: 12px; padding: 14px 16px;
  background: var(--bg-secondary); border: 1px solid var(--border-color);
  border-radius: 14px; animation: rise 0.4s cubic-bezier(0.22, 1, 0.36, 1) both;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.metric-card:hover { transform: translateY(-2px); box-shadow: 0 6px 18px var(--shadow-color) }
@keyframes rise { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: none } }
.metric-icon { width: 38px; height: 38px; border-radius: 11px; display: flex; align-items: center; justify-content: center; font-size: calc(17px * var(--font-scale)); flex-shrink: 0 }
.metric-main { display: flex; flex-direction: column; min-width: 0 }
.metric-value { font-size: calc(21px * var(--font-scale)); font-weight: 700; line-height: 1.2 }
.metric-label { font-size: calc(11.5px * var(--font-scale)); color: var(--text-muted) }

/* 快捷跳转 */
.quick-jumps { display: flex; gap: 8px; flex-wrap: wrap }
.qj {
  padding: 5px 12px; border-radius: 8px; border: 1px solid var(--border-color);
  background: var(--bg-secondary); color: var(--text-secondary);
  font-size: calc(12px * var(--font-scale)); cursor: pointer; transition: all 0.15s ease;
  white-space: nowrap;
}
.qj:hover { border-color: var(--accent-color); color: var(--accent-color); background: var(--accent-soft) }

.card {
  background: var(--bg-secondary); border: 1px solid var(--border-color);
  border-radius: 14px; padding: 14px 16px 16px; animation: rise 0.4s cubic-bezier(0.22, 1, 0.36, 1) both;
}
.card h3 { margin: 0 0 10px; font-size: calc(13.5px * var(--font-scale)); font-weight: 600; color: var(--text-secondary) }
.legend { display: flex; gap: 14px; font-size: calc(11.5px * var(--font-scale)); color: var(--text-muted); margin-bottom: 6px }
.legend i { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 4px }

.chart-box { position: relative }
.chart { width: 100%; height: 150px; display: block; overflow: visible }
.chart circle { cursor: pointer; transition: r 0.15s ease }
.chart circle:hover { r: 5 }
.tooltip {
  position: absolute; transform: translateY(-130%); padding: 4px 9px; border-radius: 7px;
  background: rgba(15, 23, 42, 0.9); color: #f8fafc; font-size: calc(11.5px * var(--font-scale));
  white-space: nowrap; pointer-events: none;
}
.tooltip b { color: #fbbf24 }
.x-axis { display: flex; justify-content: space-between; font-size: calc(10.5px * var(--font-scale)); color: var(--text-muted); margin-top: 4px }

.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px }
.bar-list { display: flex; flex-direction: column; gap: 10px }
.bar-row { display: flex; align-items: center; gap: 10px; font-size: calc(12.5px * var(--font-scale)) }
.bar-label { width: 20px; color: var(--text-secondary) }
.bar-track { flex: 1; height: 8px; border-radius: 4px; background: var(--bg-primary); overflow: hidden }
.bar-fill { display: block; height: 100%; border-radius: 4px; transition: width 0.6s cubic-bezier(0.22, 1, 0.36, 1) }
.bar-value { width: 26px; text-align: right; color: var(--text-muted) }

.donut-wrap { display: flex; align-items: center; gap: 14px }
.donut { width: 118px; height: 118px; flex-shrink: 0 }
.donut circle { transition: stroke-dasharray 0.6s ease }
.donut-num { fill: var(--text-primary); font-size: calc(20px * var(--font-scale)); font-weight: 700 }
.donut-cap { fill: var(--text-muted); font-size: calc(10px * var(--font-scale)) }
.donut-legend { list-style: none; display: flex; flex-direction: column; gap: 5px; flex: 1; min-width: 0 }
.donut-legend li { display: flex; align-items: center; gap: 6px; font-size: calc(12px * var(--font-scale)); color: var(--text-secondary) }
.donut-legend i { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0 }
.donut-legend span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.donut-legend b { color: var(--text-primary) }

.export-section { display: flex; align-items: center; gap: 10px; padding: 4px 0 }
.btn-export {
  padding: 7px 16px; border: 1px solid var(--border-color); border-radius: 9px;
  background: var(--bg-secondary); color: var(--text-secondary);
  font-size: calc(12.5px * var(--font-scale)); cursor: pointer; transition: all 0.18s ease;
}
.btn-export:hover { border-color: var(--accent-color); color: var(--accent-color) }
.export-note { font-size: calc(11.5px * var(--font-scale)); color: var(--text-muted); margin: 0 }

/* 逾期预警 */
.warn-card {
  background: var(--bg-secondary); border: 1px solid var(--border-color);
  border-radius: 14px; padding: 18px;
}
.warn-header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px }
.warn-icon { font-size: 18px }
.warn-title { font-size: 13px; font-weight: 600; color: var(--text-primary) }
.warn-count {
  margin-left: auto; font-size: 11px; padding: 2px 8px; border-radius: 10px;
  background: rgba(220, 38, 38, 0.15); color: var(--danger);
}
.warn-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px }
.warn-item {
  display: flex; align-items: center; gap: 8px; padding: 7px 10px;
  background: var(--bg-primary); border: 1px solid var(--border-color);
  border-radius: 8px; cursor: pointer; transition: border-color 0.15s ease;
}
.warn-item:hover { border-color: var(--warning) }
.warn-days { font-size: 11px; font-weight: 600; white-space: nowrap; min-width: 58px }
.warn-text { flex: 1; font-size: 12.5px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.warn-more {
  width: 100%; padding: 7px; border: 1px dashed var(--border-color); border-radius: 8px;
  background: transparent; color: var(--text-muted); font-size: 12px; cursor: pointer; transition: all 0.15s ease;
}
.warn-more:hover { border-color: var(--accent-color); color: var(--accent-color) }

@media (max-width: 1000px) {
  .metric-grid { grid-template-columns: repeat(2, 1fr) }
  .two-col { grid-template-columns: 1fr }
}
</style>
