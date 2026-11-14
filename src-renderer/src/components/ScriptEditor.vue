<template>
  <div class="script-editor">
    <!-- 基础信息 -->
    <section class="card section">
      <h3>基础信息</h3>
      <p class="section-desc">给脚本起个好记的名字，并选择命中后的处理方式。</p>

      <div class="row">
        <div class="row-text">
          <span class="row-title">脚本名称</span>
          <span class="row-sub">用于在扩展面板中标识来源</span>
        </div>
        <input class="field-input name-input" v-model="draft.name" placeholder="如：Jira 工单" />
      </div>

      <div class="row divider">
        <div class="row-text">
          <span class="row-title">应用方式</span>
          <span class="row-sub">
            {{ draft.action === 'fill' ? '提取结果自动填入面板，确认后再提交' : '点击后直接入库，不展开面板' }}
          </span>
        </div>
        <div class="seg">
          <button :class="['seg-item', { active: draft.action === 'fill' }]" @click="draft.action = 'fill'">
            预填面板
          </button>
          <button :class="['seg-item', { active: draft.action === 'submit' }]" @click="draft.action = 'submit'">
            一键入库
          </button>
        </div>
      </div>
    </section>

    <!-- 匹配规则 -->
    <section class="card section">
      <h3>匹配规则</h3>
      <p class="section-desc">当前网页地址命中任意一条规则时，该脚本才会运行。</p>

      <div class="pattern-list">
        <div v-for="(p, i) in draft.patterns" :key="i" class="pattern-row">
          <span class="pattern-idx">{{ i + 1 }}</span>
          <input class="field-input" v-model="draft.patterns[i]" placeholder="如 *.example.com/*" />
          <button class="mini-btn" title="移除" @click="removePattern(i)">✕</button>
        </div>

        <button class="add-pattern" @click="addPattern">＋ 添加规则</button>
      </div>

      <div class="hint-box">
        <b>通配写法示例</b>
        <code>jira.company.com/*</code> 匹配该域名下所有页面<br />
        <code>*.example.com</code> 匹配所有子域名<br />
        <code>https://mail.qq.com/*</code> 仅匹配 https 协议
      </div>
    </section>

    <!-- 高级匹配条件 -->
    <section class="card section">
      <h3>高级匹配条件</h3>
      <p class="section-desc">除 URL 通配外，可叠加页面标题、路径、域名关键词或选中文字特征，任一维度命中即生效（与上方规则为「或」关系，门槛更低）。</p>

      <div v-for="mf in MATCH_FIELDS" :key="mf.key" class="match-group">
        <div class="match-group-head">{{ mf.label }}</div>
        <div class="pattern-list">
          <div v-for="(v, i) in draft.match[mf.key]" :key="i" class="pattern-row">
            <span class="pattern-idx">{{ i + 1 }}</span>
            <input class="field-input" v-model="draft.match[mf.key][i]" :placeholder="mf.placeholder" />
            <button class="mini-btn" title="移除" @click="removeMatchItem(mf.key, i)">✕</button>
          </div>
          <button class="add-pattern" @click="addMatchItem(mf.key)">＋ 添加{{ mf.label }}规则</button>
        </div>
      </div>

      <div class="hint-box">
        <b>写法说明</b>
        普通文本：包含该子串即命中（不区分大小写），如 <code>github.com</code><br />
        正则：用 <code>/</code> 包裹，如 <code>/PROJ-\d+/</code>、<code>/issue/i</code><br />
        选中文字：仅在网页中选中文本且命中时，浮出「一键收藏」提示
      </div>
    </section>

    <!-- 提取配置 -->
    <section class="card section">
      <h3>提取配置</h3>
      <p class="section-desc">选择用选择器零代码配置，或编写 JS 处理复杂页面。</p>

      <div class="row">
        <div class="row-text">
          <span class="row-title">提取方式</span>
        </div>
        <div class="seg">
          <button :class="['seg-item', { active: draft.mode === 'selector' }]" @click="draft.mode = 'selector'">
            CSS 选择器
          </button>
          <button :class="['seg-item', { active: draft.mode === 'js' }]" @click="switchToJs">
            自定义 JS
          </button>
        </div>
      </div>

      <!-- 选择器模式 -->
      <div v-if="draft.mode === 'selector'" class="fields-block">
        <div v-for="f in FIELD_LIST" :key="f.key" class="field-row">
          <span class="field-label">{{ f.label }}</span>
          <input
            class="field-input"
            v-model="draft.fields[f.key].selector"
            :placeholder="f.placeholder"
          />
          <select class="field-input attr-select" v-model="draft.fields[f.key].attr">
            <option v-for="a in ATTR_LIST" :key="a.value" :value="a.value">{{ a.label }}</option>
          </select>
          <input
            v-if="draft.fields[f.key].attr === 'attr'"
            class="field-input attr-name"
            v-model="draft.fields[f.key].attrName"
            placeholder="属性名"
          />
        </div>
      </div>

      <!-- JS 模式 -->
      <div v-else class="code-block">
        <div class="code-head">
          <span class="code-tip">可用变量：<code>doc</code> 网页文档 · <code>url</code> 网址 · <code>selection</code> 选中文本</span>
          <div class="code-ops">
            <button class="btn ghost sm" @click="insertTemplate">插入示例</button>
            <button class="btn ghost sm" @click="doValidate">校验语法</button>
          </div>
        </div>
        <textarea
          ref="codeRef"
          class="code-area"
          v-model="draft.code"
          spellcheck="false"
          placeholder="// 返回 { title, description, deadline, priority }"
          @keydown.tab.prevent="insertIndent"
        ></textarea>
        <p v-if="validateMsg" :class="['validate-msg', validateOk ? 'ok' : 'err']">
          {{ validateOk ? '✓ 语法校验通过' : '✕ ' + validateMsg }}
        </p>
      </div>
    </section>

    <!-- 操作条 -->
    <div class="editor-actions">
      <button class="btn danger-ghost" @click="$emit('delete')">删除脚本</button>
      <div class="right">
        <button class="btn ghost" @click="$emit('cancel')">取消</button>
        <button class="btn primary" @click="onSave">保存脚本</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, watch, nextTick } from 'vue'
import { SCRIPT_FIELDS, SCRIPT_ATTRS, SCRIPT_MATCH_FIELDS, validateScript, getScriptTemplate } from '../composables/useScripts'

const props = defineProps({ script: { type: Object, required: true } })
const emit = defineEmits(['save', 'cancel', 'delete'])

const FIELD_LIST = SCRIPT_FIELDS
const ATTR_LIST = SCRIPT_ATTRS
const MATCH_FIELDS = SCRIPT_MATCH_FIELDS

const draft = reactive(emptyDraft())
const codeRef = ref(null)
const validateMsg = ref('')
const validateOk = ref(false)

function emptyMatch() {
  return { title: [], path: [], domain: [], selection: [] }
}

function emptyDraft() {
  const fields = {}
  for (const f of SCRIPT_FIELDS) fields[f.key] = { selector: '', attr: 'text', attrName: '' }
  return {
    id: '', name: '', enabled: true, mode: 'selector', action: 'fill',
    patterns: [], match: emptyMatch(), fields, code: '', builtin: false, updatedAt: ''
  }
}

/** 用外部脚本填充草稿（缺失字段补空，避免 undefined 绑定报错） */
function fill(src) {
  const base = emptyDraft()
  const s = src || {}
  draft.id = s.id || ''
  draft.name = s.name || ''
  draft.enabled = s.enabled !== false
  draft.mode = s.mode === 'js' ? 'js' : 'selector'
  draft.action = s.action === 'submit' ? 'submit' : 'fill'
  draft.patterns = Array.isArray(s.patterns) ? s.patterns.slice() : []
  draft.code = s.code || ''
  draft.builtin = !!s.builtin
  draft.updatedAt = s.updatedAt || ''
  const srcMatch = (s.match && typeof s.match === 'object') ? s.match : {}
  const baseMatch = emptyMatch()
  for (const k of Object.keys(baseMatch)) {
    baseMatch[k] = Array.isArray(srcMatch[k]) ? srcMatch[k].slice() : []
  }
  draft.match = baseMatch
  for (const f of SCRIPT_FIELDS) {
    const src2 = (s.fields && s.fields[f.key]) || {}
    base.fields[f.key] = {
      selector: src2.selector || '',
      attr: src2.attr || 'text',
      attrName: src2.attrName || ''
    }
  }
  draft.fields = base.fields
  validateMsg.value = ''
  validateOk.value = false
}

