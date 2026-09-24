<template>
  <div class="modal-overlay" @click.self="close">
    <div class="modal">
      <header class="modal-head">
        <h3>{{ isEdit ? '编辑待办' : '新建待办' }}</h3>
        <button class="close-x" @click="close">×</button>
      </header>

      <div class="modal-body">
        <!-- 标题 -->
        <div class="form-group">
          <label>标题 <em>*</em></label>
          <input
            ref="titleInput"
            v-model="form.title"
            type="text"
            placeholder="输入待办标题"
            maxlength="100"
            class="form-input"
          />
        </div>

        <!-- 描述 -->
        <div class="form-group">
          <label>描述</label>
          <textarea
            v-model="form.description"
            placeholder="补充描述（可选）"
            rows="2"
            class="form-textarea"
          ></textarea>
        </div>

        <!-- 优先级 -->
        <div class="form-group">
          <label>优先级</label>
          <div class="seg">
            <button
              v-for="p in priorities"
              :key="p.value"
              :class="['seg-btn', p.value, { active: form.priority === p.value }]"
              @click="form.priority = p.value"
            >{{ p.label }}</button>
          </div>
        </div>

        <!-- 分类 -->
        <div class="form-group">
          <label>分类</label>
          <div class="cat-picker">
            <button :class="['cat-chip', { active: form.category_id === '' }]" @click="form.category_id = ''">
              未分类
            </button>
            <button
              v-for="c in categories"
              :key="c.id"
              :class="['cat-chip', { active: form.category_id === c.id }]"
              :style="form.category_id === c.id ? { borderColor: c.color, color: c.color, background: c.color + '18' } : null"
              @click="form.category_id = c.id"
            >
              <span class="chip-dot" :style="{ background: c.color }"></span>{{ c.name }}
            </button>
          </div>
        </div>

        <!-- 截止时间 -->
        <div class="form-group">
          <label>截止时间</label>
          <div class="row">
            <input v-model="form.deadlineInput" type="datetime-local" class="form-input" />
            <button v-if="form.deadlineInput" class="mini-clear" @click="form.deadlineInput = ''">清除</button>
          </div>
          <div class="nl-row">
            <input
              v-model="nlText"
              type="text"
              placeholder="或输入自然语言：下周三下午3点 / 9月10日"
              class="form-input"
              @keyup.enter="parseNl"
            />
            <button class="mini-btn" :disabled="!nlText.trim()" @click="parseNl">解析</button>
          </div>
          <p v-if="nlResult" class="nl-result">
            {{ nlResult.matched ? `识别到「${nlResult.matched}」→ ` : '' }}{{ nlResult.formatted }}
          </p>
          <p v-else-if="nlError" class="nl-result error">{{ nlError }}</p>
        </div>

        <!-- 提醒 -->
        <div class="form-group" :class="{ 'ring': focusRemind }" ref="remindBlock">
          <label>提醒</label>
          <select v-model="form.remind_lead" class="form-select">
            <option :value="null">不提醒</option>
            <option :value="0">截止时提醒</option>
            <option :value="5">提前 5 分钟</option>
            <option :value="10">提前 10 分钟</option>
            <option :value="30">提前 30 分钟</option>
            <option :value="60">提前 1 小时</option>
            <option :value="180">提前 3 小时</option>
            <option :value="1440">提前 1 天</option>
          </select>
          <p class="form-hint">未设置截止时间时，提醒不会触发</p>
        </div>

        <!-- 重复 -->
        <div class="form-group">
          <label>重复</label>
          <RepeatRuleEditor v-model="form.repeat_rule" :deadline="computedDeadline" />
        </div>

        <!-- 子任务 -->
        <div class="form-group">
          <label>子任务</label>
          <SubtaskList v-model="form.subtasks" />
        </div>
      </div>

      <footer class="modal-actions">
        <button class="btn ghost" @click="close">取消</button>
        <button class="btn primary" :disabled="!form.title.trim()" @click="save">
          {{ isEdit ? '保存修改' : '创建待办' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, nextTick } from 'vue'
import SubtaskList from './SubtaskList.vue'
import RepeatRuleEditor from './RepeatRuleEditor.vue'
import { useCategories } from '../composables/useCategories'
import { settings } from '../composables/useSettings'

const props = defineProps({
  todo: { type: Object, default: null },
  isEdit: { type: Boolean, default: false },
  focusRemind: { type: Boolean, default: false }
})
const emit = defineEmits(['close', 'save'])

const { categories, loadCategories } = useCategories()

const titleInput = ref(null)
const remindBlock = ref(null)

const priorities = [
  { value: 'high', label: '高' },
  { value: 'medium', label: '中' },
  { value: 'low', label: '低' }
]

const form = reactive({
  title: '',
  description: '',
  priority: 'medium',
  category_id: '',
  deadlineInput: '',
  remind_lead: null,
  repeat_rule: null,
  subtasks: []
})

const nlText = ref('')
const nlResult = ref(null)
const nlError = ref('')

function toLocalInput(iso) {
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
    return d.toISOString().slice(0, 16)
  } catch { return '' }
}

