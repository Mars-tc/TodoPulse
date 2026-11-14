<template>
  <div class="app">
    <!-- ============ 顶栏 ============ -->
    <header class="app-header">
      <div class="brand">
        <span class="brand-logo">📋</span>
        <div class="brand-text">
          <h1>TodoPulse</h1>
          <span class="brand-sub">待办工作台</span>
        </div>
      </div>

      <SearchSortBar
        :keyword="keyword"
        :sort-by="sortBy"
        :order="order"
        @update:keyword="onKeyword"
        @sort="setSort"
      />

      <div class="header-actions">
        <button class="icon-btn" title="数据统计" @click="currentView = 'stats'">📊</button>
        <button class="icon-btn" title="智能规划" @click="currentView = 'planning'">🧭</button>
        <button class="icon-btn" title="模板库" @click="currentView = 'templates'">🧰</button>
        <button class="icon-btn" title="回收站" @click="currentView = 'trash'">🗑️</button>
        <button class="icon-btn" title="网页脚本" @click="currentView = 'scripts'">🧩</button>
        <button class="icon-btn" title="设置" @click="currentView = 'settings'">⚙️</button>
        <button class="icon-btn" :title="actualDark ? '切换浅色' : '切换深色'" @click="toggleTheme">
          {{ actualDark ? '☀️' : '🌙' }}
        </button>
        <button class="icon-btn" title="浏览器扩展指南" @click="openExtensionGuide">🔌</button>
        <button class="icon-btn" title="全局搜索 (Ctrl+K)" @click="triggerSearch">🔍</button>
      </div>
    </header>

    <div class="app-body">
      <!-- ============ 侧边栏 ============ -->
      <CategorySidebar
        :view="view"
        :category-id="categoryId"
        :uncategorized-count="uncategorizedCount"
        @select="setCategory"
        @view="setView"
        @show-stats="currentView = 'stats'"
        @manage-trash="currentView = 'trash'"
        @manage-scripts="currentView = 'scripts'"
        @manage-templates="currentView = 'templates'"
        @manage-planning="currentView = 'planning'"
      />

      <!-- ============ 主内容 ============ -->
      <main class="app-main">
        <!-- 统计视图 -->
        <StatsPanel v-if="currentView === 'stats'" @back="currentView = 'list'" @goto="handleStatsGoto" />

        <!-- 网页脚本视图 -->
        <ScriptManager
          v-else-if="currentView === 'scripts'"
          @back="currentView = 'list'"
        />

        <!-- 设置视图 -->
        <SettingsPanel
          v-else-if="currentView === 'settings'"
          @back="currentView = 'list'"
          @refresh="loadTodos"
        />

        <!-- 回收站视图 -->
        <TrashView
          v-else-if="currentView === 'trash'"
          @back="currentView = 'list'"
          @changed="loadTodos"
        />

        <!-- 智能规划视图 -->
        <PlanningView
          v-else-if="currentView === 'planning'"
          @back="currentView = 'list'"
        />

        <!-- 模板库视图 -->
        <TemplateManager
          v-else-if="currentView === 'templates'"
          @back="currentView = 'list'"
        />

        <!-- 待办列表视图 -->
        <template v-else>
          <!-- 视图切换器 -->
          <div class="view-switcher">
            <div class="view-tabs">
              <span class="vt-slider" :style="vtSliderStyle"></span>
              <button :class="['vt-btn', { active: currentListView === 'list' }]" @click="currentListView = 'list'">📋 列表</button>
              <button :class="['vt-btn', { active: currentListView === 'kanban' }]" @click="currentListView = 'kanban'">📊 看板</button>
              <button :class="['vt-btn', { active: currentListView === 'calendar' }]" @click="currentListView = 'calendar'">📅 日历</button>
            </div>
          </div>

          <div v-if="currentListView === 'kanban'">
            <KanbanView
              :todos="todos"
              :categories="categories"
            />
          </div>

          <div v-else-if="currentListView === 'calendar'">
            <CalendarView
              :todos="todos"
              @day-click="onCalendarDayClick"
            />
          </div>

          <template v-else>
            <div class="filter-bar">
              <div class="tabs">
                <span class="tab-slider" :style="tabSliderStyle"></span>
                <button
                  v-for="t in tabs"
                  :key="t.key"
                  :class="['tab-btn', { active: filter === t.key }]"
                  @click="setFilter(t.key)"
                >{{ t.label }}（{{ t.count }}）</button>
              </div>

              <div class="filter-actions">
                <button v-if="selectedIds.length" class="btn danger" @click="batchDelete">
                  删除已选（{{ selectedIds.length }}）
                </button>
                <button v-if="stats.completed > 0" class="btn ghost" @click="clearCompleted">
                  🧹 清除已完成
                </button>
                <button class="btn ghost" title="导入 JSON 备份" @click="handleImport">📥 导入</button>
                <button class="btn ghost" title="导出备份 / CSV" @click="handleExport">📤 导出</button>
              </div>
            </div>

            <div class="list-container">
              <div v-if="loading" class="loading-state">
                <span class="spinner"></span> 加载中…
              </div>

              <TodoList
                v-else
                :todos="todos"
                :selected-ids="selectedIds"
                :keyword="keyword"
                @toggle="toggleTodo"
                @delete="removeOne"
                @edit="openEditModal"
                @select="toggleSelect"
                @remind="openRemindModal"
              />

              <div v-if="!loading && todos.length === 0" class="empty-state">
                <div class="empty-icon">{{ keyword ? '🔍' : '📭' }}</div>
                <p class="empty-text">{{ keyword ? '没有匹配的待办' : '暂无待办事项' }}</p>
                <p class="empty-hint">
                  {{ keyword ? '试试更换关键词或清空搜索' : '使用浏览器扩展收藏网页，或点击下方按钮新建' }}
                </p>
                <button v-if="keyword" class="btn ghost" @click="onKeyword('')">清空搜索</button>
              </div>
            </div>
          </template>
        </template>
      </main>
    </div>

    <!-- ============ 底部状态栏 ============ -->
    <footer class="status-bar">
      <div class="status-left">
        <span>共 <b>{{ stats.all }}</b> 条</span>
        <span class="sep">·</span>
        <span>今日 <b>{{ stats.today }}</b></span>
        <span class="sep">·</span>
        <span :class="{ warn: stats.overdue > 0 }">逾期 <b>{{ stats.overdue }}</b></span>
      </div>
      <div class="status-right">
        <span :class="['dot', serverOk ? 'ok' : 'off']"></span>
        <span>本地服务 {{ serverOk ? ':' + serverPort : '未连接' }}</span>
      </div>
    </footer>

    <!-- ============ 悬浮新建 ============ -->
    <button class="add-btn" title="新建待办" @click="openAddModal">
      <span class="add-icon">＋</span>
      <span class="add-text">新建待办</span>
    </button>

    <!-- ============ 弹窗 ============ -->
    <AddEditModal
      v-if="modalVisible"
      :todo="editingTodo"
      :is-edit="!!editingTodo"
      :focus-remind="focusRemind"
      @close="closeModal"
      @save="handleSave"
    />

    <div v-if="extensionGuideOpen" class="modal-overlay" @click.self="extensionGuideOpen = false">
      <div class="guide-modal">
        <h3>🧩 浏览器扩展使用指南</h3>
        <p>扩展目录：<code>{{ extensionPath || '等待加载…' }}</code></p>
        <ol>
          <li>打开 Chromium 系浏览器（Chrome / Edge / 360 等）</li>
          <li>地址栏输入 <code>chrome://extensions</code></li>
          <li>开启「开发者模式」</li>
          <li>点击「加载已解压的扩展程序」并选择上方目录</li>
          <li>点击扩展图标，在弹窗中填写并测试端口 / Token</li>
        </ol>
        <div class="config-box">
          <div><span>端口</span><code>{{ serverPort || '-' }}</code></div>
          <div><span>Token</span><code class="token">{{ serverToken || '-' }}</code></div>
        </div>
        <p class="guide-tip">
          💡 加载成功后，任意网页右下角出现【加入待办】悬浮按钮，可编辑后再收藏。<br />
          🔄 升级应用后请在 <code>chrome://extensions</code> 点击扩展的刷新按钮重新加载，否则自定义 JS 脚本不可用。
        </p>
        <div class="guide-actions">
          <button class="btn primary" @click="openExtensionDir">打开扩展目录</button>
          <button class="btn ghost" @click="extensionGuideOpen = false">关闭</button>
        </div>
      </div>
    </div>

    <!-- 全局搜索面板 -->
    <GlobalSearch
      :todos="todos"
      :categories="categories"
      @goto="handleStatsGoto"
    />

    <!-- 快速添加栏 -->
    <QuickAddBar @saved="loadTodos" @close="quickAddOpen = false" />

    <!-- 批量操作浮栏 -->
    <BatchBar
      v-if="!['kanban', 'calendar'].includes(currentListView)"
      :selected-ids="selectedIds"
      :categories="categories"
      @clear="selectedIds = []"
      @batch-complete="batchComplete"
      @batch-priority="batchPriority"
      @batch-category="batchCategory"
      @batch-delete="batchDelete"
    />

    <!-- 完成动画 -->
    <CompletionAnim />

    <!-- 模板快速选择面板（Ctrl+Shift+T） -->
    <TemplatePicker
      :open="templatePickerOpen"
      @close="templatePickerOpen = false"
      @generated="loadTodos"
    />

    <ToastHost />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import TodoList from './components/TodoList.vue'
