<template>
  <section class="card section">
    <h3>🚀 启动与关闭</h3>
    <p class="section-desc">控制应用开机是否自启，以及关闭窗口时的行为。</p>

    <div class="row">
      <div class="row-text">
        <span class="row-title">开机自启</span>
        <span class="row-sub">登录系统后自动运行（UOS 写入 autostart 桌面文件）</span>
      </div>
      <label class="switch">
        <input type="checkbox" v-model="autoLaunch" @change="onAutoLaunch" />
        <span class="slider"></span>
      </label>
    </div>

    <div class="row divider">
      <div class="row-text">
        <span class="row-title">关闭窗口时</span>
        <span class="row-sub">选择「最小化到托盘」可保持到期提醒持续工作；「直接退出」将结束进程</span>
      </div>
      <div class="seg">
        <button :class="['seg-item', { active: closeAction === 'tray' }]" @click="setClose('tray')">
          最小化到托盘
        </button>
        <button :class="['seg-item', { active: closeAction === 'quit' }]" @click="setClose('quit')">
          直接退出
        </button>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { settings, updateSettings } from '../../composables/useSettings'
import { pushToast } from '../../composables/useToast'

const autoLaunch = ref(false)
const closeAction = ref('tray')

onMounted(async () => {
  try {
    const r = await window.electronAPI.getAutostart()
    autoLaunch.value = !!r.enabled
  } catch {
    /* ignore */
  }
  closeAction.value = (settings.value.startup && settings.value.startup.closeAction) || 'tray'
})

async function onAutoLaunch(e) {
  const next = e.target.checked
  const res = window.electronAPI.setAutostart(next)
  const result = await res
  if (result && result.success) {
    autoLaunch.value = next
    await updateSettings({ startup: { ...settings.value.startup, autoLaunch: next } })
    pushToast({ message: next ? '已开启开机自启' : '已关闭开机自启', type: 'success' })
  } else {
    autoLaunch.value = !next
    e.target.checked = !next
    pushToast({ message: '设置失败：' + (result && result.error || ''), type: 'error' })
  }
}

async function setClose(v) {
  closeAction.value = v
  await updateSettings({ startup: { ...settings.value.startup, closeAction: v } })
  pushToast({ message: '已保存', type: 'success' })
}
</script>

<style scoped>
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