async function initForm() {
  if (props.todo) {
    form.title = props.todo.title || ''
    form.description = props.todo.description || ''
    form.priority = props.todo.priority || 'medium'
    form.category_id = props.todo.category_id || ''
    form.deadlineInput = props.todo.deadline ? toLocalInput(props.todo.deadline) : ''
    form.remind_lead = props.todo.remind_lead === null || props.todo.remind_lead === undefined
      ? null
      : Number(props.todo.remind_lead)

    let rule = null
    try { rule = props.todo.repeat_rule ? JSON.parse(props.todo.repeat_rule) : null } catch { rule = null }
    form.repeat_rule = rule && rule.type ? rule : null

    try {
      const subs = await window.electronAPI.listSubtasks(props.todo.id)
      form.subtasks = (subs || []).map((s) => ({ title: s.title, completed: !!s.completed }))
    } catch {
      form.subtasks = []
    }
  } else {
    // 新建：提醒提前量取设置页的「默认提前量」（此前该设置项从未被消费）
    const lead = settings.value && settings.value.reminder ? settings.value.reminder.defaultLead : null
    form.remind_lead = lead === null || lead === undefined || lead === '' ? null : Number(lead)
  }
}

onMounted(async () => {
  await loadCategories()
  await initForm()
  await nextTick()
  if (titleInput.value) titleInput.value.focus()

  if (props.focusRemind && remindBlock.value) {
    remindBlock.value.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
})

watch(() => props.todo, () => initForm())

const computedDeadline = computed(() => {
  if (!form.deadlineInput) return props.todo && props.todo.deadline ? props.todo.deadline : ''
  return new Date(form.deadlineInput).toISOString()
})

async function parseNl() {
  const text = nlText.value.trim()
  if (!text) return
  try {
    const res = await window.electronAPI.parseDeadlineText(text)
    if (res && res.deadline) {
      form.deadlineInput = toLocalInput(res.deadline)
      nlResult.value = res
      nlError.value = ''
    } else {
      nlResult.value = null
      nlError.value = '未能识别出时间，请换一种说法或手动选择'
    }
  } catch (e) {
    nlError.value = '解析失败：' + e.message
  }
}

function close() { emit('close') }

function save() {
  if (!form.title.trim()) return

  const deadline = form.deadlineInput
    ? new Date(form.deadlineInput).toISOString()
    : null

  emit('save', {
    title: form.title.trim(),
    description: form.description.trim(),
    priority: form.priority,
    category_id: form.category_id || '',
    deadline,
    remind_lead: form.remind_lead === null ? null : Number(form.remind_lead),
    repeat_rule: form.repeat_rule,
    subtasks: form.subtasks
      .filter((s) => s.title && s.title.trim())
      .map((s) => ({ title: s.title.trim(), completed: !!s.completed })),
    // 只把用户在「自然语言输入框」里的内容交给时间解析，
    // 否则标题/描述里出现「明天」等词时，「清除」截止时间会被服务端重新解析出来
    nlpText: nlText.value.trim(),
    rawText: `${form.title} ${form.description} ${nlText.value}`
  })
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.5);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fade 0.2s ease;
}
@keyframes fade { from { opacity: 0 } to { opacity: 1 } }
.modal {
  background: var(--bg-primary);
  border-radius: 18px;
  width: 560px;
  max-width: 92vw;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.35);
  animation: pop 0.26s cubic-bezier(0.34, 1.35, 0.64, 1);
  overflow: hidden;
}
@keyframes pop { from { opacity: 0; transform: scale(0.95) translateY(10px) } to { opacity: 1; transform: none } }

