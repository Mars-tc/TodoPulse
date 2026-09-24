<template>
  <section class="card section">
    <h3>🔗 本地服务与扩展</h3>
    <p class="section-desc">
      本地 HTTP 服务仅监听 127.0.0.1，浏览器扩展据此连接。Token 即连接凭证，请勿外泄。
    </p>

    <!-- 服务启停 -->
    <div class="row">
      <div class="row-text">
        <span class="row-title">本地服务</span>
        <span class="row-sub">{{ running ? '运行中' : '已停止' }}</span>
      </div>
      <label class="switch">
        <input type="checkbox" :checked="running" @change="toggleRunning" />
        <span class="slider"></span>
      </label>
    </div>

    <!-- 端口 -->
    <div class="row divider">
      <div class="row-text">
        <span class="row-title">服务端口</span>
        <span class="row-sub">修改后保存并重启服务，冲突时给出提示</span>
      </div>
      <div class="port-edit">
        <input type="number" class="port-input" v-model="portInput" />
        <button class="btn primary sm" :disabled="portInput === port" @click="savePort">保存并重启</button>
      </div>
    </div>

    <!-- Token -->
    <div class="row divider">
      <div class="row-text">
        <span class="row-title">访问 Token</span>
        <span class="row-sub">扩展连接凭证</span>
      </div>
    </div>
    <div class="token-box">
      <code class="token-text">{{ revealed ? token : maskedToken }}</code>
      <button class="icon-sm" :title="revealed ? '隐藏' : '显示'" @click="revealed = !revealed">
        {{ revealed ? '🙈' : '👁️' }}
      </button>
      <button class="icon-sm" title="复制" @click="copyToken">📋</button>
      <button class="text-danger" @click="regenerate">重新生成</button>
    </div>

    <!-- 扩展入口 -->
    <div class="row divider">
      <div class="row-text">
        <span class="row-title">浏览器扩展</span>
        <span class="row-sub">加载扩展目录，或在弹窗中填写端口 / Token</span>
      </div>
    </div>
    <div class="ext-actions">
      <button class="btn ghost sm" @click="openDir">打开扩展目录</button>
      <button class="btn ghost sm" @click="openGuide">查看扩展指南</button>
    </div>
  </section>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { settings } from '../../composables/useSettings'
import { pushToast } from '../../composables/useToast'
import { openExtensionGuide } from '../../composables/useUi'

const port = ref(null)
const portInput = ref('')
const token = ref('')
const running = ref(true)
const revealed = ref(false)

const maskedToken = computed(() => {
  if (!token.value) return '—'
  const last = token.value.slice(-4)
  return '••••••••' + last
})

onMounted(async () => {
  try {
    const info = await window.electronAPI.getServerInfo()
    port.value = info.port
    token.value = info.token
    running.value = !!info.port
    portInput.value = info.port
  } catch {
    /* ignore */
  }
})

async function toggleRunning(e) {
  const next = e.target.checked
  const res = await window.electronAPI.setServerRunning(next)
  if (res.success) {
    running.value = res.running
    pushToast({ message: next ? '本地服务已启动' : '本地服务已停止', type: 'success' })
  } else {
    pushToast({ message: '操作失败：' + (res.error || ''), type: 'error' })
    e.target.checked = !next
  }
}

async function savePort() {
  const res = await window.electronAPI.restartServer(Number(portInput.value))
  if (res.success) {
    port.value = res.port
    pushToast({ message: '端口已更新并重启服务', type: 'success' })
  } else {
    portInput.value = port.value
    pushToast({ message: '重启失败：' + (res.error || ''), type: 'error' })
  }
}

async function copyToken() {
  try {
    await navigator.clipboard.writeText(token.value)
    pushToast({ message: 'Token 已复制', type: 'success' })
  } catch {
    pushToast({ message: '复制失败', type: 'error' })
  }
}

async function regenerate() {
  if (!window.confirm('重新生成 Token 后，浏览器扩展需重新填写凭证，确定继续？')) return
  const res = await window.electronAPI.regenerateToken()
  if (res.success) {
    token.value = res.token
    pushToast({ message: 'Token 已重新生成，请更新扩展配置', type: 'success' })
  } else {
    pushToast({ message: '生成失败：' + (res.error || ''), type: 'error' })
  }
}

function openDir() {
  window.electronAPI.openExtensionDir()
}
function openGuide() {
  openExtensionGuide()
}
</script>

<style scoped>
.port-edit { display: flex; align-items: center; gap: 8px }
.port-input {
  width: 96px;
  padding: 6px 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: calc(13px * var(--font-scale));
  outline: none;
}
.port-input:focus { border-color: var(--accent-color); box-shadow: 0 0 0 3px var(--accent-soft) }

.token-box {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  padding: 8px 10px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 10px;
}
.token-text {
  flex: 1;
  font-size: calc(12px * var(--font-scale));
  color: var(--accent-color);
  word-break: break-all;
  user-select: all;
}
.icon-sm {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: calc(14px * var(--font-scale));
  padding: 2px 4px;
  border-radius: 6px;
  transition: background 0.18s ease;
}
.icon-sm:hover { background: var(--bg-hover) }
.text-danger {
  border: none;
  background: transparent;
  color: #dc2626;
  font-size: calc(12px * var(--font-scale));
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 6px;
  transition: background 0.18s ease;
}
.text-danger:hover { background: rgba(220, 38, 38, 0.12) }

.ext-actions { display: flex; gap: 8px; margin-top: 10px }

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
</style>