import AddEditModal from './components/AddEditModal.vue'
import CategorySidebar from './components/CategorySidebar.vue'
import SearchSortBar from './components/SearchSortBar.vue'
import StatsPanel from './components/StatsPanel.vue'
import TrashView from './components/TrashView.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import ScriptManager from './components/ScriptManager.vue'
import GlobalSearch from './components/GlobalSearch.vue'
import QuickAddBar from './components/QuickAddBar.vue'
import BatchBar from './components/BatchBar.vue'
import KanbanView from './components/KanbanView.vue'
import CalendarView from './components/CalendarView.vue'
import CompletionAnim from './components/CompletionAnim.vue'
import ToastHost from './components/ToastHost.vue'
import TemplateManager from './components/TemplateManager.vue'
import TemplatePicker from './components/TemplatePicker.vue'
import PlanningView from './components/PlanningView.vue'
import { useTodos } from './composables/useTodos'
import { useCategories } from './composables/useCategories'
import { useTheme } from './composables/useTheme'
import { loadSettings, updateSettings } from './composables/useSettings'
import { extensionGuideOpen, openExtensionGuide } from './composables/useUi'
import { pushToast } from './composables/useToast'
import { registerKeyboardShortcuts, searchOpen, quickAddOpen, templatePickerOpen } from './composables/useKeyboardShortcuts'

