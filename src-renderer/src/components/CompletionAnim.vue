<template>
  <Transition name="ca">
    <div v-if="show" class="ca-wrap">
      <div class="ca-ring"></div>
      <div class="ca-content">
        <span class="ca-check">✓</span>
        <span class="ca-text">完成！</span>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'

const show = ref(false)
let _timer = null

function trigger() {
  show.value = true
  clearTimeout(_timer)
  _timer = setTimeout(() => { show.value = false }, 700)
}

onMounted(() => {
  window.addEventListener('todo-completion-trigger', trigger)
})
onBeforeUnmount(() => {
  window.removeEventListener('todo-completion-trigger', trigger)
  clearTimeout(_timer)
})

defineExpose({ trigger })
</script>

<style scoped>
.ca-wrap {
  position: fixed; inset: 0; z-index: 3000;
  display: flex; align-items: center; justify-content: center;
  pointer-events: none;
}
.ca-ring {
  position: absolute; width: 160px; height: 160px; border-radius: 50%;
  border: 3px solid rgba(22, 163, 74, 0.5);
  animation: caRing 0.6s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}
.ca-content {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  animation: caPop 0.6s cubic-bezier(0.34, 1.4, 0.64, 1) forwards;
}
.ca-check {
  width: 48px; height: 48px; border-radius: 50%;
  background: linear-gradient(135deg, #22c55e, #16a34a);
  color: #fff; font-size: 26px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 4px 20px rgba(22, 163, 74, 0.4);
}
.ca-text { font-size: 15px; font-weight: 600; color: #16a34a; letter-spacing: 0.05em }

@keyframes caRing {
  from { transform: scale(0.4); opacity: 1 }
  to { transform: scale(1.8); opacity: 0 }
}
@keyframes caPop {
  from { transform: scale(0.6); opacity: 0 }
  to { transform: scale(1); opacity: 1 }
}
.ca-enter-active { transition: opacity 0.1s ease }
.ca-leave-active { transition: opacity 0.3s ease }
.ca-enter-from, .ca-leave-to { opacity: 0 }
</style>