watch(() => props.script, (v) => fill(v), { immediate: true, deep: false })

function addPattern() { draft.patterns.push('') }
function removePattern(i) { draft.patterns.splice(i, 1) }

function addMatchItem(key) { draft.match[key].push('') }
function removeMatchItem(key, i) { draft.match[key].splice(i, 1) }

async function switchToJs() {
  draft.mode = 'js'
  if (!draft.code) await insertTemplate()
}

async function insertTemplate() {
  if (draft.code && draft.code.trim()) return
  const tpl = await getScriptTemplate()
  draft.code = tpl.code || ''
  await nextTick()
  codeRef.value && codeRef.value.focus()
}

function insertIndent() {
  draft.code += '  '
}

async function doValidate() {
  const res = await validateScript({ mode: 'js', code: draft.code })
  validateOk.value = !!res.success
  validateMsg.value = res.success ? '' : res.error || '语法错误'
}

function onSave() {
  // 提交前清理空选择器与空规则，避免脏数据入库
  const fields = {}
  for (const f of SCRIPT_FIELDS) {
    const v = draft.fields[f.key]
    if (v && v.selector && v.selector.trim()) {
      fields[f.key] = { selector: v.selector.trim(), attr: v.attr, attrName: v.attrName || '' }
    }
  }
  const payload = {
    ...draft,
    name: (draft.name || '').trim() || '未命名脚本',
    patterns: draft.patterns.map((p) => (p || '').trim()).filter(Boolean),
    match: cleanMatch(draft.match),
    fields,
    code: draft.mode === 'js' ? draft.code : ''
  }
  emit('save', payload)
}