.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px 12px;
  border-bottom: 1px solid var(--border-color);
}
.modal-head h3 { margin: 0; font-size: calc(17px * var(--font-scale)); color: var(--text-primary) }
.close-x {
  border: none;
  background: transparent;
  font-size: calc(22px * var(--font-scale));
  line-height: 1;
  color: var(--text-muted);
  cursor: pointer;
}
.close-x:hover { color: var(--text-primary) }

.modal-body { padding: 16px 24px; overflow-y: auto; flex: 1 }
.form-group { margin-bottom: 15px; border-radius: 10px; transition: box-shadow 0.3s ease }
.form-group.ring { box-shadow: 0 0 0 3px var(--accent-soft); animation: ring 1.2s ease }
@keyframes ring { 0%, 100% { box-shadow: 0 0 0 3px var(--accent-soft) } 50% { box-shadow: 0 0 0 6px var(--accent-soft) } }
.form-group label {
  display: block;
  font-size: calc(12px * var(--font-scale));
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 6px;
}
.form-group label em { color: #dc2626; font-style: normal }

.form-input, .form-textarea, .form-select {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid var(--border-color);
  border-radius: 9px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: calc(13.5px * var(--font-scale));
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  box-sizing: border-box;
}
.form-input:focus, .form-textarea:focus, .form-select:focus {
  outline: none;
  border-color: var(--accent-color);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.form-textarea { resize: vertical; min-height: 56px }
.row { display: flex; gap: 8px; align-items: center }
.mini-clear, .mini-btn {
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 9px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: calc(12px * var(--font-scale));
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.18s ease;
}
.mini-clear:hover, .mini-btn:hover:not(:disabled) { border-color: var(--accent-color); color: var(--accent-color) }
.mini-btn:disabled { opacity: 0.5; cursor: not-allowed }
.nl-row { display: flex; gap: 8px; margin-top: 8px }
.nl-result { font-size: calc(11.5px * var(--font-scale)); color: var(--accent-color); margin: 6px 0 0 }
.nl-result.error { color: #dc2626 }
.form-hint { font-size: calc(11px * var(--font-scale)); color: var(--text-muted); margin: 5px 0 0 }

.seg { display: flex; gap: 6px }
.seg-btn {
  flex: 1;
  padding: 7px 0;
  border: 1px solid var(--border-color);
  border-radius: 9px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: calc(13px * var(--font-scale));
  cursor: pointer;
  transition: all 0.18s ease;
}
.seg-btn:hover { border-color: var(--accent-color) }
.seg-btn.active { color: #fff; font-weight: 600; border-color: transparent }
.seg-btn.high.active { background: linear-gradient(135deg, #ef4444, #dc2626) }
.seg-btn.medium.active { background: linear-gradient(135deg, #f97316, #ea580c) }
.seg-btn.low.active { background: linear-gradient(135deg, #22c55e, #16a34a) }

.cat-picker { display: flex; flex-wrap: wrap; gap: 6px }
.cat-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border: 1px solid var(--border-color);
  border-radius: 20px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: calc(12.5px * var(--font-scale));
  cursor: pointer;
  transition: all 0.18s ease;
}
.cat-chip:hover { transform: translateY(-1px) }
.cat-chip.active { border-color: var(--accent-color); color: var(--accent-color); font-weight: 600 }
.chip-dot { width: 7px; height: 7px; border-radius: 50% }

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 24px 18px;
  border-top: 1px solid var(--border-color);
}
.btn { padding: 9px 20px; border-radius: 9px; border: 1px solid transparent; cursor: pointer; font-size: calc(13.5px * var(--font-scale)); font-weight: 600; transition: all 0.18s ease }
.btn.ghost { background: var(--bg-secondary); border-color: var(--border-color); color: var(--text-secondary) }
.btn.ghost:hover { border-color: var(--accent-color); color: var(--accent-color) }
.btn.primary { background: linear-gradient(135deg, #3b82f6, #2563eb); color: #fff }
.btn.primary:hover:not(:disabled) { filter: brightness(1.07); transform: translateY(-1px) }
.btn.primary:disabled { opacity: 0.5; cursor: not-allowed }
</style>