const {
  todos, loading, filter, keyword, categoryId, view, sortBy, order, stats,
  loadTodos, toggleTodo, removeTodos, clearCompleted,
  setFilter, setCategory, setView, setSort
} = useTodos()

const { categories, loadCategories } = useCategories()
const { theme, actualDark, applyAppearance, setActualDark, initFromSettings } = useTheme()

const selectedIds = ref([])
const modalVisible = ref(false)
const editingTodo = ref(null)
const focusRemind = ref(false)
const currentView = ref('list')
const currentListView = ref('list') // 'list' | 'kanban' | 'calendar'

const serverPort = ref(null)
const serverToken = ref('')
const extensionPath = ref('')
const serverOk = computed(() => !!serverPort.value)

const uncategorizedCount = computed(() => stats.value.uncategorized || 0)

const tabs = computed(() => [
  { key: 'all', label: '全部', count: stats.value.all },
  { key: 'pending', label: '未完成', count: stats.value.pending },
  { key: 'completed', label: '已完成', count: stats.value.completed }
])

const tabSliderStyle = computed(() => {
  const idx = tabs.value.findIndex((t) => t.key === filter.value)
  return { transform: `translateX(${Math.max(idx, 0) * 100}%)` }
})

const viewSwitcherTabs = ['list', 'kanban', 'calendar']
const vtSliderStyle = computed(() => {
  const idx = viewSwitcherTabs.indexOf(currentListView.value)
  return { transform: `translateX(${idx * 100}%)` }
})

