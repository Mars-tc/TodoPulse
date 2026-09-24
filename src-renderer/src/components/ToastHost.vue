<template>
  <div class="toast-host">
    <TransitionGroup name="toast">
      <div v-for="t in toasts" :key="t.id" :class="['toast', t.type]">
        <span class="toast-msg">{{ t.message }}</span>
        <button v-if="t.actionLabel" class="toast-action" @click="runAction(t)">{{ t.actionLabel }}</button>
        <button class="toast-close" @click="remove(t.id)" aria-label="关闭">×</button>
        <span class="toast-progress" :style="{ animationDuration: t.duration + 'ms' }"></span>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup>
import { toasts, removeToast } from '../composables/useToast'

function remove(id) { removeToast(id) }
function runAction(t) {
  if (typeof t.onAction === 'function') t.onAction()
  removeToast(t.id)
}
</script>

<style scoped>
.toast-host {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  z-index: 2000;
  pointer-events: none;
}
.toast {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  min-width: 220px;
  max-width: 420px;
  border-radius: 12px;
  background: var(--bg-inverse, #1e293b);
  color: #f8fafc;
  font-size: calc(13px * var(--font-scale));
  box-shadow: 0 8px 28px rgba(15, 23, 42, 0.28);
  overflow: hidden;
  pointer-events: auto;
  backdrop-filter: blur(8px);
}
[data-theme='dark'] .toast {
  background: #334155;
  color: #f1f5f9;
}
.toast-msg { flex: 1; line-height: 1.5; word-break: break-all }
.toast-action {
  padding: 4px 12px;
  border: none;
  border-radius: 8px;
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: #fff;
  font-size: calc(12px * var(--font-scale));
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s ease, opacity 0.15s ease;
}
.toast-action:hover { transform: translateY(-1px); opacity: 0.92 }
.toast-close {
  border: none;
  background: transparent;
  color: rgba(248, 250, 252, 0.6);
  font-size: calc(18px * var(--font-scale));
  line-height: 1;
  cursor: pointer;
  padding: 0 2px;
}
.toast-close:hover { color: #f8fafc }
.toast-progress {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 2px;
  width: 100%;
  background: linear-gradient(90deg, #60a5fa, #3b82f6);
  transform-origin: left;
  animation: toast-progress linear forwards;
}
@keyframes toast-progress {
  from { transform: scaleX(1) }
  to { transform: scaleX(0) }
}
.toast-enter-active, .toast-leave-active { transition: all 0.28s cubic-bezier(0.22, 1, 0.36, 1) }
.toast-enter-from { opacity: 0; transform: translateY(14px) scale(0.96) }
.toast-leave-to { opacity: 0; transform: translateY(-6px) scale(0.98) }
</style>
