<template>
  <section class="section">
    <h3>📌 自动分类规则</h3>
    <p class="hint">输入关键词规则，新建待办时会自动匹配对应分类。</p>

    <div v-if="rules.length === 0" class="empty-rules">
      <span>暂无规则，点击下方按钮添加</span>
    </div>

    <div v-for="(rule, idx) in rules" :key="idx" class="rule-row">
      <input
        v-model="rule.regex"
        class="rule-input"
        placeholder="正则表达式（如：代码、会议、文档）"
        @blur="saveRules()"
      />
      <select v-model="rule.categoryId" class="rule-cat" @change="saveRules()">
        <option value="">— 未分类 —</option>
        <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
      <button class="rule-del" @click="removeRule(idx)">✕</button>
    </div>

    <button class="btn ghost" @click="addRule">＋ 添加规则</button>
  </section>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { settings, loadSettings, updateSettings } from '../../composables/useSettings'
import { useCategories } from '../../composables/useCategories'
import { pushToast } from '../../composables/useToast'

const { categories, loadCategories } = useCategories()
const rules = ref([])

onMounted(async () => {
  await loadSettings()
  await loadCategories()
  rules.value = [...(settings.value?.auto_categorize_rules || [])]
})

const active = computed(() => settings.value?.auto_categorize_rules || [])

function addRule() {
  rules.value.push({ regex: '', categoryId: '' })
  saveRules()
}

function removeRule(idx) {
  rules.value.splice(idx, 1)
  saveRules()
}

async function saveRules() {
  try {
    await updateSettings({ auto_categorize_rules: rules.value })
    pushToast({ message: '自动分类规则已保存', type: 'success' })
  } catch (e) {
    pushToast({ message: '保存失败：' + e.message, type: 'error' })
  }
}
</script>

<style scoped>
.section { margin-bottom: 28px }
.section h3 { margin: 0 0 6px; font-size: calc(13.5px * var(--font-scale)); font-weight: 600; color: var(--text-primary) }
.hint { margin: 0 0 14px; font-size: calc(12px * var(--font-scale)); color: var(--text-muted) }
.empty-rules { padding: 16px 0; text-align: center; color: var(--text-muted); font-size: calc(12.5px * var(--font-scale)); border-bottom: 1px solid var(--border-color); margin-bottom: 12px }
.rule-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px }
.rule-input {
  flex: 1; padding: 7px 10px; border: 1px solid var(--border-color);
  border-radius: 8px; background: var(--bg-primary); color: var(--text-primary);
  font-size: calc(12.5px * var(--font-scale)); outline: none; transition: border-color 0.15s;
}
.rule-input:focus { border-color: var(--accent-color) }
.rule-cat {
  padding: 7px 8px; border: 1px solid var(--border-color); border-radius: 8px;
  background: var(--bg-primary); color: var(--text-secondary);
  font-size: calc(12.5px * var(--font-scale)); outline: none; cursor: pointer;
}
.rule-cat:focus { border-color: var(--accent-color) }
.rule-del {
  width: 28px; height: 28px; border: 1px solid var(--border-color); border-radius: 7px;
  background: var(--bg-secondary); color: var(--text-muted); font-size: 14px;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: all 0.15s; flex-shrink: 0;
}
.rule-del:hover { color: var(--danger); border-color: var(--danger) }
</style>