function triggerSearch() { searchOpen.value = true }
function handleStatsGoto(action) {
  if (
    action === 'view-stats' ||
    action === 'view-settings' ||
    action === 'view-trash' ||
    action === 'view-scripts' ||
    action === 'view-templates' ||
    action === 'view-planning'
  ) {
    currentView.value = action.replace('view-', '')
    return
  }
  if (action === 'view-today') { currentView.value = 'list'; setView('today') }
  else if (action === 'view-overdue') { currentView.value = 'list'; setView('overdue') }
  else if (action === 'view-week') { currentView.value = 'list'; setView('week') }
  else if (action.startsWith('focus:')) {
    const id = action.replace('focus:', '')
    currentView.value = 'list'
    setView('all')
    window.electronAPI.focusTodo(id).catch(() => {})
  } else if (action.startsWith('category:')) {
    const catId = action.replace('category:', '')
    currentView.value = 'list'
    setView('all')
    setCategory(catId)
  }
}
function onCalendarDayClick(dateStr) {
  // 跳到今天的日历，弹出新建弹窗
  currentView.value = 'list'
  currentListView.value = 'list'
  openAddModal()
}

// ---------- 批量操作 ----------
async function batchComplete() {
  const ids = selectedIds.value
  if (!ids.length) return
  try {
    const now = new Date().toISOString()
    for (const id of ids) {
      await window.electronAPI.updateTodo(id, { completed: true, completed_at: now })
    }
    pushToast({ message: `已完成 ${ids.length} 项`, type: 'success' })
    selectedIds.value = []
    loadTodos()
  } catch (e) {
    pushToast({ message: '批量完成失败：' + e.message, type: 'error' })
  }
}
async function batchPriority(priority) {
  const ids = selectedIds.value
  if (!ids.length) return
  try {
    await window.electronAPI.batchUpdatePriority(ids, priority)
    pushToast({ message: `已设置 ${ids.length} 项优先级为「${{ high: '高', medium: '中', low: '低' }[priority]}」`, type: 'success' })
    selectedIds.value = []
    loadTodos()
  } catch (e) {
    pushToast({ message: '批量修改失败：' + e.message, type: 'error' })
  }
}
async function batchCategory(catId) {
  const ids = selectedIds.value
  if (!ids.length) return
  try {
    await window.electronAPI.batchUpdateCategory(ids, catId || '')
    pushToast({ message: `已移动 ${ids.length} 项到「${catId ? categories.find(c => c.id === catId)?.name || '未分类' : '未分类'}」`, type: 'success' })
    selectedIds.value = []
    loadTodos()
  } catch (e) {
    pushToast({ message: '批量移动失败：' + e.message, type: 'error' })
  }
}

// ---------- 搜索防抖在组件内完成，这里只负责同步 ----------
function onKeyword(v) {
  keyword.value = v
  loadTodos()
}

// ---------- 选择 ----------
function toggleSelect(id) {
  const i = selectedIds.value.indexOf(id)
  if (i >= 0) selectedIds.value.splice(i, 1)
  else selectedIds.value.push(id)
}

