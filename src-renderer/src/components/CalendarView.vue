<template>
  <div class="cal">
    <div class="cal-header">
      <button class="cal-nav" @click="prevMonth">‹</button>
      <span class="cal-title">{{ year }}年{{ month }}月</span>
      <button class="cal-nav" @click="nextMonth">›</button>
      <button v-if="month !== todayMonth || year !== todayYear" class="cal-today-btn" @click="goToday">今天</button>
    </div>

    <div class="cal-weekdays">
      <span v-for="d in weekDays" :key="d" class="cal-wd">{{ d }}</span>
    </div>

    <div class="cal-grid">
      <div
        v-for="cell in calendarCells"
        :key="cell.key"
        :class="['cal-cell', {
          today: cell.isToday,
          currentMonth: cell.isCurrentMonth,
          hasTodos: cell.todos.length > 0,
          hasOverdue: cell.hasOverdue
        }]"
        @click="cell.isCurrentMonth && onDayClick(cell.dateStr)"
      >
        <span class="cal-day-num">{{ cell.day }}</span>
        <div v-if="cell.todos.length > 0" class="cal-day-badges">
          <span
            v-for="t in cell.todos.slice(0, 3)"
            :key="t.id"
            :class="['cal-dot', t.completed ? 'cal-dot-done' : (isOverdue(t.deadline) ? 'cal-dot-overdue' : 'cal-dot-pending')]"
            :title="t.title"
          ></span>
          <span v-if="cell.todos.length > 3" class="cal-more">+{{ cell.todos.length - 3 }}</span>
        </div>
        <div v-if="cell.hasOverdue" class="cal-overdue-marker">⚠</div>
      </div>
    </div>

    <!-- 月度统计条 -->
    <div class="cal-month-stats">
      <span>本月 {{ monthStats.total }} 条待办</span>
      <span>完成 {{ monthStats.completed }}</span>
      <span class="cal-rate">完成率 {{ monthStats.rate }}%</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { pushToast } from '../composables/useToast'

const props = defineProps({
  todos: { type: Array, default: () => [] }
})
const emit = defineEmits(['day-click'])

const today = new Date()
const todayYear = today.getFullYear()
const todayMonth = today.getMonth() + 1

let currentYear = todayYear
let currentMonth = todayMonth

const weekDays = ['日', '一', '二', '三', '四', '五', '六']

const calendarCells = computed(() => {
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate()
  const firstDay = new Date(currentYear, currentMonth - 1, 1).getDay() // 0=Sun

  // 填充上月末尾
  const prevMonthDays = new Date(currentYear, currentMonth - 1, 0).getDate()
  const cells = []
  for (let i = firstDay - 1; i >= 0; i--) {
    const day = prevMonthDays - i
    cells.push({ day, isCurrentMonth: false, dateStr: formatDateStr(currentYear, currentMonth - 1, day), todos: [], isToday: false, hasOverdue: false })
  }

  // 本月
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = formatDateStr(currentYear, currentMonth, d)
    const dayTodos = props.todos.filter(t => {
      if (!t.deadline) return false
      try {
        const td = new Date(t.deadline)
        return td.getFullYear() === currentYear && td.getMonth() + 1 === currentMonth && td.getDate() === d
      } catch { return false }
    })
    const hasOverdue = dayTodos.some(t => !t.completed && isOverdue(t.deadline))
    cells.push({
      day, isCurrentMonth: true, dateStr,
      todos: dayTodos,
      isToday: currentYear === todayYear && currentMonth === todayMonth && d === today.getDate(),
      hasOverdue
    })
  }

  // 下月填充至 42 格（6 行）
  const remaining = 42 - cells.length
  for (let d = 1; d <= remaining; d++) {
    cells.push({ day: d, isCurrentMonth: false, dateStr: formatDateStr(currentYear, currentMonth + 1, d), todos: [], isToday: false, hasOverdue: false })
  }
  return cells
})

