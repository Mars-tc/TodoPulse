<template>
  <section class="card section">
    <h3>ℹ️ 关于与诊断</h3>
    <p class="section-desc">应用版本与运行环境信息。</p>

    <div class="about-head">
      <span class="about-logo">📋</span>
      <div>
        <div class="about-name">TodoPulse</div>
        <div class="about-ver">v{{ info.version }} · 待办工作台</div>
      </div>
    </div>

    <div class="info-grid">
      <div class="info-row"><span>Electron</span><b>{{ info.electron || '—' }}</b></div>
      <div class="info-row"><span>Chromium</span><b>{{ info.chromium || '—' }}</b></div>
      <div class="info-row"><span>Node</span><b>{{ info.node || '—' }}</b></div>
      <div class="info-row"><span>平台</span><b>{{ info.platform }} / {{ info.arch }}</b></div>
    </div>

    <div class="row divider">
      <div class="row-text">
        <span class="row-title">数据目录</span>
        <span class="row-sub">配置文件、数据库与日志所在位置</span>
      </div>
      <button class="btn ghost sm" @click="openDir">打开数据目录</button>
    </div>

    <div class="path-list">
      <div class="path-item" v-for="p in pathItems" :key="p.label">
        <span class="path-label">{{ p.label }}</span>
        <code class="path-value">{{ p.value }}</code>
        <button class="icon-sm" title="复制" @click="copy(p.value)">📋</button>
      </div>
    </div>

    <!-- 运行日志 -->
    <div class="row divider">
      <div class="row-text">
        <span class="row-title">运行日志</span>
        <span class="row-sub">最近 100 条（已对 Token 脱敏）</span>
      </div>
    </div>
    <div class="log-box">
      <div class="log-actions">
        <button class="icon-sm" title="复制" @click="copy(logs)">📋 复制</button>
        <button class="icon-sm danger" title="清空" @click="clearLogs">🧹 清空</button>
      </div>
      <pre class="log-text">{{ logs || '暂无日志' }}</pre>
    </div>
  </section>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { appInfo, dataPaths, loadAppInfo, loadDataPaths } from '../../composables/useSettings'
import { pushToast } from '../../composables/useToast'

const info = ref({})
const paths = ref({})
const logs = ref('')

const pathItems = computed(() =>
  paths.value
    ? [
        { label: '配置', value: paths.value.config },
        { label: '数据库', value: paths.value.database },
        { label: '日志', value: paths.value.logs }
      ]
    : []
)

onMounted(async () => {
  info.value = (await loadAppInfo()) || {}
  paths.value = (await loadDataPaths()) || {}
  await refreshLogs()
})

async function refreshLogs() {
  try {
    const r = await window.electronAPI.getLogs(100)
    logs.value = r.logs || ''
  } catch {
    /* ignore */
  }
}

function openDir() {
  window.electronAPI.openDataDir()
}
async function copy(text) {
  try {
    await navigator.clipboard.writeText(String(text))
    pushToast({ message: '已复制', type: 'success' })
  } catch {
    pushToast({ message: '复制失败', type: 'error' })
  }
}
async function clearLogs() {
  await window.electronAPI.clearLogs()
  await refreshLogs()
  pushToast({ message: '日志已清空', type: 'info' })
}
</script>

<style scoped>
.about-head { display: flex; align-items: center; gap: 12px; margin: 10px 0 14px }
.about-logo {
  width: 44px; height: 44px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 12px;
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  font-size: calc(22px * var(--font-scale));
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.32);
}
.about-name { font-size: calc(16px * var(--font-scale)); font-weight: 700; color: var(--text-primary) }
.about-ver { font-size: calc(11.5px * var(--font-scale)); color: var(--text-muted) }

.info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  margin-bottom: 6px;
}
.info-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 9px;
  font-size: calc(12.5px * var(--font-scale));
}
.info-row span { color: var(--text-muted) }
.info-row b { color: var(--text-primary); font-weight: 600 }

.path-list { display: flex; flex-direction: column; gap: 6px; margin-top: 10px }
.path-item { display: flex; align-items: center; gap: 8px; font-size: calc(12px * var(--font-scale)) }
.path-label { width: 38px; color: var(--text-muted); flex-shrink: 0 }
.path-value {
  flex: 1;
  background: var(--bg-secondary);
  padding: 3px 8px;
  border-radius: 6px;
  font-size: calc(11.5px * var(--font-scale));
  color: var(--accent-color);
  word-break: break-all;
}
.icon-sm {
  border: none; background: transparent; cursor: pointer;
  font-size: calc(13px * var(--font-scale)); padding: 2px 5px; border-radius: 6px;
  transition: background 0.18s ease;
}
.icon-sm:hover { background: var(--bg-hover) }
.icon-sm.danger:hover { background: rgba(220, 38, 38, 0.12) }

.log-box {
  margin-top: 10px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  overflow: hidden;
  background: #0f172a;
}
.log-actions { display: flex; gap: 6px; padding: 6px 8px; background: #1e293b; border-bottom: 1px solid #334155 }
.log-actions .icon-sm { color: #94a3b8 }
.log-actions .icon-sm:hover { background: #334155 }
.log-text {
  margin: 0;
  padding: 10px 12px;
  max-height: 240px;
  overflow-y: auto;
  font-family: "SF Mono", "Cascadia Code", Consolas, monospace;
  font-size: calc(11px * var(--font-scale));
  line-height: 1.7;
  color: #cbd5e1;
  white-space: pre-wrap;
  word-break: break-all;
}

.btn.sm { padding: 6px 14px; font-size: calc(12px * var(--font-scale)) }
</style>