async function batchDelete() {
  if (!selectedIds.value.length) return
  await removeTodos(selectedIds.value)
  selectedIds.value = []
}

async function removeOne(id) {
  await removeTodos([id])
  selectedIds.value = selectedIds.value.filter((s) => s !== id)
}

// ---------- 弹窗 ----------
function openAddModal() { editingTodo.value = null; focusRemind.value = false; modalVisible.value = true }
function openEditModal(t) { editingTodo.value = { ...t }; focusRemind.value = false; modalVisible.value = true }
function openRemindModal(t) { editingTodo.value = { ...t }; focusRemind.value = true; modalVisible.value = true }
function closeModal() { modalVisible.value = false; editingTodo.value = null; focusRemind.value = false }

async function handleSave(fd) {
  // IPC 失败（reject）此前无任何提示，用户只会看到弹窗卡住不动
  try {
    if (editingTodo.value) {
      await window.electronAPI.updateTodo(editingTodo.value.id, fd)
    } else {
      await window.electronAPI.addTodo(fd)
    }
  } catch (e) {
    pushToast({ message: '保存失败：' + ((e && e.message) || '未知错误'), type: 'error' })
    return
  }
  closeModal()
  await loadTodos()
  await loadCategories(true)
}

// ---------- 导入导出 ----------
async function handleImport() {
  try {
    const res = await window.electronAPI.importData('merge')
    if (res.canceled) return
    if (res.success) {
      pushToast({ message: `已导入 ${res.imported} 条待办`, type: 'success' })
      await loadCategories(true)
      await loadTodos()
    } else {
      pushToast({ message: '导入失败：' + (res.error || '未知错误'), type: 'error' })
    }
  } catch (e) {
    pushToast({ message: '导入失败：' + ((e && e.message) || '未知错误'), type: 'error' })
  }
}

async function handleExport() {
  try {
    const res = await window.electronAPI.exportData('json')
    if (res.canceled) return
    if (res.success) pushToast({ message: '备份已导出', type: 'success' })
    else pushToast({ message: '导出失败：' + (res.error || '未知错误'), type: 'error' })
  } catch (e) {
    pushToast({ message: '导出失败：' + ((e && e.message) || '未知错误'), type: 'error' })
  }
}

function openExtensionDir() { window.electronAPI.openExtensionDir() }

// 顶栏快捷切换深浅（在 light / dark 间切换）
async function toggleTheme() {
  const next = actualDark.value ? 'light' : 'dark'
  applyAppearance({ theme: next })
  if (next === 'light') setActualDark(false)
  else setActualDark(true)
  await updateSettings({ theme: next })
}

// ---------- 生命周期 ----------
let disposers = []