/** 清理 match 空规则，仅保留有内容的维度 */
function cleanMatch(raw) {
  const out = {}
  if (raw && typeof raw === 'object') {
    for (const k of Object.keys(emptyMatch())) {
      const arr = Array.isArray(raw[k]) ? raw[k] : []
      const cleaned = arr.map((x) => (x || '').trim()).filter(Boolean)
      if (cleaned.length) out[k] = cleaned
    }
  }
  return out
}
</script>

<style scoped>
.script-editor { display: flex; flex-direction: column; gap: var(--section-gap) }

.name-input { width: 220px }

.pattern-list { display: flex; flex-direction: column; gap: 8px; margin-top: 12px }
.match-group { margin-top: 14px }
.match-group:first-of-type { margin-top: 16px }
.match-group-head {
  font-size: calc(12px * var(--font-scale));
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 2px;
}
.pattern-row { display: flex; align-items: center; gap: 8px }
.pattern-idx {
  width: 20px; height: 20px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  border-radius: 6px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  font-size: calc(11px * var(--font-scale));
  color: var(--text-muted);
}
.mini-btn {
  border: none; background: transparent; cursor: pointer;
  color: var(--text-muted); font-size: calc(12px * var(--font-scale));
  padding: 4px 7px; border-radius: 6px;
  transition: all 0.16s ease;
}
.mini-btn:hover { background: rgba(220, 38, 38, 0.12); color: #dc2626 }

.add-pattern {
  padding: 7px; margin-top: 2px;
  border: 1px dashed var(--border-color);
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  font-size: calc(12px * var(--font-scale));
  cursor: pointer;
  transition: all 0.18s ease;
}
.add-pattern:hover { border-color: var(--accent-color); color: var(--accent-color); background: var(--accent-soft) }

.hint-box {
  margin-top: 12px;
  padding: 10px 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 9px;
  font-size: calc(11.5px * var(--font-scale));
  color: var(--text-muted);
  line-height: 1.9;
}
.hint-box b { display: block; color: var(--text-secondary); margin-bottom: 2px; font-size: calc(12px * var(--font-scale)) }
.hint-box code {
  background: var(--accent-soft);
  color: var(--accent-color);
  padding: 1px 6px;
  border-radius: 5px;
  font-size: calc(11px * var(--font-scale));
}

.fields-block { display: flex; flex-direction: column; gap: 8px; margin-top: 12px }
.field-row { display: flex; align-items: center; gap: 8px }
.field-label { width: 68px; flex-shrink: 0; font-size: calc(12.5px * var(--font-scale)); font-weight: 600; color: var(--text-secondary) }
.attr-select { width: 108px; flex-shrink: 0; cursor: pointer }
.attr-name { width: 96px; flex-shrink: 0 }

.code-block { margin-top: 12px }
.code-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 8px }
.code-tip { font-size: calc(11.5px * var(--font-scale)); color: var(--text-muted) }
.code-tip code {
  background: var(--accent-soft); color: var(--accent-color);
  padding: 1px 5px; border-radius: 4px; font-size: calc(11px * var(--font-scale));
}
.code-ops { display: flex; gap: 6px; flex-shrink: 0 }
.code-area {
  width: 100%;
  min-height: 190px;
  padding: 12px 14px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: #0f172a;
  color: #e2e8f0;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  font-size: calc(12.5px * var(--font-scale));
  line-height: 1.7;
  outline: none;
  resize: vertical;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}
.code-area:focus { border-color: var(--accent-color); box-shadow: 0 0 0 3px var(--accent-soft) }
.code-area::placeholder { color: #64748b }
.validate-msg { margin-top: 8px; font-size: calc(12px * var(--font-scale)) }
.validate-msg.ok { color: #16a34a }
.validate-msg.err { color: #dc2626 }

.editor-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 20px;
}
.editor-actions .right { display: flex; gap: 8px }
</style>
