<template>
  <Transition name="bb">
    <div v-if="open" class="bb-backdrop" @click.self="clear">
      <div class="bb-bar">
        <span class="bb-count">{{ selectedIds.length }} 项已选</span>
        <div class="bb-actions">
          <button class="bb-btn bb-btn-complete" @click="$emit('batch-complete')" title="标记完成">
            ✅ 完成
          </button>
          <button class="bb-btn bb-btn-priority" @click="showPriorityPicker = !showPriorityPicker" title="修改优先级">
            🔴 改优先级
          </button>
          <div v-if="showPriorityPicker" class="bb-priority-pop">
            <button class="pp-btn high" @click="$emit('batch-priority', 'high')">高</button>
            <button class="pp-btn medium" @click="$emit('batch-priority', 'medium')">中</button>
            <button class="pp-btn low" @click="$emit('batch-priority', 'low')">低</button>
          </div>
          <button class="bb-btn bb-btn-category" @click="showCatPicker = !showCatPicker" title="移动到分类">
            📁 换分类
          </button>
          <div v-if="showCatPicker" class="bb-cat-pop">
            <button class="cat-btn" @click="$emit('batch-category', '')">未分类</button>
            <button v-for="c in categories" :key="c.id" class="cat-btn"
              @click="$emit('batch-category', c.id)"
              :style="{ borderColor: c.color }">{{ c.name }}</button>
          </div>
          <button class="bb-btn bb-btn-delete" @click="$emit('batch-delete')">
            🗑️ 删除
          </button>
        </div>
        <button class="bb-clear" @click="clear">✕</button>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'

const props = defineProps({
  selectedIds: { type: Array, default: () => [] },
  categories: { type: Array, default: () => [] }
})
const emit = defineEmits(['clear', 'batch-complete', 'batch-priority', 'batch-category', 'batch-delete'])

const open = ref(false)
const showPriorityPicker = ref(false)
const showCatPicker = ref(false)

watch(() => props.selectedIds, ids => {
  open.value = ids.length > 0
  if (!ids.length) {
    showPriorityPicker.value = false
    showCatPicker.value = false
  }
})

function clear() {
  showPriorityPicker.value = false
  showCatPicker.value = false
  emit('clear')
}

onMounted(() => {
  document.addEventListener('click', handleOutsideClick)
  document.addEventListener('keydown', handleKey)
})
defineExpose({ clear })

function handleOutsideClick(e) {
  const bar = document.querySelector('.bb-bar')
  if (bar && !bar.contains(e.target)) {
    clear()
  }
}
function handleKey(e) {
  if (e.key === 'Escape' && open.value) clear()
}
</script>

<style scoped>
.bb-backdrop {
  position: fixed; bottom: 0; left: 0; right: 0; z-index: 1500;
  background: rgba(15, 23, 42, 0.3);
  display: flex; justify-content: center; padding: 12px 20px 16px;
}
.bb-bar {
  display: flex; align-items: center; gap: 14px;
  background: var(--bg-primary); border: 1px solid var(--border-color);
  border-radius: 14px; padding: 10px 16px;
  box-shadow: 0 -4px 24px rgba(15, 23, 42, 0.2);
  max-width: 700px; width: 100%;
}
.bb-count { font-size: 12.5px; color: var(--text-muted); white-space: nowrap }
.bb-actions { display: flex; align-items: center; gap: 6px; flex: 1; position: relative }
.bb-btn {
  padding: 5px 12px; border-radius: 8px; border: 1px solid var(--border-color);
  background: var(--bg-secondary); color: var(--text-secondary);
  font-size: 12px; cursor: pointer; transition: all 0.15s ease; position: relative;
}
.bb-btn:hover { border-color: var(--accent-color); color: var(--accent-color) }
.bb-btn-delete:hover { border-color: var(--danger); color: var(--danger) }
.bb-clear {
  width: 26px; height: 26px; border: 1px solid var(--border-color); border-radius: 7px;
  background: var(--bg-secondary); color: var(--text-muted); font-size: 14px;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: all 0.15s ease;
}
.bb-clear:hover { color: var(--text-primary) }

/* 优先级弹窗 */
.bb-priority-pop {
  position: absolute; bottom: 38px; left: 0;
  display: flex; gap: 4px; padding: 6px;
  background: var(--bg-primary); border: 1px solid var(--border-color);
  border-radius: 10px; box-shadow: 0 6px 20px rgba(0,0,0,0.25); z-index: 10;
}
.pp-btn {
  padding: 4px 12px; border-radius: 6px; border: none; cursor: pointer;
  font-size: 12px; font-weight: 600; color: #fff; transition: opacity 0.15s;
}
.pp-btn:hover { opacity: 0.85 }
.pp-btn.high { background: #dc2626 }
.pp-btn.medium { background: #ea580c }
.pp-btn.low { background: #16a34a }

/* 分类弹窗 */
.bb-cat-pop {
  position: absolute; bottom: 38px; left: 90px;
  display: flex; flex-direction: column; gap: 4px; padding: 8px;
  background: var(--bg-primary); border: 1px solid var(--border-color);
  border-radius: 10px; box-shadow: 0 6px 20px rgba(0,0,0,0.25); z-index: 10;
  max-height: 200px; overflow-y: auto;
}
.cat-btn {
  padding: 5px 12px; border-radius: 6px; border: 1px solid var(--border-color);
  background: var(--bg-secondary); color: var(--text-secondary);
  font-size: 12px; cursor: pointer; text-align: left; transition: all 0.15s;
}
.cat-btn:hover { background: var(--accent-soft); color: var(--accent-color) }

.bb-enter-active, .bb-leave-active { transition: opacity 0.2s ease }
.bb-enter-from, .bb-leave-to { opacity: 0 }
</style>