onMounted(async () => {
  const info = await window.electronAPI.getServerInfo()
  serverPort.value = info.port
  serverToken.value = info.token
  // 扩展目录 ≠ 数据目录：这里必须取真正的 browser-extension 路径，
  // 否则指南里显示的目录会让用户在 chrome://extensions 加载错文件夹
  try {
    extensionPath.value = (await window.electronAPI.getExtensionDir()) || ''
  } catch {
    extensionPath.value = ''
  }

  // 设置 + 主题同步
  const settings = await loadSettings()
  // 旧版 localStorage 主题一次性迁移到 settings
  const legacy = window.__todopulseLegacyTheme
  if (legacy === 'dark' || legacy === 'light') {
    settings.theme = legacy
    await updateSettings({ theme: legacy })
    try { localStorage.removeItem('todopulse-theme') } catch {}
    delete window.__todopulseLegacyTheme
  }
  initFromSettings(settings)

  await loadCategories()
  await loadTodos()

  // 快捷键注册
  registerKeyboardShortcuts({
    onSearchOpen: triggerSearch,
    onQuickAddOpen: () => { /* 快速添加栏由 quickAddOpen ref 控制 */ },
    onNewTodo: openAddModal,
    onToggleFirstSelected: () => {
      if (selectedIds.value.length > 0) {
        const id = selectedIds.value[0]
        const todo = todos.value.find(t => t.id === id)
        if (todo) toggleTodo(todo)
      }
    },
    onDeleteSelected: batchDelete
  })
  watch(quickAddOpen, val => {
    if (!val) { /* handled by component */ }
  })

  if (window.electronAPI.onTodosChanged) disposers.push(window.electronAPI.onTodosChanged(() => loadTodos()))
  if (window.electronAPI.onMenuNewTodo) disposers.push(window.electronAPI.onMenuNewTodo(() => openAddModal()))
  if (window.electronAPI.onMenuViewToday) {
    disposers.push(window.electronAPI.onMenuViewToday(() => { currentView.value = 'list'; setView('today') }))
  }
  if (window.electronAPI.onMenuOpenSettings) {
    disposers.push(window.electronAPI.onMenuOpenSettings(() => { currentView.value = 'settings' }))
  }
  if (window.electronAPI.onMenuOpenScripts) {
    disposers.push(window.electronAPI.onMenuOpenScripts(() => { currentView.value = 'scripts' }))
  }
  if (window.electronAPI.onMenuOpenTemplates) {
    disposers.push(window.electronAPI.onMenuOpenTemplates(() => { currentView.value = 'templates' }))
  }
  if (window.electronAPI.onMenuOpenPlanning) {
    disposers.push(window.electronAPI.onMenuOpenPlanning(() => { currentView.value = 'planning' }))
  }
  if (window.electronAPI.onFocusTodo) {
    disposers.push(window.electronAPI.onFocusTodo((payload) => {
      currentView.value = 'list'
      setView('all')
      if (payload && payload.title) onKeyword(payload.title)
    }))
  }
  if (window.electronAPI.onThemeChanged) {
    disposers.push(window.electronAPI.onThemeChanged((isDark) => setActualDark(isDark)))
  }
})

onBeforeUnmount(() => {
  disposers.forEach((d) => typeof d === 'function' && d())
  disposers = []
})

watch([filter, categoryId, view], () => { selectedIds.value = [] })
</script>

<style scoped>
.app { display: flex; flex-direction: column; height: 100vh; overflow: hidden; background: var(--bg-primary) }

/* ---- 顶栏 ---- */
.app-header {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 0 20px;
  height: 58px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border-color);
  background: var(--header-bg);
}
.brand { display: flex; align-items: center; gap: 10px; flex-shrink: 0 }
.brand-logo {
  width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 9px;
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  font-size: calc(16px * var(--font-scale));
  box-shadow: 0 3px 10px rgba(37, 99, 235, 0.32);
}
.brand-text h1 { font-size: calc(16px * var(--font-scale)); font-weight: 700; margin: 0; color: var(--text-primary); line-height: 1.2 }
.brand-sub { font-size: calc(11px * var(--font-scale)); color: var(--text-muted) }
.header-actions { display: flex; gap: 6px; margin-left: auto; flex-shrink: 0 }
.icon-btn {
  width: 34px; height: 34px;
  border: 1px solid var(--border-color);
  border-radius: 9px;
  background: var(--bg-secondary);
  cursor: pointer;
  font-size: calc(15px * var(--font-scale));
  display: flex; align-items: center; justify-content: center;
  transition: all 0.18s ease;
}
.icon-btn:hover { background: var(--accent-soft); border-color: var(--accent-color); transform: translateY(-1px) }

/* ---- 主体 ---- */
.app-body { flex: 1; display: flex; overflow: hidden }
.app-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; padding: 16px 20px; gap: 14px; min-width: 0 }

