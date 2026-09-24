<template>
  <div class="search-sort-bar">
    <div class="search-box" :class="{ focused }">
      <span class="search-icon">🔍</span>
      <input
        v-model="localKeyword"
        type="text"
        placeholder="搜索标题、描述或来源网页…"
        @focus="focused = true"
        @blur="focused = false"
        @keyup.esc="localKeyword = ''"
      />
      <button v-if="localKeyword" class="clear-btn" @click="localKeyword = ''" title="清空">×</button>
    </div>

    <div class="sort-box">
      <button
        v-for="s in sorts"
        :key="s.key"
        :class="['sort-btn', { active: sortBy === s.key }]"
        @click="$emit('sort', s.key)"
        :title="`按${s.label}排序（点击切换升降序）`"
      >
        <span>{{ s.label }}</span>
        <span v-if="sortBy === s.key" class="arrow">{{ order === 'asc' ? '↑' : '↓' }}</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  keyword: { type: String, default: '' },
  sortBy: { type: String, default: 'create_at' },
  order: { type: String, default: 'desc' }
})
const emit = defineEmits(['update:keyword', 'sort'])

const localKeyword = ref(props.keyword)
const focused = ref(false)

const sorts = [
  { key: 'create_at', label: '创建时间' },
  { key: 'deadline', label: '截止时间' },
  { key: 'priority', label: '优先级' }
]

watch(() => props.keyword, (v) => { localKeyword.value = v })

let timer = null
watch(localKeyword, (v) => {
  clearTimeout(timer)
  timer = setTimeout(() => emit('update:keyword', v), 220)
})
</script>

<style scoped>
.search-sort-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}
.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  max-width: 420px;
  padding: 0 12px;
  height: 36px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-secondary);
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
}
.search-box.focused {
  border-color: var(--accent-color);
  background: var(--bg-primary);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.search-icon { font-size: calc(13px * var(--font-scale)); opacity: 0.7 }
.search-box input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text-primary);
  font-size: calc(13px * var(--font-scale));
}
.search-box input::placeholder { color: var(--text-muted) }
.clear-btn {
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: calc(16px * var(--font-scale));
  line-height: 1;
}
.clear-btn:hover { color: var(--text-primary) }

.sort-box {
  display: flex;
  gap: 2px;
  padding: 3px;
  background: var(--bg-secondary);
  border-radius: 10px;
  border: 1px solid var(--border-color);
}
.sort-btn {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 5px 11px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--text-secondary);
  font-size: calc(12px * var(--font-scale));
  cursor: pointer;
  transition: all 0.2s ease;
}
.sort-btn:hover { background: var(--bg-hover); color: var(--text-primary) }
.sort-btn.active {
  background: var(--bg-primary);
  color: var(--accent-color);
  font-weight: 600;
  box-shadow: 0 1px 4px var(--shadow-color);
}
.arrow { font-size: calc(10px * var(--font-scale)) }
</style>