const monthStats = computed(() => {
  const total = props.todos.filter(t => {
    if (!t.deadline) return false
    try {
      const d = new Date(t.deadline)
      return d.getFullYear() === currentYear && d.getMonth() + 1 === currentMonth
    } catch { return false }
  }).length
  const completed = props.todos.filter(t => {
    if (!t.completed || !t.completed_at) return false
    try {
      const d = new Date(t.completed_at)
      return d.getFullYear() === currentYear && d.getMonth() + 1 === currentMonth
    } catch { return false }
  }).length
  return { total, completed, rate: total > 0 ? Math.round((completed / total) * 100) : 0 }
})

function prevMonth() {
  currentMonth--
  if (currentMonth < 1) { currentMonth = 12; currentYear-- }
}
function nextMonth() {
  currentMonth++
  if (currentMonth > 12) { currentMonth = 1; currentYear++ }
}
function goToday() {
  currentYear = todayYear
  currentMonth = todayMonth
}
function onDayClick(dateStr) {
  emit('day-click', dateStr)
}
function isOverdue(d) { return !!d && new Date(d) < new Date() }
function formatDateStr(y, m, d) {
  if (m < 1) { y--; m = 12 }
  if (m > 12) { y++; m = 1 }
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

onMounted(() => {
  currentYear = todayYear
  currentMonth = todayMonth
})
</script>

<style scoped>
.cal { display: flex; flex-direction: column; gap: 12px; height: 100%; padding: 4px }

.cal-header { display: flex; align-items: center; gap: 10px }
.cal-nav {
  width: 30px; height: 30px; border: 1px solid var(--border-color); border-radius: 8px;
  background: var(--bg-secondary); color: var(--text-secondary); font-size: 18px;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: all 0.15s ease;
}
.cal-nav:hover { border-color: var(--accent-color); color: var(--accent-color) }
.cal-title { font-size: 15px; font-weight: 600; color: var(--text-primary); flex: 1; text-align: center }
.cal-today-btn {
  padding: 4px 12px; border: 1px solid var(--border-color); border-radius: 8px;
  background: var(--bg-secondary); color: var(--text-secondary); font-size: 12px;
  cursor: pointer; transition: all 0.15s ease;
}
.cal-today-btn:hover { border-color: var(--accent-color); color: var(--accent-color) }

.cal-weekdays { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px }
.cal-wd { text-align: center; font-size: 11px; color: var(--text-muted); padding: 4px 0; font-weight: 600 }

.cal-grid {
  display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px;
  flex: 1; align-content: start;
}
.cal-cell {
  aspect-ratio: 1 / 1.1; border: 1px solid var(--border-color); border-radius: 8px;
  padding: 4px 5px; cursor: pointer; transition: all 0.15s ease;
  display: flex; flex-direction: column; gap: 2px; position: relative;
  background: var(--bg-secondary);
}
.cal-cell:hover { border-color: var(--accent-color); background: var(--accent-soft) }
.cal-cell.today { border-color: var(--accent-color); background: var(--accent-soft) }
.cal-cell.current-month { cursor: pointer }
.cal-cell:not(.current-month) { opacity: 0.35; cursor: default }
.cal-cell.has-overdue::after {
  content: ''; position: absolute; top: 3px; right: 3px;
  width: 6px; height: 6px; border-radius: 50%; background: #dc2626;
}
.cal-day-num { font-size: 11px; font-weight: 600; color: var(--text-secondary) }
.cal-cell.today .cal-day-num { color: var(--accent-color); font-weight: 700 }

.cal-day-badges { display: flex; gap: 2px; flex-wrap: wrap; align-items: center }
.cal-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0 }
.cal-dot-done { background: #16a34a }
.cal-dot-overdue { background: #dc2626 }
.cal-dot-pending { background: #3b82f6 }
.cal-more { font-size: 9px; color: var(--text-muted) }
.cal-overdue-marker { position: absolute; bottom: 2px; right: 3px; font-size: 9px }

.cal-month-stats {
  display: flex; gap: 12px; padding: 8px 12px; border-radius: 8px;
  background: var(--bg-secondary); border: 1px solid var(--border-color);
  font-size: 11.5px; color: var(--text-muted);
}
.cal-rate { color: var(--accent-color); font-weight: 600; margin-left: auto }
</style>