/* ---- 视图切换器 ---- */
.view-switcher { flex-shrink: 0 }
.view-tabs {
  position: relative;
  display: flex; gap: 2px; padding: 3px;
  background: var(--bg-secondary); border-radius: 11px;
  border: 1px solid var(--border-color); width: fit-content;
}
.vt-slider {
  position: absolute; top: 3px; left: 3px;
  width: calc((100% - 6px) / 3); height: calc(100% - 6px);
  border-radius: 8px;
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  transition: transform 0.28s cubic-bezier(0.34, 1.3, 0.64, 1);
  box-shadow: 0 2px 8px rgba(37, 99, 235, 0.28);
}
.vt-btn {
  position: relative; z-index: 1;
  padding: 5px 14px; border: none; background: transparent;
  border-radius: 8px; cursor: pointer;
  font-size: calc(12.5px * var(--font-scale));
  color: var(--text-secondary); transition: color 0.2s ease; white-space: nowrap;
}
.vt-btn.active { color: #fff; font-weight: 600 }
.vt-btn:not(.active):hover { color: var(--text-primary) }

/* ---- 筛选条 ---- */
.filter-bar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px }
.tabs {
  position: relative;
  display: flex;
  gap: 2px;
  padding: 3px;
  background: var(--bg-secondary);
  border-radius: 11px;
  border: 1px solid var(--border-color);
}
.tab-slider {
  position: absolute;
  top: 3px; left: 3px;
  width: calc((100% - 6px) / 3);
  height: calc(100% - 6px);
  border-radius: 8px;
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  transition: transform 0.28s cubic-bezier(0.34, 1.3, 0.64, 1);
  box-shadow: 0 2px 8px rgba(37, 99, 235, 0.28);
}
.tab-btn {
  position: relative;
  z-index: 1;
  flex: 1;
  padding: 6px 16px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  font-size: calc(13px * var(--font-scale));
  color: var(--text-secondary);
  white-space: nowrap;
  transition: color 0.2s ease;
}
.tab-btn.active { color: #fff; font-weight: 600 }
.tab-btn:not(.active):hover { color: var(--text-primary) }

.filter-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap }
.btn {
  padding: 6px 13px;
  border-radius: 8px;
  border: 1px solid transparent;
  font-size: calc(12.5px * var(--font-scale));
  cursor: pointer;
  transition: all 0.18s ease;
  white-space: nowrap;
}
.btn.ghost {
  background: var(--bg-secondary);
  border-color: var(--border-color);
  color: var(--text-secondary);
}
.btn.ghost:hover { border-color: var(--accent-color); color: var(--accent-color); transform: translateY(-1px) }
.btn.danger { background: linear-gradient(135deg, #ef4444, #dc2626); color: #fff; font-weight: 600 }
.btn.danger:hover { filter: brightness(1.06); transform: translateY(-1px) }
.btn.primary {
  padding: 8px 18px;
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: #fff;
  font-weight: 600;
}
.btn.primary:hover { filter: brightness(1.06) }

/* ---- 列表 ---- */
.list-container { flex: 1; overflow-y: auto; padding-right: 4px; position: relative }
.loading-state { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 40px; color: var(--text-muted); font-size: calc(13px * var(--font-scale)) }
.spinner {
  width: 16px; height: 16px;
  border: 2px solid var(--border-color);
  border-top-color: var(--accent-color);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg) } }

.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 56px 20px; gap: 6px }
.empty-icon { font-size: calc(46px * var(--font-scale)); margin-bottom: 6px; animation: float 2.6s ease-in-out infinite }
@keyframes float { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-7px) } }
.empty-text { font-size: calc(16px * var(--font-scale)); font-weight: 600; color: var(--text-primary); margin: 0 }
.empty-hint { font-size: calc(13px * var(--font-scale)); color: var(--text-muted); margin: 0 0 10px }

/* ---- 悬浮按钮 ---- */
.add-btn {
  position: fixed;
  bottom: 30px; right: 30px;
  height: 50px;
  width: 50px;
  box-sizing: border-box;
  padding: 0;
  border-radius: 25px;
  border: none;
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: #fff;
  font-size: calc(24px * var(--font-scale));
  line-height: 1;
  cursor: pointer;
  box-shadow: 0 6px 20px rgba(37, 99, 235, 0.4);
  display: flex; align-items: center; justify-content: center; gap: 6px;
  z-index: 100;
  overflow: hidden;
  white-space: nowrap;
  transition: width 0.25s cubic-bezier(0.34, 1.3, 0.64, 1), padding 0.25s ease, transform 0.2s ease, box-shadow 0.2s ease;
}
.add-btn .add-icon { display: flex; align-items: center; justify-content: center; font-size: calc(22px * var(--font-scale)) }
.add-btn .add-text { display: none; font-size: calc(14px * var(--font-scale)); font-weight: 600 }
.add-btn:hover { width: 132px; padding: 0 18px; box-shadow: 0 10px 26px rgba(37, 99, 235, 0.48); transform: translateY(-2px) }
.add-btn:hover .add-text { display: inline }

/* ---- 状态栏 ---- */
.status-bar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 20px;
  height: 28px;
  flex-shrink: 0;
  border-top: 1px solid var(--border-color);
  background: var(--bg-secondary);
  font-size: calc(11.5px * var(--font-scale));
  color: var(--text-muted);
}
.status-left, .status-right { display: flex; align-items: center; gap: 6px }
.status-left b { color: var(--text-secondary) }
.status-left .warn b { color: #dc2626 }
.sep { opacity: 0.5 }
.dot { width: 7px; height: 7px; border-radius: 50%; background: #94a3b8 }
.dot.ok { background: #16a34a; box-shadow: 0 0 0 3px rgba(22, 163, 74, 0.18) }
.dot.off { background: #dc2626 }

/* ---- 扩展指南弹窗 ---- */
.modal-overlay {
  position: fixed; inset: 0;
  background: rgba(15, 23, 42, 0.5);
  backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000;
  animation: fade 0.2s ease;
}
@keyframes fade { from { opacity: 0 } to { opacity: 1 } }
.guide-modal {
  background: var(--bg-primary);
  border-radius: 16px;
  padding: 26px;
  max-width: 500px;
  width: 90%;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.32);
  animation: pop 0.24s cubic-bezier(0.34, 1.4, 0.64, 1);
}
@keyframes pop { from { opacity: 0; transform: scale(0.94) translateY(8px) } to { opacity: 1; transform: none } }
.guide-modal h3 { margin: 0 0 14px; color: var(--text-primary); font-size: calc(17px * var(--font-scale)) }
.guide-modal p, .guide-modal li { color: var(--text-secondary); font-size: calc(13px * var(--font-scale)); line-height: 1.8 }
.guide-modal code {
  background: var(--bg-secondary);
  padding: 2px 6px;
  border-radius: 5px;
  font-size: calc(12px * var(--font-scale));
  color: var(--accent-color);
  word-break: break-all;
}
.guide-modal ol { padding-left: 20px; margin: 10px 0 }
.config-box {
  display: flex; flex-direction: column; gap: 6px;
  padding: 10px 12px;
  margin: 12px 0;
  background: var(--bg-secondary);
  border-radius: 10px;
}
.config-box > div { display: flex; align-items: center; gap: 10px; font-size: calc(12px * var(--font-scale)); color: var(--text-muted) }
.config-box span { width: 42px; flex-shrink: 0 }
.config-box .token { max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.guide-tip {
  background: var(--accent-soft);
  padding: 10px 12px;
  border-radius: 9px;
  font-size: calc(12.5px * var(--font-scale)) !important;
  margin: 14px 0 !important;
  color: var(--text-secondary) !important;
}
.guide-actions { display: flex; gap: 10px; margin-top: 18px; justify-content: flex-end }

/* ---- 窄屏适配 ---- */
@media (max-width: 900px) {
  .brand-text { display: none }
  .app-header { gap: 10px; padding: 0 12px }
  .header-actions { gap: 4px }
  .icon-btn { width: 30px; height: 30px }
}
</style>
